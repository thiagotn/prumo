// Copies one clinic's setup onto another: the pricing parameters, and optionally the
// catalogue of rooms, procedures and products.
//
//   npx tsx --tsconfig tsconfig.scripts.json scripts/copy-clinic-setup.ts \
//     --from app.clinic.example --to hml.clinic.example [--catalog] [--dry-run]
//
// Used to give a new or staging clinic a realistic starting point without retyping
// numbers that already exist somewhere.
//
// What it does NOT copy, deliberately:
//   - patients, appointments, encounters, payments — those are the clinic's own records,
//     and copying a patient between clinics is the one thing the whole isolation design
//     exists to prevent;
//   - stock lots — a lot is a physical box on a shelf with a batch number and an expiry.
//     Copying one would invent inventory that does not exist.
import 'dotenv/config';
import { parseArgs } from 'node:util';
import type { PricingParams } from '@prisma/client';
import { prisma, withTenant } from '../src/lib/db';
import { tenantByHost } from '../src/lib/tenant';

const { values } = parseArgs({
  options: {
    from: { type: 'string' },
    to: { type: 'string' },
    catalog: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
  },
});

const DRY_RUN = values['dry-run'] === true;
const WITH_CATALOG = values.catalog === true;

function percent(value: unknown): string {
  return `${(Number(value) * 100).toFixed(2).replace(/\.00$/, '')}%`;
}

/**
 * Do two versions carry the same numbers? Decimal is compared through `equals`, so
 * 0.30 and 0.3 count as one rate rather than two.
 */
function sameRates(a: PricingParams, b: PricingParams): boolean {
  return (
    a.taxRate.equals(b.taxRate) &&
    a.cardFeeUpfront.equals(b.cardFeeUpfront) &&
    a.cardFeeInstallment.equals(b.cardFeeInstallment) &&
    a.fixedMonthlyCosts.equals(b.fixedMonthlyCosts) &&
    a.expectedAppointments === b.expectedAppointments &&
    a.defaultMargin.equals(b.defaultMargin)
  );
}

