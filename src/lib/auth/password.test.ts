import { describe, expect, it } from 'vitest';
import { hashPassword, needsRehash, verifyPassword } from './password';

describe('hashPassword / verifyPassword', () => {
  it('accepts the correct password', async () => {
    const hash = await hashPassword('prumo1234');
    expect(await verifyPassword('prumo1234', hash)).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('prumo1234');
    expect(await verifyPassword('prumo1235', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('produces different hashes for the same password (per-hash salt)', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('stores the cost parameters inside the hash', async () => {
    const hash = await hashPassword('x');
    expect(hash.split('$').slice(0, 4)).toEqual(['scrypt', '131072', '8', '1']);
  });

  it('normalises accents (NFKC) — a password typed two different ways', async () => {
    const composed = 'senão'; // "senão" with a precomposed ã
    const decomposed = 'senão'; // "senão" with a + combining tilde
    const hash = await hashPassword(composed);
    expect(await verifyPassword(decomposed, hash)).toBe(true);
  });

  it('does not throw on a malformed hash — it just refuses', async () => {
    for (const bad of ['', 'not-a-hash', 'scrypt$1$2', 'bcrypt$a$b$c$d$e', '$$$$$']) {
      expect(await verifyPassword('x', bad)).toBe(false);
    }
  });
});

describe('needsRehash', () => {
  it('does not ask for a rehash of a freshly generated hash', async () => {
    expect(needsRehash(await hashPassword('x'))).toBe(false);
  });

  it('asks for a rehash of older parameters', () => {
    expect(needsRehash('scrypt$16384$8$1$YQ==$Yg==')).toBe(true);
  });

  it('asks for a rehash of an unknown format (algorithm migration)', () => {
    expect(needsRehash('$2b$12$abcdefghijklmnopqrstuv')).toBe(true);
  });
});
