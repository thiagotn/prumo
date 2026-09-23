// The database access boundary. NO business-table query should use `prisma` directly:
// RLS denies everything outside a scope (see the `_rls` migration).
//
//   await withTenant(tenantId, (tx) => tx.user.findMany())   // per-tenant slice
//   await withPlatformScope((tx) => tx.tenant.findMany())    // reseller scope
//
// `withTenant` opens a transaction and issues `set_config('app.tenant_id', …, true)`,
// which is scoped to that transaction — no connection state leaks between requests.
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

export type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set — see .env.example');
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

// Hot reload recreates modules in development; without the global cache we would open
// one connection pool per reload.
const globalForPrisma = globalThis as unknown as { prumoPrisma?: PrismaClient };

function client(): PrismaClient {
  if (!globalForPrisma.prumoPrisma) globalForPrisma.prumoPrisma = createClient();
  return globalForPrisma.prumoPrisma;
}

/**
 * The Prisma client. The connection is created on first use, not on import: a module
 * that only needs a pure function (normalizeHost, say) can be imported by a unit test
 * with no database configured at all.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(client(), prop, receiver);
  },
  has(_target, prop) {
    return Reflect.has(client(), prop);
  },
});

/** Runs `fn` with RLS sliced to the given tenant. */
export async function withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
}

/**
 * Runs `fn` ignoring the per-tenant slice — reseller scope.
 *
 * Only callable after confirming server-side that the session is a SUPERADMIN (see
 * requireSuperadmin in src/lib/auth/guards.ts), or from maintenance/seed scripts.
 * Anywhere else this is a security bug.
 */
export async function withPlatformScope<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.platform_scope', 'on', true)`;
    return fn(tx);
  });
}
