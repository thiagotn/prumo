import type { Metadata } from 'next';
import { requireModuleWrite } from '@/lib/auth/guards';
import { PatientForm } from '../patient-form';
import styles from '../patients.module.css';

export const metadata: Metadata = { title: 'Nova paciente' };

const EMPTY = {
  name: '',
  birthDate: '',
  phone: '',
  email: '',
  document: '',
  clinicalAlert: '',
  notes: '',
  active: true,
};

export default async function NewPatientPage() {
  // The guard, not the button: reaching this URL without write permission bounces.
  const { tenant } = await requireModuleWrite('patients');
  if (!tenant) return <p className="card-body">Esta tela pertence a uma clínica.</p>;

  return (
    <div>
      <div className="kicker">Cadastro</div>
      <h2 className={styles.panelName}>Nova paciente</h2>
      <p className="card-body" style={{ maxWidth: 560, marginBottom: 'var(--space-5)' }}>
        Só o nome é obrigatório. Telefone, e-mail e CPF podem entrar depois, quando a paciente
        chegar.
      </p>
      <PatientForm values={EMPTY} />
    </div>
  );
}
