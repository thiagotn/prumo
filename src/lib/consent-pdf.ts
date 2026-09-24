// The PDF of a signed term.
//
// Built from what is stored on the consent row — the wording as issued, the signature as
// drawn, the instant, the IP — and never from the template, which may have been edited
// since. The hash is printed on every page: the document carries the means to check it.
//
// Generated on demand rather than stored. There is nothing to keep in sync that way, and
// the inputs are immutable once signed, so the same consent always produces the same
// document.
import 'server-only';
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import { formatHash, paragraphs } from './consent';
import { CONTENT_WIDTH, INK, MARGIN, MUTED, PAGE, RULE, toWinAnsi, wrap } from './pdf';

export type ConsentPdfInput = {
  clinicName: string;
  clinicUnit: string | null;
  title: string;
  body: string;
  templateVersion: number;
  patientName: string;
  procedureName: string | null;
  signerName: string;
  signerNote: string | null;
  signedAt: Date;
  signedIp: string | null;
  signature: Uint8Array;
  hash: string;
  /** How the signature was collected, in the clinic's words. */
  channel: 'tela' | 'link';
};

/** pt-BR, in the clinic's timezone — the PDF is read in Brazil, not in UTC. */
function longDateTime(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

export async function renderConsentPdf(input: ConsentPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const body = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);

  pdf.setTitle(toWinAnsi(`${input.title} — ${input.patientName}`));
  pdf.setProducer('Prumo');
  pdf.setCreationDate(input.signedAt);

  const pages: PDFPage[] = [];
  let page = pdf.addPage([PAGE.width, PAGE.height]);
  pages.push(page);
  let y = PAGE.height - MARGIN;

  const space = (needed: number) => {
    if (y - needed >= MARGIN + 40) return;
    page = pdf.addPage([PAGE.width, PAGE.height]);
    pages.push(page);
    y = PAGE.height - MARGIN;
  };

  const write = (
    text: string,
    options: { font?: PDFFont; size?: number; color?: typeof INK; lineHeight?: number } = {},
  ) => {
    const font = options.font ?? body;
    const size = options.size ?? 11;
    const lineHeight = options.lineHeight ?? size * 1.45;
    for (const line of wrap(toWinAnsi(text), font, size, CONTENT_WIDTH)) {
      space(lineHeight);
      page.drawText(line, { x: MARGIN, y: y - size, size, font, color: options.color ?? INK });
      y -= lineHeight;
    }
  };

  // ── heading ────────────────────────────────────────────────────────────────
  write(input.clinicUnit ? `${input.clinicName} · ${input.clinicUnit}` : input.clinicName, {
    font: bold,
    size: 10,
    color: MUTED,
  });
  y -= 6;
  write(input.title, { font: bold, size: 17, lineHeight: 22 });
  write(`Edição ${input.templateVersion} do termo`, { size: 9, color: MUTED });
  y -= 10;

  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE.width - MARGIN, y },
    thickness: 0.7,
    color: RULE,
  });
  y -= 22;

  // ── who and what ───────────────────────────────────────────────────────────
  write(`Paciente: ${input.patientName}`, { size: 11 });
  if (input.procedureName) write(`Procedimento: ${input.procedureName}`, { size: 11 });
  y -= 12;

  // ── the wording, exactly as it was shown ───────────────────────────────────
  for (const paragraph of paragraphs(input.body)) {
    write(paragraph);
    y -= 7;
  }

  // ── the signature ──────────────────────────────────────────────────────────
  y -= 18;
  space(150);
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE.width - MARGIN, y },
    thickness: 0.7,
    color: RULE,
  });
  y -= 20;

  const png = await pdf.embedPng(input.signature);
  // Fit the drawing into a 220x70 box without stretching it.
  const scale = Math.min(220 / png.width, 70 / png.height, 1);
  const drawn = { width: png.width * scale, height: png.height * scale };
  space(drawn.height + 70);
  page.drawImage(png, { x: MARGIN, y: y - drawn.height, ...drawn });
  y -= drawn.height + 6;

  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: MARGIN + 240, y },
    thickness: 0.7,
    color: RULE,
  });
  y -= 16;

  write(input.signerName, { font: bold, size: 11 });
  if (input.signerNote) write(input.signerNote, { size: 9, color: MUTED });
  write(
    `Assinado em ${longDateTime(input.signedAt)} · ${
      input.channel === 'tela' ? 'assinatura em tela na clínica' : 'assinatura por link'
    }${input.signedIp ? ` · IP ${input.signedIp}` : ''}`,
    { size: 9, color: MUTED, font: italic },
  );

  // ── footer on every page ───────────────────────────────────────────────────
  const footer = `Verificação: ${formatHash(input.hash)}`;
  pages.forEach((sheet, index) => {
    sheet.drawText(toWinAnsi(footer), {
      x: MARGIN,
      y: MARGIN - 22,
      size: 7,
      font: body,
      color: MUTED,
    });
    const label = `${index + 1}/${pages.length}`;
    sheet.drawText(label, {
      x: PAGE.width - MARGIN - body.widthOfTextAtSize(label, 7),
      y: MARGIN - 22,
      size: 7,
      font: body,
      color: MUTED,
    });
  });

  return pdf.save();
}

/** The filename the browser offers. No name in it: it lands in a downloads folder. */
export function consentPdfFilename(consentId: string, signedAt: Date): string {
  return `termo-${signedAt.toISOString().slice(0, 10)}-${consentId.slice(0, 8)}.pdf`;
}
