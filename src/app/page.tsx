import { redirect } from 'next/navigation';
import { currentSession } from '@/lib/auth/session';
import { MODULE_DEFS } from '@/lib/modules';
import { initialModule } from '@/lib/rbac';
import { isPlatformHost, requestHost, tenantByHost } from '@/lib/tenant';

/** The root has no screen: it sends you to your role's first one, or to the login. */
export default async function Root() {
  const host = await requestHost();
  const tenant = isPlatformHost(host) ? null : await tenantByHost(host);
  const session = await currentSession(tenant?.id ?? null);

  if (!session) redirect('/login');
  if (session.twoFactorRequired && !session.twoFactorOk) {
    redirect(session.totpEnrolled ? '/login/2fa' : '/login/2fa/setup');
  }
  redirect(MODULE_DEFS[initialModule(session.role)].path);
}
