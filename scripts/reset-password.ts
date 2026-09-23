// Resets a user's password and ends every open session of theirs.
// Used when someone loses their password (email recovery arrives in stage 6) and
// whenever a credential leak is suspected.
//
// Usage:
//   npx tsx scripts/reset-password.ts --host app.dratatimayumi.com.br --email tati@dratatimayumi.com.br
//   npx tsx scripts/reset-password.ts --host ... --email ... --reenrol-2fa
//
// --reenrol-2fa clears the TOTP secret, so the person enrols the authenticator again on
// the next sign-in. That is what to do when they change or lose their phone.
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { hashPassword } from '../src/lib/auth/password';
import { prisma, withTenant } from '../src/lib/db';
import { normalizeHost, tenantByHost } from '../src/lib/tenant';

const { values } = parseArgs({
  options: {
    host: { type: 'string' },
    email: { type: 'string' },
    'reenrol-2fa': { type: 'boolean', default: false },
  },
});

async function main() {
  const host = values.host?.trim();
  const email = values.email?.trim().toLowerCase();
  if (!host || !email) {
    console.error('Usage: --host <clinic hostname> --email <email> [--reenrol-2fa]');
    process.exit(1);
  }

  const tenant = await tenantByHost(host);
  if (!tenant) {
    console.error(`No clinic answers for ${normalizeHost(host)}.`);
    process.exit(1);
  }

  const password = randomBytes(9).toString('base64url');
  const passwordHash = await hashPassword(password);
  const reenrol = values['reenrol-2fa'] === true;

  const result = await withTenant(tenant.id, async (tx) => {
    const user = await tx.user.findFirst({
      where: { email },
      select: { id: true, name: true, role: true },
    });
    if (!user) return null;

    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        ...(reenrol ? { totpSecret: null, totpConfirmedAt: null } : {}),
      },
    });

    // A new password invalidates what was open — that is half the point of the operation.
    const { count } = await tx.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        action: 'password.reset',
        resource: 'password',
        resourceId: user.id,
        details: { via: 'script', sessionsRevoked: count, reenrol2fa: reenrol },
      },
    });

    return { user, sessionsRevoked: count };
  });

  if (!result) {
    console.error(`There is no user ${email} in ${tenant.name}.`);
    process.exit(1);
  }

  console.log(`\n✅ Password reset — ${result.user.name} (${result.user.role})`);
  console.log(`   Clinic ............. ${tenant.name}`);
  console.log(`   Sessions ended ..... ${result.sessionsRevoked}`);
  if (reenrol) {
    console.log('   2FA ................ cleared, enrols again on next sign-in');
  }
  console.log(`\n   New password: ${password}`);
  console.log('   Hand it over through a secure channel. It is stored nowhere.\n');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
