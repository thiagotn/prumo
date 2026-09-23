// TOTP (RFC 6238) over HMAC-SHA1, 6 digits, 30-second step — what Google
// Authenticator, Authy and 1Password speak. Implemented here rather than pulling in a
// dependency: the algorithm fits in 40 lines and the RFC's official test vectors are
// covered in totp.test.ts.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;
/** Tolerance of +/-1 step (+/-30s) for a phone clock that has drifted. */
const WINDOW_STEPS = 1;

export function generateBase32Secret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error(`Invalid base32 character: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** TOTP code for an instant (default: now). `algorithm`/`digits` exist for the RFC vectors. */
export function generateTotpCode(
  base32Secret: string,
  atMs: number = Date.now(),
  options: { digits?: number; algorithm?: 'sha1' | 'sha256' | 'sha512'; step?: number } = {},
): string {
  const digits = options.digits ?? DIGITS;
  const algorithm = options.algorithm ?? 'sha1';
  const step = options.step ?? STEP_SECONDS;

  const counter = Math.floor(atMs / 1000 / step);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac(algorithm, base32Decode(base32Secret)).update(buffer).digest();
  // "Dynamic truncation" from RFC 4226 section 5.3
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** Checks the code allowing +/-1 step of drift. Constant-time comparison. */
export function verifyTotpCode(
  base32Secret: string,
  providedCode: string,
  atMs: number = Date.now(),
): boolean {
  const code = providedCode.replace(/\D/g, '');
  if (code.length !== DIGITS) return false;

  for (let drift = -WINDOW_STEPS; drift <= WINDOW_STEPS; drift++) {
    const expected = generateTotpCode(base32Secret, atMs + drift * STEP_SECONDS * 1000);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(code))) return true;
  }
  return false;
}

/** `otpauth://` URI for the enrolment QR code. */
export function otpAuthUri(params: {
  base32Secret: string;
  email: string;
  issuer: string;
}): string {
  const label = encodeURIComponent(`${params.issuer}:${params.email}`);
  const query = new URLSearchParams({
    secret: params.base32Secret,
    issuer: params.issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

/** Groups the secret in fours so it can be typed into the authenticator by hand. */
export function readableSecret(base32Secret: string): string {
  return base32Secret.replace(/(.{4})/g, '$1 ').trim();
}
