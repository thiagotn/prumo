// audit_log — LGPD. Records access to medical records, anamneses and photos
// (CLAUDE.md) plus authentication, configuration and reseller "impersonate" events.
//
// The table is append-only in the database (SELECT/INSERT policies only, no UPDATE or
// DELETE policy). Never put clinical data in `details`: the log is proof of access,
// not a copy of what was accessed.
import type { Prisma } from '@prisma/client';
import { headers } from 'next/headers';
import { withPlatformScope, withTenant } from './db';

export type AuditAction =
  | 'login.success'
  | 'login.failure'
  | 'login.2fa.success'
  | 'login.2fa.failure'
  | 'login.2fa.setup'
  | 'login.throttled'
  | 'password.reset'
  | 'logout'
  | 'session.expired'
  | 'medicalRecord.view'
  | 'anamnesis.view'
  | 'photo.view'
  | 'photo.upload'
  | 'photo.delete'
  | 'photo.download'
  | 'settings.save'
  | 'report.export'
  | 'consent.template.save'
  | 'consent.issue'
  | 'consent.sign'
  | 'consent.view'
  | 'consent.pdf'
  | 'consent.cancel'
  | 'patient.create'
  | 'patient.update'
  | 'appointment.create'
  | 'appointment.status'
  | 'message.queued'
  | 'message.sent'
  | 'message.reply'
  | 'patient.erased'
  | 'tenant.impersonate'
  | 'tenant.impersonate.end'
  | 'access.denied';

export type AuditEntry = {
  tenantId: string | null;
  userId?: string | null;
  action: AuditAction;
  resource?: string;
  resourceId?: string;
  details?: Prisma.InputJsonValue;
};

/** IP and user-agent of the current request. Behind the tunnel/Traefik the real IP
 *  arrives in X-Forwarded-For. */
export async function requestContext(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    const forwarded = h.get('x-forwarded-for');
    const ip = forwarded?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null;
    return { ip: ip || null, userAgent: h.get('user-agent') };
  } catch {
    // No request at all: a maintenance script or the message dispatcher, which audit too.
    // An event with no IP is worth more than an exception in the middle of a cron run.
    return { ip: null, userAgent: null };
  }
}

/**
 * Writes an audit row. A write failure is logged but does not take down the user's
 * action — a broken audit trail must not become a denial of service during care.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  const { ip, userAgent } = await requestContext();
  const data = {
    tenantId: entry.tenantId,
    userId: entry.userId ?? null,
    action: entry.action,
    resource: entry.resource ?? null,
    resourceId: entry.resourceId ?? null,
    ip,
    userAgent,
    details: entry.details,
  };

  try {
    if (entry.tenantId) {
      await withTenant(entry.tenantId, (tx) => tx.auditLog.create({ data }));
    } else {
      // Tenant-less events (platform, unknown host) live in platform scope.
      await withPlatformScope((tx) => tx.auditLog.create({ data }));
    }
  } catch (error) {
    console.error('[audit] failed to write', entry.action, error);
  }
}
