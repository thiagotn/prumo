// Password hashing with Node's own scrypt — no native dependency to compile on Alpine.
// Parameters follow the OWASP recommendation for scrypt (N=2^17, r=8, p=1) and are
// stored inside the hash so they can be rotated.
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * scrypt as a Promise. Written by hand rather than with promisify() because the
 * `options` overload is lost in the conversion and the cost parameters would be untyped.
 */
function scryptAsync(
  password: string | Buffer,
  salt: string | Buffer,
  length: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, length, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

const N = 2 ** 17;
const r = 8;
const p = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

/** Format: `scrypt$N$r$p$saltBase64$hashBase64` */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH, {
    N,
    r,
    p,
    maxmem: 256 * 1024 * 1024,
  });
  return ['scrypt', N, r, p, salt.toString('base64'), key.toString('base64')].join('$');
}

/** Constant-time comparison. Never throws: a malformed hash is simply invalid. */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, nStr, rStr, pStr, saltB64, hashB64] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const storedN = Number(nStr);
  const storedR = Number(rStr);
  const storedP = Number(pStr);
  if (!Number.isInteger(storedN) || !Number.isInteger(storedR) || !Number.isInteger(storedP)) {
    return false;
  }

  let expected: Buffer;
  let computed: Buffer;
  try {
    expected = Buffer.from(hashB64, 'base64');
    computed = await scryptAsync(
      password.normalize('NFKC'),
      Buffer.from(saltB64, 'base64'),
      expected.length,
      { N: storedN, r: storedR, p: storedP, maxmem: 256 * 1024 * 1024 },
    );
  } catch {
    return false;
  }

  if (expected.length !== computed.length || expected.length === 0) return false;
  return timingSafeEqual(expected, computed);
}

/** True when the hash used older parameters and is worth rewriting on next login. */
export function needsRehash(storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return true;
  return Number(parts[1]) < N || Number(parts[2]) < r || Number(parts[3]) < p;
}
