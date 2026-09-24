// Session: an opaque 256-bit token in an httpOnly cookie; only its HMAC is stored in
// the database. A database dump grants nobody a login, and revoking is one UPDATE.
//
// The second factor is a step WITHIN the session (`twoFactorOk`), not a separate
// cookie: while it is false the user can only reach /login/2fa.
import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Role, type Prisma } from '@prisma/client';
import { cookies } from 'next/headers';
import { withPlatformScope, withTenant, type Tx } from '../db';
import { requiresTwoFactor } from '../rbac';

export const SESSION_COOKIE = 'prumo_session';

/** 12h: a whole clinical day without re-login, without leaving sessions alive overnight. */
const DURATION_MS = 12 * 60 * 60 * 1000;
/** "Keep me signed in on this device" — 30 days. */
const REMEMBER_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error('SESSION_SECRET is missing or shorter than 32 characters — see .env.example');
  }
  return s;
}

/** HMAC of the token. HMAC rather than plain SHA-256: without the app secret you
 *  cannot build a rainbow table. */
export function hashToken(token: string): string {
  return createHmac('sha256', secret()).update(token).digest('hex');
}

export type ActiveSession = {
  sessionId: string;
  token: string;
  userId: string;
  tenantId: string | null;
  role: Role;
  name: string;
  email: string;
  twoFactorOk: boolean;
  twoFactorRequired: boolean;
  totpEnrolled: boolean;
  /** Set when the reseller is using "impersonate". */
  impersonatedByUserId: string | null;
  medicalRecordUnlocked: boolean;
  /** For a PATIENT login: the clinical record the portal reads. Null for staff. */
  patientId: string | null;
  expiresAt: Date;
};

const SESSION_SELECT = {
  id: true,
  userId: true,
  tenantId: true,
  twoFactorOk: true,
  impersonatedByUserId: true,
  medicalRecordUnlocked: true,
  expiresAt: true,
  revokedAt: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      totpConfirmedAt: true,
      patientId: true,
    },
  },
} satisfies Prisma.SessionSelect;

type LoadedSession = Prisma.SessionGetPayload<{ select: typeof SESSION_SELECT }>;

function build(session: LoadedSession, token: string): ActiveSession {
  return {
    sessionId: session.id,
    token,
    userId: session.userId,
    tenantId: session.tenantId,
    role: session.user.role,
    name: session.user.name,
    email: session.user.email,
    twoFactorOk: session.twoFactorOk,
    twoFactorRequired: requiresTwoFactor(session.user.role),
    totpEnrolled: session.user.totpConfirmedAt !== null,
    impersonatedByUserId: session.impersonatedByUserId,
    medicalRecordUnlocked: session.medicalRecordUnlocked,
    patientId: session.user.patientId,
    expiresAt: session.expiresAt,
  };
}

/**
 * How long a support session lasts. Far shorter than a clinic's own: somebody from the
 * platform is inside someone else's record, and that should end by itself.
 */
export const IMPERSONATION_DURATION_MS = 60 * 60 * 1000;

/**
 * Creates an impersonation session WITHOUT touching the cookie jar.
 *
 * The cookie belongs to the clinic's host and this runs on the reseller's — a cookie set
 * here would never be sent there. The ticket in `impersonation_handoffs` is what carries
 * the session across, and `setSessionCookie` finishes the job on the other side.
 *
 * `twoFactorOk` starts true on purpose: the reseller has already cleared their own second
 * factor to reach the panel, and the clinic's authenticator is not theirs to hold. What
 * bounds this session is its hour, the banner, the masked record and the audit trail.
 */
