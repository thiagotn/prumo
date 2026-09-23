// Server guards. Permission is checked HERE, not by hiding a menu item (CLAUDE.md).
// Every app page calls requireModule(); pages holding health data call
// requireSensitiveModule(), which also writes the access to audit_log.
import 'server-only';
import { Role } from '@prisma/client';
import { notFound, redirect } from 'next/navigation';
import { audit, type AuditAction } from '../audit';
import { MODULE_DEFS, type Module } from '../modules';
import { accessLevel, canAccess, initialModule, type AccessLevel } from '../rbac';
import { isPlatformHost, requestHost, currentTenant, type ResolvedTenant } from '../tenant';
import { currentSession, type ActiveSession } from './session';

export type AuthContext = {
  tenant: ResolvedTenant | null;
  session: ActiveSession;
};

export type TenantAuthContext = AuthContext & { tenant: ResolvedTenant };

/**
 * Resolves the tenant from the hostname. An unknown host does not become a generic
 * instance: it 404s, because there is no clinic at that address.
 */
export async function requireTenantOrPlatform(): Promise<ResolvedTenant | null> {
  const host = await requestHost();
  if (isPlatformHost(host)) return null;

  const tenant = await currentTenant();
  if (!tenant) {
    await audit({ tenantId: null, action: 'access.denied', resource: 'host', resourceId: host });
    notFound();
  }
  if (!tenant.active) notFound();
  return tenant;
}

/**
 * A valid session with the second factor already settled. Redirects to login (or to the
 * 2FA step) when something is missing.
 */
export async function requireSession(): Promise<AuthContext> {
  const tenant = await requireTenantOrPlatform();
  const session = await currentSession(tenant?.id ?? null);
  if (!session) redirect('/login');

  if (session.twoFactorRequired && !session.twoFactorOk) {
    redirect(session.totpEnrolled ? '/login/2fa' : '/login/2fa/setup');
  }

  return { tenant, session };
}

/** Like requireSession, but guarantees we are on a clinic instance. */
export async function requireTenantSession(): Promise<TenantAuthContext> {
  const ctx = await requireSession();
  if (!ctx.tenant) redirect('/tenants');
  return ctx as TenantAuthContext;
}

/**
 * Session + permission on the module + the tenant's flag on. A denied access becomes an
 * audit_log row and sends the user back to the first screen their role can open.
 */
export async function requireModule(
  module: Module,
): Promise<AuthContext & { level: AccessLevel }> {
  const ctx = await requireSession();
  const { session, tenant } = ctx;

  const flag = MODULE_DEFS[module].flag;
  const flagOn = !flag || (tenant?.flags[flag] ?? false);

  if (!canAccess(session.role, module) || !flagOn) {
    await audit({
      tenantId: tenant?.id ?? null,
      userId: session.userId,
      action: 'access.denied',
      resource: 'module',
      resourceId: module,
      details: { role: session.role, reason: flagOn ? 'role' : 'flag_off' },
    });
    redirect(`${MODULE_DEFS[initialModule(session.role)].path}?denied=${module}`);
  }

  return { ...ctx, level: accessLevel(session.role, module) };
}

/**
 * For medical records, anamneses and photos: on top of the permission, record the
 * access. While the reseller is impersonating, the record stays masked unless
 * explicitly authorised — the caller decides what to show based on `masked`.
 */
export async function requireSensitiveModule(
  module: Module,
  resource?: { kind: string; id: string },
): Promise<AuthContext & { level: AccessLevel; masked: boolean }> {
  const ctx = await requireModule(module);

  // Explicit map: opening the encounter is access to the whole medical record, not just
  // the anamnesis.
  const ACTION_BY_MODULE: Partial<Record<Module, AuditAction>> = {
    photos: 'photo.view',
    medicalRecord: 'medicalRecord.view',
    encounter: 'medicalRecord.view',
  };
  const action = ACTION_BY_MODULE[module];
  if (!action) {
    throw new Error(`requireSensitiveModule called for a non-sensitive module: ${module}`);
  }

  await audit({
    tenantId: ctx.tenant?.id ?? null,
    userId: ctx.session.userId,
    action,
    resource: resource?.kind ?? module,
    resourceId: resource?.id,
    details: ctx.session.impersonatedByUserId
      ? {
          impersonated: true,
          medicalRecordUnlocked: ctx.session.medicalRecordUnlocked,
        }
      : undefined,
  });

  const masked =
    ctx.session.impersonatedByUserId !== null && !ctx.session.medicalRecordUnlocked;
  return { ...ctx, masked };
}

/** The reseller panel. SUPERADMIN only, and always with 2FA settled. */
export async function requireSuperadmin(): Promise<AuthContext> {
  const ctx = await requireSession();
  if (ctx.session.role !== Role.SUPERADMIN) {
    await audit({
      tenantId: ctx.tenant?.id ?? null,
      userId: ctx.session.userId,
      action: 'access.denied',
      resource: 'platform',
      details: { role: ctx.session.role },
    });
    redirect(MODULE_DEFS[initialModule(ctx.session.role)].path);
  }
  return ctx;
}
