'use server';

// Authentication actions. Everything that decides access lives on the server.
// User-facing copy stays pt-BR; the code around it is English (CLAUDE.md).
import { Role } from '@prisma/client';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { audit, requestContext } from '@/lib/audit';
import { confirmTwoFactor, createSession, currentSession, endSession } from '@/lib/auth/session';
import { hashPassword, needsRehash, verifyPassword } from '@/lib/auth/password';
import { generateBase32Secret, verifyTotpCode } from '@/lib/auth/totp';
import { withPlatformScope, withTenant, type Tx } from '@/lib/db';
import { MODULE_DEFS } from '@/lib/modules';
import { initialModule } from '@/lib/rbac';
import { isPlatformHost, requestHost, tenantByHost } from '@/lib/tenant';

export type LoginState = { error?: string };

const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido.'),
  password: z.string().min(1, 'Informe a senha.'),
  remember: z.boolean(),
});

const codeSchema = z.object({
  code: z
    .string()
    .transform((s) => s.replace(/\D/g, ''))
    .refine((s) => s.length === 6, 'O código tem 6 dígitos.'),
});

/** The same message for an unknown email and a wrong password — we never reveal who is
 *  registered. */
const INVALID_CREDENTIALS = 'E-mail ou senha incorretos.';

/** Throttle: 5 failures per email+IP within 15 minutes. */
const THROTTLE_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

/** Throwaway hash, to spend the same time when the email does not exist. */
const DECOY_HASH =
  'scrypt$131072$8$1$aXNjYS1kZS10ZW1wby1jb25zdA==$Zm9yYS1kZS11c28tYXBlbmFzLXRlbXBvLXNjcnlwdA==';

type Scope =
  | { kind: 'tenant'; tenantId: string; portalEnabled: boolean }
  | { kind: 'platform' };

async function scopeFromHost(): Promise<Scope | null> {
  const host = await requestHost();
  if (isPlatformHost(host)) return { kind: 'platform' };
  const tenant = await tenantByHost(host);
  if (!tenant || !tenant.active) return null;
  return { kind: 'tenant', tenantId: tenant.id, portalEnabled: tenant.flags.patientPortal };
}

function run<T>(scope: Scope, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return scope.kind === 'tenant' ? withTenant(scope.tenantId, fn) : withPlatformScope(fn);
}

function tenantIdOf(scope: Scope): string | null {
  return scope.kind === 'tenant' ? scope.tenantId : null;
}

export async function signIn(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const scope = await scopeFromHost();
  if (!scope) return { error: 'Esta instância não está disponível.' };

  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    remember: formData.get('remember') === 'on',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }
  const { email, password, remember } = parsed.data;
  const { ip, userAgent } = await requestContext();
  const tenantId = tenantIdOf(scope);

  // ── throttle ───────────────────────────────────────────────────────────────
  const since = new Date(Date.now() - THROTTLE_WINDOW_MS);
  const failures = await run(scope, (tx) =>
    tx.loginAttempt.count({ where: { email, ip, success: false, createdAt: { gte: since } } }),
  );
  if (failures >= MAX_FAILURES) {
    await audit({ tenantId, action: 'login.throttled', resource: 'email', details: { email } });
    return {
      error: 'Muitas tentativas. Aguarde 15 minutos ou fale com a administração da clínica.',
    };
  }

  const recordFailure = async () => {
    await run(scope, (tx) =>
      tx.loginAttempt.create({ data: { tenantId, email, ip, success: false } }),
    );
    await audit({ tenantId, action: 'login.failure', resource: 'email', details: { email } });
  };

  // ── credentials ────────────────────────────────────────────────────────────
  const user = await run(scope, (tx) =>
    tx.user.findFirst({
      where:
        scope.kind === 'tenant'
          ? { email, tenantId: scope.tenantId }
          : { email, tenantId: null, role: Role.SUPERADMIN },
      select: {
        id: true,
        name: true,
        role: true,
        passwordHash: true,
        active: true,
        totpSecret: true,
        totpConfirmedAt: true,
      },
    }),
  );

  if (!user) {
    await verifyPassword(password, DECOY_HASH); // same time cost, reveals no account
    await recordFailure();
    return { error: INVALID_CREDENTIALS };
  }

  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk || !user.active) {
    await recordFailure();
    return {
      error: user.active ? INVALID_CREDENTIALS : 'Acesso desativado. Fale com a administração.',
    };
  }

  // A patient only gets in if the portal is enabled for the tenant.
  if (user.role === Role.PATIENT && scope.kind === 'tenant' && !scope.portalEnabled) {
    await recordFailure();
    return { error: 'O portal da paciente não está habilitado nesta clínica.' };
  }

  await run(scope, async (tx) => {
    await tx.loginAttempt.create({ data: { tenantId, email, ip, success: true } });
    await tx.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        // scrypt parameters have gone up since enrolment: rewrite now that we have the password.
        ...(needsRehash(user.passwordHash) ? { passwordHash: await hashPassword(password) } : {}),
      },
    });
  });

  const { twoFactorPending } = await createSession({
    userId: user.id,
    tenantId,
    role: user.role,
    remember,
    ip,
    userAgent,
  });

  await audit({
    tenantId,
    userId: user.id,
    action: 'login.success',
    details: { role: user.role, twoFactorPending },
  });

  if (twoFactorPending) {
    redirect(user.totpConfirmedAt ? '/login/2fa' : '/login/2fa/setup');
  }
  redirect(MODULE_DEFS[initialModule(user.role)].path);
}

