// The patient's own copy, from the link she signed on. The token is the authorisation,
// and it expires — a PDF of a health document must not sit behind a permanent URL.
import { audit } from '@/lib/audit';
import { hashToken } from '@/lib/auth/session';
import { consentPdfResponse } from '@/lib/consent-document';
import { withTenant } from '@/lib/db';
import { currentTenant } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const tenant = await currentTenant();
  if (!tenant || !tenant.active) return new Response('Link inválido.', { status: 404 });

  const { token } = await context.params;
  const consent = await withTenant(tenant.id, (tx) =>
    tx.consent.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        patient: { select: { name: true } },
        appointment: { include: { procedure: true } },
      },
    }),
  );
  if (!consent) return new Response('Link inválido.', { status: 404 });
  if (!consent.tokenExpiresAt || consent.tokenExpiresAt < new Date()) {
    return new Response('Este link expirou. Peça uma nova cópia à clínica.', { status: 410 });
  }

  await audit({
    tenantId: tenant.id,
    userId: null,
    action: 'consent.pdf',
    resource: 'consent.link',
    resourceId: consent.id,
  });

  return consentPdfResponse(consent, { clinicName: tenant.name, clinicUnit: tenant.defaultUnit });
}
