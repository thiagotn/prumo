// The signed term as a PDF, for the clinic.
//
// Authorise, record the access, then build the document from the row. The bytes are
// generated per request: there is nothing stored to fall out of step with the record,
// and the inputs stop changing the moment the term is signed.
import { audit } from '@/lib/audit';
import { requireModule } from '@/lib/auth/guards';
import { consentPdfResponse } from '@/lib/consent-document';
import { withTenant } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { tenant, session } = await requireModule('consents');
  if (!tenant) return new Response('Esta rota pertence a uma clínica.', { status: 404 });

  const { id } = await context.params;
  const consent = await withTenant(tenant.id, (tx) =>
    tx.consent.findUnique({
      where: { id },
      include: {
        patient: { select: { name: true } },
        appointment: { include: { procedure: true } },
      },
    }),
  );
  if (!consent) return new Response('Termo não encontrado.', { status: 404 });

  await audit({
    tenantId: tenant.id,
    userId: session.userId,
    action: 'consent.pdf',
    resource: 'consent',
    resourceId: consent.id,
  });

  return consentPdfResponse(consent, { clinicName: tenant.name, clinicUnit: tenant.defaultUnit });
}
