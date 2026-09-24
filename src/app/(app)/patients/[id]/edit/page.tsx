import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireModuleWrite } from '@/lib/auth/guards';
import { withTenant } from '@/lib/db';
import { birthDateInputValue } from '@/lib/patient';
import { PatientForm } from '../../patient-form';
import styles from '../../patients.module.css';

export const metadata: Metadata = { title: 'Editar paciente' };

export default async function EditPatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { tenant } = await requireModuleWrite('patients');
  const { id } = await params;
  if (!tenant) return <p className="card-body">Esta tela pertence a uma clínica.</p>;

  // Under RLS this only ever finds a patient of this clinic; another tenant's id is a 404
  // here, the same as an id that does not exist.
  const patient = await withTenant(tenant.id, (tx) => tx.patient.findUnique({ where: { id } }));
  if (!patient) notFound();

  return (
    <div>
      <div className="kicker">Cadastro</div>
      <h2 className={styles.panelName}>{patient.name}</h2>
      <p className="card-body" style={{ maxWidth: 560, marginBottom: 'var(--space-5)' }}>
        Corrigir os dados de contato não mexe no histórico de atendimentos.
      </p>
      <PatientForm
        values={{
          id: patient.id,
          name: patient.name,
          birthDate: birthDateInputValue(patient.birthDate),
          phone: patient.phone ?? '',
          email: patient.email ?? '',
          document: patient.document ?? '',
          clinicalAlert: patient.clinicalAlert ?? '',
          notes: patient.notes ?? '',
          active: patient.active,
        }}
      />
    </div>
  );
}
