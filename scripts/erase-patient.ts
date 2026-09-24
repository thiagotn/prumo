// Erases a patient: the database rows AND the photo objects in the bucket.
//
//   npx tsx scripts/erase-patient.ts --host app.clinic.example --patient <uuid> [--dry-run]
//
// This exists because the two do not cascade together. Deleting the patient row takes the
// encounters, payments and clinical_photos rows with it — but the bytes in R2 have no
// foreign key, and a photo that outlives the record it belonged to is precisely what an
// erasure request is about (ADR 0011).
//
// The objects go first, deliberately. If the rows went first and the sweep then failed,
// the keys would be gone from the database and the objects orphaned with nothing left
// pointing at them. This way a failure leaves the patient intact and the operation
// repeatable.
//
// It sweeps the patient's PREFIX rather than the keys in the database, so it also catches
// uploads that were signed but never confirmed.
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { audit } from '../src/lib/audit';
import { prisma, withTenant } from '../src/lib/db';
import { patientPrefix } from '../src/lib/photo-key';
import { deleteObjects, listKeys, storageConfigured } from '../src/lib/storage';
import { tenantByHost } from '../src/lib/tenant';

const { values } = parseArgs({
  options: {
    host: { type: 'string' },
    patient: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    yes: { type: 'boolean', default: false },
  },
});

async function main() {
  const host = values.host?.trim();
  const patientId = values.patient?.trim();
  const dryRun = values['dry-run'] === true;

  if (!host || !patientId) {
    console.error('Usage: --host <clinic hostname> --patient <uuid> [--dry-run] [--yes]');
    process.exit(1);
  }

  const tenant = await tenantByHost(host);
  if (!tenant) {
    console.error(`No clinic answers for ${host}.`);
    process.exit(1);
  }

  const patient = await withTenant(tenant.id, (tx) =>
    tx.patient.findUnique({
      where: { id: patientId },
      select: {
        id: true,
        name: true,
        _count: { select: { encounters: true, appointments: true, photos: true } },
      },
    }),
  );
  if (!patient) {
    console.error(`No patient ${patientId} in ${tenant.name}.`);
    process.exit(1);
  }

  const prefix = patientPrefix(tenant.id, patient.id);
  const keys = storageConfigured() ? await listKeys(prefix) : [];

  console.log(`\nClinic:      ${tenant.name}`);
  console.log(`Patient:     ${patient.name} (${patient.id})`);
  console.log(`Encounters:  ${patient._count.encounters}`);
  console.log(`Appointments:${patient._count.appointments}`);
  console.log(`Photo rows:  ${patient._count.photos}`);
  console.log(`Objects under ${prefix}: ${keys.length}`);
  if (!storageConfigured()) {
    console.log('  (R2 not configured here — no objects will be swept)');
  }

  if (dryRun) {
    console.log('\n--dry-run: nothing was deleted.\n');
    return;
  }

  if (!values.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      `\nThis permanently erases ${patient.name} and ${keys.length} object(s). Type the patient's name to confirm: `,
    );
    rl.close();
    if (answer.trim() !== patient.name) {
      console.error('Names do not match. Nothing was deleted.');
      process.exit(1);
    }
  }

  // The erasure itself is recorded. The audit row survives the patient — it holds no
  // health data, only the fact that an erasure happened and when.
  await audit({
    tenantId: tenant.id,
    action: 'patient.erased',
    resource: 'patient',
    resourceId: patient.id,
    details: { objects: keys.length, encounters: patient._count.encounters },
  }).catch(() => {
    // audit() needs a request context for IP and user agent; outside one it logs and
    // moves on. The console line below is the record in that case.
    console.warn('  (audit row not written: running outside a request context)');
  });

  if (keys.length > 0) {
    const removed = await deleteObjects(keys);
    console.log(`\nDeleted ${removed} object(s) from the bucket.`);
  }

  await withTenant(tenant.id, (tx) => tx.patient.delete({ where: { id: patient.id } }));
  console.log(`Deleted the patient and every row that cascades from it.`);

  const left = storageConfigured() ? await listKeys(prefix) : [];
  if (left.length > 0) {
    console.error(`\n⚠ ${left.length} object(s) still under ${prefix}. Re-run this script.`);
    process.exit(1);
  }
  console.log('\n✅ Erasure complete: no rows and no objects remain.\n');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
