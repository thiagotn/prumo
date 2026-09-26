// Tenant resolution by hostname (docs/especificacao.md: "app.<clinic-domain>").
//
// The request host is looked up in `tenant_domains`, which is the platform registry —
// it has to be readable BEFORE any tenant scope exists, which is why it sits outside
// RLS. An unknown host does not become a generic tenant: there is simply no instance.
import { Prisma } from '@prisma/client';
import { headers } from 'next/headers';
import { prisma } from './db';
import { readFlags, type Flags } from './flags';
import { isLocalHost, originFor } from './host';

// Reexportadas: elas moram em `host.ts` para não arrastar este módulo (e o Prisma junto)
// para o bundle do cliente, mas continuam fazendo parte da API de tenant.
export { isLocalHost, originFor };

export type ResolvedTenant = {
  id: string;
  name: string;
  subtitle: string | null;
  monogram: string;
  logoUrl: string | null;
  accentColor: string;
  domain: string;
  defaultUnit: string | null;
  flags: Flags;
  active: boolean;
};

/**
 * Normalises the Host: lowercase, no default port (80/443), no trailing dot and no
 * `www.` — `www.app.clinic.com.br` and `app.clinic.com.br` are the same instance.
 */
export function normalizeHost(host: string): string {
  let h = host.trim().toLowerCase().replace(/\.$/, '');
  h = h.replace(/:(80|443)$/, '');
  h = h.replace(/^www\./, '');
  return h;
}

/** Hosts reserved for the reseller panel (no tenant). Comma-separated in the env. */
export function platformHosts(): string[] {
  return (process.env.PLATFORM_HOSTS ?? '')
    .split(',')
    .map((h) => normalizeHost(h))
    .filter(Boolean);
}

export function isPlatformHost(host: string): boolean {
  return platformHosts().includes(normalizeHost(host));
}

/**
 * The domains the product itself owns, derived from the platform hosts: `admin.prumo.in`
 * means `prumo.in` is ours. It is what a clinic gets a subdomain of when it has no domain
 * of its own, and it is served by a wildcard — so every label under it reaches the
 * application instead of dying in the tunnel's 404.
 */
export function platformDomains(): string[] {
  return platformHosts()
    .map((host) => host.split('.').slice(1).join('.'))
    .filter(Boolean);
}

/**
 * Labels that never become a clinic on a domain of ours.
 *
 * Under a wildcard any label is a clinic waiting to happen, and some of them are things
 * the product needs for itself — or things a person would read as the product speaking.
 * Outside a platform domain this does not apply: what a clinic calls a host inside its
 * own domain is the clinic's business.
 */
export const RESERVED_LABELS = [
  'admin',
  'api',
  'app',
  'assets',
  'cdn',
  'docs',
  'help',
  'hml',
  'mail',
  'ns1',
  'ns2',
  'painel',
  'plataforma',
  'prumo',
  'smtp',
  'staging',
  'static',
  'status',
  'suporte',
  'www',
] as const;

/** Whether a hostname is the platform's own, and so can never answer for a clinic. */
export function isReservedHost(host: string): boolean {
  const normalized = normalizeHost(host);
  if (!normalized) return true;
  if (isPlatformHost(normalized)) return true;

  const domains = platformDomains();
  // The bare domain is ours too — and `www.prumo.in` normalises to it.
  if (domains.includes(normalized)) return true;

  const [label, ...rest] = normalized.split('.');
  return (
    rest.length > 0 &&
    domains.includes(rest.join('.')) &&
    (RESERVED_LABELS as readonly string[]).includes(label!)
  );
}


/**
 * Which of a clinic's hostnames to use when the code has to name one.
 *
 * A clinic has more than one: the address on its own domain, the one under ours, and in
 * development a `.localhost`. Two rules, in order. It has to be reachable from where the
 * caller stands — sending a developer to app.clinic.com.br would hand the session to
 * production, and sending production to tati.localhost would hand it to nobody. Among
 * those, the one the clinic calls its own (`primary`) wins, because that is the address
 * a patient should see on a link.
 */
export function preferredHost(
  domains: Array<{ host: string; primary: boolean }>,
  from: string,
): string | null {
  if (domains.length === 0) return null;
  const local = isLocalHost(from);
  const reachable = domains.filter((domain) => isLocalHost(domain.host) === local);
  const pool = reachable.length > 0 ? reachable : domains;
  return (pool.find((domain) => domain.primary) ?? pool[0]!).host;
}

/** Host of the current request, with the env fallback for jobs and scripts. */
export async function requestHost(): Promise<string> {
  const h = await headers();
  const raw = h.get('x-forwarded-host') ?? h.get('host') ?? process.env.TENANT_HOST_FALLBACK ?? '';
  return normalizeHost(raw);
}

const TENANT_SELECT = {
  id: true,
  name: true,
  subtitle: true,
  monogram: true,
  logoUrl: true,
  accentColor: true,
  domain: true,
  defaultUnit: true,
  enabledModules: true,
  active: true,
} satisfies Prisma.TenantSelect;

function build(t: Prisma.TenantGetPayload<{ select: typeof TENANT_SELECT }>): ResolvedTenant {
  const { enabledModules, ...rest } = t;
  return { ...rest, flags: readFlags(enabledModules) };
}

/** The tenant for a host, or null when the host belongs to no instance. */
export async function tenantByHost(host: string): Promise<ResolvedTenant | null> {
  const normalized = normalizeHost(host);
  if (!normalized || isPlatformHost(normalized)) return null;

  const domain = await prisma.tenantDomain.findUnique({
    where: { host: normalized },
    select: { tenant: { select: TENANT_SELECT } },
  });
  if (domain) return build(domain.tenant);

  // Fallback: the tenant's primary domain also resolves, with no row in
  // tenant_domains (e.g. clinic.com.br in addition to app.clinic.com.br).
  const byDomain = await prisma.tenant.findUnique({
    where: { domain: normalized },
    select: TENANT_SELECT,
  });
  return byDomain ? build(byDomain) : null;
}

/** Tenant of the current request. Null on a platform host or an unknown one. */
export async function currentTenant(): Promise<ResolvedTenant | null> {
  return tenantByHost(await requestHost());
}

/**
 * The hostname to put in a link for this clinic, seen from `from` (usually the host of
 * the request writing the link). Null when the clinic has no hostname at all.
 */
export async function canonicalHost(tenantId: string, from: string): Promise<string | null> {
  const domains = await prisma.tenantDomain.findMany({
    where: { tenantId },
    orderBy: [{ primary: 'desc' }, { createdAt: 'asc' }],
    select: { host: true, primary: true },
  });
  return preferredHost(domains, from);
}

export async function tenantById(id: string): Promise<ResolvedTenant | null> {
  const t = await prisma.tenant.findUnique({ where: { id }, select: TENANT_SELECT });
  return t ? build(t) : null;
}
