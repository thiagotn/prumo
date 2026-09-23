import { requireSession } from '@/lib/auth/guards';
import { monogram } from '@/lib/format';
import { buildNavigation, mobileItems } from '@/lib/navigation';
import { ROLE_LABELS } from '@/lib/rbac';
import { signOut } from '../login/actions';
import { Header } from './header';
import { MobileTitle } from './mobile-title';
import { SidebarNav } from './sidebar-nav';
import { TabBar } from './tab-bar';
import styles from './shell.module.css';

/**
 * The shell around every authenticated screen. `requireSession` already turns away
 * anyone without a valid session and diverts anyone still owing a second factor; each
 * page calls `requireModule` on its own — the shell is not the permission.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { tenant, session } = await requireSession();

  const flags = tenant?.flags ?? null;
  const sections = buildNavigation(session.role, flags);
  const tabs = mobileItems(session.role, flags);

  const brandName = tenant?.name ?? 'Ateliê · Plataforma';
  const brandMonogram = tenant?.monogram ?? 'AT';
  const unit = tenant?.defaultUnit ?? 'Painel da revenda';

  return (
    <div className={styles.shell}>
      <aside className={styles.nav}>
        <div className={styles.navBrand}>
          <div className={`monogram ${styles.navMonogram}`}>{brandMonogram}</div>
          <div className={styles.navBrandText}>
            <div className={styles.navName}>{brandName}</div>
            <div className={styles.navUnit}>{unit}</div>
          </div>
        </div>

        <SidebarNav sections={sections} />

        <div className={styles.navFooter}>
          <div className={styles.avatar} aria-hidden="true">
            {monogram(session.name)}
          </div>
          <div className={styles.userText}>
            <div className={styles.userName}>{session.name}</div>
            <div className={styles.userRole} data-testid="user-role">
              {ROLE_LABELS[session.role]}
            </div>
          </div>
          <form action={signOut}>
            <button
              className="btn btn-ghost"
              type="submit"
              style={{ fontSize: 11, padding: '5px 9px' }}
            >
              Sair
            </button>
          </form>
        </div>
      </aside>

      <div className={styles.body}>
        <div className={styles.mobileHeader}>
          <div className={`monogram ${styles.mobileMonogram}`}>{brandMonogram}</div>
          <MobileTitle />
          <div
            className={styles.avatar}
            aria-label={`${session.name} — ${ROLE_LABELS[session.role]}`}
          >
            {monogram(session.name)}
          </div>
        </div>

        {session.impersonatedByUserId ? (
          <div className={styles.impersonationBanner} role="status">
            <strong>Sessão assumida pela plataforma.</strong>
            <span>
              {session.medicalRecordUnlocked
                ? 'Prontuário liberado por autorização registrada.'
                : 'Prontuário e fotos aparecem mascarados. Todo acesso está em log.'}
            </span>
            <form action={signOut} style={{ marginLeft: 'auto' }}>
              <button className="btn btn-ghost" type="submit" style={{ fontSize: 11 }}>
                Encerrar
              </button>
            </form>
          </div>
        ) : null}

        <Header clinicName={brandName} />

        <main className={`${styles.content} scrollbar`} id="content">
          {children}
        </main>
      </div>

      <TabBar items={tabs} />
    </div>
  );
}
