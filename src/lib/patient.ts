// Patient registration data: what the front desk types, normalised and checked before it
// reaches the database. No Prisma and no React here, so the rules can be tested directly.
//
// Dates of birth are date-only. They are held at UTC midnight and formatted in UTC on the
// way out: formatted in the server's zone, a patient born on the 1st would read as the
// 31st for every clinic west of Greenwich.

export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * A Brazilian phone number: 10 digits with the area code (landline) or 11 (mobile).
 * Stored as digits; the formatting is the screen's business.
 */
export function normalizePhone(raw: string): { ok: true; digits: string } | { ok: false; error: string } {
  const digits = digitsOnly(raw);
  if (digits.length !== 10 && digits.length !== 11) {
    return { ok: false, error: 'O telefone precisa ter DDD e 8 ou 9 dígitos.' };
  }
  return { ok: true, digits };
}

/** Formats a stored number for reading: (11) 98765-0001. */
export function formatPhone(raw: string | null): string {
  if (!raw) return '—';
  const digits = digitsOnly(raw);
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return raw;
}

/**
 * CPF check digits (Receita Federal's modulus 11). Catches the typo at the counter
 * rather than at the invoice, and keeps the unique index on (tenant, document) from
 * filling up with variants of the same person.
 */
export function isValidCpf(raw: string): boolean {
  const digits = digitsOnly(raw);
  if (digits.length !== 11) return false;
  // 00000000000, 11111111111 and friends pass the arithmetic but are not CPFs.
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const checkDigit = (upTo: number): number => {
    let sum = 0;
    for (let i = 0; i < upTo; i++) sum += Number(digits[i]) * (upTo + 1 - i);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return checkDigit(9) === Number(digits[9]) && checkDigit(10) === Number(digits[10]);
}

/** Formats a stored CPF for reading: 529.982.247-25. */
export function formatCpf(raw: string | null): string {
  if (!raw) return '—';
  const d = digitsOnly(raw);
  if (d.length !== 11) return raw;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Oldest and youngest dates of birth the form accepts, as `YYYY-MM-DD`. */
export const MIN_BIRTH_YEAR = 1900;

/**
 * Parses the `YYYY-MM-DD` an `<input type="date">` submits into the instant the column
 * stores. A future date is refused: it is always a typo, and it would produce a negative
 * age on the patient panel.
 */
export function parseBirthDate(
  value: string,
  now = new Date(),
): { ok: true; date: Date | null } | { ok: false; error: string } {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, date: null };

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return { ok: false, error: 'Data de nascimento inválida.' };

  const [, year, month, day] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC rolls 31/02 over into March instead of failing; compare it back.
  const rolled =
    date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day;
  if (rolled) return { ok: false, error: 'Data de nascimento inválida.' };

  if (year < MIN_BIRTH_YEAR) return { ok: false, error: 'Data de nascimento inválida.' };
  if (date.getTime() > now.getTime()) {
    return { ok: false, error: 'A data de nascimento não pode estar no futuro.' };
  }
  return { ok: true, date };
}

/** The `YYYY-MM-DD` an `<input type="date">` expects, from a stored date. */
export function birthDateInputValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : '';
}

/** Date of birth as the clinic reads it: 14 de março de 1988. */
export function formatBirthDate(date: Date | null): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}

/** Completed years, counted in UTC to match how the date is stored. */
export function ageInYears(birthDate: Date, now = new Date()): number {
  let years = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birthDate.getUTCDate())) years--;
  return years;
}

/** Product copy, pt-BR. */
export function ageLabel(birthDate: Date | null, now = new Date()): string {
  if (!birthDate) return '—';
  const years = ageInYears(birthDate, now);
  return `${years} ano${years === 1 ? '' : 's'}`;
}
