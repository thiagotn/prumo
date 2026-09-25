// Development seed: the three example tenants from docs/design.md (Tati, Aurora, Vértice)
// plus one
// user per role. Idempotent — running it again does not duplicate anything.
//
// These passwords only ever exist in development. In production the first account is
// created through the reseller panel (stage 8) or `scripts/create-tenant.ts`.
import 'dotenv/config'; // the seed runs under tsx, outside Next's env loading
import { BillingStatus, Plan, Role } from '@prisma/client';
import { hashPassword } from '../src/lib/auth/password';
import { validateAccentColor } from '../src/lib/color';
import { prisma, withPlatformScope } from '../src/lib/db';
import type { Flags } from '../src/lib/flags';
import {
  seedAppointments,
  seedCatalog,
  seedClosedEncounters,
  seedMessageQueue,
  seedStockLots,
} from './seed-catalog';

const DEV_PASSWORD = 'prumo1234';

type TenantSeed = {
  name: string;
  subtitle: string;
  monogram: string;
  accentColor: string;
  domain: string;
  defaultUnit: string;
  plan: Plan;
  billingStatus: BillingStatus;
  flags: Partial<Flags>;
  /** Extra hosts resolving to this tenant (dev). The primary domain already resolves. */
  hosts: string[];
  users: Array<{ name: string; email: string; role: Role }>;
};

const TENANTS: TenantSeed[] = [
  {
    name: 'Dra. Tati Mayumi',
    subtitle: 'Estética Avançada · Tatuapé, SP',
    monogram: 'TM',
    accentColor: '#b68235',
    domain: 'dratatimayumi.com.br',
    defaultUnit: 'Coworking Tatuapé',
    plan: Plan.CLINIC,
    billingStatus: BillingStatus.ACTIVE,
    flags: {
      clinicalPhotos: true,
      automaticPricing: true,
      automaticStockDeduction: true,
      messageAutomation: true,
    },
    hosts: ['app.dratatimayumi.com.br', 'localhost:3100', 'tati.localhost:3100'],
    users: [
      { name: 'Dra. Tati Mayumi', email: 'owner@dratatimayumi.com.br', role: Role.OWNER },
      { name: 'Aline Souza', email: 'recepcao@dratatimayumi.com.br', role: Role.RECEPTION },
      { name: 'Marcos Ribeiro', email: 'financeiro@dratatimayumi.com.br', role: Role.FINANCE },
      { name: 'Dr. Pedro Lemos', email: 'pedro@dratatimayumi.com.br', role: Role.PRACTITIONER },
    ],
  },
  {
    name: 'Clínica Aurora',
    subtitle: 'Harmonização Facial · Moema, SP',
    monogram: 'CA',
    accentColor: '#7d5411',
    domain: 'clinicaaurora.com.br',
    defaultUnit: 'Unidade Moema',
    plan: Plan.ESSENTIAL,
    billingStatus: BillingStatus.TRIAL,
    flags: { clinicalPhotos: true, patientPortal: true },
    hosts: ['app.clinicaaurora.com.br', 'aurora.localhost:3100'],
    users: [
      { name: 'Dra. Helena Prado', email: 'helena@clinicaaurora.com.br', role: Role.OWNER },
      { name: 'Renata Yamada', email: 'renata@exemplo.com.br', role: Role.PATIENT },
    ],
  },
  {
    name: 'Vértice Saúde',
    subtitle: 'Rede de clínicas · 6 unidades',
    monogram: 'VS',
    accentColor: '#444141',
    domain: 'verticesaude.com.br',
    defaultUnit: 'Unidade Jardins',
    plan: Plan.NETWORK,
    billingStatus: BillingStatus.ACTIVE,
    flags: { multipleUnits: true, multiplePractitioners: true, clinicalPhotos: true },
    hosts: ['app.verticesaude.com.br', 'vertice.localhost:3100'],
    users: [
      { name: 'Dr. Ivan Bertoldo', email: 'ivan@verticesaude.com.br', role: Role.OWNER },
      { name: 'Camila Ferraz', email: 'recepcao@verticesaude.com.br', role: Role.RECEPTION },
    ],
  },
];

/** The reseller super-admin: no tenant, signs in through PLATFORM_HOSTS. */
const SUPERADMIN = { name: 'Suporte Ateliê', email: 'suporte@atelie.app' };

