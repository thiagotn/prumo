// What the public "tenho interesse" form may and may not do, proven against a real
// Postgres rather than asserted in a comment.
//
// The table has a shape no other table here has: anyone may INSERT, only platform scope
// may read or change, and the intake path may count the rows of its own IP. Every claim
// below is one of those sentences.
//
// Requires the dev database: `npm run db:up && npm run db:migrate && npm run db:seed`.
import 'dotenv/config';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { LeadStatus } from '@prisma/client';
import { prisma, withLeadIntake, withPlatformScope, withTenant } from '../src/lib/db';

const MARK = `rls-leads-${Date.now()}`;
const IP = '203.0.113.7';
const OTHER_IP = '203.0.113.8';

let tatiId: string;

beforeAll(async () => {
  const tenants = await withPlatformScope((tx) =>
    tx.tenant.findMany({ select: { id: true, domain: true } }),
  );
  const tati = tenants.find((t) => t.domain === 'dratatimayumi.com.br');
  if (!tati) {
    throw new Error('Run `npm run db:seed` first: the example tenants are not in the database.');
  }
  tatiId = tati.id;
});

afterEach(async () => {
  await withPlatformScope((tx) => tx.interestLead.deleteMany({ where: { name: { contains: MARK } } }));
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** A request arriving from `ip`, written the way the public action writes it. */
async function arrive(ip: string | null, suffix = '') {
  return withLeadIntake(ip, (tx) =>
    tx.interestLead.create({
      data: {
        name: `${MARK}${suffix}`,
        email: `quem${suffix || '-0'}@exemplo.com.br`,
        host: 'prumo.in',
        ip,
      },
      select: { id: true },
    }),
  );
}

describe('taking in a contact request', () => {
  it('lets an anonymous request write one, with no scope of its own', async () => {
    const lead = await arrive(IP);
    const stored = await withPlatformScope((tx) =>
      tx.interestLead.findUnique({ where: { id: lead.id }, select: { name: true, status: true } }),
    );
    expect(stored?.name).toBe(MARK);
    expect(stored?.status).toBe(LeadStatus.NEW);
  });

  it('refuses a row with no e-mail worth answering', async () => {
    await expect(
      withLeadIntake(IP, (tx) =>
        tx.interestLead.create({
          data: { name: MARK, email: 'nao-e-um-email', host: 'prumo.in', ip: IP },
        }),
      ),
    ).rejects.toThrow(/interest_leads_email_looks_like_one/);
  });

  it('shows the intake its own recent requests, and only those', async () => {
    await arrive(IP, '-a');
    await arrive(OTHER_IP, '-b');

    const mine = await withLeadIntake(IP, (tx) => tx.interestLead.count());
    expect(mine).toBe(1);

    const theirs = await withLeadIntake(OTHER_IP, (tx) => tx.interestLead.count());
    expect(theirs).toBe(1);
  });

  it('shows an intake with no IP nothing at all — there is nothing to count by', async () => {
    await arrive(IP, '-c');
    expect(await withLeadIntake(null, (tx) => tx.interestLead.count())).toBe(0);
  });

  it('hides everything from a request that opens no scope whatsoever', async () => {
    await arrive(IP, '-d');
    expect(await prisma.interestLead.count()).toBe(0);
  });
});

describe('who may read a contact request', () => {
  it('keeps it out of every clinic scope', async () => {
    await arrive(IP, '-e');
    expect(await withTenant(tatiId, (tx) => tx.interestLead.count())).toBe(0);
    expect(
      await withTenant(tatiId, (tx) => tx.interestLead.findMany({ select: { email: true } })),
    ).toEqual([]);
  });

  it('gives it to platform scope, which is the reseller panel', async () => {
    await arrive(IP, '-f');
    const found = await withPlatformScope((tx) =>
      tx.interestLead.findMany({ where: { name: { contains: MARK } }, select: { email: true } }),
    );
    expect(found).toHaveLength(1);
  });
});

describe('who may change a contact request', () => {
  it('refuses an update from the intake scope', async () => {
    const lead = await arrive(IP, '-g');
    const changed = await withLeadIntake(IP, (tx) =>
      tx.interestLead.updateMany({ where: { id: lead.id }, data: { status: LeadStatus.ARCHIVED } }),
    );
    // The row is invisible to the UPDATE, so nothing matches — no error, no change, which
    // is what "deny by default" looks like from the application's side.
    expect(changed.count).toBe(0);
  });

  it('refuses a delete from a clinic scope', async () => {
    const lead = await arrive(IP, '-h');
    const deleted = await withTenant(tatiId, (tx) =>
      tx.interestLead.deleteMany({ where: { id: lead.id } }),
    );
    expect(deleted.count).toBe(0);

    const survivor = await withPlatformScope((tx) =>
      tx.interestLead.findUnique({ where: { id: lead.id }, select: { id: true } }),
    );
    expect(survivor).not.toBeNull();
  });

  it('lets platform scope mark it handled, and the table demands who and when together', async () => {
    const lead = await arrive(IP, '-i');

    await expect(
      withPlatformScope((tx) =>
        tx.interestLead.update({
          where: { id: lead.id },
          data: { status: LeadStatus.CONTACTED, handledAt: new Date() },
        }),
      ),
    ).rejects.toThrow(/interest_leads_handled_together/);

    const user = await withTenant(tatiId, (tx) =>
      tx.user.findFirst({ where: { tenantId: tatiId }, select: { id: true } }),
    );
    const updated = await withPlatformScope((tx) =>
      tx.interestLead.update({
        where: { id: lead.id },
        data: {
          status: LeadStatus.CONTACTED,
          handledByUserId: user!.id,
          handledAt: new Date(),
          note: 'combinado uma demo',
        },
        select: { status: true, note: true },
      }),
    );
    expect(updated).toEqual({ status: LeadStatus.CONTACTED, note: 'combinado uma demo' });
  });
});
