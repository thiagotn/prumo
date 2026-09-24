// "Entrar como": the ticket that carries a support session from the reseller's host to
// the clinic's.
//
// A cookie set on admin.<reseller> is never sent to app.<clinic> — different sites. So the
// session is created on the platform side and handed over through a URL, once. What
// protects the trip: 256 bits of token, only the HMAC stored, one minute of life, single
// use, and the host it was minted for written down.
import 'server-only';
import { randomBytes } from 'node:crypto';
import { handoffExpiresAt } from '../reseller';
import { withPlatformScope } from '../db';
import { hashToken } from './session';

export async function mintHandoff(sessionId: string, host: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');

  await withPlatformScope((tx) =>
    tx.impersonationHandoff.create({
      data: { tokenHash: hashToken(token), sessionId, host, expiresAt: handoffExpiresAt() },
    }),
  );

  return token;
}

export type HandoffResult =
  | { ok: true; token: string; expiresAt: Date; tenantId: string }
  | { ok: false; reason: 'unknown' | 'expired' | 'used' | 'wrong-host' };

/**
 * Spends a ticket, once, and mints a fresh session token for the cookie.
 *
 * The ticket never carries the session's own token: that would put a live credential in a
 * URL, which lands in browser history and in every proxy log on the way. Instead the
 * clinic's host generates a new token for the same session row and stores its HMAC —
 * the session is the same, the credential is new, and nothing secret travelled.
 *
 * The update is conditional on `usedAt` still being null, so two requests racing on the
 * same URL — a reload, a prefetch, a link opened twice — cannot both walk in.
 */
export async function consumeHandoff(
  presented: string,
  host: string,
): Promise<HandoffResult> {
  return withPlatformScope(async (tx) => {
    const handoff = await tx.impersonationHandoff.findUnique({
      where: { tokenHash: hashToken(presented) },
      include: { session: { select: { id: true, tenantId: true, expiresAt: true, revokedAt: true } } },
    });
    if (!handoff) return { ok: false, reason: 'unknown' } as const;
    if (handoff.usedAt) return { ok: false, reason: 'used' } as const;
    if (handoff.host !== host) return { ok: false, reason: 'wrong-host' } as const;
    if (handoff.expiresAt < new Date()) return { ok: false, reason: 'expired' } as const;
    if (handoff.session.revokedAt || handoff.session.expiresAt < new Date()) {
      return { ok: false, reason: 'expired' } as const;
    }

    const claimed = await tx.impersonationHandoff.updateMany({
      where: { id: handoff.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) return { ok: false, reason: 'used' } as const;

    const token = randomBytes(32).toString('base64url');
    await tx.session.update({
      where: { id: handoff.session.id },
      data: { tokenHash: hashToken(token), lastUsedAt: new Date() },
    });

    return {
      ok: true,
      token,
      expiresAt: handoff.session.expiresAt,
      tenantId: handoff.session.tenantId ?? '',
    } as const;
  });
}