async function main() {
  const passwordHash = await hashPassword(DEV_PASSWORD);

  await withPlatformScope(async (tx) => {
    for (const seed of TENANTS) {
      // The accent colour goes through the same contrast validation as the Settings
      // screen — the seed never inserts a colour the application would refuse.
      const color = validateAccentColor(seed.accentColor);
      if (!color.ok) throw new Error(`${seed.name}: ${color.error}`);

      const tenant = await tx.tenant.upsert({
        where: { domain: seed.domain },
        update: {
          name: seed.name,
          subtitle: seed.subtitle,
          monogram: seed.monogram,
          accentColor: color.hex,
          defaultUnit: seed.defaultUnit,
          plan: seed.plan,
          billingStatus: seed.billingStatus,
          enabledModules: seed.flags,
        },
        create: {
          name: seed.name,
          subtitle: seed.subtitle,
          monogram: seed.monogram,
          accentColor: color.hex,
          domain: seed.domain,
          defaultUnit: seed.defaultUnit,
          plan: seed.plan,
          billingStatus: seed.billingStatus,
          enabledModules: seed.flags,
        },
      });

      for (const [i, host] of seed.hosts.entries()) {
        await tx.tenantDomain.upsert({
          where: { host },
          update: { tenantId: tenant.id, primary: i === 0 },
          create: { tenantId: tenant.id, host, primary: i === 0 },
        });
      }

      for (const user of seed.users) {
        await tx.user.upsert({
          where: { tenantId_email: { tenantId: tenant.id, email: user.email } },
          // The TOTP secret is cleared on purpose: a development database has to come up
          // in a known state, and "half enrolled" is not one. It is also what keeps the
          // e2e suite repeatable, since enrolment is otherwise a one-way step.
          update: {
            name: user.name,
            role: user.role,
            active: true,
            // The password goes back to the development one too: `npm run db:seed` is
            // what the README promises brings the whole known state back, and a login
            // changed by a script or a test would otherwise stay changed forever.
            passwordHash,
            totpSecret: null,
            totpConfirmedAt: null,
          },
          create: {
            tenantId: tenant.id,
            name: user.name,
            email: user.email,
            role: user.role,
            passwordHash,
          },
        });
      }

      // The catalogue only goes to the clinics that actually run appointments; the
      // patient portal tenant (Aurora) gets patients too, for the portal flow.
      await seedCatalog(tx, tenant.id, seed.domain !== 'verticesaude.com.br');
      // Only the first clinic gets a diary: the others exist to prove isolation, and an
      // empty schedule is what proves it.
      // Vértice stays without a diary: an empty schedule is what proves the isolation.
      if (seed.domain !== 'verticesaude.com.br') {
        await seedStockLots(tx, tenant.id);
        await seedAppointments(tx, tenant.id);
        await seedClosedEncounters(tx, tenant.id);
        await seedMessageQueue(tx, tenant.id);
      }

      // A portal login has to point at a clinical record: the portal shows that patient's
      // own diary and documents, and it finds them by this link.
      for (const user of seed.users.filter((u) => u.role === Role.PATIENT)) {
        const patient = await tx.patient.findFirst({
          where: { tenantId: tenant.id, name: user.name },
          select: { id: true },
        });
        if (patient) {
          await tx.user.update({
            where: { tenantId_email: { tenantId: tenant.id, email: user.email } },
            data: { patientId: patient.id },
          });
        }
      }

      const counts = await Promise.all([
        tx.room.count({ where: { tenantId: tenant.id } }),
        tx.procedure.count({ where: { tenantId: tenant.id } }),
        tx.product.count({ where: { tenantId: tenant.id } }),
        tx.patient.count({ where: { tenantId: tenant.id } }),
        tx.appointment.count({ where: { tenantId: tenant.id } }),
        tx.stockLot.count({ where: { tenantId: tenant.id } }),
        tx.payment.count({ where: { tenantId: tenant.id } }),
        tx.messageJob.count({ where: { tenantId: tenant.id } }),
      ]);
      console.log(
        `✅ ${seed.name} — ${seed.hosts.length} host(s), ${seed.users.length} user(s), ` +
          `${counts[0]} room(s), ${counts[1]} procedure(s), ${counts[2]} product(s), ` +
          `${counts[3]} patient(s), ${counts[4]} appointment(s), ${counts[5]} lot(s), ` +
          `${counts[6]} closing(s), ${counts[7]} message(s) queued`,
      );
    }

    const existing = await tx.user.findFirst({
      where: { email: SUPERADMIN.email, tenantId: null },
      select: { id: true },
    });
    if (existing) {
      await tx.user.update({
        where: { id: existing.id },
        data: { name: SUPERADMIN.name, active: true },
      });
    } else {
      await tx.user.create({
        data: {
          tenantId: null,
          name: SUPERADMIN.name,
          email: SUPERADMIN.email,
          role: Role.SUPERADMIN,
          passwordHash,
        },
      });
    }
    console.log(`✅ reseller super-admin — ${SUPERADMIN.email}`);
  });

  console.log(`\nPassword for every development user: ${DEV_PASSWORD}`);
  console.log('Roles that reach medical records (owner, practitioner, superadmin) enrol 2FA on first sign-in.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
