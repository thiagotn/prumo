'use client';

import { useActionState } from 'react';
import { confirmTotpSetup, signOut, verifyTwoFactor, type LoginState } from './actions';
import styles from './login.module.css';

const INITIAL: LoginState = {};

export function CodeForm({ mode }: { mode: 'verify' | 'enrol' }) {
  const [state, action, pending] = useActionState(
    mode === 'verify' ? verifyTwoFactor : confirmTotpSetup,
    INITIAL,
  );

  return (
    <form className={styles.form} action={action} noValidate>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="field">
        <label htmlFor="code">Código do autenticador</label>
        <input
          className={`input ${styles.code}`}
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={7}
          placeholder="000000"
          required
          autoFocus
        />
      </div>

      <button className="btn btn-primary btn-block touch" type="submit" disabled={pending}>
        {pending ? 'Verificando…' : mode === 'verify' ? 'Confirmar' : 'Ativar 2FA e entrar'}
      </button>

      <button className="btn btn-ghost" type="submit" formAction={signOut} disabled={pending}>
        Entrar com outra conta
      </button>
    </form>
  );
}