export async function createImpersonationSession(params: {
  userId: string;
  tenantId: string;
  byUserId: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{ sessionId: string; token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + IMPERSONATION_DURATION_MS);

  const session = await withTenant(params.tenantId, (tx) =>
    tx.session.create({
      data: {
        tokenHash: hashToken(token),
        userId: params.userId,
        tenantId: params.tenantId,
        twoFactorOk: true,
        impersonatedByUserId: params.byUserId,
        medicalRecordUnlocked: false,
        ip: params.ip ?? null,
        userAgent: params.userAgent ?? null,
        expiresAt,
      },
      select: { id: true },
    }),
  );

  return { sessionId: session.id, token, expiresAt };
}

/** Puts an already-created session into the cookie jar of the host being served. */
export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

/**
 * Creates the session and sets the cookie. `twoFactorOk` starts false for anyone who
 * requires 2FA — the login is only complete after the second step.
 */
export async function createSession(params: {
  userId: string;
  tenantId: string | null;
  role: Role;
  remember?: boolean;
  ip?: string | null;
  userAgent?: string | null;
  impersonatedByUserId?: string | null;
  medicalRecordUnlocked?: boolean;
}): Promise<{ token: string; expiresAt: Date; twoFactorPending: boolean }> {
  const token = randomBytes(32).toString('base64url');
  const duration = params.remember ? REMEMBER_DURATION_MS : DURATION_MS;
  const expiresAt = new Date(Date.now() + duration);
  const twoFactorPending = requiresTwoFactor(params.role);

  const data = {
    tokenHash: hashToken(token),
    userId: params.userId,
    tenantId: params.tenantId,
    twoFactorOk: !twoFactorPending,
    impersonatedByUserId: params.impersonatedByUserId ?? null,
    medicalRecordUnlocked: params.medicalRecordUnlocked ?? false,
    ip: params.ip ?? null,
    userAgent: params.userAgent ?? null,
    expiresAt,
  };

  if (params.tenantId) {
    await withTenant(params.tenantId, (tx) => tx.session.create({ data }));
  } else {
    await withPlatformScope((tx) => tx.session.create({ data }));
  }

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // With no maxAge the cookie dies when the browser closes — the right default on a
    // shared front-desk machine.
    ...(params.remember ? { expires: expiresAt } : {}),
  });

  return { token, expiresAt, twoFactorPending };
}

/**
 * Validates a session token. Returns null for an unknown token, a revoked or expired
 * session, and a deactivated user.
 *
 * `expectedTenantId` binds the session to the hostname's tenant: a cookie from another
 * instance is worthless here, even though it is valid there. The check is doubled — RLS
 * already slices the lookup, and we still compare the row's tenant_id.
 *
 * Deliberately separate from `currentSession`: there is no cookie or request here, only
 * the rule, which makes it testable straight against the database (tests/session.test.ts).
 */
export async function sessionByToken(
  token: string,
  expectedTenantId: string | null,
): Promise<ActiveSession | null> {
  if (!token) return null;

  const tokenHash = hashToken(token);
  const find = (tx: Tx) => tx.session.findUnique({ where: { tokenHash }, select: SESSION_SELECT });

  const session = expectedTenantId
    ? await withTenant(expectedTenantId, find)
    : await withPlatformScope(find);

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  if (!session.user.active) return null;
  if (session.tenantId !== expectedTenantId) return null;

  return build(session, token);
}

/** Session of the current request, read from the cookie. */
export async function currentSession(expectedTenantId: string | null): Promise<ActiveSession | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return sessionByToken(token, expectedTenantId);
}

/** Marks the second factor as verified for this session. */
export async function confirmTwoFactor(session: ActiveSession): Promise<void> {
  const update = (tx: Tx) =>
    tx.session.update({
      where: { id: session.sessionId },
      data: { twoFactorOk: true, lastUsedAt: new Date() },
    });

  if (session.tenantId) await withTenant(session.tenantId, update);
  else await withPlatformScope(update);
}

/** Revokes the session in the database and clears the cookie. */
export async function endSession(session: ActiveSession): Promise<void> {
  const revoke = (tx: Tx) =>
    tx.session.update({ where: { id: session.sessionId }, data: { revokedAt: new Date() } });

  if (session.tenantId) await withTenant(session.tenantId, revoke);
  else await withPlatformScope(revoke);

  (await cookies()).delete(SESSION_COOKIE);
}

/** Revokes every session of a user — password change, suspected leak. */
export async function revokeUserSessions(
  tenantId: string | null,
  userId: string,
): Promise<number> {
  const revoke = async (tx: Tx) => {
    const result = await tx.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  };
  return tenantId ? withTenant(tenantId, revoke) : withPlatformScope(revoke);
}

export { DURATION_MS, REMEMBER_DURATION_MS };
export const tokensEqual = (a: string, b: string): boolean =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
