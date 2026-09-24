'use server';

// Registering a patient. The front desk types this at the counter, often with the patient
// on the phone, so the rules are few and the messages say what to do: name is the only
// thing genuinely required, and everything else can arrive later.
import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { audit } from '@/lib/audit';
import { requireModuleWrite } from '@/lib/auth/guards';
import { withTenant } from '@/lib/db';
import { isValidCpf, digitsOnly, normalizePhone, parseBirthDate } from '@/lib/patient';

/** What the form submitted, echoed back so a refused save does not wipe the typing. */
export type PatientValues = {
  id?: string;
  name: string;
  birthDate: string;
  phone: string;
  email: string;
  document: string;
  clinicalAlert: string;
  notes: string;
  active: boolean;
};

export type PatientFormState = { error?: string; values?: PatientValues };

const patientSchema = z.object({
  id: z.string().uuid().optional(),
  name: z
    .string()
    .trim()
    .min(3, 'Informe o nome completo da paciente.')
    .max(120, 'O nome ficou longo demais.'),
  birthDate: z.string().trim().max(10).default(''),
  phone: z.string().trim().max(40).default(''),
  email: z.string().trim().max(160).default(''),
  document: z.string().trim().max(20).default(''),
  clinicalAlert: z.string().trim().max(200, 'O alerta clínico é uma linha curta.').default(''),
  notes: z.string().trim().max(2000).default(''),
  active: z.boolean().default(true),
});

/** Thrown inside the transaction when the id does not belong to this tenant. */
class PatientNotFound extends Error {}

/**
 * Creates or updates a patient. One action for both: the form is the same, and an edit
 * that silently created a second record would be worse than an error.
 */
export async function savePatient(
  _previous: PatientFormState,
  formData: FormData,
): Promise<PatientFormState> {
  const { tenant, session } = await requireModuleWrite('patients');

  const text = (field: string) => String(formData.get(field) ?? '');
  const values: PatientValues = {
    id: text('id') || undefined,
    name: text('name'),
    birthDate: text('birthDate'),
    phone: text('phone'),
    email: text('email'),
    document: text('document'),
    clinicalAlert: text('clinicalAlert'),
    notes: text('notes'),
    // The form always renders the checkbox, so an absent value means unchecked.
    active: formData.get('active') === 'on',
  };
  // React resets an uncontrolled form once the action returns, so every refusal carries
  // the typing back with it. Otherwise one wrong digit empties the whole counter form.
  const fail = (error: string): PatientFormState => ({ error, values });

  if (!tenant) return fail('Esta tela pertence a uma clínica.');

  const parsed = patientSchema.safeParse(values);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const input = parsed.data;

  const birth = parseBirthDate(input.birthDate);
  if (!birth.ok) return fail(birth.error);

  let phone: string | null = null;
  if (input.phone) {
    const normalized = normalizePhone(input.phone);
    if (!normalized.ok) return fail(normalized.error);
    phone = normalized.digits;
  }

  if (input.email && !z.email().safeParse(input.email).success) {
    return fail('E-mail inválido.');
  }

  let document: string | null = null;
  if (input.document) {
    if (!isValidCpf(input.document)) return fail('CPF inválido. Confira os números.');
    document = digitsOnly(input.document);
  }

  const data = {
    name: input.name,
    birthDate: birth.date,
    phone,
    email: input.email || null,
    document,
    clinicalAlert: input.clinicalAlert || null,
    notes: input.notes || null,
    active: input.active,
  };

  let patientId: string;
  try {
    patientId = await withTenant(tenant.id, async (tx) => {
      if (input.id) {
        // updateMany, not update: RLS scopes the rows, and a patient from another clinic
        // has to come back as "not found" rather than as a row this session may write.
        const changed = await tx.patient.updateMany({ where: { id: input.id }, data });
        if (changed.count === 0) throw new PatientNotFound();
        return input.id;
      }
      const created = await tx.patient.create({ data: { tenantId: tenant.id, ...data } });
      return created.id;
    });
  } catch (error) {
    if (error instanceof PatientNotFound) return fail('Paciente não encontrada.');
    // The unique index on (tenant, CPF) is what stops the same person being registered
    // twice — which is how a history ends up split across two records.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return fail('Já existe uma paciente com esse CPF nesta clínica.');
    }
    throw error;
  }

  await audit({
    tenantId: tenant.id,
    userId: session.userId,
    action: input.id ? 'patient.update' : 'patient.create',
    resource: 'patient',
    resourceId: patientId,
    // Never the clinical alert itself: the log is proof of access, not a copy of the data.
    details: { hasClinicalAlert: data.clinicalAlert !== null },
  });

  revalidatePath('/patients');
  revalidatePath('/schedule');
  redirect(`/patients?selected=${patientId}&saved=1`);
}
