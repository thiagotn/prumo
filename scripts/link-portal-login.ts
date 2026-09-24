// Gives a patient access to the portal: creates (or reuses) her login and points it at
// her clinical record. Until the reseller panel (stage 8) there is no screen for this.
//
// Usage:
//   npx tsx --tsconfig tsconfig.scripts.json scripts/link-portal-login.ts \
//     --host app.clinic.example --email paciente@exemplo.com --patient <uuid>
//
// Or by CPF, which is what the front desk has at hand:
//   ... --host app.clinic.example --email paciente@exemplo.com --document 529.982.247-25
//
// The password is generated here and printed ONCE — only its hash is stored. The patient
// role needs no second factor: the portal holds no medical record.
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { Role } from '@prisma/client';
import { hashPassword } from '../src/lib/auth/password';
import { prisma, withTenant } from '../src/lib/db';
import { digitsOnly } from '../src/lib/patient';
import { normalizeHost, tenantByHost } from '../src/lib/tenant';

const { values } = parseArgs({
  options: {
    host: { type: 'string' },
    email: { type: 'string' },
    patient: { type: 'string' },
    document: { type: 'string' },
    name: { type: 'string' },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main() {
  const host = values.host ?? fail('--host é obrigatório (o endereço da clínica).');
  const email = values.email?.trim().toLowerCase() ?? fail('--email é obrigatório.');
  if (!values.patient && !values.document && !values.name) {
    fail('Informe --patient <uuid>, --document <cpf> ou --name "<nome completo>".');
  }

  const tenant = await tenantByHost(normalizeHost(host));
  if (!tenant) fail(`Nenhuma clínica responde por ${host}.`);

  const password = randomBytes(9).toString('base64url');
  const passwordHash = await hashPassword(password);
  let created = true;

  const result = await withTenant(tenant.id, async (tx) => {
    const patient = values.patient
      ? await tx.patient.findUnique({ where: { id: values.patient } })
      : values.document
        ? await tx.patient.findFirst({ where: { document: digitsOnly(values.document) } })
        : await tx.patient.findFirst({ where: { name: values.name } });
    if (!patient) return { error: 'Paciente não encontrada nesta clínica.' } as const;

    // One login per record: the portal reads by this link, and two logins pointing at the
    // same patient would be two people holding one set of documents.
    const taken = await tx.user.findFirst({
      where: { patientId: patient.id, NOT: { email } },
      select: { email: true },
    });
    if (taken) {
      return { error: `Essa paciente já tem acesso pelo e-mail ${taken.email}.` } as const;
    }

    // An existing login keeps its password: this script links an account to a record, and
    // resetting a password as a side effect of that would be a surprise. Use
    // scripts/reset-password.ts when that is what you mean.
    const existing = await tx.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email } },
      select: { id: true },
    });
    created = existing === null;

    const user = await tx.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email } },
      update: { patientId: patient.id, active: true, role: Role.PATIENT },
      create: {
        tenantId: tenant.id,
        name: patient.name,
        email,
        role: Role.PATIENT,
        passwordHash,
        patientId: patient.id,
      },
    });
    return { user, patient } as const;
  });

  const error = 'error' in result ? result.error : null;
  if (error) fail(error);
  const { patient } = result as Exclude<typeof result, { error: string }>;

  console.log(`✅ ${patient.name} agora entra no portal de ${tenant.name}.`);
  console.log(`   Endereço: https://${host}`);
  console.log(`   E-mail:   ${email}`);
  if (created) {
    console.log(`   Senha:    ${password}`);
    console.log('   Esta senha aparece uma vez só. Peça que ela troque no primeiro acesso.');
  } else {
    console.log('   A senha continua a que ela já usava — este comando só ligou o cadastro.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
