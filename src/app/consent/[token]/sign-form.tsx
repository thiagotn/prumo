'use client';

import { useActionState } from 'react';
import { SignaturePad } from '@/components/signature-pad';
import { signByLink, type SignByLinkState } from './actions';

const INITIAL: SignByLinkState = {};

export function SignForm({ token, patientName }: { token: string; patientName: string }) {
  const [state, action, pending] = useActionState(signByLink, INITIAL);
  const values = state.values ?? { signerName: patientName, signerNote: '' };

  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />

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

      <div style={{ marginTop: 'var(--space-4)' }}>
        <SignaturePad name="signature" label="Assinatura" />
      </div>

      <button
        className="btn btn-primary btn-block touch"
        type="submit"
        disabled={pending}
        style={{ marginTop: 'var(--space-4)' }}
      >
        {pending ? 'Registrando…' : 'Assinar o termo'}
      </button>
    </form>
  );
}
