import type { Metadata } from 'next';
import Link from 'next/link';
import { requireModuleWrite } from '@/lib/auth/guards';
import { withTenant } from '@/lib/db';
import { IssueForm } from '../issue-form';
import styles from '../consents.module.css';

export const metadata: Metadata = { title: 'Emitir termo' };

export default async function IssueConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string; appointment?: string; template?: string }>;
}) {
  const { tenant } = await requireModuleWrite('consents');
  const { patient, appointment, template } = await searchParams;
  if (!tenant) return <p className="card-body">Esta tela pertence a uma clínica.</p>;

  const { templates, patients } = await withTenant(tenant.id, async (tx) => ({
    templates: await tx.consentTemplate.findMany({
      where: { current: true },
      orderBy: { title: 'asc' },
      select: { id: true, title: true, version: true },
    }),
    patients: await tx.patient.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
      take: 500,
    }),
  }));

  if (templates.length === 0) {
    return (
      <p className="card-body" style={{ maxWidth: '44em' }}>
        Nenhum termo escrito ainda. A doutora escreve o primeiro em{' '}
        <Link href="/consents">Termos</Link>, e a partir daí ele pode ser emitido para qualquer
        paciente.
      </p>
    );
  }

  return (
    <div>
      <div className="kicker">Termos</div>
      <h2 className={styles.title}>Emitir termo</h2>
      <p className="card-body" style={{ maxWidth: '44em', marginBottom: 'var(--space-5)' }}>
        O termo fica aguardando assinatura. Você colhe na tela, na hora, ou envia o link para a
        paciente assinar do celular dela.
      </p>

      <IssueForm
        templates={templates}
        patients={patients}
        defaults={{
          templateId: template ?? '',
          patientId: patient ?? '',
          appointmentId: appointment ?? '',
        }}
      />
    </div>
  );
}
