'use server';

// The reseller's side: what a clinic pays, which modules it has, and "entrar como".
import { BillingStatus, Plan, Role } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { audit, requestContext } from '@/lib/audit';
import { requireSuperadmin } from '@/lib/auth/guards';
import { mintHandoff } from '@/lib/auth/impersonation';
import { createImpersonationSession } from '@/lib/auth/session';
import { withPlatformScope } from '@/lib/db';
import { requestHost } from '@/lib/tenant';
import { DEFAULT_FLAGS, type Flags } from '@/lib/flags';
import { enterUrl, hostForHandoff } from '@/lib/reseller';

export type TenantFormState = { error?: string; saved?: string };

const settingsSchema = z.object({
  tenantId: z.string().uuid(),
  plan: z.nativeEnum(Plan),
  billingStatus: z.nativeEnum(BillingStatus),
  monthlyFee: z.string().trim().default(''),
  active: z.boolean(),
});

/** Money as the reseller types it: "1.234,56" or "1234.56". */
function parseMoney(raw: string): number | null {
  if (!raw) return null;
  const value = Number(raw.replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export async function saveTenantSettings(
  _previous: TenantFormState,
  formData: FormData,
): Promise<TenantFormState> {
  const { session } = await requireSuperadmin();

  const parsed = settingsSchema.safeParse({
    tenantId: formData.get('tenantId'),
    plan: formData.get('plan'),
    billingStatus: formData.get('billingStatus'),
    monthlyFee: formData.get('monthlyFee') ?? '',
    active: formData.get('active') === 'on',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  const input = parsed.data;

  const fee = input.monthlyFee ? parseMoney(input.monthlyFee) : null;
  if (input.monthlyFee && fee === null) return { error: 'Mensalidade inválida.' };

  // The flags the clinic gets. Read against the catalogue, so a checkbox nobody defined
  // cannot turn into a module.
  const flags = Object.fromEntries(
    (Object.keys(DEFAULT_FLAGS) as Array<keyof Flags>).map((flag) => [
      flag,
      formData.get(`flag:${flag}`) === 'on',
    ]),
  ) as Flags;

  const current = await withPlatformScope((tx) =>
    tx.tenant.findUnique({ where: { id: input.tenantId }, select: { active: true, name: true } }),
  );
  if (!current) return { error: 'Clínica não encontrada.' };

  await withPlatformScope((tx) =>
    tx.tenant.update({
      where: { id: input.tenantId },
      data: {
        plan: input.plan,
        billingStatus: input.billingStatus,
        monthlyFee: fee === null ? null : fee.toFixed(2),
        enabledModules: flags,
        active: input.active,
        // Churn is a question about a period: a clinic that closes gets a date, and one
        // that comes back loses it.
        deactivatedAt: input.active ? null : (current.active ? new Date() : undefined),
      },
    }),
  );

  await audit({
    tenantId: input.tenantId,
    userId: session.userId,
    action: 'settings.save',
    resource: 'platform.tenant',
    resourceId: input.tenantId,
    details: { plan: input.plan, billing: input.billingStatus, active: input.active },
  });

  revalidatePath('/tenants');
  revalidatePath(`/tenants/${input.tenantId}`);
  return { saved: `${current.name} atualizada.` };
}

/**
 * Opens a clinic as its owner, from the platform.
 *
 * The session is created here and carried over by a one-off ticket: a cookie set on the
 * reseller's host would never be sent to the clinic's. Everything that follows is marked
 * — the banner on every screen, `impersonatedByUserId` on the session, and the medical
 * record masked unless it is explicitly unlocked.
 */
export async function impersonate(formData: FormData): Promise<void> {
  const { session } = await requireSuperadmin();

  const tenantId = String(formData.get('tenantId') ?? '');
  if (!z.string().uuid().safeParse(tenantId).success) return;

  // The ticket has to land on a hostname reachable from where the reseller is standing.
  const platformHost = await requestHost();

  const target = await withPlatformScope(async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      include: { domains: { orderBy: { createdAt: 'asc' } } },
    });
    if (!tenant || !tenant.active) return null;

    // As the owner: it is the profile that reaches what support is asked about. A
    // reseller who needs less can be given less later; what bounds this today is the
    // hour, the banner and the log.
    const owner = await tx.user.findFirst({
      where: { tenantId, role: Role.OWNER, active: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true },
    });
    const host = hostForHandoff(
      tenant.domains.map((domain) => domain.host),
      platformHost,
    );
    return owner && host ? { tenant, owner, host } : null;
  });

  // Nothing to enter as: no active owner, or no hostname to land on. Silence here would
  // look like a broken button, so the panel says what is missing.
  if (!target) redirect('/tenants?falha=sem-porta');

  const { ip, userAgent } = await requestContext();
  const created = await createImpersonationSession({
    userId: target.owner.id,
    tenantId,
    byUserId: session.userId,
    ip,
    userAgent,
  });
  const ticket = await mintHandoff(created.sessionId, target.host);

  await audit({
    tenantId,
    userId: session.userId,
    action: 'tenant.impersonate',
    resource: 'tenant',
    resourceId: tenantId,
    details: { as: target.owner.name, host: target.host },
  });

  redirect(enterUrl(target.host, ticket));
}
