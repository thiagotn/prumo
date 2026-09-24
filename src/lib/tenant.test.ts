import { afterEach, describe, expect, it } from 'vitest';
import {
  isLocalHost,
  isPlatformHost,
  isReservedHost,
  normalizeHost,
  originFor,
  platformDomains,
  platformHosts,
  preferredHost,
} from './tenant';

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

describe('platform domains and reserved names', () => {
  it('derives the product domain from the panel host', () => {
    process.env.PLATFORM_HOSTS = 'admin.prumo.in, admin.localhost:3100';
    expect(platformDomains()).toEqual(['prumo.in', 'localhost:3100']);
  });

  it('keeps the product names out of a clinic subdomain', () => {
    process.env.PLATFORM_HOSTS = 'admin.prumo.in';
    // Under a wildcard every label is a clinic waiting to happen.
    expect(isReservedHost('admin.prumo.in')).toBe(true);
    expect(isReservedHost('api.prumo.in')).toBe(true);
    expect(isReservedHost('hml.prumo.in')).toBe(true);
    // The bare domain is ours, and www normalises to it.
    expect(isReservedHost('prumo.in')).toBe(true);
    expect(isReservedHost('www.prumo.in')).toBe(true);
    // A clinic's own label under our domain is fine.
    expect(isReservedHost('tati.prumo.in')).toBe(false);
  });

  it('does not police a clinic inside its own domain', () => {
    process.env.PLATFORM_HOSTS = 'admin.prumo.in';
    // `app` is reserved under prumo.in and perfectly normal under a clinic's domain.
    expect(isReservedHost('app.prumo.in')).toBe(true);
    expect(isReservedHost('app.dratatimayumi.com.br')).toBe(false);
    expect(isReservedHost('admin.clinic.com.br')).toBe(false);
  });

  it('with no platform host, only an empty name is reserved', () => {
    delete process.env.PLATFORM_HOSTS;
    expect(isReservedHost('')).toBe(true);
    expect(isReservedHost('admin.prumo.in')).toBe(false);
  });
});

describe('preferredHost', () => {
  const domains = [
    { host: 'app.dratatimayumi.com.br', primary: true },
    { host: 'tati.prumo.in', primary: false },
    { host: 'tati.localhost:3100', primary: false },
  ];

  it('picks a host reachable from where the caller stands', () => {
    // Sending a developer to the real host would hand the session to production, and
    // sending production to a .localhost would hand it to nobody.
    expect(preferredHost(domains, 'admin.localhost:3100')).toBe('tati.localhost:3100');
    expect(preferredHost(domains, 'admin.prumo.in')).toBe('app.dratatimayumi.com.br');
  });

  it('prefers the clinic own address over the one under our domain', () => {
    const swapped = [
      { host: 'tati.prumo.in', primary: false },
      { host: 'app.dratatimayumi.com.br', primary: true },
    ];
    expect(preferredHost(swapped, 'admin.prumo.in')).toBe('app.dratatimayumi.com.br');
  });

  it('falls back to the first host rather than to nothing', () => {
    expect(preferredHost([{ host: 'app.clinic.com.br', primary: false }], 'admin.localhost:3100')).toBe(
      'app.clinic.com.br',
    );
    expect(preferredHost([], 'admin.localhost:3100')).toBeNull();
  });
});

describe('scheme', () => {
  it('is plain http only where the host is this machine', () => {
    expect(isLocalHost('tati.localhost:3100')).toBe(true);
    expect(isLocalHost('tati.prumo.in')).toBe(false);
    expect(originFor('tati.localhost:3100')).toBe('http://tati.localhost:3100');
    expect(originFor('tati.prumo.in')).toBe('https://tati.prumo.in');
  });
});
