// Consent terms: the rules that decide what a signature proves. No database and no React
// here, so they can be tested directly.
//
// Two things carry the weight. The wording is copied into the consent when it is issued
// and never recomputed — a template edited next year must not change what a patient
// signed last year. And the hash covers exactly what was shown plus who signed it and
// when, so a row edited afterwards stops matching the PDF it produced.
import { createHash } from 'node:crypto';
import { CLINIC_TIME_ZONE } from './schedule';

/** What the clinic can drop into a term's wording. Product copy, pt-BR. */
export const CONSENT_PLACEHOLDERS = {
  paciente: 'Nome da paciente',
  procedimento: 'Procedimento do atendimento',
  clinica: 'Nome da clínica',
  data: 'Data em que o termo foi emitido',
} as const;

export type ConsentVariables = Partial<Record<keyof typeof CONSENT_PLACEHOLDERS, string>>;

/** What a known field becomes when there is nothing to put in it: a line to fill by hand,
 *  the way a printed term does it. */
export const CONSENT_BLANK = '__________';

/**
 * Fills `{{paciente}}` and friends.
 *
 * A known field with nothing to put in it becomes a blank line — a term issued outside an
 * appointment has no procedure to name, and the patient should see a line to complete,
 * not the braces of a template. A name that is NOT a field stays exactly as written: it
 * is a typo of the clinic's, and a term that silently loses a clause would be worse than
 * one that visibly needs fixing.
 */
export function fillConsentBody(body: string, variables: ConsentVariables): string {
  return body.replace(/\{\{\s*([a-zç]+)\s*\}\}/gi, (whole, name: string) => {
    const key = name.toLowerCase() as keyof typeof CONSENT_PLACEHOLDERS;
    if (!(key in CONSENT_PLACEHOLDERS)) return whole;
    const value = variables[key];
    return value === undefined || value === '' ? CONSENT_BLANK : value;
  });
}

/** The placeholders a wording actually uses, in the order they appear. */
export function placeholdersIn(body: string): string[] {
  const found = new Set<string>();
  for (const match of body.matchAll(/\{\{\s*([a-zç]+)\s*\}\}/gi)) {
    found.add(match[1]!.toLowerCase());
  }
  return [...found];
}

/** Blank lines separate paragraphs — the only formatting a term needs. */
export function paragraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}

/**
 * A stable identifier for a term across its editions, from the title of the first one.
 * Accents are folded so the slug stays readable in a URL and in a log line.
 */
export function slugifyTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export type ConsentHashInput = {
  templateVersion: number;
  title: string;
  body: string;
  signerName: string;
  /** The instant of the signature. */
  signedAt: Date;
  /** The drawn signature, as it is stored. */
  signature: Uint8Array;
};

/**
 * SHA-256 over the whole signed record, field-separated so no two different records can
 * be arranged into the same string. Printed on the PDF: anyone holding the document can
 * ask the clinic to recompute it.
 */
export function consentHash(input: ConsentHashInput): string {
  const hash = createHash('sha256');
  // A length prefix per field: without it, moving a character from the title into the
  // body would produce the same hash.
  for (const field of [
    String(input.templateVersion),
    input.title,
    input.body,
    input.signerName,
    input.signedAt.toISOString(),
  ]) {
    hash.update(`${Buffer.byteLength(field, 'utf8')}:`).update(field, 'utf8');
  }
  hash.update(`${input.signature.byteLength}:`).update(input.signature);
  return hash.digest('hex');
}

/**
 * The date a term carries, in the clinic's timezone rather than the server's. A term
 * issued at half past nine at night in São Paulo must not say tomorrow.
 */
export function consentDateLabel(date: Date, timeZone = CLINIC_TIME_ZONE): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone }).format(date);
}

/** How the hash is shown to a human: grouped, so it can be read out loud. */
export function formatHash(hash: string): string {
  return (hash.match(/.{1,8}/g) ?? []).join(' ');
}

/** A signing link lasts three days — long enough for a weekend, short enough to expire. */
export const CONSENT_LINK_TTL_HOURS = 72;

export function linkExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + CONSENT_LINK_TTL_HOURS * 3_600_000);
}

/** The drawing is a signature, not a file upload. */
export const MAX_SIGNATURE_BYTES = 262_144;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Decodes the `data:image/png;base64,...` the signature pad produces.
 *
 * Checked rather than trusted: this arrives from a public page, and what is stored is
 * later embedded in a PDF. The magic bytes are what say it is really a PNG — the data
 * URL prefix is just a claim.
 */
export function decodeSignaturePng(
  dataUrl: string,
): { ok: true; bytes: Buffer } | { ok: false; error: string } {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!match) return { ok: false, error: 'Assine no quadro antes de confirmar.' };

  const bytes = Buffer.from(match[1]!, 'base64');
  if (bytes.byteLength === 0) return { ok: false, error: 'Assine no quadro antes de confirmar.' };
  if (bytes.byteLength > MAX_SIGNATURE_BYTES) {
    return { ok: false, error: 'A assinatura ficou grande demais. Refaça o traço.' };
  }
  if (!bytes.subarray(0, 8).equals(PNG_MAGIC)) {
    return { ok: false, error: 'Assinatura inválida.' };
  }
  return { ok: true, bytes };
}

/** Product copy, pt-BR. */
export const CONSENT_STATUS_LABELS = {
  PENDING: 'Aguardando assinatura',
  SIGNED: 'Assinado',
  CANCELLED: 'Cancelado',
} as const;

/** Tag class from the design system, per status. */
export const CONSENT_STATUS_TAG = {
  PENDING: 'tag-outline',
  SIGNED: 'tag-accent',
  CANCELLED: 'tag-neutral',
} as const;
