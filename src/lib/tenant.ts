// Tenant resolution by hostname (README: "app.<clinic-domain>").
//
// The request host is looked up in `tenant_domains`, which is the platform registry —
// it has to be readable BEFORE any tenant scope exists, which is why it sits outside
// RLS. An unknown host does not become a generic tenant: there is simply no instance.
import { Prisma } from '@prisma/client';
import { headers } from 'next/headers';
import { prisma } from './db';
import { readFlags, type Flags } from './flags';

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

export async function tenantById(id: string): Promise<ResolvedTenant | null> {
  const t = await prisma.tenant.findUnique({ where: { id }, select: TENANT_SELECT });
  return t ? build(t) : null;
}
