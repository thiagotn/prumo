import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { storageConfig, storageConfigured } from './storage';

// These cover the configuration boundary, which is where a misconfigured deployment
// shows up. The signing itself is AWS SDK code and is exercised against a real bucket by
// the runbook check in docs/operacao.md, not here.

const VARS = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'R2_SIGNED_URL_TTL',
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of VARS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of VARS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function configure(overrides: Partial<Record<(typeof VARS)[number], string>> = {}) {
  process.env.R2_ACCOUNT_ID = 'acct';
  process.env.R2_ACCESS_KEY_ID = 'key';
  process.env.R2_SECRET_ACCESS_KEY = 'secret';
  process.env.R2_BUCKET = 'prumo-clinical';
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe('storageConfig', () => {
  it('is null when nothing is set, so development and CI keep working', () => {
    // The photo screens then say the storage is not configured rather than failing to
    // render, which is what lets the rest of the app run without a bucket.
    expect(storageConfig()).toBeNull();
    expect(storageConfigured()).toBe(false);
  });

  it('reads exactly the five variables the cluster provides', () => {
    configure({ R2_SIGNED_URL_TTL: '120' });
    expect(storageConfig()).toEqual({
      accountId: 'acct',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      bucket: 'prumo-clinical',
      readTtlSeconds: 120,
    });
  });

  it('is null when any credential is missing — half-configured is not configured', () => {
    for (const missing of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) {
      configure();
      delete process.env[missing];
      expect(storageConfig(), `missing ${missing}`).toBeNull();
    }
  });

  it('falls back to a short read TTL when the value is absent or nonsense', () => {
    for (const ttl of [undefined, '', 'soon', '0', '-5']) {
      configure(ttl === undefined ? {} : { R2_SIGNED_URL_TTL: ttl });
      expect(storageConfig()?.readTtlSeconds).toBe(120);
    }
  });

  it('honours a configured TTL', () => {
    configure({ R2_SIGNED_URL_TTL: '45' });
    expect(storageConfig()?.readTtlSeconds).toBe(45);
  });
});
