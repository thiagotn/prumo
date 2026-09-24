// Shared authorisation for the photo routes.
//
// These are API routes rather than server components, so they cannot lean on the page
// guards. Every one of them starts here: a valid session, the second factor settled, the
// `photos` module reachable for the role, the tenant's flag on, and the encounter
// belonging to the tenant the hostname resolved to.
import 'server-only';
import { audit, type AuditAction } from './audit';
import { currentSession, type ActiveSession } from './auth/session';
import { withTenant } from './db';
import { MODULE_DEFS } from './modules';
import { canAccess } from './rbac';
import { isPlatformHost, requestHost, tenantByHost, type ResolvedTenant } from './tenant';

export type PhotoAccess =
  | { ok: true; tenant: ResolvedTenant; session: ActiveSession; masked: boolean }
  | { ok: false; status: number; message: string };

/**
 * Authorises a photo request. Returns a status rather than redirecting: these are fetch
 * endpoints, and a redirect to the login page would arrive at the caller as a confusing
 * success.
 */
export async function authorizePhotoAccess(): Promise<PhotoAccess> {
  const host = await requestHost();
  if (isPlatformHost(host)) {
    return { ok: false, status: 404, message: 'Fotos clínicas pertencem a uma clínica.' };
  }

  const tenant = await tenantByHost(host);
  if (!tenant || !tenant.active) {
    return { ok: false, status: 404, message: 'Instância não encontrada.' };
  }

  const session = await currentSession(tenant.id);
  if (!session) return { ok: false, status: 401, message: 'Sessão expirada.' };

  // A role that reaches photos always requires 2FA, so an unsettled second factor means
  // the session is not yet entitled to anything sensitive.
  if (session.twoFactorRequired && !session.twoFactorOk) {
    return { ok: false, status: 403, message: 'Verificação em duas etapas pendente.' };
  }

  if (!canAccess(session.role, 'photos')) {
    await audit({
      tenantId: tenant.id,
      userId: session.userId,
      action: 'access.denied',
      resource: 'photos',
      details: { role: session.role },
    });
    return { ok: false, status: 403, message: 'Seu perfil não acessa fotos clínicas.' };
  }

  const flag = MODULE_DEFS.photos.flag;
  if (flag && !tenant.flags[flag]) {
    return { ok: false, status: 403, message: 'Fotos clínicas não estão habilitadas nesta clínica.' };
  }

  // While the reseller is impersonating, clinical images stay masked unless explicitly
  // authorised — the same rule the screens follow.
  const masked = session.impersonatedByUserId !== null && !session.medicalRecordUnlocked;
  return { ok: true, tenant, session, masked };
}

/** Confirms the encounter belongs to this tenant, and returns its patient. */
export async function encounterInTenant(
  tenantId: string,
  encounterId: string,
): Promise<{ id: string; patientId: string } | null> {
  return withTenant(tenantId, (tx) =>
    tx.encounter.findUnique({ where: { id: encounterId }, select: { id: true, patientId: true } }),
  );
}

export async function auditPhoto(
  action: AuditAction,
  params: { tenantId: string; userId: string; photoId?: string; details?: Record<string, unknown> },
) {
  await audit({
    tenantId: params.tenantId,
    userId: params.userId,
    action,
    resource: 'photo',
    resourceId: params.photoId,
    details: params.details as never,
  });
}
