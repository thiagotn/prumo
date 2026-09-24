// Puts the development database in a known state before the suite runs.
//
// Reseeding alone is not enough: the seed is idempotent, so it skips what already exists
// and therefore cannot undo what the tests changed. The suite closes encounters, which
// turns appointments into ATTENDED and draws down stock — so a second run would find a
// diary with nothing left to close. Clearing the transactional tables first makes the
// seed rebuild them, and every run starts from the same place.
//
// The registry (tenants, users, catalogue) is left alone: the seed updates that in place.
import { execFileSync } from 'node:child_process';
import 'dotenv/config';
import { prisma, withPlatformScope } from '../src/lib/db';

/** Refuses to run against anything but a local database. */
function assertLocalDatabase() {
  const url = process.env.DATABASE_URL ?? '';
  const host = /@([^/:]+)/.exec(url)?.[1] ?? '';
  const isLocal = ['localhost', '127.0.0.1', 'db', 'postgres'].includes(host);
  if (!isLocal) {
    throw new Error(
      `The e2e suite refuses to reset a non-local database (host "${host}"). ` +
        'Point DATABASE_URL at the development database before running it.',
    );
  }
}

export default async function globalSetup() {
  assertLocalDatabase();

  await withPlatformScope(async (tx) => {
    // Order matters: children before parents.
    await tx.payment.deleteMany();
    await tx.stockMovement.deleteMany();
    await tx.encounter.deleteMany();
    await tx.appointment.deleteMany();
    await tx.stockLot.deleteMany();
    await tx.session.deleteMany();
    await tx.loginAttempt.deleteMany();
  });
  await prisma.$disconnect();

  execFileSync('npx', ['tsx', '--tsconfig', 'tsconfig.scripts.json', 'prisma/seed.ts'], {
    stdio: process.env.CI ? 'inherit' : 'ignore',
    env: process.env,
  });
}
