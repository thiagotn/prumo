'use client';

import { useActionState, useState } from 'react';
import { currency } from '@/lib/format';
import { savePricingParams, type SettingsState } from './actions';
import styles from './settings.module.css';

const INITIAL: SettingsState = {};

type Props = {
  taxRate: number;
  cardFeeUpfront: number;
  cardFeeInstallment: number;
  fixedMonthlyCosts: number;
  expectedAppointments: number;
  defaultMargin: number;
};

/** Stored as fractions, edited as percentages. */
const toPercent = (fraction: number) => Number((fraction * 100).toFixed(2));

export function PricingForm(props: Props) {
  const [state, action, pending] = useActionState(savePricingParams, INITIAL);
  const [fixed, setFixed] = useState(String(props.fixedMonthlyCosts));
  const [appointments, setAppointments] = useState(String(props.expectedAppointments));
  const [tax, setTax] = useState(String(toPercent(props.taxRate)));
  const [feeInstallment, setFeeInstallment] = useState(String(toPercent(props.cardFeeInstallment)));
  const [margin, setMargin] = useState(String(toPercent(props.defaultMargin)));

  const fixedNumber = Number(fixed.replace(',', '.'));
  const appointmentsNumber = Number(appointments);
  const overhead =
    Number.isFinite(fixedNumber) && appointmentsNumber > 0 ? fixedNumber / appointmentsNumber : null;

  // Mirrors the guard in the action: past 100% combined there is no price that yields
  // the margin, so we say so before the save is attempted.
  const sum = Number(tax) + Number(feeInstallment) + Number(margin);
  const impossible = Number.isFinite(sum) && sum >= 100;

  return (
    <form action={action}>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.saved ? (
        <p className={styles.feedback} role="status">
          {state.saved}
        </p>
      ) : null}

      <div className={styles.gridThree}>
        <div className="field">
          <label htmlFor="taxRate">Impostos (%)</label>
          <input
            className="input num"
            id="taxRate"
            name="taxRate"
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={tax}
            onChange={(e) => setTax(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="cardFeeUpfront">Maquininha à vista (%)</label>
          <input
            className="input num"
            id="cardFeeUpfront"
            name="cardFeeUpfront"
            type="number"
            step="0.01"
            min="0"
            max="100"
            defaultValue={toPercent(props.cardFeeUpfront)}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="cardFeeInstallment">Maquininha parcelado (%)</label>
          <input
            className="input num"
            id="cardFeeInstallment"
            name="cardFeeInstallment"
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={feeInstallment}
            onChange={(e) => setFeeInstallment(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="fixedMonthlyCosts">Custos fixos mensais (R$)</label>
          <input
            className="input num"
            id="fixedMonthlyCosts"
            name="fixedMonthlyCosts"
            type="number"
            step="0.01"
            min="0"
            value={fixed}
            onChange={(e) => setFixed(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="expectedAppointments">Atendimentos por mês</label>
          <input
            className="input num"
            id="expectedAppointments"
            name="expectedAppointments"
            type="number"
            step="1"
            min="1"
            value={appointments}
            onChange={(e) => setAppointments(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="defaultMargin">Margem padrão (%)</label>
          <input
            className="input num"
            id="defaultMargin"
            name="defaultMargin"
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={margin}
            onChange={(e) => setMargin(e.target.value)}
            required
          />
        </div>
      </div>

      <div className={styles.derived}>
        <div>
          <div className="kicker">Rateio por atendimento</div>
          <div className={`${styles.derivedValue} num`}>
            {overhead === null ? '—' : currency(overhead)}
          </div>
        </div>
        <p className={styles.contrast} style={{ margin: 0 }}>
          Custos fixos ÷ atendimentos por mês. Entra no custo de cada procedimento, então mexer aqui
          muda todos os preços sugeridos.
        </p>
      </div>

      {impossible ? (
        <p className="form-error" style={{ marginTop: 'var(--space-3)' }} role="alert">
          Impostos, taxa parcelada e margem somam {sum.toFixed(1)}%. Precisam ficar abaixo de 100% —
          acima disso não existe preço que feche essa margem.
        </p>
      ) : null}

      <div className={styles.actions}>
        <button className="btn btn-primary touch" type="submit" disabled={pending || impossible}>
          {pending ? 'Salvando…' : 'Salvar parâmetros'}
        </button>
        <span className={styles.contrast}>
          Salvar cria uma versão nova — a anterior fica no histórico, para explicar preços antigos.
        </span>
      </div>
    </form>
  );
}
