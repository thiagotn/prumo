// The patient's own copy of a term she signed.
//
// A separate route from the clinic's: the PATIENT role does not reach the consents
// module, and it should not — what authorises this is that the term is hers.
import { audit } from '@/lib/audit';
import { requireModule } from '@/lib/auth/guards';
import { consentPdfResponse } from '@/lib/consent-document';
import { withTenant } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { tenant, session } = await requireModule('portal');
  const patientId = session.patientId;
  if (!tenant || !patientId) {
    return new Response('Não encontrado.', { status: 404 });
  }

  const { id } = await context.params;
  const consent = await withTenant(tenant.id, (tx) =>
    tx.consent.findFirst({
      where: { id, patientId, status: 'SIGNED' },
      include: {
        patient: { select: { name: true } },
        appointment: { include: { procedure: true } },
      },
    }),
  );
  // Another patient's term is simply not found: there is nothing to learn from the
  // difference between "not yours" and "does not exist".
  if (!consent) return new Response('Não encontrado.', { status: 404 });

  await audit({
    tenantId: tenant.id,
    userId: session.userId,
    action: 'consent.pdf',
    resource: 'portal.consent',
    resourceId: consent.id,
  });

  return consentPdfResponse(consent, { clinicName: tenant.name, clinicUnit: tenant.defaultUnit });
}
