import type { Metadata } from 'next';
import Link from 'next/link';
import { Prisma, Role } from '@prisma/client';
import { requireModule } from '@/lib/auth/guards';
import { withTenant } from '@/lib/db';
import { longDate } from '@/lib/format';
import { canWrite } from '@/lib/rbac';
import {
  addDays,
  dayBounds,
  dayKey,
  daySlots,
  groupByDay,
  hourIn,
  slotLabel,
  STATUS_LABELS,
  STATUS_TAG,
  todayKey,
  weekDays,
} from '@/lib/schedule';
import { WriteDeniedNotice } from '../denied-notice';
import styles from './schedule.module.css';

export const metadata: Metadata = { title: 'Agenda' };

const VIEWS = [
  { key: 'day', label: 'Dia' },
  { key: 'week', label: 'Semana' },
  { key: 'list', label: 'Lista' },
] as const;

type ViewKey = (typeof VIEWS)[number]['key'];

const WEEKDAY_NAMES = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    day?: string;
    room?: string;
    denied?: string;
    saved?: string;
  }>;
}) {
  const { tenant, session, level } = await requireModule('schedule');
  const { view, day, room, denied, saved } = await searchParams;

  if (!tenant) return <p className="card-body">Esta tela pertence a uma clínica.</p>;

  const activeView: ViewKey = VIEWS.some((v) => v.key === view) ? (view as ViewKey) : 'day';
  const activeDay = /^\d{4}-\d{2}-\d{2}$/.test(day ?? '') ? day! : todayKey();
  const today = todayKey();

  // A guest practitioner sees only their own diary — the matrix says 'own', and this is
  // where that is enforced, not by hiding anything.
  const ownOnly = level === 'own' && session.role === Role.PRACTITIONER;
  const mayWrite = canWrite(session.role, 'schedule');

  const range =
    activeView === 'day'
      ? dayBounds(activeDay)
      : activeView === 'week'
        ? { from: dayBounds(weekDays(activeDay)[0]!).from, to: dayBounds(weekDays(activeDay)[5]!).to }
        : { from: dayBounds(activeDay).from, to: dayBounds(addDays(activeDay, 14)).to };

  const where: Prisma.AppointmentWhereInput = {
    startsAt: { gte: range.from, lt: range.to },
    ...(room ? { roomId: room } : {}),
    ...(ownOnly ? { practitionerId: session.userId } : {}),
  };

  const { appointments, rooms } = await withTenant(tenant.id, async (tx) => ({
    appointments: await tx.appointment.findMany({
      where,
      orderBy: { startsAt: 'asc' },
      include: { patient: true, room: true, procedure: true, product: true },
    }),
    rooms: await tx.room.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
  }));

  const href = (next: Partial<{ view: string; day: string; room: string }>) => {
    const merged = { view: activeView, day: activeDay, room: room ?? '', ...next };
    const sp = new URLSearchParams();
    if (merged.view !== 'day') sp.set('view', merged.view);
    if (merged.day !== today) sp.set('day', merged.day);
    if (merged.room) sp.set('room', merged.room);
    const query = sp.toString();
    return query ? `/schedule?${query}` : '/schedule';
  };

  const byDay = groupByDay(appointments);

  return (
    <div>
      <WriteDeniedNotice denied={denied} what="Agendar e remarcar" />
      {saved ? (
        <p className={styles.saved} role="status">
          Agendamento gravado.
        </p>
      ) : null}

      <div className={styles.toolbar}>
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={href({ view: v.key })}
            className={`btn ${v.key === activeView ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: 12 }}
          >
            {v.label}
          </Link>
        ))}

        <Link className="btn btn-secondary" href={href({ day: addDays(activeDay, activeView === 'week' ? -7 : -1) })} style={{ fontSize: 12 }}>
          ←
        </Link>
        <span className={styles.dayLabel}>
          {activeView === 'week'
            ? `${longDate(dayBounds(weekDays(activeDay)[0]!).from)} — ${longDate(dayBounds(weekDays(activeDay)[5]!).from)}`
            : longDate(dayBounds(activeDay).from)}
        </span>
        <Link className="btn btn-secondary" href={href({ day: addDays(activeDay, activeView === 'week' ? 7 : 1) })} style={{ fontSize: 12 }}>
          →
        </Link>
        {activeDay !== today ? (
          <Link className="btn btn-ghost" href={href({ day: today })} style={{ fontSize: 12 }}>
            Hoje
          </Link>
        ) : null}

        {mayWrite ? (
          <Link
            className="btn btn-primary touch"
            href={`/schedule/new?day=${activeDay}${room ? `&room=${room}` : ''}`}
            style={{ fontSize: 12 }}
          >
            Novo agendamento
          </Link>
        ) : null}

        <div className={styles.spacer} />

        <Link
          href={href({ room: '' })}
          className={`btn ${room ? 'btn-secondary' : 'btn-primary'}`}
          style={{ fontSize: 12 }}
        >
          Todas as salas
        </Link>
        {rooms.map((r) => (
          <Link
            key={r.id}
            href={href({ room: r.id })}
            className={`btn ${room === r.id ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: 12 }}
          >
            {r.name}
          </Link>
        ))}
      </div>

      {/* Mobile day picker — the week at a glance, thumb-sized. */}
      <div className={styles.dayPicker} data-testid="day-picker">
        {weekDays(activeDay).map((d, i) => (
          <Link
            key={d}
            href={href({ day: d, view: 'day' })}
            className={`${styles.dayPick} ${d === activeDay ? styles.dayPickActive : ''}`}
          >
            <span>{WEEKDAY_NAMES[i]}</span>
            <strong className="num">{d.slice(8)}</strong>
          </Link>
        ))}
      </div>

      {activeView === 'day' ? (
        <div className={styles.dayGrid}>
          {daySlots(activeDay).map((slot) => {
            const inSlot = appointments.filter((a) => hourIn(a.startsAt) === slot.hour);
            return (
              <div className={styles.slot} key={slot.hour}>
                <div className={`${styles.slotHour} num`}>{slot.hour}h</div>
                <div className={styles.slotBody}>
                  {inSlot.length === 0 ? (
                    mayWrite ? (
                      // A free slot is the shortest path to booking: it carries the day,
                      // the hour and the room filter into the form.
                      <Link
                        className={styles.free}
                        href={`/schedule/new?day=${activeDay}&hour=${slot.hour}${room ? `&room=${room}` : ''}`}
                      >
                        Livre · agendar
                      </Link>
                    ) : (
                      <span className={styles.free}>Livre</span>
                    )
                  ) : (
                    inSlot.map((a) =>
                      a.isBlock ? (
                        <div className={styles.block} key={a.id}>
                          <strong>Bloqueio</strong> · {a.notes ?? 'sala indisponível'}
                        </div>
                      ) : (
                        <Link className={styles.card} href={`/encounter?appointment=${a.id}`} key={a.id}>
                          <span>
                            <span className={styles.cardName}>{a.patient?.name ?? '—'}</span>
                            <br />
                            <span className={styles.cardDetail}>
                              {a.procedure?.name ?? 'Procedimento a definir'}
                              {a.product ? ` · ${a.product.brand}` : ''}
                            </span>
                          </span>
                          <span className={styles.cardMeta}>
                            <span className={styles.cardDetail}>{a.room?.name}</span>
                            <span className={`tag ${STATUS_TAG[a.status]}`}>
                              {STATUS_LABELS[a.status]}
                            </span>
                          </span>
                        </Link>
                      ),
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {activeView === 'week' ? (
        <div className={styles.weekGrid} data-testid="week-grid">
          {weekDays(activeDay).map((d, i) => (
            <div className={`${styles.weekColumn} ${d === today ? styles.weekToday : ''}`} key={d}>
              <div className={styles.weekHead}>
                <div className={styles.weekDayName}>{WEEKDAY_NAMES[i]}</div>
                <div className={`${styles.weekDayNumber} ${d === today ? styles.weekTodayNumber : ''} num`}>
                  {d.slice(8)}
                </div>
              </div>
              <div className={styles.weekItems}>
                {(byDay.get(d) ?? []).map((a) => (
                  <Link
                    className={styles.weekCard}
                    href={a.isBlock ? href({ day: d, view: 'day' }) : `/encounter?appointment=${a.id}`}
                    key={a.id}
                  >
                    <span className={`${styles.weekHour} num`}>{hourIn(a.startsAt)}h</span>
                    <br />
                    <span className={styles.weekName}>
                      {a.isBlock ? 'Bloqueio' : (a.patient?.name ?? '—')}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {activeView === 'list' ? (
        <div className={styles.listWrap}>
          {appointments.length === 0 ? (
            <p className={styles.empty}>Nenhum atendimento nos próximos 14 dias.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Hora</th>
                  <th>Paciente</th>
                  <th>Procedimento</th>
                  <th>Sala</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((a) => (
                  <tr key={a.id}>
                    <td className="num">{dayKey(a.startsAt).slice(8)}/{dayKey(a.startsAt).slice(5, 7)}</td>
                    <td className="num">{slotLabel(a.startsAt, a.endsAt)}</td>
                    <td>
                      {a.isBlock ? (
                        <em>Bloqueio</em>
                      ) : (
                        <Link href={`/encounter?appointment=${a.id}`}>{a.patient?.name ?? '—'}</Link>
                      )}
                    </td>
                    <td>
                      {a.procedure?.name ?? '—'}
                      {a.product ? ` · ${a.product.brand}` : ''}
                    </td>
                    <td>{a.room?.name ?? '—'}</td>
                    <td>
                      <span className={`tag ${STATUS_TAG[a.status]}`}>{STATUS_LABELS[a.status]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
    </div>
  );
}
