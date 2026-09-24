import type { Metadata } from 'next';
import Link from 'next/link';
import { requireModule } from '@/lib/auth/guards';
import { FLAG_LABELS } from '@/lib/flags';
import { contrastRatio } from '@/lib/color';
import { ROLE_LABELS } from '@/lib/rbac';
import { DeniedNotice } from '../denied-notice';
import styles from './dashboard.module.css';

export const metadata: Metadata = { title: 'Painel' };

/** The four KPIs in the band (docs/especificacao.md, screen 2). Values arrive in stage 6. */
const KPIS = [
  { label: 'Atendimentos no mês', note: 'meta definida em Configurações' },
  { label: 'Faturamento', note: 'ticket médio' },
  { label: 'Lucro líquido', note: 'margem realizada' },
  { label: 'Lucro por hora', note: 'horas de sala contratadas' },
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const { tenant, session } = await requireModule('dashboard');
  const { denied } = await searchParams;

  const enabledFlags = tenant
    ? (Object.entries(tenant.flags) as Array<[keyof typeof FLAG_LABELS, boolean]>)
        .filter(([, on]) => on)
        .map(([flag]) => FLAG_LABELS[flag])
    : [];

  return (
    <>
      <DeniedNotice module={denied} />

      <section className={styles.kpiBand} aria-label="Indicadores do mês">
        {KPIS.map((kpi) => (
          <div className={styles.kpi} key={kpi.label}>
            <div className="kicker">{kpi.label}</div>
            <div className={`${styles.kpiValue} num`}>—</div>
            <div className={styles.kpiNote}>{kpi.note}</div>
          </div>
        ))}
      </section>

      <div className={styles.columns}>
        <div className="card">
          <div className="card-kicker">Próximos atendimentos de hoje</div>
          <div className="card-title">Agenda do dia</div>
          <p className="card-body">
            O dia inteiro está em <Link href="/schedule">Agenda</Link>, com as visões de dia, semana
            e lista. Os números e as pendências desta tela entram com o financeiro, na etapa 6.
          </p>
        </div>

        <div className="card">
          <div className="card-kicker">Esta instância</div>
          <div className="card-title">{tenant?.name ?? 'Plataforma'}</div>
          <dl className={styles.definitions}>
            <dt>Domínio</dt>
            <dd className="num">{tenant?.domain ?? '—'}</dd>

            <dt>Cor de acento</dt>
            <dd>
              <span className={styles.colorSwatch} style={{ background: tenant?.accentColor }} />
              <span className="num">{tenant?.accentColor ?? '—'}</span>
              {tenant ? (
                <span className={styles.contrast}>
                  contraste {contrastRatio(tenant.accentColor, '#f3f2f2').toFixed(2)}:1
                </span>
              ) : null}
            </dd>

            <dt>Seu perfil</dt>
            <dd>{ROLE_LABELS[session.role]}</dd>

            <dt>Segundo fator</dt>
            <dd>
              {session.twoFactorRequired
                ? session.twoFactorOk
                  ? 'verificado nesta sessão'
                  : 'pendente'
                : 'não exigido para este perfil'}
            </dd>

            <dt>Módulos habilitados</dt>
            <dd>{enabledFlags.length > 0 ? enabledFlags.join(' · ') : '—'}</dd>
          </dl>
        </div>
      </div>
    </>
  );
}
