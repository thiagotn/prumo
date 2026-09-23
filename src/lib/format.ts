// pt-BR formatting. BRL currency and tabular figures in tables and KPIs (CLAUDE.md).
const LOCALE = 'pt-BR';

export function currency(value: number, options: { cents?: boolean } = {}): string {
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: options.cents === false ? 0 : 2,
    maximumFractionDigits: options.cents === false ? 0 : 2,
  }).format(value);
}

export function percent(fraction: number, digits = 1): string {
  return new Intl.NumberFormat(LOCALE, {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(fraction);
}

export function shortDate(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit' }).format(date);
}

export function longDate(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: 'long' }).format(date);
}

export function dateTime(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

/** First name plus the surname initial, for headings and avatars. */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1] : undefined;
  return last ? `${first} ${last[0]!.toUpperCase()}.` : first;
}

/** Up to two letters, as in the brand circle and the user avatar. */
export function monogram(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    // Portuguese connectives ("das", "de", "e") are not part of a monogram.
    .filter((w) => w.length > 1 && !/^(d[aeo]s?|e)$/i.test(w));
  // A single-word name ("Li", "Aurora") yields its first two letters.
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  const initials = words.slice(0, 2).map((w) => w[0]!.toUpperCase());
  return initials.join('') || name.slice(0, 2).toUpperCase();
}
