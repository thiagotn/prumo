import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentSession } from '@/lib/auth/session';
import { MODULE_DEFS } from '@/lib/modules';
import { initialModule } from '@/lib/rbac';
import { isContactHost, isPlatformHost, requestHost, tenantByHost } from '@/lib/tenant';
import { InterestPage } from './_interest/interest-page';

export async function generateMetadata(): Promise<Metadata> {
  const host = await requestHost();
  // On a clinic's hostname this page only redirects, so its title is never seen.
  return isContactHost(host) ? { title: 'Tenho interesse' } : {};
}

/**
 * The root, which means three different things depending on who is asking.
 *
 * On a clinic's hostname and on the panel's, it has no screen of its own: it sends you to
 * your role's first one, or to the login. On the product's contact address
 * (`contato.prumo.in`) it is the interest form — the one place where "this host is no
 * clinic" is the expected answer instead of a 404. The apex is the institutional site,
 * served by another deployment entirely.
 *
 * The tenant is resolved FIRST, on purpose: a host that answers for a clinic is a clinic,
 * whatever the configuration says.
 */
export default async function Root() {
  const host = await requestHost();
  const platform = isPlatformHost(host);
  const tenant = platform ? null : await tenantByHost(host);

  if (!tenant && !platform && isContactHost(host)) return <InterestPage />;

  const session = await currentSession(tenant?.id ?? null);

  if (!session) redirect('/login');
  if (session.twoFactorRequired && !session.twoFactorOk) {
    redirect(session.totpEnrolled ? '/login/2fa' : '/login/2fa/setup');
  }
  redirect(MODULE_DEFS[initialModule(session.role)].path);
}
