// Proxy (called `middleware` up to Next 15): tenant resolution by hostname starts here —
// docs/especificacao.md, "Multi-tenant / white-label" -> "Resolução por hostname".
//
// What it does NOT do: validate a session or a permission. It runs before rendering,
// with no access to Postgres, and Next's own docs warn against relying on shared modules
// here. Every real decision lives in the server guards (src/lib/auth/guards.ts). This
// only: (1) stamps the normalised host for the rest of the request and (2) avoids
// rendering the app shell for someone who has no cookie at all.
import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'prumo_session';

/**
 * Routes that never require a session.
 *
 * `/consent` is the page a patient opens from the link the clinic sent her: she has no
 * account, and the token in the URL is what authorises the request (the page checks it
 * against the HMAC stored on the row).
 *
 * `/enter` is where an impersonation ticket from the reseller's panel is spent. There is
 * no session there yet — that page is what creates one.
 */
const PUBLIC_PATHS = ['/login', '/healthz', '/readyz', '/consent', '/enter'];

/**
 * API routes answer for themselves. Redirecting one to the sign-in page would hand a
 * fetch an HTML page with a 200, which reads as success; the routes return a real 401
 * instead. They still authorise — see src/lib/photo-access.ts.
 */
const API_PREFIX = '/api/';

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/:(80|443)$/, '')
    .replace(/^www\./, '');

  const isPublic =
    pathname.startsWith(API_PREFIX) ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!isPublic && !req.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const res = NextResponse.next();
  res.headers.set('x-prumo-host', host);
  return res;
}

export const config = {
  // Excluded: Next assets, the favicon and the self-hosted fonts.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|woff2?)$).*)'],
};
