// Schedule logic, kept free of database and React so it can be tested directly.
//
// Everything here works in the clinic's timezone rather than the server's. A diary that
// silently shifts by three hours because the container runs in UTC is worse than one
// that does not load, and this is the module where that would happen.

/** The clinic's timezone. Per-tenant configuration lands with multiple units (stage 8). */
export const CLINIC_TIME_ZONE = 'America/Sao_Paulo';

/** Working hours shown in the day grid. Configurable per tenant in a later stage. */
export const DAY_START_HOUR = 8;
export const DAY_END_HOUR = 19;

export type Slot = {
  hour: number;
  /** Start of this hour, as an absolute instant. */
  startsAt: Date;
  endsAt: Date;
};

/**
 * Formats a date in the clinic's timezone. Intl does the conversion, which keeps the
 * daylight-saving rules out of our hands.
 */
function partsIn(date: Date, timeZone = CLINIC_TIME_ZONE): Record<string, string> {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
}

/** The calendar day of an instant, in the clinic's timezone, as `YYYY-MM-DD`. */
export function dayKey(date: Date, timeZone = CLINIC_TIME_ZONE): string {
  const p = partsIn(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** The hour of the day of an instant, in the clinic's timezone. */
export function hourIn(date: Date, timeZone = CLINIC_TIME_ZONE): number {
  // Intl renders midnight as "24" in some locales; normalise it.
  const hour = Number(partsIn(date, timeZone).hour);
  return hour === 24 ? 0 : hour;
}

/**
 * Converts a `YYYY-MM-DD` plus an hour in the clinic's timezone into an absolute instant.
 *
 * Done by probing rather than by assuming a fixed offset: São Paulo has dropped daylight
 * saving, but the tenant may not stay there, and a hardcoded -03:00 would be a bug that
 * only shows up once a year.
 */
export function instantAt(
  day: string,
  hour: number,
  timeZone = CLINIC_TIME_ZONE,
  minute = 0,
): Date {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  // Start from the wall-clock time treated as UTC, then correct by the observed offset.
  const naive = Date.UTC(year, month - 1, date, hour, minute, 0);
  const guess = new Date(naive);
  const p = partsIn(guess, timeZone);
  const asSeen = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) === 24 ? 0 : Number(p.hour),
    Number(p.minute),
  );
  return new Date(naive + (naive - asSeen));
}

/** `HH:MM` as the time input submits it, into an instant in the clinic's timezone. */
export function instantAtTime(day: string, time: string, timeZone = CLINIC_TIME_ZONE): Date | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return instantAt(day, hour, timeZone, minute);
}

/** Minutes offered when booking: the half hours of the working day. */
export const BOOKING_STEP_MINUTES = 30;

/**
 * The slot a booking occupies, from the day, the start time and a duration in minutes.
 * Returns null when the form sent something that is not a time — the caller turns that
 * into a message, never into a row.
 */
export function appointmentWindow(
  day: string,
  time: string,
  durationMinutes: number,
  timeZone = CLINIC_TIME_ZONE,
): { startsAt: Date; endsAt: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;
  const startsAt = instantAtTime(day, time, timeZone);
  if (!startsAt) return null;
  // Added as elapsed time, not as wall clock: an appointment lasts its duration even on
  // the night the clock changes.
  return { startsAt, endsAt: new Date(startsAt.getTime() + durationMinutes * 60_000) };
}

/** The `HH:MM` a time input expects, from an instant, in the clinic's timezone. */
export function timeInputValue(date: Date, timeZone = CLINIC_TIME_ZONE): string {
  const p = partsIn(date, timeZone);
  const hour = p.hour === '24' ? '00' : p.hour;
  return `${hour}:${p.minute}`;
}

/** Whole minutes between two instants — the duration of an existing appointment. */
export function durationMinutes(startsAt: Date, endsAt: Date): number {
  return Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000);
}

