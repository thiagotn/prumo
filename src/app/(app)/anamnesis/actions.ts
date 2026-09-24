'use server';

// Filling the anamnesis, and writing an edition of the questionnaire.
//
// A filling is never an update: answering again writes a new row and the previous one
// stays exactly as it was. The database enforces it too — `anamneses` refuses UPDATE.
import { Prisma, Role } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { audit } from '@/lib/audit';
import { requireModule, requireSensitiveModule } from '@/lib/auth/guards';
import { alertsIn, isEmpty, normalizeAnswers, type Answers, type Question } from '@/lib/anamnesis';
import { currentQuestionnaire } from '@/lib/anamnesis-source';
import { withTenant } from '@/lib/db';

export type AnamnesisState = { error?: string };

const fillSchema = z.object({
  patientId: z.string().uuid(),
  encounterId: z.string().uuid().optional(),
  appointmentId: z.string().uuid().optional(),
});

export async function fillAnamnesis(
  _previous: AnamnesisState,
  formData: FormData,
): Promise<AnamnesisState> {
  // Health data: 2FA settled and the access written to audit_log.
  const { tenant, session, masked, level } = await requireSensitiveModule('medicalRecord');
  if (!tenant) return { error: 'Esta tela pertence a uma clínica.' };
  if (masked) {
    return { error: 'Sessão assumida pela plataforma: o prontuário está mascarado.' };
  }

  const parsed = fillSchema.safeParse({
    patientId: formData.get('patientId'),
    encounterId: formData.get('encounterId') || undefined,
    appointmentId: formData.get('appointmentId') || undefined,
  });
  if (!parsed.success) return { error: 'Paciente não informada.' };
  const input = parsed.data;

  const result = await withTenant(tenant.id, async (tx) => {
    // Same scope the screen applies: 'own' means her own patients, and a patient id in a
    // form field is not a permission.
    const ownOnly = level === 'own' && session.role === Role.PRACTITIONER;
    const patient = await tx.patient.findFirst({
      where: {
        id: input.patientId,
        ...(ownOnly ? { appointments: { some: { practitionerId: session.userId } } } : {}),
      },
      select: { id: true, name: true },
    });
    if (!patient) return { ok: false, error: 'Paciente não encontrada.' } as const;

    const questionnaire = await currentQuestionnaire(tx, tenant.id);

    // Read the answers against the questions that were actually asked.
    const answers: Answers = {};
    for (const question of questionnaire.questions) {
      if (question.type === 'boolean') {
        const raw = formData.get(`q:${question.id}`);
        if (raw === 'sim' || raw === 'nao') {
          answers[question.id] = {
            value: raw === 'sim',
            detail: String(formData.get(`d:${question.id}`) ?? ''),
          };
        }
        continue;
      }
      answers[question.id] = { value: String(formData.get(`q:${question.id}`) ?? '') };
    }

    const clean = normalizeAnswers(questionnaire.questions, answers);
    if (isEmpty(clean)) {
      return { ok: false, error: 'Responda ao menos uma pergunta antes de salvar.' } as const;
    }

    const anamnesis = await tx.anamnesis.create({
      data: {
        tenantId: tenant.id,
        patientId: patient.id,
        templateId: questionnaire.id,
        encounterId: input.encounterId ?? null,
        questionsSnapshot: questionnaire.questions as unknown as Prisma.InputJsonValue,
        answers: clean as unknown as Prisma.InputJsonValue,
        alertCount: alertsIn(questionnaire.questions, clean).length,
        templateVersion: questionnaire.version,
        filledByUserId: session.userId,
      },
    });

    return { ok: true, id: anamnesis.id, patientId: patient.id, alerts: anamnesis.alertCount } as const;
  });

  if (!result.ok) return { error: result.error };

  await audit({
    tenantId: tenant.id,
    userId: session.userId,
    action: 'anamnesis.fill',
    resource: 'anamnesis',
    resourceId: result.id,
    // Never the answers themselves: the log is proof of the event, not a copy of the
    // record.
    details: { alerts: result.alerts },
  });

  revalidatePath('/anamnesis');
  revalidatePath('/encounter');
  revalidatePath('/patients');

  redirect(
    input.appointmentId
      ? `/encounter?appointment=${input.appointmentId}&anamnesis=1`
      : `/anamnesis?patient=${result.patientId}&saved=1`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The questionnaire itself
// ─────────────────────────────────────────────────────────────────────────────

const questionSchema = z.object({
  label: z.string().trim().min(5, 'A pergunta está curta demais.').max(200),
  type: z.enum(['boolean', 'text']),
  detailLabel: z.string().trim().max(120).default(''),
  alert: z.boolean(),
});

/**
 * Publishes an edition of the questionnaire. Like a consent term, it never overwrites:
 * what was answered stays attached to the questions that were asked.
 */
export async function saveQuestionnaire(
  _previous: AnamnesisState,
  formData: FormData,
): Promise<AnamnesisState> {
  const { tenant, session } = await requireModule('medicalRecord');
  if (!tenant) return { error: 'Esta tela pertence a uma clínica.' };
  // The wording of the anamnesis is the doctor's, like the wording of a consent term.
  if (session.role !== Role.OWNER) {
    return { error: 'Só a doutora edita o questionário da anamnese.' };
  }

  const labels = formData.getAll('label').map(String);
  const types = formData.getAll('type').map(String);
  const details = formData.getAll('detailLabel').map(String);
  const alerts = formData.getAll('alert').map(String);
  const ids = formData.getAll('id').map(String);

  const questions: Question[] = [];
  for (const [index, label] of labels.entries()) {
    if (!label.trim()) continue; // a row left blank is a question removed
    const parsed = questionSchema.safeParse({
      label,
      type: types[index] ?? 'boolean',
      detailLabel: details[index] ?? '',
      alert: alerts[index] === 'on',
    });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Pergunta inválida.' };

    const id = (ids[index] ?? '').trim() || `q${index + 1}-${Date.now().toString(36)}`;
    questions.push({
      id,
      label: parsed.data.label,
      type: parsed.data.type,
      ...(parsed.data.type === 'boolean' && parsed.data.detailLabel
        ? { detailLabel: parsed.data.detailLabel }
        : {}),
      ...(parsed.data.alert ? { alert: true } : {}),
    });
  }

  if (questions.length === 0) return { error: 'O questionário precisa de ao menos uma pergunta.' };
  if (new Set(questions.map((q) => q.id)).size !== questions.length) {
    return { error: 'Há perguntas repetidas no questionário.' };
  }

  const version = await withTenant(tenant.id, async (tx) => {
    const previous = await tx.anamnesisTemplate.findFirst({
      where: { tenantId: tenant.id },
      orderBy: { version: 'desc' },
    });
    if (previous?.current) {
      await tx.anamnesisTemplate.update({ where: { id: previous.id }, data: { current: false } });
    }
    const created = await tx.anamnesisTemplate.create({
      data: {
        tenantId: tenant.id,
        questions: questions as unknown as Prisma.InputJsonValue,
        version: (previous?.version ?? 0) + 1,
        current: true,
        createdByUserId: session.userId,
      },
    });
    return created.version;
  });

  await audit({
    tenantId: tenant.id,
    userId: session.userId,
    action: 'settings.save',
    resource: 'anamnesisTemplate',
    details: { version, questions: questions.length },
  });

  revalidatePath('/anamnesis');
  redirect('/anamnesis/questions?saved=1');
}
