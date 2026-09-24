'use client';

// The invoice is on the counter: which brand, which batch, how many, for how much.
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { NEW_PRODUCT } from '@/lib/stock';
import { receiveStock, type StockEntryState } from './actions';
import styles from './inventory.module.css';

const INITIAL: StockEntryState = {};

export type EntryFormProps = {
  products: Array<{ id: string; brand: string; procedureName: string; purchaseUnit: string; purchaseCost: string }>;
  procedures: Array<{ id: string; name: string }>;
  defaults: { productId: string };
};

export function EntryForm(props: EntryFormProps) {
  const [state, action, pending] = useActionState(receiveStock, INITIAL);
  const sent = state.values;
  const [productId, setProductId] = useState(sent?.productId ?? props.defaults.productId);
  const isNew = productId === NEW_PRODUCT;
  const chosen = props.products.find((product) => product.id === productId);

  return (
    <form action={action} className={styles.form}>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="field">
        <label htmlFor="productId">Produto</label>
        <select
          className="input"
          id="productId"
          name="productId"
          value={productId}
          onChange={(event) => setProductId(event.target.value)}
          required
        >
          <option value="">Escolha o produto</option>
          {props.products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.brand} · {product.procedureName} · {product.purchaseUnit}
            </option>
          ))}
          <option value={NEW_PRODUCT}>+ Produto novo, ainda não cadastrado</option>
        </select>
      </div>

      {isNew ? (
        <fieldset className={styles.fieldset}>
          <legend className="kicker">Produto novo</legend>
          <div className={styles.formGrid}>
            <div className="field">
              <label htmlFor="brand">Marca</label>
              <input
                className="input"
                id="brand"
                name="brand"
                defaultValue={sent?.brand ?? ''}
                placeholder="Botulim"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="procedureId">Procedimento</label>
              <select
                className="input"
                id="procedureId"
                name="procedureId"
                defaultValue={sent?.procedureId ?? ''}
                required
              >
                <option value="">Escolha o procedimento</option>
                {props.procedures.map((procedure) => (
                  <option key={procedure.id} value={procedure.id}>
                    {procedure.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="purchaseUnit">Unidade de compra</label>
              <input
                className="input"
                id="purchaseUnit"
                name="purchaseUnit"
                defaultValue={sent?.purchaseUnit ?? ''}
                placeholder="Frasco 50U"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="purchaseCost">Custo de compra (R$)</label>
              <input
                className="input"
                id="purchaseCost"
                name="purchaseCost"
                inputMode="decimal"
                defaultValue={sent?.purchaseCost ?? ''}
                placeholder="540,00"
                required
              />
              <p className={styles.hint}>
                O que a clínica paga por uma unidade. Entra direto no preço sugerido de cada
                atendimento.
              </p>
            </div>

            <div className="field">
              <label htmlFor="yieldPerUnit">Rendimento</label>
              <input
                className="input"
                id="yieldPerUnit"
                name="yieldPerUnit"
                inputMode="decimal"
                defaultValue={sent?.yieldPerUnit ?? '1'}
                placeholder="1"
                required
              />
              <p className={styles.hint}>
                Quantos atendimentos uma unidade comprada cobre. Um frasco que rende um
                atendimento e meio é 1,5.
              </p>
            </div>
          </div>
        </fieldset>
      ) : null}

      <fieldset className={styles.fieldset}>
        <legend className="kicker">Lote que chegou</legend>
        <div className={styles.formGrid}>
          <div className="field">
            <label htmlFor="lotNumber">Número do lote</label>
            <input
              className="input"
              id="lotNumber"
              name="lotNumber"
              defaultValue={sent?.lotNumber ?? ''}
              placeholder="Como está impresso na caixa"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="expiresAt">Validade</label>
            <input
              className="input"
              id="expiresAt"
              name="expiresAt"
              type="date"
              defaultValue={sent?.expiresAt ?? ''}
            />
            <p className={styles.hint}>
              Sem validade o lote nunca aparece como “vence”, e o sistema não consegue usar
              primeiro o que vence antes.
            </p>
          </div>

          <div className="field">
            <label htmlFor="quantity">Quantidade recebida</label>
            <input
              className="input"
              id="quantity"
              name="quantity"
              type="number"
              min={1}
              step={1}
              defaultValue={sent?.quantity ?? ''}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="unitCost">Custo deste lote (R$)</label>
            <input
              className="input"
              id="unitCost"
              name="unitCost"
              inputMode="decimal"
              defaultValue={sent?.unitCost ?? ''}
              placeholder={chosen ? chosen.purchaseCost : 'igual ao do produto'}
            />
            <p className={styles.hint}>
              Em branco, vale o custo do produto. Preencha quando esta compra veio por outro
              preço — o lote guarda o que foi pago por ele.
            </p>
          </div>

          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="invoiceRef">Nota fiscal (opcional)</label>
            <input
              className="input"
              id="invoiceRef"
              name="invoiceRef"
              defaultValue={sent?.invoiceRef ?? ''}
              placeholder="NF-12345"
            />
          </div>
        </div>
      </fieldset>

      <div className={styles.formActions}>
        <button className="btn btn-primary touch" type="submit" disabled={pending}>
          {pending ? 'Lançando…' : 'Lançar entrada'}
        </button>
        <Link className="btn btn-secondary touch" href="/inventory">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