/** The hour slots of a day, as absolute instants. */
export function daySlots(day: string, timeZone = CLINIC_TIME_ZONE): Slot[] {
  const slots: Slot[] = [];
  for (let hour = DAY_START_HOUR; hour < DAY_END_HOUR; hour++) {
    slots.push({
      hour,
      startsAt: instantAt(day, hour, timeZone),
      endsAt: instantAt(day, hour + 1, timeZone),
    });
  }
  return slots;
}

/** Start and end of a calendar day, for querying a range. */
export function dayBounds(day: string, timeZone = CLINIC_TIME_ZONE): { from: Date; to: Date } {
  return { from: instantAt(day, 0, timeZone), to: instantAt(day, 24, timeZone) };
}

/** Monday to Saturday of the week containing `day` — the six columns of the week view. */
export function weekDays(day: string, timeZone = CLINIC_TIME_ZONE): string[] {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  const noon = new Date(Date.UTC(year, month - 1, date, 12));
  // getUTCDay: 0 is Sunday. The clinic's week runs Monday to Saturday.
  const weekday = noon.getUTCDay();
  const offsetToMonday = weekday === 0 ? -6 : 1 - weekday;
  const days: string[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(noon.getTime() + (offsetToMonday + i) * 86_400_000);
    days.push(dayKey(d, timeZone));
  }
  return days;
}

/** Shifts a `YYYY-MM-DD` by whole days. */
export function addDays(day: string, amount: number): string {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(year, month - 1, date + amount, 12));
  return shifted.toISOString().slice(0, 10);
}

export function todayKey(timeZone = CLINIC_TIME_ZONE): string {
  return dayKey(new Date(), timeZone);
}

/** Two intervals overlap when each starts before the other ends. Touching is not overlap. */
export function overlaps(
  a: { startsAt: Date; endsAt: Date },
  b: { startsAt: Date; endsAt: Date },
): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

/**
 * Finds appointments that clash with a proposed slot in the same room. A room holds one
 * patient at a time, so this is what stops a double booking.
 */
export function clashesIn<T extends { id: string; startsAt: Date; endsAt: Date; roomId: string | null }>(
  proposed: { startsAt: Date; endsAt: Date; roomId: string | null; id?: string },
  existing: T[],
): T[] {
  if (!proposed.roomId) return [];
  return existing.filter(
    (other) =>
      other.id !== proposed.id &&
      other.roomId === proposed.roomId &&
      overlaps(proposed, other),
  );
}

/** Groups appointments by calendar day, for the week and list views. */
export function groupByDay<T extends { startsAt: Date }>(
  items: T[],
  timeZone = CLINIC_TIME_ZONE,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = dayKey(item.startsAt, timeZone);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(item);
    else grouped.set(key, [item]);
  }
  for (const bucket of grouped.values()) {
    bucket.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  }
  return grouped;
}

/** Product copy, pt-BR. */
export const STATUS_LABELS = {
  CONFIRMED: 'Confirmado',
  WAITING: 'Aguardando',
  ATTENDED: 'Atendido',
  NO_SHOW: 'Faltou',
  CANCELLED: 'Cancelado',
} as const;

/** Tag class from the design system, per status (docs/especificacao.md, screen 3). */
export const STATUS_TAG = {
  CONFIRMED: 'tag-accent',
  WAITING: 'tag-outline',
  ATTENDED: 'tag-neutral',
  NO_SHOW: 'tag-outline',
  CANCELLED: 'tag-neutral',
} as const;

/** Formats an hour range as the diary shows it: "14h" or "14h–15h30". */
export function slotLabel(startsAt: Date, endsAt: Date, timeZone = CLINIC_TIME_ZONE): string {
  const from = partsIn(startsAt, timeZone);
  const to = partsIn(endsAt, timeZone);
  const render = (p: Record<string, string>) =>
    p.minute === '00' ? `${Number(p.hour)}h` : `${Number(p.hour)}h${p.minute}`;
  return `${render(from)}–${render(to)}`;
}
