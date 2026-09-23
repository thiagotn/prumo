'use client';

import { useActionState } from 'react';
import { signIn, type LoginState } from './actions';
import styles from './login.module.css';

const INITIAL: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, INITIAL);

  return (
    <form className={styles.form} action={action} noValidate>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input
          className="input"
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          autoFocus
        />
      </div>

      <div className="field">
        <label htmlFor="password">Senha</label>
        <input
          className="input"
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <div className={styles.helperRow}>
        <label className={styles.remember}>
          <input type="checkbox" name="remember" />
          Manter conectado neste dispositivo
        </label>
        {/* Password recovery arrives in stage 6, with transactional email. */}
        <a href="/login/password">Esqueci a senha</a>
      </div>

      <button className="btn btn-primary btn-block touch" type="submit" disabled={pending}>
        {pending ? 'Entrando…' : 'Entrar'}
      </button>

      <p className={styles.note}>
        Perfis com acesso a prontuário exigem verificação em duas etapas. A recepção entra sem 2FA,
        mas não vê anamnese nem fotos clínicas.
      </p>
    </form>
  );
}
