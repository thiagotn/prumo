// The timestamp a public form is handed out with, and its signature.
//
// Signed because the anti-robot rule is "nobody fills five fields in three seconds", and
// an unsigned timestamp is just a number a robot rewrites. The HMAC is the one the session
// tokens use, keyed with SESSION_SECRET — hence server-only, and hence a module of its own
// rather than an export of the action file: a `'use server'` export is callable from
// anywhere on the internet, and handing out fresh stamps on request is not the point.
import 'server-only';
import { hashToken } from './auth/session';

export type FormStamp = { issuedAt: string; signature: string };

/** Namespaces the signature, so a stamp from one form is not good for another. */
export const INTEREST_FORM = 'interest';

export function issueFormStamp(purpose: string, now = Date.now()): FormStamp {
  const issuedAt = String(now);
  return { issuedAt, signature: hashToken(`${purpose}:${issuedAt}`) };
}

/** The instant the form was issued, or null when the pair does not check out. */
export function readFormStamp(purpose: string, issuedAt: string, signature: string): number | null {
  if (!/^\d{13}$/.test(issuedAt)) return null;
  if (hashToken(`${purpose}:${issuedAt}`) !== signature) return null;
  return Number(issuedAt);
}