async function main() {
  const fromHost = values.from?.trim();
  const toHost = values.to?.trim();
  if (!fromHost || !toHost) {
    console.error('Usage: --from <hostname> --to <hostname> [--catalog] [--dry-run]');
    process.exit(1);
  }

  const [source, target] = await Promise.all([tenantByHost(fromHost), tenantByHost(toHost)]);
  if (!source) {
    console.error(`No clinic answers for ${fromHost}.`);
    process.exit(1);
  }
  if (!target) {
    console.error(`No clinic answers for ${toHost}.`);
    process.exit(1);
  }
  if (source.id === target.id) {
    console.error('Source and target are the same clinic.');
    process.exit(1);
  }

  console.log(`\nFrom: ${source.name} (${source.domain})`);
  console.log(`To:   ${target.name} (${target.domain})`);

  // ── pricing parameters ─────────────────────────────────────────────────────
  const params = await withTenant(source.id, (tx) =>
    tx.pricingParams.findFirst({ where: { validFrom: { lte: new Date() } }, orderBy: { validFrom: 'desc' } }),
  );
  if (!params) {
    console.error(`\n${source.name} has no pricing parameters to copy.`);
    process.exit(1);
  }

  const overhead = Number(params.fixedMonthlyCosts) / params.expectedAppointments;
  console.log('\nPricing parameters:');
  console.log(`  tax ${percent(params.taxRate)} · card ${percent(params.cardFeeUpfront)} upfront / ${percent(params.cardFeeInstallment)} instalments`);
  console.log(`  fixed ${Number(params.fixedMonthlyCosts).toFixed(2)} over ${params.expectedAppointments} appointments = ${overhead.toFixed(2)} per appointment`);
  console.log(`  margin ${percent(params.defaultMargin)}`);

  // Versions are appended, never overwritten, so a re-run would stack an identical row
  // onto the history of the very table whose job is to explain why an old quote cost what
  // it cost. Skip when the target already reads the same — this script is meant to be
  // run again with --catalog.
  const targetParams = await withTenant(target.id, (tx) =>
    tx.pricingParams.findFirst({ where: { validFrom: { lte: new Date() } }, orderBy: { validFrom: 'desc' } }),
  );
  const paramsAlreadyMatch = targetParams !== null && sameRates(params, targetParams);
  if (paramsAlreadyMatch) {
    console.log(`  (${target.name} already reads exactly this; no new version)`);
  } else if (targetParams) {
    const existing = await withTenant(target.id, (tx) => tx.pricingParams.count());
    console.log(`  (${target.name} has ${existing} version(s) with other numbers; this adds one more)`);
  }

  // ── catalogue ──────────────────────────────────────────────────────────────
  const procedures = WITH_CATALOG
    ? await withTenant(source.id, (tx) =>
        tx.procedure.findMany({
          where: { active: true },
          include: { products: { where: { active: true }, orderBy: { brand: 'asc' } } },
          orderBy: { name: 'asc' },
        }),
      )
    : [];
  const rooms = WITH_CATALOG
    ? await withTenant(source.id, (tx) => tx.room.findMany({ where: { active: true }, orderBy: { name: 'asc' } }))
    : [];

  if (WITH_CATALOG) {
    console.log('\nCatalogue:');
    console.log(`  ${rooms.length} room(s)`);
    console.log(`  ${procedures.length} procedure(s), ${procedures.reduce((n, p) => n + p.products.length, 0)} product(s)`);
    console.log('  (stock lots are NOT copied — a lot is a physical box, not configuration)');
  } else {
    console.log('\nCatalogue: not copied (pass --catalog to include rooms, procedures and products).');
  }

  if (DRY_RUN) {
    console.log('\n--dry-run: nothing was written.\n');
    return;
  }

  await withTenant(target.id, async (tx) => {
    if (!paramsAlreadyMatch) {
      await tx.pricingParams.create({
        data: {
          tenantId: target.id,
          taxRate: params.taxRate,
          cardFeeUpfront: params.cardFeeUpfront,
          cardFeeInstallment: params.cardFeeInstallment,
          fixedMonthlyCosts: params.fixedMonthlyCosts,
          expectedAppointments: params.expectedAppointments,
          defaultMargin: params.defaultMargin,
        },
      });
    }

    for (const room of rooms) {
      await tx.room.upsert({
        where: { tenantId_name: { tenantId: target.id, name: room.name } },
        update: { hourlyRate: room.hourlyRate, notes: room.notes },
        create: { tenantId: target.id, name: room.name, hourlyRate: room.hourlyRate, notes: room.notes },
      });
    }

    for (const procedure of procedures) {
      const saved = await tx.procedure.upsert({
        where: { tenantId_name: { tenantId: target.id, name: procedure.name } },
        update: {
          disposablesCost: procedure.disposablesCost,
          defaultDurationHours: procedure.defaultDurationHours,
        },
        create: {
          tenantId: target.id,
          name: procedure.name,
          disposablesCost: procedure.disposablesCost,
          defaultDurationHours: procedure.defaultDurationHours,
        },
      });

      for (const product of procedure.products) {
        await tx.product.upsert({
          where: {
            tenantId_procedureId_brand: {
              tenantId: target.id,
              procedureId: saved.id,
              brand: product.brand,
            },
          },
          update: {
            purchaseCost: product.purchaseCost,
            yieldPerUnit: product.yieldPerUnit,
            purchaseUnit: product.purchaseUnit,
          },
          create: {
            tenantId: target.id,
            procedureId: saved.id,
            brand: product.brand,
            purchaseCost: product.purchaseCost,
            yieldPerUnit: product.yieldPerUnit,
            purchaseUnit: product.purchaseUnit,
          },
        });
      }
    }
  });

  console.log(`\n✅ Copied onto ${target.name}.`);
  if (!WITH_CATALOG) {
    console.log('   Closing an encounter also needs rooms, procedures and products —');
    console.log('   re-run with --catalog if the target has none.');
  }
  console.log();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
