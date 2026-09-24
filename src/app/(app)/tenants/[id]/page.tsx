import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSuperadmin } from '@/lib/auth/guards';
import { withPlatformScope } from '@/lib/db';
import { currency, dateTime, longDate } from '@/lib/format';
import { readFlags } from '@/lib/flags';
import { ROLE_LABELS } from '@/lib/rbac';
import { impersonate } from '../actions';
import { TenantSettingsForm } from './settings-form';
import styles from '../tenants.module.css';

export const metadata: Metadata = { title: 'Clínica' };

export default async function TenantPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperadmin();
  const { id } = await params;

  const tenant = await withPlatformScope((tx) =>
    tx.tenant.findUnique({
      where: { id },
      include: {
        domains: { orderBy: { createdAt: 'asc' } },
        users: { orderBy: { createdAt: 'asc' }, select: { name: true, email: true, role: true, active: true } },
        _count: { select: { patients: true, appointments: true } },
      },
    }),
  );
  if (!tenant) notFound();

  // What the platform did inside this clinic, which is the first thing to look at when
  // someone asks "quem entrou aqui?".
  const impersonations = await withPlatformScope((tx) =>
    tx.auditLog.findMany({
      where: { tenantId: tenant.id, action: 'tenant.impersonate' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { user: { select: { name: true } } },
    }),
  );

  return (
    <div>
      <div className="kicker">Plataforma</div>
      <h2 className={styles.title}>{tenant.name}</h2>
      <p className={styles.kpiNote} style={{ marginBottom: 'var(--space-5)' }}>
        {tenant.domains.map((domain) => domain.host).join(' · ') || tenant.domain} ·{' '}
        {tenant._count.patients} paciente{tenant._count.patients === 1 ? '' : 's'} ·{' '}
        {tenant._count.appointments} horário{tenant._count.appointments === 1 ? '' : 's'} · desde{' '}
        {longDate(tenant.createdAt)}
        {tenant.deactivatedAt ? ` · saiu em ${longDate(tenant.deactivatedAt)}` : ''}
      </p>

      <TenantSettingsForm
        tenantId={tenant.id}
        plan={tenant.plan}
        billingStatus={tenant.billingStatus}
        monthlyFee={tenant.monthlyFee === null ? '' : currency(Number(tenant.monthlyFee)).replace('R$ ', '')}
        active={tenant.active}
        flags={readFlags(tenant.enabledModules)}
      />

      <section style={{ marginTop: 'var(--space-7)', maxWidth: 720 }}>
        <div className="kicker">Quem trabalha nesta clínica</div>
        <div className={styles.tableWrap} style={{ marginTop: 'var(--space-2)' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Perfil</th>
              </tr>
            </thead>
            <tbody>
              {tenant.users.map((user) => (
                <tr key={user.email} className={user.active ? undefined : styles.inactive}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>{ROLE_LABELS[user.role]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.kpiNote} style={{ marginTop: 'var(--space-2)' }}>
          Criar usuário e redefinir acesso continua nos scripts de operação — a plataforma lê esta
          lista, não escreve nela.
        </p>
      </section>

      <section style={{ marginTop: 'var(--space-7)', maxWidth: 720 }}>
        <div className="kicker">Sessões assumidas</div>
        {impersonations.length === 0 ? (
          <p className={styles.kpiNote} style={{ marginTop: 'var(--space-2)' }}>
            A plataforma nunca entrou nesta clínica.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 'var(--space-2) 0 0', padding: 0 }}>
            {impersonations.map((entry) => (
              <li key={entry.id} className={styles.kpiNote} style={{ padding: '4px 0' }}>
                {dateTime(entry.createdAt)} · {entry.user?.name ?? 'plataforma'}
                {entry.ip ? ` · ${entry.ip}` : ''}
              </li>
            ))}
          </ul>
        )}

        {tenant.active && tenant.domains[0] ? (
          <form action={impersonate} style={{ marginTop: 'var(--space-3)' }}>
            <input type="hidden" name="tenantId" value={tenant.id} />
            <button className="btn btn-secondary touch" type="submit" style={{ fontSize: 12 }}>
              Entrar como {tenant.name}
            </button>
          </form>
        ) : null}

        <p className={styles.danger}>
          A clínica vê exatamente isto no próprio log de auditoria — entrada, saída e cada tela
          aberta. Prontuário e fotos ficam mascarados; liberar exige autorização registrada, que
          ainda não tem tela: hoje é alteração direta no banco, e propositalmente incômoda.
        </p>
      </section>

      <p className={styles.note}>
        <Link href="/tenants">Voltar para a lista</Link>
      </p>
    </div>
  );
}
