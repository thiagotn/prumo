'use client';

// Collecting the signature at the counter: the tablet or the phone is handed to the
// patient, she signs, and the term is closed on the spot.
import { useActionState } from 'react';
import { SignaturePad } from '@/components/signature-pad';
import { signOnScreen, type ConsentFormState } from './actions';
import styles from './consents.module.css';

const INITIAL: ConsentFormState = {};

export function SignOnScreenForm({
  consentId,
  patientName,
}: {
  consentId: string;
  patientName: string;
}) {
  const [state, action, pending] = useActionState(signOnScreen, INITIAL);
  const values = state.values ?? { signerName: patientName, signerNote: '' };

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="consentId" value={consentId} />

      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="field">
        <label htmlFor="signerName">Quem está assinando</label>
        <input
          className="input"
          id="signerName"
          name="signerName"
          defaultValue={values.signerName}
          required
        />
      </div>

      <div className="field" style={{ marginTop: 'var(--space-3)' }}>
        <label htmlFor="signerNote">Se não for a própria paciente, qual a relação?</label>
        <input
          className="input"
          id="signerNote"
          name="signerNote"
          placeholder="Responsável legal · mãe"
          defaultValue={values.signerNote}
        />
      </div>

      <div style={{ marginTop: 'var(--space-4)', maxWidth: 520 }}>
        <SignaturePad
          name="signature"
          label="Assinatura da paciente"
          hint="Entregue a tela para ela assinar com o dedo."
        />
      </div>

      <div className={styles.formActions}>
        <button className="btn btn-primary touch" type="submit" disabled={pending}>
          {pending ? 'Registrando…' : 'Registrar assinatura'}
        </button>
      </div>
    </form>
  );
}
