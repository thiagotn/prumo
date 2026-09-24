import type { Metadata } from 'next';
import { Role } from '@prisma/client';
import { requireModuleWrite } from '@/lib/auth/guards';
import { withTenant } from '@/lib/db';
import { longDate } from '@/lib/format';
import {
  BOOKING_STEP_MINUTES,
  DAY_END_HOUR,
  DAY_START_HOUR,
  instantAtTime,
  todayKey,
} from '@/lib/schedule';
import { AppointmentForm } from '../appointment-form';
import styles from '../schedule.module.css';

export const metadata: Metadata = { title: 'Novo agendamento' };

/** The bookable half hours of the working day, as `HH:MM`. */
function bookableTimes(): string[] {
  const times: string[] = [];
  for (let hour = DAY_START_HOUR; hour < DAY_END_HOUR; hour++) {
    for (let minute = 0; minute < 60; minute += BOOKING_STEP_MINUTES) {
      times.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
    }
  }
  return times;
}

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string; hour?: string; patient?: string; room?: string }>;
}) {
  const { tenant } = await requireModuleWrite('schedule');
  const { day, hour, patient, room } = await searchParams;
  if (!tenant) return <p className="card-body">Esta tela pertence a uma clínica.</p>;

  const activeDay = /^\d{4}-\d{2}-\d{2}$/.test(day ?? '') ? day! : todayKey();
  const times = bookableTimes();
  const requestedTime = `${String(Number(hour)).padStart(2, '0')}:00`;
  const defaultTime = times.includes(requestedTime) ? requestedTime : (times[2] ?? times[0]!);

  const { patients, procedures, rooms, practitioners } = await withTenant(tenant.id, async (tx) => ({
    patients: await tx.patient.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, clinicalAlert: true },
      take: 500,
    }),
    procedures: await tx.procedure.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      include: {
        products: {
          where: { active: true },
          orderBy: { brand: 'asc' },
          select: { id: true, brand: true },
        },
      },
    }),
    rooms: await tx.room.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    practitioners: tenant.flags.multiplePractitioners
      ? await tx.user.findMany({
          where: { active: true, role: { in: [Role.OWNER, Role.PRACTITIONER] } },
          orderBy: { name: 'asc' },
          select: { id: true, name: true },
        })
      : [],
  }));

  return (
    <div>
      <div className="kicker">Agenda</div>
      <h2 className={styles.formTitle}>Novo agendamento</h2>
      <p className="card-body" style={{ maxWidth: 560, marginBottom: 'var(--space-5)' }}>
        {longDate(instantAtTime(activeDay, defaultTime) ?? new Date())} — a sala e o horário são o
        que o sistema confere antes de gravar.
      </p>

      <AppointmentForm
        patients={patients}
        procedures={procedures.map((p) => ({
          id: p.id,
          name: p.name,
          // The catalogue keeps chair time in hours; the form books in minutes.
          durationMinutes: Math.round(Number(p.defaultDurationHours) * 60),
          products: p.products,
        }))}
        rooms={rooms.map((r) => ({ id: r.id, name: r.name }))}
        practitioners={practitioners}
        defaults={{
          day: activeDay,
          time: defaultTime,
          patientId: patient ?? '',
          roomId: room && rooms.some((r) => r.id === room) ? room : (rooms[0]?.id ?? ''),
        }}
        times={times}
      />
    </div>
  );
}
