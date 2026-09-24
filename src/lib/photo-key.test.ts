import { describe, expect, it } from 'vitest';
import {
  buildPhotoKey,
  FRAMINGS,
  keyBelongsToTenant,
  patientPrefix,
  tenantPrefix,
} from './photo-key';
import { ulid } from './ulid';

const TENANT = '11111111-1111-4111-8111-111111111111';
const PATIENT = '22222222-2222-4222-8222-222222222222';
const ENCOUNTER = '33333333-3333-4333-8333-333333333333';
const parts = { tenantId: TENANT, patientId: PATIENT, encounterId: ENCOUNTER } as const;

describe('buildPhotoKey', () => {
  it('puts the tenant first, so the boundary is legible in the bucket', () => {
    const key = buildPhotoKey({ ...parts, framing: 'FRONT' }, ulid(1_790_000_000_000));
    expect(key.startsWith(`t/${TENANT}/`)).toBe(true);
    expect(key).toMatch(
      new RegExp(`^t/${TENANT}/p/${PATIENT}/e/${ENCOUNTER}/front-[0-9A-HJKMNP-TV-Z]{26}\\.webp$`),
    );
  });

  it('gives each framing its own segment', () => {
    const segments = FRAMINGS.map((framing) => {
      const key = buildPhotoKey({ ...parts, framing });
      return key.split('/').pop()!.split('-')[0];
    });
    expect(segments).toEqual(['front', 'left', 'right', 'upper']);
    expect(new Set(segments).size).toBe(4);
  });

  it('carries no name and no document number — a key ends up in logs', () => {
    const key = buildPhotoKey({ ...parts, framing: 'FRONT' });
    // Only identifiers, slashes, the framing segment and the extension.
    expect(key).toMatch(/^[0-9a-zA-Z/.-]+$/);
    expect(key).not.toMatch(/[áàâãéêíóôõúç ]/i);
  });

  it('two photos of the same framing in the same encounter never collide', () => {
    const keys = new Set(
      Array.from({ length: 1_000 }, () => buildPhotoKey({ ...parts, framing: 'FRONT' })),
    );
    expect(keys.size).toBe(1_000);
  });

  it('refuses anything but a UUID, so a caller cannot shape the key', () => {
    // A key that escapes its prefix escapes the isolation the prefix expresses.
    expect(() => buildPhotoKey({ ...parts, tenantId: '../../other', framing: 'FRONT' })).toThrow(
      /Invalid tenantId/,
    );
    expect(() => buildPhotoKey({ ...parts, patientId: 'x', framing: 'FRONT' })).toThrow(
      /Invalid patientId/,
    );
    expect(() =>
      buildPhotoKey({ ...parts, encounterId: `${ENCOUNTER}/..`, framing: 'FRONT' }),
    ).toThrow(/Invalid encounterId/);
  });

  it('refuses an id that is not a ULID', () => {
    expect(() => buildPhotoKey({ ...parts, framing: 'FRONT' }, 'nope')).toThrow(/Invalid ULID/);
  });

  it('sorts chronologically within a prefix', () => {
    const early = buildPhotoKey({ ...parts, framing: 'FRONT' }, ulid(1_700_000_000_000));
    const late = buildPhotoKey({ ...parts, framing: 'FRONT' }, ulid(1_790_000_000_000));
    expect([late, early].sort()).toEqual([early, late]);
  });
});

describe('prefixes', () => {
  it('a tenant prefix covers every photo of that clinic', () => {
    const key = buildPhotoKey({ ...parts, framing: 'FRONT' });
    expect(key.startsWith(tenantPrefix(TENANT))).toBe(true);
  });

  it('a patient prefix covers that patient only — what an erasure targets', () => {
    const mine = buildPhotoKey({ ...parts, framing: 'FRONT' });
    const other = buildPhotoKey(
      { ...parts, patientId: '44444444-4444-4444-8444-444444444444', framing: 'FRONT' },
      ulid(),
    );
    expect(mine.startsWith(patientPrefix(TENANT, PATIENT))).toBe(true);
    expect(other.startsWith(patientPrefix(TENANT, PATIENT))).toBe(false);
  });
});

describe('keyBelongsToTenant', () => {
  it('accepts a key under the tenant prefix', () => {
    expect(keyBelongsToTenant(buildPhotoKey({ ...parts, framing: 'FRONT' }), TENANT)).toBe(true);
  });

  it("rejects another tenant's key, including one that merely starts the same", () => {
    const other = '11111111-1111-4111-8111-111111111112';
    expect(keyBelongsToTenant(buildPhotoKey({ ...parts, framing: 'FRONT' }), other)).toBe(false);
    // A prefix check without the trailing slash would pass this.
    expect(keyBelongsToTenant(`t/${TENANT}-evil/p/x`, TENANT)).toBe(false);
  });
});