export async function verifyTwoFactor(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const scope = await scopeFromHost();
  if (!scope) return { error: 'Esta instância não está disponível.' };

  const session = await currentSession(tenantIdOf(scope));
  if (!session) redirect('/login');
  if (session.twoFactorOk) redirect(MODULE_DEFS[initialModule(session.role)].path);

  const parsed = codeSchema.safeParse({ code: formData.get('code') });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Código inválido.' };

  const user = await run(scope, (tx) =>
    tx.user.findUnique({ where: { id: session.userId }, select: { totpSecret: true } }),
  );
  if (!user?.totpSecret) redirect('/login/2fa/setup');

  if (!verifyTotpCode(user.totpSecret, parsed.data.code)) {
    await audit({ tenantId: session.tenantId, userId: session.userId, action: 'login.2fa.failure' });
    return { error: 'Código incorreto ou expirado. Confira o app autenticador.' };
  }

  await confirmTwoFactor(session);
  await audit({ tenantId: session.tenantId, userId: session.userId, action: 'login.2fa.success' });
  redirect(MODULE_DEFS[initialModule(session.role)].path);
}

/** Completes TOTP enrolment: the first valid code switches the second factor on. */
export async function confirmTotpSetup(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const scope = await scopeFromHost();
  if (!scope) return { error: 'Esta instância não está disponível.' };

  const session = await currentSession(tenantIdOf(scope));
  if (!session) redirect('/login');

  const parsed = codeSchema.safeParse({ code: formData.get('code') });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Código inválido.' };

  const user = await run(scope, (tx) =>
    tx.user.findUnique({ where: { id: session.userId }, select: { totpSecret: true } }),
  );
  if (!user?.totpSecret) return { error: 'Recarregue a página para gerar um novo segredo.' };

  if (!verifyTotpCode(user.totpSecret, parsed.data.code)) {
    await audit({ tenantId: session.tenantId, userId: session.userId, action: 'login.2fa.failure' });
    return { error: 'Código incorreto. Confira se o relógio do celular está automático.' };
  }

  await run(scope, (tx) =>
    tx.user.update({ where: { id: session.userId }, data: { totpConfirmedAt: new Date() } }),
  );
  await confirmTwoFactor(session);
  await audit({ tenantId: session.tenantId, userId: session.userId, action: 'login.2fa.setup' });
  redirect(MODULE_DEFS[initialModule(session.role)].path);
}

/**
 * Generates (or reuses) the signed-in user's pending TOTP secret.
 * Called by the enrolment page; the secret only counts once the first code is correct.
 */
export async function pendingTotpSecret(): Promise<{ secret: string; email: string } | null> {
  const scope = await scopeFromHost();
  if (!scope) return null;
  const session = await currentSession(tenantIdOf(scope));
  if (!session) return null;

  return run(scope, async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: session.userId },
      select: { totpSecret: true, totpConfirmedAt: true, email: true },
    });
    if (!user) return null;
    // Already confirmed: we do not reissue a secret here (that is a device change, which
    // gets its own flow in Settings).
    if (user.totpConfirmedAt) return { secret: '', email: user.email };

    if (user.totpSecret) return { secret: user.totpSecret, email: user.email };

    const secret = generateBase32Secret();
    await tx.user.update({ where: { id: session.userId }, data: { totpSecret: secret } });
    return { secret, email: user.email };
  });
}

export async function signOut(): Promise<void> {
  const scope = await scopeFromHost();
  const session = scope ? await currentSession(tenantIdOf(scope)) : null;
  if (session) {
    await endSession(session);
    await audit({ tenantId: session.tenantId, userId: session.userId, action: 'logout' });
  }
  redirect('/login');
}
