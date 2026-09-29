// The rules around a contact request, free of database and React so they can be tested
// directly.
//
// The form is public and anonymous, which makes it the only door in the system a stranger
// can knock on. Nothing here is a wall by itself: the caps bound what a single request can
// cost, `looksAutomated` throws away what obvious robots send, and the real ceiling is the
// per-IP count in the intake path plus the rate limit Traefik already applies to the
// Ingress. Three cheap rules that ask for no third party and send nobody's data anywhere.

/** How much of each field is kept, and how many requests one address may send. */
export const LEAD_LIMITS = {
  name: 120,
  email: 160,
  phone: 40,
  clinic: 120,
  message: 2000,
  /** The note the platform writes about the conversation, not part of the public form. */
  note: 2000,
  perIpPerHour: 3,
  perIpPerDay: 10,
} as const;

/** Nobody fills five fields in three seconds. A robot does. */
export const MIN_FILL_MS = 3_000;

/**
 * How long a rendered form stays good for. Long enough for someone to write carefully and
 * be interrupted; short enough that a scraped page cannot be replayed for days.
 */
export const FORM_TTL_MS = 30 * 60 * 1_000;

export type AutomationCheck = {
  /** The honeypot field: visible to a robot reading the HTML, not to a person. */
  honeypot: string;
  /** When the form was handed out, as the signed field says. Null when it was tampered. */
  issuedAt: number | null;
  now: number;
};

/**
 * Whether a submission looks like a machine's.
 *
 * The caller answers a robot with the same thank-you a person gets, and writes nothing: a
 * robot told it failed tries another way, and one told it succeeded goes away.
 */
export function looksAutomated({ honeypot, issuedAt, now }: AutomationCheck): boolean {
  if (honeypot.trim() !== '') return true;
  if (issuedAt === null) return true;
  const age = now - issuedAt;
  // Negative age: a clock that disagrees, or a forged timestamp from the future.
  return age < MIN_FILL_MS || age > FORM_TTL_MS;
}

/** The address, as it will be stored and compared. */
export function normalizeLeadEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * One line of text from a stranger, made safe to store and boring to display: control
 * characters out (they turn a log line into two), runs of whitespace collapsed.
 *
 * This is not escaping. React escapes what it renders; nothing here is ever interpolated
 * into HTML or SQL by hand.
 */
export function sanitizeLine(raw: string): string {
  return stripControl(raw).replace(/\s+/g, ' ').trim();
}

/** The same, keeping the paragraphs a message was written with. */
export function sanitizeMessage(raw: string): string {
  return stripControl(raw)
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Everything unprintable except the newline, which a message is allowed to have. */
function stripControl(raw: string): string {
  return raw.replace(/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/g, '');
}
