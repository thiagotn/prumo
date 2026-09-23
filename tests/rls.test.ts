// Row Level Security integration tests against a real Postgres. They prove the
// isolation belongs to the DATABASE, not the application: even a query with no tenant
// filter does not cross the boundary.
//
// Requires the dev database: `npm run db:up && npm run db:migrate && npm run db:seed`.
import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma, withPlatformScope, withTenant } from '../src/lib/db';

let tatiId: string;
let auroraId: string;

beforeAll(async () => {
  const tenants = await withPlatformScope((tx) =>
    tx.tenant.findMany({ select: { id: true, domain: true } }),
  );
  const tati = tenants.find((t) => t.domain === 'dratatimayumi.com.br');
  const aurora = tenants.find((t) => t.domain === 'clinicaaurora.com.br');
  if (!tati || !aurora) {
    throw new Error('Run `npm run db:seed` first: the example tenants are not in the database.');
  }
  tatiId = tati.id;
  auroraId = aurora.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('RLS — per-tenant slice', () => {
  it('with no scope at all, no business row is visible', async () => {
    // A bare query, outside withTenant/withPlatformScope: the default is to deny.
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.session.count()).toBe(0);
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it('in tenant scope, only that tenant users show up', async () => {
    const tatiUsers = await withTenant(tatiId, (tx) =>
      tx.user.findMany({ select: { email: true, tenantId: true } }),
    );
    expect(tatiUsers.length).toBeGreaterThan(0);
    expect(tatiUsers.every((u) => u.tenantId === tatiId)).toBe(true);
    expect(tatiUsers.some((u) => u.email.includes('clinicaaurora'))).toBe(false);
  });

  it('fetching another tenant id returns nothing, even knowing the id', async () => {
    const target = await withTenant(auroraId, (tx) =>
      tx.user.findFirst({ select: { id: true, email: true } }),
    );
    expect(target).not.toBeNull();

    const leak = await withTenant(tatiId, (tx) =>
      tx.user.findUnique({ where: { id: target!.id }, select: { id: true } }),
    );
    expect(leak).toBeNull();
  });

  it('the superadmin (null tenant_id) shows up in no tenant scope', async () => {
    for (const id of [tatiId, auroraId]) {
      const superadmins = await withTenant(id, (tx) =>
        tx.user.findMany({ where: { role: 'SUPERADMIN' } }),
      );
      expect(superadmins).toHaveLength(0);
    }
  });

  it('updateMany with no tenant filter only reaches the scoped tenant', async () => {
    const before = await withPlatformScope((tx) =>
      tx.user.count({ where: { tenantId: auroraId, active: true } }),
    );

    // Deliberately broad update, the way a coding bug would write it.
    await withTenant(tatiId, (tx) => tx.user.updateMany({ data: { active: true } }));

    const after = await withPlatformScope((tx) =>
      tx.user.count({ where: { tenantId: auroraId, active: true } }),
    );
    expect(after).toBe(before);
  });

  it('cannot INSERT on behalf of another tenant (WITH CHECK)', async () => {
    await expect(
      withTenant(tatiId, (tx) =>
        tx.user.create({
          data: {
            tenantId: auroraId,
            name: 'Intruder',
            email: `intruder-${Date.now()}@example.com`,
            role: 'RECEPTION',
            passwordHash: 'scrypt$1$1$1$YQ==$Yg==',
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('platform scope crosses tenants — it is the reseller path', async () => {
    const total = await withPlatformScope((tx) => tx.user.count());
    const tatiOnly = await withTenant(tatiId, (tx) => tx.user.count());
    expect(total).toBeGreaterThan(tatiOnly);
  });
});

describe('audit_log is append-only', () => {
  it('UPDATE and DELETE have no effect', async () => {
    const entry = await withTenant(tatiId, (tx) =>
      tx.auditLog.create({
        data: { tenantId: tatiId, action: 'medicalRecord.view', resource: 'rls-test' },
      }),
    );

    await withTenant(tatiId, (tx) =>
      tx.auditLog.updateMany({ where: { id: entry.id }, data: { action: 'logout' } }),
    );
    await withTenant(tatiId, (tx) => tx.auditLog.deleteMany({ where: { id: entry.id } }));

    const after = await withTenant(tatiId, (tx) =>
      tx.auditLog.findUnique({ where: { id: entry.id }, select: { action: true } }),
    );
    expect(after?.action).toBe('medicalRecord.view');
  });
});

describe('deleting a clinic', () => {
  it('removes the clinic and preserves the audit trail (FK SET NULL)', async () => {
    // Regression: while audit_log was append-only via a RULE (DO INSTEAD NOTHING),
    // Postgres' ON DELETE aborted with XX000 and NO tenant could ever be deleted.
    const tenant = await withPlatformScope((tx) =>
      tx.tenant.create({
        data: {
          name: 'Clínica Efêmera',
          monogram: 'CE',
          accentColor: '#5a3b0a',
          domain: `ephemeral-${Date.now()}.com.br`,
        },
      }),
    );

    const entry = await withTenant(tenant.id, (tx) =>
      tx.auditLog.create({
        data: { tenantId: tenant.id, action: 'medicalRecord.view', resource: 'delete-regression' },
      }),
    );

    await withPlatformScope((tx) => tx.tenant.delete({ where: { id: tenant.id } }));

    const survived = await withPlatformScope((tx) =>
      tx.auditLog.findUnique({
        where: { id: entry.id },
        select: { action: true, tenantId: true },
      }),
    );
    expect(survived).not.toBeNull();
    expect(survived!.action).toBe('medicalRecord.view');
    // The clinic is gone, the access record remains — just unlinked.
    expect(survived!.tenantId).toBeNull();

    const clinic = await withPlatformScope((tx) =>
      tx.tenant.findUnique({ where: { id: tenant.id }, select: { id: true } }),
    );
    expect(clinic).toBeNull();
  });

  it('the clinic users and sessions go away with it (CASCADE)', async () => {
    const tenant = await withPlatformScope((tx) =>
      tx.tenant.create({
        data: {
          name: 'Clínica Efêmera 2',
          monogram: 'C2',
          accentColor: '#444141',
          domain: `ephemeral2-${Date.now()}.com.br`,
        },
      }),
    );
    const user = await withTenant(tenant.id, (tx) =>
      tx.user.create({
        data: {
          tenantId: tenant.id,
          name: 'Goes With Me',
          email: `gone-${Date.now()}@example.com`,
          role: 'RECEPTION',
          passwordHash: 'scrypt$131072$8$1$YQ==$Yg==',
        },
      }),
    );

    await withPlatformScope((tx) => tx.tenant.delete({ where: { id: tenant.id } }));

    const left = await withPlatformScope((tx) =>
      tx.user.findUnique({ where: { id: user.id }, select: { id: true } }),
    );
    expect(left).toBeNull();
  });
});

describe('every business table is protected', () => {
  // This exists because a migration once shipped four tables — encounters, payments and
  // the two stock tables — with RLS off. Nothing failed: queries simply returned other
  // tenants' rows. Enumerating the tables here means the next one cannot be forgotten
  // quietly; it has to be listed as deliberately public instead.
  const PLATFORM_REGISTRY = ['tenants', 'tenant_domains'];
  const NOT_BUSINESS_DATA = ['_prisma_migrations'];

  it('has RLS enabled and forced on every table except the platform registry', async () => {
    const rows = await withPlatformScope(
      (tx) => tx.$queryRaw<Array<{ table: string; rls: boolean; forced: boolean }>>`
        SELECT relname AS "table", relrowsecurity AS rls, relforcerowsecurity AS forced
          FROM pg_class
         WHERE relnamespace = 'public'::regnamespace
           AND relkind = 'r'
         ORDER BY relname
      `,
    );

    const unprotected = rows
      .filter((r) => !PLATFORM_REGISTRY.includes(r.table) && !NOT_BUSINESS_DATA.includes(r.table))
      .filter((r) => !r.rls || !r.forced)
      .map((r) => r.table);

    expect(unprotected, `tables without RLS + FORCE: ${unprotected.join(', ')}`).toEqual([]);
  });

  it('the platform registry is deliberately outside RLS', async () => {
    // tenants and tenant_domains have to be readable before a tenant is known — that is
    // how a hostname resolves to a clinic in the first place.
    const rows = await withPlatformScope(
      (tx) => tx.$queryRaw<Array<{ table: string; rls: boolean }>>`
        SELECT relname AS "table", relrowsecurity AS rls
          FROM pg_class
         WHERE relnamespace = 'public'::regnamespace
           AND relname IN ('tenants', 'tenant_domains')
      `,
    );
    expect(rows.every((r) => !r.rls)).toBe(true);
  });

  it('every protected table denies reads with no scope set', async () => {
    // The policies could exist and still be wrong. This asserts the actual behaviour:
    // outside withTenant/withPlatformScope, a business table returns nothing.
    const counts = await Promise.all([
      prisma.appointment.count(),
      prisma.patient.count(),
      prisma.product.count(),
      prisma.room.count(),
      prisma.procedure.count(),
      prisma.pricingParams.count(),
      prisma.stockLot.count(),
      prisma.stockMovement.count(),
      prisma.encounter.count(),
      prisma.payment.count(),
    ]);
    expect(counts).toEqual(counts.map(() => 0));
  });
});
