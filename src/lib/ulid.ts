// ULID (github.com/ulid/spec): a 48-bit millisecond timestamp followed by 80 bits of
// randomness, rendered in Crockford base32.
//
// Written here rather than pulled in as a dependency: it is thirty lines, and the two
// properties we rely on — lexicographic order matching chronological order, and no
// collision between two photos taken in the same millisecond — are worth asserting
// directly in tests rather than trusting.
//
// Used for object keys. A UUID would work, but ULIDs sort by time, so listing a prefix in
// the bucket comes back in the order the photos were taken.
import { randomBytes } from 'node:crypto';

/** Crockford base32: no I, L, O or U, so a key cannot be misread aloud. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TIME_LENGTH = 10;
const RANDOM_LENGTH = 16;

function encodeTime(ms: number): string {
  if (!Number.isInteger(ms) || ms < 0 || ms > 281_474_976_710_655) {
    throw new Error(`Timestamp outside the 48-bit ULID range: ${ms}`);
  }
  let out = '';
  let value = ms;
  for (let i = 0; i < TIME_LENGTH; i++) {
    out = ALPHABET[value % 32] + out;
    value = Math.floor(value / 32);
  }
  return out;
}

function encodeRandom(): string {
  // 16 characters of 5 bits each = 80 bits. One byte per character wastes entropy but
  // keeps the mapping obvious, and 5 bits of 8 is still 80 bits of randomness.
  const bytes = randomBytes(RANDOM_LENGTH);
  let out = '';
  for (const byte of bytes) out += ALPHABET[byte % 32];
  return out;
}

export function ulid(now: number = Date.now()): string {
  return encodeTime(now) + encodeRandom();
}

/** The millisecond a ULID encodes. Used in tests and when reading a key back. */
export function ulidTime(value: string): number {
  const time = value.slice(0, TIME_LENGTH).toUpperCase();
  let ms = 0;
  for (const ch of time) {
    const index = ALPHABET.indexOf(ch);
    if (index === -1) throw new Error(`Not a ULID: ${value}`);
    ms = ms * 32 + index;
  }
  return ms;
}

export function isUlid(value: string): boolean {
  return (
    value.length === TIME_LENGTH + RANDOM_LENGTH &&
    [...value.toUpperCase()].every((ch) => ALPHABET.includes(ch))
  );
}
