'use client';

import { useActionState, useState } from 'react';
import { currency } from '@/lib/format';
import { closeEncounter, type CloseState } from './actions';
import styles from './encounter.module.css';

const INITIAL: CloseState = {};

type ProductOption = { id: string; brand: string; suggestedUpfront: number; suggestedInstallment: number };

/** Product copy, pt-BR. */
const METHODS = [
  { value: 'PIX', label: 'Pix' },
  { value: 'CASH', label: 'Dinheiro' },
  { value: 'DEBIT', label: 'Débito' },
  { value: 'CREDIT_UPFRONT', label: 'Crédito à vista' },
  { value: 'CREDIT_INSTALLMENT', label: 'Crédito parcelado' },
] as const;

export function CloseForm({
  appointmentId,
  products,
  totalCost,
}: {
  appointmentId: string;
  products: ProductOption[];
  totalCost: number;
}) {
  const [state, action, pending] = useActionState(closeEncounter, INITIAL);
  const [productId, setProductId] = useState(products[0]?.id ?? '');
  const [method, setMethod] = useState<string>('PIX');
  const [charged, setCharged] = useState(() =>
    products[0] ? products[0].suggestedUpfront.toFixed(2) : '',
  );

  const product = products.find((p) => p.id === productId);
  const chargedNumber = Number(charged.replace(',', '.'));
  const belowCost = Number.isFinite(chargedNumber) && chargedNumber < totalCost;
  const installmentMethod = method === 'CREDIT_INSTALLMENT';

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="appointmentId" value={appointmentId} />

      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.warning ? (
        <p className="form-error" role="alert">
          {state.warning}
        </p>
      ) : null}
      {state.saved ? (
        <p className={styles.saved} role="status">
          {state.saved}
        </p>
      ) : null}

      <div className="field">
        <label htmlFor="productId">Produto usado</label>
        <select
          className="input"
          id="productId"
          name="productId"
          value={productId}
          onChange={(e) => {
            setProductId(e.target.value);
            const next = products.find((p) => p.id === e.target.value);
            if (next) setCharged(next.suggestedUpfront.toFixed(2));
          }}
          required
        >
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.brand}
            </option>
          ))}
        </select>
        {product ? (
          <p className={styles.hint}>
            Sugerido: {currency(product.suggestedUpfront)} à vista ·{' '}
            {currency(product.suggestedInstallment)} parcelado. O lote usado é escolhido
            automaticamente — sai o que vence primeiro.
          </p>
        ) : null}
      </div>

      <div className={styles.row}>
        <div className="field">
          <label htmlFor="volume">Volume aplicado</label>
          <input className="input num" id="volume" name="volume" type="number" step="0.01" min="0" />
        </div>
        <div className="field">
          <label htmlFor="technique">Técnica</label>
          <input className="input" id="technique" name="technique" maxLength={200} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="evolution">Evolução</label>
        <textarea className="input" id="evolution" name="evolution" rows={3} maxLength={4000} />
      </div>

      <div className={styles.row}>
        <div className="field">
          <label htmlFor="method">Forma de pagamento</label>
          <select
            className="input"
            id="method"
            name="method"
            value={method}
            onChange={(e) => {
              setMethod(e.target.value);
              const next = products.find((p) => p.id === productId);
              if (next) {
                setCharged(
                  (e.target.value === 'CREDIT_INSTALLMENT'
                    ? next.suggestedInstallment
                    : next.suggestedUpfront
                  ).toFixed(2),
                );
              }
            }}
            required
          >
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          {method === 'PIX' || method === 'CASH' ? (
            <p className={styles.hint}>Sem maquininha: a margem sai maior que a definida.</p>
          ) : null}
        </div>

        {installmentMethod ? (
          <div className="field">
            <label htmlFor="installments">Parcelas</label>
            <input
              className="input num"
              id="installments"
              name="installments"
              type="number"
              min="2"
              max="24"
              defaultValue="12"
              required
            />
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="charged">Valor cobrado (R$)</label>
          <input
            className="input num"
            id="charged"
            name="charged"
            type="number"
            step="0.01"
            min="0"
            value={charged}
            onChange={(e) => setCharged(e.target.value)}
            required
          />
          <p className={`${styles.hint} ${belowCost ? styles.hintWarn : ''}`}>
            Custo total: {currency(totalCost)}
            {belowCost ? ' — abaixo do custo, o prejuízo sai da margem.' : ''}
          </p>
        </div>
      </div>

      {state.warning ? (
        <label className={styles.confirm}>
          <input type="checkbox" name="confirmBelowCost" />
          Confirmo o fechamento abaixo do custo
        </label>
      ) : null}

      <div className={styles.actions}>
        <button className="btn btn-primary touch" type="submit" disabled={pending || !productId}>
          {pending ? 'Fechando…' : 'Fechar atendimento'}
        </button>
        <span className={styles.hint}>
          Fechar grava o pagamento, baixa o lote no estoque e marca o atendimento como atendido.
        </span>
      </div>
    </form>
  );
}
