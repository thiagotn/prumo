// Session lifecycle against a real Postgres. Covers what the HTTP checks cannot reach:
// revocation, expiry, deactivated user, and one tenant's cookie presented at another.
//
// Requires the dev database: `npm run db:up && npm run db:migrate && npm run db:seed`.
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashToken, sessionByToken } from '../src/lib/auth/session';
import { prisma, withPlatformScope, withTenant } from '../src/lib/db';

let tatiId: string;
let auroraId: string;
let tatiOwnerId: string;

/** Creates the session row directly, as createSession would — without needing a cookie. */
async function openSession(
  tenantId: string,
  userId: string,
  overrides: { expiresAt?: Date; revokedAt?: Date; twoFactorOk?: boolean } = {},
) {
  const token = randomBytes(32).toString('base64url');
  await withTenant(tenantId, (tx) =>
    tx.session.create({
      data: {
        tokenHash: hashToken(token),
        userId,
        tenantId,
        twoFactorOk: overrides.twoFactorOk ?? true,
        expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
        revokedAt: overrides.revokedAt ?? null,
      },
    }),
  );
  return token;
}

beforeAll(async () => {
  // SESSION_SECRET may be absent from the runner's environment; hashToken needs 32+ chars.
  process.env.SESSION_SECRET ??= 'x'.repeat(64);

  const tenants = await withPlatformScope((tx) =>
    tx.tenant.findMany({ select: { id: true, domain: true } }),
  );
  tatiId = tenants.find((t) => t.domain === 'dratatimayumi.com.br')!.id;
  auroraId = tenants.find((t) => t.domain === 'clinicaaurora.com.br')!.id;

  const owner = await withTenant(tatiId, (tx) =>
    tx.user.findFirst({ where: { role: 'OWNER' }, select: { id: true } }),
  );
  if (!owner) throw new Error('Run `npm run db:seed` first.');
  tatiOwnerId = owner.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('sessionByToken', () => {
  it('accepts a valid session of its own tenant', async () => {
    const token = await openSession(tatiId, tatiOwnerId);
    const session = await sessionByToken(token, tatiId);
    expect(session).not.toBeNull();
    expect(session!.userId).toBe(tatiOwnerId);
    expect(session!.tenantId).toBe(tatiId);
    // OWNER reaches medical records, so the second factor is required.
    expect(session!.twoFactorRequired).toBe(true);
  });

  it('refuses an unknown token', async () => {
    expect(await sessionByToken(randomBytes(32).toString('base64url'), tatiId)).toBeNull();
  });

  it('refuses an empty token', async () => {
    expect(await sessionByToken('', tatiId)).toBeNull();
  });

  it('refuses a revoked session — this is what logout does', async () => {
    const token = await openSession(tatiId, tatiOwnerId, { revokedAt: new Date() });
    expect(await sessionByToken(token, tatiId)).toBeNull();
  });

  it('refuses an expired session', async () => {
    const token = await openSession(tatiId, tatiOwnerId, { expiresAt: new Date(Date.now() - 1000) });
    expect(await sessionByToken(token, tatiId)).toBeNull();
  });

  it("one tenant's cookie is worthless at another", async () => {
    const token = await openSession(tatiId, tatiOwnerId);
    expect(await sessionByToken(token, auroraId)).toBeNull();
    expect(await sessionByToken(token, null)).toBeNull();
  });

  it('refuses a deactivated user session without needing to revoke the token', async () => {
    const token = await openSession(tatiId, tatiOwnerId);
    try {
      await withTenant(tatiId, (tx) =>
        tx.user.update({ where: { id: tatiOwnerId }, data: { active: false } }),
      );
      expect(await sessionByToken(token, tatiId)).toBeNull();
    } finally {
      await withTenant(tatiId, (tx) =>
        tx.user.update({ where: { id: tatiOwnerId }, data: { active: true } }),
      );
    }
  });

  it('stores only the token hash — the cleartext value is not in the database', async () => {
    const token = await openSession(tatiId, tatiOwnerId);
    const foundInClear = await withTenant(tatiId, (tx) =>
      tx.session.findFirst({ where: { tokenHash: token }, select: { id: true } }),
    );
    expect(foundInClear).toBeNull();

    const foundByHash = await withTenant(tatiId, (tx) =>
      tx.session.findUnique({ where: { tokenHash: hashToken(token) }, select: { id: true } }),
    );
    expect(foundByHash).not.toBeNull();
  });

  it('the hash depends on SESSION_SECRET — rotating it invalidates every session', async () => {
    const token = await openSession(tatiId, tatiOwnerId);
    const original = process.env.SESSION_SECRET;
    try {
      process.env.SESSION_SECRET = 'y'.repeat(64);
      expect(await sessionByToken(token, tatiId)).toBeNull();
    } finally {
      process.env.SESSION_SECRET = original;
    }
  });

  it('marks a reseller-impersonated session with the medical record masked', async () => {
    const superadmin = await withPlatformScope((tx) =>
      tx.user.findFirst({ where: { role: 'SUPERADMIN' }, select: { id: true } }),
    );
    const token = randomBytes(32).toString('base64url');
    await withTenant(tatiId, (tx) =>
      tx.session.create({
        data: {
          tokenHash: hashToken(token),
          userId: tatiOwnerId,
          tenantId: tatiId,
          twoFactorOk: true,
          impersonatedByUserId: superadmin!.id,
          medicalRecordUnlocked: false,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      }),
    );

    const session = await sessionByToken(token, tatiId);
    expect(session!.impersonatedByUserId).toBe(superadmin!.id);
    expect(session!.medicalRecordUnlocked).toBe(false);
  });
});
