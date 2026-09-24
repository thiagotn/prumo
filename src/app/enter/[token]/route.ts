// Where an impersonation ticket is spent.
//
// A Route Handler and not a page: this has to set the session cookie, and only a handler
// (or a server action) may. Public by necessity — there is no session yet; creating one is
// the whole point. What authorises it is the ticket: single use, one minute of life, and
// minted for this hostname.
import { NextResponse } from 'next/server';
import { audit } from '@/lib/audit';
import { consumeHandoff } from '@/lib/auth/impersonation';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { currentTenant, originFor, requestHost } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const host = await requestHost();
  // Not request.url: Next hands it back with the server's own origin, which in a
  // subdomain-per-clinic setup would redirect the reseller to somebody else's login.
  const origin = originFor(host);
  const tenant = await currentTenant();

  const result = await consumeHandoff(token, host);

  if (!result.ok) {
    await audit({
      tenantId: tenant?.id ?? null,
      action: 'access.denied',
      resource: 'impersonation.enter',
      details: { reason: result.reason },
    });
    // The reason is shown by a page, so the refusal looks like the rest of the system
    // rather than like a stack trace.
    return NextResponse.redirect(new URL(`/enter?motivo=${result.reason}`, origin));
  }

  await audit({
    tenantId: result.tenantId,
    action: 'tenant.impersonate',
    resource: 'impersonation.enter',
    details: { host },
  });

  const response = NextResponse.redirect(new URL('/dashboard', origin));
  response.cookies.set(SESSION_COOKIE, result.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: result.expiresAt,
  });
  return response;
}
