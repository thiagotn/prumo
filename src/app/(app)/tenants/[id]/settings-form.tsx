'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { FLAG_LABELS, FLAG_NOTES, type Flags } from '@/lib/flags';
import { BILLING_LABELS, PLAN_LABELS } from '@/lib/reseller';
import { saveTenantSettings, type TenantFormState } from '../actions';
import styles from '../tenants.module.css';

const INITIAL: TenantFormState = {};

export function TenantSettingsForm({
  tenantId,
  plan,
  billingStatus,
  monthlyFee,
  active,
  flags,
}: {
  tenantId: string;
  plan: string;
  billingStatus: string;
  monthlyFee: string;
  active: boolean;
  flags: Flags;
}) {
  const [state, action, pending] = useActionState(saveTenantSettings, INITIAL);

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="tenantId" value={tenantId} />

      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.saved ? (
        <p className={styles.saved} role="status">
          {state.saved}
        </p>
      ) : null}

      <div className={styles.grid}>
        <div className="field">
          <label htmlFor="plan">Plano</label>
          <select className="input" id="plan" name="plan" defaultValue={plan}>
            {Object.entries(PLAN_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="billingStatus">Cobrança</label>
          <select
            className="input"
            id="billingStatus"
            name="billingStatus"
            defaultValue={billingStatus}
          >
            {Object.entries(BILLING_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="monthlyFee">Mensalidade (R$)</label>
          <input
            className="input"
            id="monthlyFee"
            name="monthlyFee"
            inputMode="decimal"
            defaultValue={monthlyFee}
            placeholder="em branco: fora do MRR"
          />
          <p className={styles.kpiNote}>
            O que esta clínica paga, não o preço de tabela do plano. É a soma disto que vira o MRR.
          </p>
        </div>

        <div className="field">
          <label className={styles.flag} htmlFor="active" style={{ marginTop: 'var(--space-5)' }}>
            <input id="active" name="active" type="checkbox" defaultChecked={active} />
            <span>
              <strong>Clínica ativa</strong>
              <br />
              <span className={styles.kpiNote}>
                Desmarcar tira do MRR e conta como saída no mês. Os dados continuam no lugar.
              </span>
            </span>
          </label>
        </div>
      </div>

      <div style={{ marginTop: 'var(--space-5)' }}>
        <div className="kicker">Módulos desta clínica</div>
        <div className={styles.flags}>
          {(Object.keys(FLAG_LABELS) as Array<keyof Flags>).map((flag) => (
            <label className={styles.flag} key={flag}>
              <input type="checkbox" name={`flag:${flag}`} defaultChecked={flags[flag]} />
              <span>
                <strong>{FLAG_LABELS[flag]}</strong>
                <br />
                <span className={styles.kpiNote}>{FLAG_NOTES[flag]}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className={styles.actions}>
        <button className="btn btn-primary touch" type="submit" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar'}
        </button>
        <Link className="btn btn-secondary touch" href="/tenants">
          Voltar
        </Link>
      </div>
    </form>
  );
}
