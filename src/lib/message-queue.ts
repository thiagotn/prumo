// Filling the outbox.
//
// Messages are queued when the thing that justifies them happens — a booking, a closing,
// an absence — and the text is rendered and frozen right there. A queue that stores "send
// the 24h reminder for appointment X" would have to re-derive the wording at send time,
// by which point the appointment may have moved and the template may have been rewritten.
import 'server-only';
import { MessageStatus, type MessageKind as PrismaKind } from '@prisma/client';
import type { Tx } from './db';
import { shortDate } from './format';
import {
  DEFAULT_BODIES,
  dedupeKey,
  dueAt,
  MESSAGE_KINDS,
  renderMessage,
  toE164,
  type MessageKind,
} from './messages';
import { slotLabel } from './schedule';

export type TemplateSettings = Record<MessageKind, { body: string; enabled: boolean }>;

/**
 * The clinic's wording, with the defaults filling any gap. A tenant that never opened the
 * screen still has working automations.
 */
export async function templatesFor(tx: Tx, tenantId: string): Promise<TemplateSettings> {
  const rows = await tx.messageTemplate.findMany({ where: { tenantId } });
  const settings = {} as TemplateSettings;
  for (const kind of MESSAGE_KINDS) {
    const row = rows.find((r) => r.kind === kind);
    settings[kind] = { body: row?.body ?? DEFAULT_BODIES[kind], enabled: row?.enabled ?? true };
  }
  return settings;
}

type AppointmentForMessages = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  patientId: string | null;
  patient: { name: string; phone: string | null; active: boolean } | null;
  procedure: { name: string } | null;
  room: { name: string } | null;
};

function variablesFor(appointment: AppointmentForMessages, clinicName: string) {
  return {
    paciente: appointment.patient?.name.split(/\s+/)[0] ?? '',
    clinica: clinicName,
    data: shortDate(appointment.startsAt),
    hora: slotLabel(appointment.startsAt, appointment.endsAt).split('–')[0] ?? '',
    procedimento: appointment.procedure?.name ?? '',
    sala: appointment.room?.name ?? '',
  };
}

type QueueContext = {
  tenantId: string;
  clinicName: string;
  /**
   * A flag `messageAutomation` da clínica. Obrigatória de propósito: quem chama tem o
   * tenant em mãos e o compilador cobra a decisão — uma fila que enche sozinha para uma
   * clínica que nunca vai enviar é dívida silenciosa, e some da vista até o dia em que
   * alguém conecta o canal e ela sai toda de uma vez.
   */
  automation: boolean;
  templates: TemplateSettings;
  now?: Date;
};

/**
 * Queues one message, unless there is a reason not to. Returns what happened, so the
 * caller can say "3 lembretes na fila" rather than guessing.
 */
async function enqueue(
  tx: Tx,
  context: QueueContext,
  kind: MessageKind,
  input: {
    patientId: string;
    appointmentId?: string;
    phone: string | null;
    variables: Parameters<typeof renderMessage>[1];
    reference: Date;
    key: string;
  },
): Promise<'queued' | 'off' | 'disabled' | 'no-phone' | 'too-late' | 'duplicate'> {
  // Módulo desligado é diferente de automação desligada: ali a clínica escolheu não usar
  // uma das seis; aqui ela não usa comunicação automática nenhuma.
  if (!context.automation) return 'off';

  const template = context.templates[kind];
  if (!template.enabled) return 'disabled';

  const phone = input.phone ? toE164(input.phone) : null;
  if (!phone) return 'no-phone';

  const scheduledFor = dueAt(kind, input.reference);
  const now = context.now ?? new Date();
  // A booking made this afternoon for tomorrow has already missed its 24h reminder. The
  // message is skipped rather than sent late, which would read as a mistake.
  if (scheduledFor.getTime() < now.getTime() - 60_000) return 'too-late';

  const existing = await tx.messageJob.findFirst({
    where: { tenantId: context.tenantId, dedupeKey: input.key },
    select: { id: true },
  });
  if (existing) return 'duplicate';

  await tx.messageJob.create({
    data: {
      tenantId: context.tenantId,
      kind: kind as PrismaKind,
      patientId: input.patientId,
      appointmentId: input.appointmentId ?? null,
      phone,
      body: renderMessage(template.body, input.variables),
      scheduledFor,
      dedupeKey: input.key,
    },
  });
  return 'queued';
}

