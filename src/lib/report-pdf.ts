// The month-by-month report the accountant receives.
//
// Same posture as the consent PDF: built per request from what was recorded at closing
// time, never stored, and carrying no patient name — the accountant needs the figures,
// not who they belong to.
import 'server-only';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { currency, percent } from './format';
import { monthLabel } from './finance';
import { CONTENT_WIDTH, INK, MARGIN, MUTED, PAGE, RULE, toWinAnsi, truncate } from './pdf';

export type ReportMonth = {
  month: string;
  count: number;
  charged: number;
  totalCost: number;
  taxAndFee: number;
  netProfit: number;
  margin: number;
};

export type ReportPdfInput = {
  clinicName: string;
  clinicUnit: string | null;
  from: string;
  to: string;
  months: ReportMonth[];
  totals: Omit<ReportMonth, 'month'>;
  /** Procedure lines, biggest first. */
  mix: Array<{ name: string; charged: number; count: number }>;
  generatedAt: Date;
};

/** Column layout of the monthly table, in points from the left margin. */
const COLUMNS = [
  { title: 'Mês', width: 96, align: 'left' as const },
  { title: 'Atend.', width: 46, align: 'right' as const },
  { title: 'Faturado', width: 84, align: 'right' as const },
  { title: 'Custos', width: 78, align: 'right' as const },
  { title: 'Imp.+taxa', width: 72, align: 'right' as const },
  { title: 'Lucro', width: 84, align: 'right' as const },
  { title: 'Margem', width: 56, align: 'right' as const },
];

export async function renderReportPdf(input: ReportPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const body = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);

  pdf.setTitle(toWinAnsi(`Prumo — ${input.from} a ${input.to}`));
  pdf.setProducer('Prumo');
  pdf.setCreationDate(input.generatedAt);

  let page = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;

  const line = (text: string, size = 11, font = body, color = INK) => {
    page.drawText(toWinAnsi(text), { x: MARGIN, y: y - size, size, font, color });
    y -= size * 1.5;
  };

  const rule = () => {
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE.width - MARGIN, y },
      thickness: 0.7,
      color: RULE,
    });
    y -= 14;
  };

  const row = (cells: string[], font = body, size = 10) => {
    // A new page before the row runs into the footer, not after.
    if (y < MARGIN + 60) {
      page = pdf.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - MARGIN;
    }
    let x = MARGIN;
    COLUMNS.forEach((column, index) => {
      const text = truncate(cells[index] ?? '', font, size, column.width - 6);
      const width = font.widthOfTextAtSize(text, size);
      page.drawText(text, {
        x: column.align === 'right' ? x + column.width - width - 6 : x,
        y: y - size,
        size,
        font,
        color: INK,
      });
      x += column.width;
    });
    y -= size * 1.7;
  };

  line(input.clinicUnit ? `${input.clinicName} · ${input.clinicUnit}` : input.clinicName, 10, bold, MUTED);
  y -= 4;
  line('Faturamento, custos e lucro', 17, bold);
  line(`${monthLabel(input.from)} a ${monthLabel(input.to)}`, 10, body, MUTED);
  y -= 8;
  rule();

  row(COLUMNS.map((c) => c.title), bold);
  for (const month of input.months) {
    row([
      monthLabel(month.month),
      String(month.count),
      currency(month.charged),
      currency(month.totalCost),
      currency(month.taxAndFee),
      currency(month.netProfit),
      month.count > 0 ? percent(month.margin) : '—',
    ]);
  }
  y += 4;
  rule();
  row(
    [
      'Total',
      String(input.totals.count),
      currency(input.totals.charged),
      currency(input.totals.totalCost),
      currency(input.totals.taxAndFee),
      currency(input.totals.netProfit),
      input.totals.count > 0 ? percent(input.totals.margin) : '—',
    ],
    bold,
  );

  if (input.mix.length > 0) {
    y -= 18;
    rule();
    line('Receita por linha de procedimento', 13, bold);
    y -= 2;
    for (const item of input.mix) {
      const label = truncate(item.name, body, 10, CONTENT_WIDTH - 160);
      const value = `${currency(item.charged)} · ${item.count} atendimento${item.count === 1 ? '' : 's'}`;
      if (y < MARGIN + 60) {
        page = pdf.addPage([PAGE.width, PAGE.height]);
        y = PAGE.height - MARGIN;
      }
      page.drawText(label, { x: MARGIN, y: y - 10, size: 10, font: body, color: INK });
      page.drawText(toWinAnsi(value), {
        x: PAGE.width - MARGIN - body.widthOfTextAtSize(toWinAnsi(value), 10),
        y: y - 10,
        size: 10,
        font: body,
        color: INK,
      });
      y -= 17;
    }
  }

  const footer = toWinAnsi(
    `Gerado pelo Prumo em ${new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    }).format(input.generatedAt)} · valores como registrados no fechamento de cada atendimento`,
  );
  for (const sheet of pdf.getPages()) {
    sheet.drawText(footer, { x: MARGIN, y: MARGIN - 22, size: 7, font: body, color: MUTED });
  }

  return pdf.save();
}
