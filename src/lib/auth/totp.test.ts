import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  generateBase32Secret,
  generateTotpCode,
  otpAuthUri,
  readableSecret,
  verifyTotpCode,
} from './totp';

// Official vectors from RFC 6238 appendix B. The secret is the ASCII string
// "12345678901234567890" (repeated for SHA256/SHA512), which has to be base32-encoded.
const SHA1_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'));
const SHA256_SECRET = base32Encode(Buffer.from('12345678901234567890123456789012', 'ascii'));
const SHA512_SECRET = base32Encode(
  Buffer.from('1234567890123456789012345678901234567890123456789012345678901234', 'ascii'),
);

describe('base32', () => {
  it('round-trips', () => {
    const buf = Buffer.from('prontuário sigiloso', 'utf8');
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
  });

  it('tolerates whitespace and padding when decoding', () => {
    const encoded = base32Encode(Buffer.from([1, 2, 3, 4, 5]));
    expect(base32Decode(`${encoded} `).equals(base32Decode(encoded))).toBe(true);
  });

  it('rejects a character outside the alphabet', () => {
    expect(() => base32Decode('ABC1')).toThrow(/Invalid/);
  });
});

describe('generateTotpCode — RFC 6238 vectors', () => {
  const cases: Array<[number, 'sha1' | 'sha256' | 'sha512', string, string]> = [
    [59, 'sha1', SHA1_SECRET, '94287082'],
    [59, 'sha256', SHA256_SECRET, '46119246'],
    [59, 'sha512', SHA512_SECRET, '90693936'],
    [1111111109, 'sha1', SHA1_SECRET, '07081804'],
    [1111111111, 'sha1', SHA1_SECRET, '14050471'],
    [1234567890, 'sha1', SHA1_SECRET, '89005924'],
    [2000000000, 'sha1', SHA1_SECRET, '69279037'],
    [20000000000, 'sha1', SHA1_SECRET, '65353130'],
    [1111111109, 'sha256', SHA256_SECRET, '68084774'],
    [20000000000, 'sha512', SHA512_SECRET, '47863826'],
  ];

  for (const [seconds, algorithm, secret, expected] of cases) {
    it(`T=${seconds} ${algorithm} -> ${expected}`, () => {
      expect(generateTotpCode(secret, seconds * 1000, { algorithm, digits: 8 })).toBe(expected);
    });
  }

  it('defaults to 6 digits and SHA-1, which is what authenticator apps expect', () => {
    expect(generateTotpCode(SHA1_SECRET, 59_000)).toBe('287082');
  });
});

describe('verifyTotpCode', () => {
  const now = 1_700_000_000_000;
  const secret = generateBase32Secret();

  it('accepts the current step', () => {
    expect(verifyTotpCode(secret, generateTotpCode(secret, now), now)).toBe(true);
  });

  it('tolerates +/-30s of phone clock drift', () => {
    expect(verifyTotpCode(secret, generateTotpCode(secret, now - 30_000), now)).toBe(true);
    expect(verifyTotpCode(secret, generateTotpCode(secret, now + 30_000), now)).toBe(true);
  });

  it('refuses a code from 90s ago', () => {
    expect(verifyTotpCode(secret, generateTotpCode(secret, now - 90_000), now)).toBe(false);
  });

  it('refuses a code from another secret', () => {
    expect(verifyTotpCode(secret, generateTotpCode(generateBase32Secret(), now), now)).toBe(false);
  });

  it('refuses malformed input without throwing', () => {
    for (const input of ['', '12345', '1234567', 'abcdef', '   ']) {
      expect(verifyTotpCode(secret, input, now)).toBe(false);
    }
  });

  it('ignores whitespace pasted from the authenticator', () => {
    const code = generateTotpCode(secret, now);
    expect(verifyTotpCode(secret, `${code.slice(0, 3)} ${code.slice(3)}`, now)).toBe(true);
  });
});

describe('authenticator enrolment', () => {
  it('builds the otpauth URI with issuer and period', () => {
    const uri = otpAuthUri({
      base32Secret: 'ABCD',
      email: 'tati@x.com.br',
      issuer: 'Dra. Tati Mayumi',
    });
    expect(uri).toContain('otpauth://totp/Dra.%20Tati%20Mayumi%3Atati%40x.com.br');
    expect(uri).toContain('secret=ABCD');
    expect(uri).toContain('period=30');
    expect(uri).toContain('digits=6');
  });

  it('groups the secret in fours for manual entry', () => {
    expect(readableSecret('ABCDEFGH')).toBe('ABCD EFGH');
  });

  it('generates a 160-bit secret (32 base32 chars)', () => {
    expect(generateBase32Secret()).toHaveLength(32);
  });
});
