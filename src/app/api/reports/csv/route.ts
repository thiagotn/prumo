// The ledger as a CSV the accountant opens in Excel.
//
// No patient name in it: what leaves the clinic for bookkeeping is the money, the date
// and the tax — who was treated is not the accountant's business, and a spreadsheet
// travels further than anyone plans.
import { audit } from '@/lib/audit';
import { requireModule } from '@/lib/auth/guards';
import { csvNumber, currentMonthKey, exportFilename, monthLabel, summarize, toCsv } from '@/lib/finance';
import { loadReport, resolvePeriod } from '@/lib/report-data';

export const dynamic = 'force-dynamic';

/** Product copy, pt-BR — this file is read by a person. */
const METHOD_LABELS: Record<string, string> = {
  CASH: 'Dinheiro',
  PIX: 'Pix',
  DEBIT: 'Débito',
  CREDIT_UPFRONT: 'Crédito à vista',
  CREDIT_INSTALLMENT: 'Crédito parcelado',
};

const HEADER = [
  'Data',
  'Mês',
  'Procedimento',
  'Produto',
  'Forma de pagamento',
  'Parcelas',
  'Cobrado',
  'Material',
  'Sala',
  'Descartáveis',
  'Rateio',
  'Custo total',
  'Imposto',
  'Taxa de cartão',
  'Lucro líquido',
  'Margem %',
];

export async function GET(request: Request) {
  const { tenant, session, level } = await requireModule('reports');
  if (!tenant) return new Response('Esta rota pertence a uma clínica.', { status: 404 });
  // Reports is full-access only in the matrix; this is belt and braces for a role that
  // might gain partial access later.
  if (level !== 'full') return new Response('Sem acesso ao relatório.', { status: 403 });

  const url = new URL(request.url);
  const period = resolvePeriod(
    url.searchParams.get('from') ?? undefined,
    url.searchParams.get('to') ?? undefined,
    currentMonthKey(),
  );
  const data = await loadReport(tenant.id, period);
  const totals = summarize(data.lines);

  const rows: Array<Array<string | number>> = [
    HEADER,
    ...data.lines.map((line) => [
      new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(line.at),
      monthLabel(line.month),
      line.procedure,
      line.product,
      METHOD_LABELS[line.method] ?? line.method,
      line.installments ?? '',
      csvNumber(line.charged),
      csvNumber(line.materialCost),
      csvNumber(line.roomCost),
      csvNumber(line.disposablesCost),
      csvNumber(line.overheadCost),
      csvNumber(line.totalCost),
      csvNumber(line.taxAmount),
      csvNumber(line.cardFeeAmount),
      csvNumber(line.netProfit),
      csvNumber(line.margin * 100, 2),
    ]),
    [],
    [
      'Total',
      '',
      '',
      '',
      '',
      '',
      csvNumber(totals.charged),
      '',
      '',
      '',
      '',
      csvNumber(totals.totalCost),
      '',
      '',
      csvNumber(totals.netProfit),
      csvNumber(totals.margin * 100, 2),
    ],
  ];

  await audit({
    tenantId: tenant.id,
    userId: session.userId,
    action: 'report.export',
    resource: 'report.csv',
    details: { from: period.from, to: period.to, lines: data.lines.length },
  });

  return new Response(toCsv(rows), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${exportFilename('csv', period.from, period.to)}"`,
      'cache-control': 'private, no-store, max-age=0',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
}
