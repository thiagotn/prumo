import { afterEach, describe, expect, it } from 'vitest';
import { isPlatformHost, normalizeHost, platformHosts } from './tenant';

const ORIGINAL = process.env.PLATFORM_HOSTS;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.PLATFORM_HOSTS;
  else process.env.PLATFORM_HOSTS = ORIGINAL;
});

describe('normalizeHost', () => {
  it('lowercases', () => {
    expect(normalizeHost('APP.DraTatiMayumi.com.BR')).toBe('app.dratatimayumi.com.br');
  });

  it('strips default ports but keeps the development one', () => {
    expect(normalizeHost('app.clinic.com.br:443')).toBe('app.clinic.com.br');
    expect(normalizeHost('app.clinic.com.br:80')).toBe('app.clinic.com.br');
    expect(normalizeHost('localhost:3100')).toBe('localhost:3100');
  });

  it('treats www as the same address', () => {
    expect(normalizeHost('www.app.clinic.com.br')).toBe('app.clinic.com.br');
  });

  it('strips the absolute FQDN trailing dot and surrounding whitespace', () => {
    expect(normalizeHost('  app.clinic.com.br.  ')).toBe('app.clinic.com.br');
  });

  it('is idempotent', () => {
    const once = normalizeHost('WWW.App.Clinic.com.BR:443');
    expect(normalizeHost(once)).toBe(once);
  });
});

describe('platform hosts', () => {
  it('reads the list from the env, normalising each host', () => {
    process.env.PLATFORM_HOSTS = 'Admin.Atelie.app, admin.localhost:3100';
    expect(platformHosts()).toEqual(['admin.atelie.app', 'admin.localhost:3100']);
  });

  it('recognises the platform host regardless of case and www', () => {
    process.env.PLATFORM_HOSTS = 'admin.atelie.app';
    expect(isPlatformHost('WWW.admin.atelie.app')).toBe(true);
    expect(isPlatformHost('app.dratatimayumi.com.br')).toBe(false);
  });

  it('with no PLATFORM_HOSTS, no host is a platform host', () => {
    delete process.env.PLATFORM_HOSTS;
    expect(platformHosts()).toEqual([]);
    expect(isPlatformHost('anything')).toBe(false);
  });

  it('ignores empty entries from stray commas', () => {
    process.env.PLATFORM_HOSTS = 'admin.atelie.app,,';
    expect(platformHosts()).toEqual(['admin.atelie.app']);
  });
});
