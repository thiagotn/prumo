// Proxy (called `middleware` up to Next 15): tenant resolution by hostname starts here —
// README, "Resolução de tenant por hostname via middleware".
//
// What it does NOT do: validate a session or a permission. It runs before rendering,
// with no access to Postgres, and Next's own docs warn against relying on shared modules
// here. Every real decision lives in the server guards (src/lib/auth/guards.ts). This
// only: (1) stamps the normalised host for the rest of the request and (2) avoids
// rendering the app shell for someone who has no cookie at all.
import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'prumo_session';

/** Routes that never require a session. */
const PUBLIC_PATHS = ['/login', '/healthz', '/readyz'];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/:(80|443)$/, '')
    .replace(/^www\./, '');

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

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
