// The same period as the CSV, as a one-page summary to attach to an email.
import { audit } from '@/lib/audit';
import { requireModule } from '@/lib/auth/guards';
import { currentMonthKey, exportFilename, summarize } from '@/lib/finance';
import { loadReport, monthlyTotals, procedureMix, resolvePeriod } from '@/lib/report-data';
import { renderReportPdf } from '@/lib/report-pdf';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { tenant, session, level } = await requireModule('reports');
  if (!tenant) return new Response('Esta rota pertence a uma clínica.', { status: 404 });
  if (level !== 'full') return new Response('Sem acesso ao relatório.', { status: 403 });

  const url = new URL(request.url);
  const period = resolvePeriod(
    url.searchParams.get('from') ?? undefined,
    url.searchParams.get('to') ?? undefined,
    currentMonthKey(),
  );
  const data = await loadReport(tenant.id, period);
  const totals = summarize(data.lines);

  const pdf = await renderReportPdf({
    clinicName: tenant.name,
    clinicUnit: tenant.defaultUnit,
    from: period.from,
    to: period.to,
    months: monthlyTotals(data).map((month) => ({
      month: month.month,
      count: month.count,
      charged: month.charged,
      totalCost: month.totalCost,
      taxAndFee: month.taxAndFee,
      netProfit: month.netProfit,
      margin: month.margin,
    })),
    totals: {
      count: totals.count,
      charged: totals.charged,
      totalCost: totals.totalCost,
      taxAndFee: totals.taxAndFee,
      netProfit: totals.netProfit,
      margin: totals.margin,
    },
    mix: procedureMix(data),
    generatedAt: new Date(),
  });

  await audit({
    tenantId: tenant.id,
    userId: session.userId,
    action: 'report.export',
    resource: 'report.pdf',
    details: { from: period.from, to: period.to, lines: data.lines.length },
  });

  return new Response(pdf as BodyInit, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${exportFilename('pdf', period.from, period.to)}"`,
      'cache-control': 'private, no-store, max-age=0',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
}