/** The reminders a new booking earns: the preparation, then the confirmation. */
export async function enqueueForAppointment(
  tx: Tx,
  context: Omit<QueueContext, 'templates'> & { templates?: TemplateSettings },
  appointment: AppointmentForMessages,
): Promise<number> {
  if (!context.automation) return 0;
  if (!appointment.patientId || !appointment.patient?.active) return 0;
  const templates = context.templates ?? (await templatesFor(tx, context.tenantId));
  const full = { ...context, templates };
  const variables = variablesFor(appointment, context.clinicName);

  let queued = 0;
  for (const kind of ['PREP_48H', 'REMINDER_24H'] as const) {
    const result = await enqueue(tx, full, kind, {
      patientId: appointment.patientId,
      appointmentId: appointment.id,
      phone: appointment.patient.phone,
      variables,
      reference: appointment.startsAt,
      key: dedupeKey(kind, { appointmentId: appointment.id }),
    });
    if (result === 'queued') queued++;
  }
  return queued;
}

/** What follows a closing: how are you tomorrow, and shall we look at it in two weeks. */
export async function enqueueAfterEncounter(
  tx: Tx,
  context: Omit<QueueContext, 'templates'> & { templates?: TemplateSettings },
  appointment: AppointmentForMessages,
): Promise<number> {
  if (!context.automation) return 0;
  if (!appointment.patientId || !appointment.patient?.active) return 0;
  const templates = context.templates ?? (await templatesFor(tx, context.tenantId));
  const full = { ...context, templates };
  const variables = variablesFor(appointment, context.clinicName);

  let queued = 0;
  for (const kind of ['FOLLOW_UP_1D', 'RETURN_14D'] as const) {
    const result = await enqueue(tx, full, kind, {
      patientId: appointment.patientId,
      appointmentId: appointment.id,
      phone: appointment.patient.phone,
      variables,
      reference: appointment.startsAt,
      key: dedupeKey(kind, { appointmentId: appointment.id }),
    });
    if (result === 'queued') queued++;
  }
  return queued;
}

/** The note after an absence. Goes out at once, while the patient still remembers. */
export async function enqueueNoShow(
  tx: Tx,
  context: Omit<QueueContext, 'templates'> & { templates?: TemplateSettings },
  appointment: AppointmentForMessages,
): Promise<number> {
  if (!context.automation) return 0;
  if (!appointment.patientId || !appointment.patient?.active) return 0;
  const templates = context.templates ?? (await templatesFor(tx, context.tenantId));
  const result = await enqueue(
    tx,
    { ...context, templates },
    'NO_SHOW_POLICY',
    {
      patientId: appointment.patientId,
      appointmentId: appointment.id,
      phone: appointment.patient.phone,
      variables: variablesFor(appointment, context.clinicName),
      reference: context.now ?? new Date(),
      key: dedupeKey('NO_SHOW_POLICY', { appointmentId: appointment.id }),
    },
  );
  return result === 'queued' ? 1 : 0;
}

/**
 * Drops what has not gone out yet for an appointment. Called when it is cancelled or
 * moved: a reminder for a horário that no longer exists is worse than no reminder.
 */
export async function cancelPendingFor(tx: Tx, appointmentId: string): Promise<number> {
  const { count } = await tx.messageJob.updateMany({
    where: { appointmentId, status: MessageStatus.PENDING },
    data: { status: MessageStatus.CANCELLED },
  });
  return count;
}

/** Birthdays falling on a given clinic day. Called by the dispatcher, once a day. */
export async function enqueueBirthdays(
  tx: Tx,
  context: Omit<QueueContext, 'templates'> & { templates?: TemplateSettings },
  today: Date,
): Promise<number> {
  if (!context.automation) return 0;
  const templates = context.templates ?? (await templatesFor(tx, context.tenantId));
  if (!templates.BIRTHDAY.enabled) return 0;

  const month = today.getUTCMonth() + 1;
  const day = today.getUTCDate();
  // The column is a date, so the comparison is on the stored month and day.
  const patients = await tx.$queryRaw<Array<{ id: string; name: string; phone: string | null }>>`
    SELECT "id", "name", "phone"
      FROM "patients"
     WHERE "active"
       AND "birth_date" IS NOT NULL
       AND EXTRACT(MONTH FROM "birth_date") = ${month}
       AND EXTRACT(DAY FROM "birth_date") = ${day}
  `;

  let queued = 0;
  for (const patient of patients) {
    const result = await enqueue(tx, { ...context, templates }, 'BIRTHDAY', {
      patientId: patient.id,
      phone: patient.phone,
      variables: { paciente: patient.name.split(/\s+/)[0] ?? '', clinica: context.clinicName },
      reference: today,
      key: dedupeKey('BIRTHDAY', { patientId: patient.id, year: today.getUTCFullYear() }),
    });
    if (result === 'queued') queued++;
  }
  return queued;
}
