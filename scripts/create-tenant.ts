// Creates a clinic (tenant) and its owner user. This is how an instance is born until
// stage 8 delivers the reseller panel.
//
// Usage (local, with .env pointing at the right database):
//   npx tsx scripts/create-tenant.ts \
//     --name "Dra. Tati Mayumi" \
//     --subtitle "Estética Avançada · Tatuapé, SP" \
//     --monogram TM \
//     --color "#b68235" \
//     --domain dratatimayumi.com.br \
//     --host app.dratatimayumi.com.br \
//     --unit "Coworking Tatuapé" \
//     --owner-name "Dra. Tati Mayumi" \
//     --owner-email tati@dratatimayumi.com.br
//
// For production (homelab), see docs/operacao.md — it runs from the admin's machine
// against a port-forwarded Postgres.
//
// The password is generated here and printed ONCE — nothing but its hash is stored.
// The user enrols 2FA herself on first sign-in.
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { Plan, BillingStatus, Role } from '@prisma/client';
import { hashPassword } from '../src/lib/auth/password';
import { validateAccentColor } from '../src/lib/color';
import { DEFAULT_FLAGS } from '../src/lib/flags';
import { normalizeHost } from '../src/lib/tenant';
import { prisma, withPlatformScope } from '../src/lib/db';

const { values } = parseArgs({
  options: {
    name: { type: 'string' },
    subtitle: { type: 'string' },
    monogram: { type: 'string' },
    color: { type: 'string' },
    domain: { type: 'string' },
    host: { type: 'string', multiple: true },
    unit: { type: 'string' },
    plan: { type: 'string', default: 'ESSENTIAL' },
    'owner-name': { type: 'string' },
    'owner-email': { type: 'string' },
  },
});

function required(key: keyof typeof values): string {
  const value = values[key];
  if (typeof value !== 'string' || value.trim() === '') {
    console.error(`Missing --${key}. See the header of this file for the full usage.`);
    process.exit(1);
  }
  return value.trim();
}

/** An initial password that can be read out over the phone, with enough entropy for one use. */
function initialPassword(): string {
  return randomBytes(9).toString('base64url');
}

async function main() {
  const name = required('name');
  const monogram = required('monogram').toUpperCase().slice(0, 3);
  const domain = normalizeHost(required('domain'));
  const ownerName = required('owner-name');
  const ownerEmail = required('owner-email').trim().toLowerCase();

  const color = validateAccentColor(required('color'));
  if (!color.ok) {
    console.error(`Accent colour refused: ${color.error}`);
    process.exit(1);
  }

  const plan = values.plan?.toUpperCase() as keyof typeof Plan;
  if (!(plan in Plan)) {
    console.error(`Invalid plan: ${values.plan}. Use one of ${Object.keys(Plan).join(', ')}.`);
    process.exit(1);
  }

  // The primary domain already resolves; --host adds the extras (app.<domain>, etc.).
  const hosts = [...new Set((values.host ?? []).map(normalizeHost))].filter(Boolean);
  const password = initialPassword();

  await withPlatformScope(async (tx) => {
    const existing = await tx.tenant.findUnique({ where: { domain }, select: { id: true } });
    if (existing) {
      console.error(`A clinic with domain ${domain} already exists. Nothing was changed.`);
      process.exit(1);
    }

    const tenant = await tx.tenant.create({
      data: {
        name,
        subtitle: values.subtitle?.trim() || null,
        monogram,
        accentColor: color.hex,
        domain,
        defaultUnit: values.unit?.trim() || null,
        plan: Plan[plan],
        billingStatus: BillingStatus.TRIAL,
        enabledModules: DEFAULT_FLAGS,
      },
    });

    for (const [i, host] of hosts.entries()) {
      await tx.tenantDomain.create({ data: { tenantId: tenant.id, host, primary: i === 0 } });
    }

    await tx.user.create({
      data: {
        tenantId: tenant.id,
        name: ownerName,
        email: ownerEmail,
        role: Role.OWNER,
        passwordHash: await hashPassword(password),
      },
    });

    console.log(`\n✅ Clinic created: ${name}`);
    console.log(`   id ................. ${tenant.id}`);
    console.log(`   domain ............. ${domain}`);
    console.log(`   resolving hosts .... ${[domain, ...hosts].join(', ')}`);
    console.log(`   accent colour ...... ${color.hex} (contrast ${color.contrast.toFixed(2)}:1)`);
    console.log(`\n   Owner: ${ownerName} <${ownerEmail}>`);
    console.log(`   Initial password: ${password}`);
    console.log('\n   Hand it over through a secure channel. It is stored nowhere but as a hash —');
    console.log('   if lost, run scripts/reset-password.ts. 2FA is enrolled on first sign-in.\n');
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
