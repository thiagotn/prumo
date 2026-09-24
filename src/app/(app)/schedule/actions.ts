'use server';

// Booking a slot in the diary. The rule that matters here is the room: it holds one
// patient at a time, so a clash is refused with the appointment it collides with named,
// rather than written and discovered by two people arriving at once.
import { AppointmentStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { audit } from '@/lib/audit';
import { requireModuleWrite } from '@/lib/auth/guards';
import { withTenant } from '@/lib/db';
import {
  appointmentWindow,
  clashesIn,
  DAY_END_HOUR,
  DAY_START_HOUR,
  hourIn,
  slotLabel,
} from '@/lib/schedule';

/** What the form submitted, echoed back so a refused booking does not wipe the typing. */
export type AppointmentValues = {
  patientId: string;
  day: string;
  time: string;
  durationMinutes: string;
  roomId: string;
  procedureId: string;
  productId: string;
  practitionerId: string;
  status: string;
  notes: string;
};

export type AppointmentFormState = { error?: string; values?: AppointmentValues };

const appointmentSchema = z.object({
  patientId: z.string().uuid('Escolha a paciente.'),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Escolha o dia.'),
  time: z.string().trim().min(1, 'Escolha o horário.'),
  durationMinutes: z.coerce
    .number()
    .int()
    .min(15, 'A duração mínima é de 15 minutos.')
    .max(480, 'A duração máxima é de 8 horas.'),
  roomId: z.string().uuid('Escolha a sala.'),
  procedureId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  practitionerId: z.string().uuid().optional(),
  status: z.nativeEnum(AppointmentStatus),
  notes: z.string().trim().max(500).default(''),
});

/** Statuses the front desk may book with. Attended and no-show are outcomes, not plans. */
const BOOKABLE = [
  AppointmentStatus.WAITING,
  AppointmentStatus.CONFIRMED,
] as const satisfies readonly AppointmentStatus[];

export async function createAppointment(
  _previous: AppointmentFormState,
  formData: FormData,
): Promise<AppointmentFormState> {
  const { tenant, session } = await requireModuleWrite('schedule');

  const text = (field: string) => String(formData.get(field) ?? '');
  const values: AppointmentValues = {
    patientId: text('patientId'),
    day: text('day'),
    time: text('time'),
    durationMinutes: text('durationMinutes'),
    roomId: text('roomId'),
    procedureId: text('procedureId'),
    productId: text('productId'),
    practitionerId: text('practitionerId'),
    status: text('status') || AppointmentStatus.WAITING,
    notes: text('notes'),
  };
  // React resets an uncontrolled form once the action returns. A clash is the most likely
  // refusal here, and the front desk has to be able to change only the hour and retry.
  const fail = (error: string): AppointmentFormState => ({ error, values });

  if (!tenant) return fail('Esta tela pertence a uma clínica.');

  const parsed = appointmentSchema.safeParse({
    ...values,
    procedureId: values.procedureId || undefined,
    productId: values.productId || undefined,
    practitionerId: values.practitionerId || undefined,
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const input = parsed.data;

  if (!BOOKABLE.includes(input.status as (typeof BOOKABLE)[number])) {
    return fail('Um agendamento novo entra como Aguardando ou Confirmado.');
  }

  const window = appointmentWindow(input.day, input.time, input.durationMinutes);
  if (!window) return fail('Horário inválido.');

  // The day grid runs from DAY_START_HOUR to DAY_END_HOUR. Booking outside it would
  // create an appointment that only the list view can see.
  const startHour = hourIn(window.startsAt);
  if (startHour < DAY_START_HOUR || startHour >= DAY_END_HOUR) {
    return fail(`A agenda vai das ${DAY_START_HOUR}h às ${DAY_END_HOUR}h.`);
  }

  const result = await withTenant(tenant.id, async (tx) => {
    const [patient, room] = await Promise.all([
      tx.patient.findUnique({ where: { id: input.patientId } }),
      tx.room.findUnique({ where: { id: input.roomId } }),
    ]);
    if (!patient) return { ok: false, error: 'Paciente não encontrada.' } as const;
    if (!room) return { ok: false, error: 'Sala não encontrada.' } as const;

    // Anything that could overlap the proposed window, not only what starts in the same
    // hour: a 90-minute appointment starting at 14h collides with one at 15h, and one
    // that started the evening before can still be running. Twelve hours of margin
    // covers the longest bookable appointment.
    //
    // Inside the transaction, but not race-proof: two people booking the same slot in the
    // same second can both pass it. Making the database hold the rule would take an
    // EXCLUDE constraint over (room_id, tstzrange(starts_at, ends_at)), which needs
    // btree_gist in the shared Postgres — not enabled there yet.
    const neighbours = await tx.appointment.findMany({
      where: {
        startsAt: {
          gte: new Date(window.startsAt.getTime() - 12 * 3_600_000),
          lt: window.endsAt,
        },
        roomId: input.roomId,
        status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] },
      },
      include: { patient: { select: { name: true } } },
    });

    const clashes = clashesIn({ ...window, roomId: input.roomId }, neighbours);
    if (clashes.length > 0) {
      const clash = clashes[0]!;
      const who = clash.isBlock ? 'um bloqueio' : (clash.patient?.name ?? 'outro atendimento');
      return {
        ok: false,
        error: `${room.name} já tem ${who} das ${slotLabel(clash.startsAt, clash.endsAt)}. Escolha outro horário ou outra sala.`,
      } as const;
    }

    const appointment = await tx.appointment.create({
      data: {
        tenantId: tenant.id,
        patientId: patient.id,
        roomId: room.id,
        procedureId: input.procedureId ?? null,
        productId: input.productId ?? null,
        practitionerId: input.practitionerId ?? null,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        status: input.status,
        isBlock: false,
        notes: input.notes || null,
      },
    });
    return { ok: true, id: appointment.id, patientName: patient.name } as const;
  });

  if (!result.ok) return fail(result.error);

  await audit({
    tenantId: tenant.id,
    userId: session.userId,
    action: 'appointment.create',
    resource: 'appointment',
    resourceId: result.id,
    details: { day: input.day, durationMinutes: input.durationMinutes },
  });

  revalidatePath('/schedule');
  revalidatePath('/dashboard');
  redirect(`/schedule?day=${input.day}&saved=1`);
}
