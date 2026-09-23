'use client';

import { useActionState } from 'react';
import { FLAG_LABELS, type Flags } from '@/lib/flags';
import { saveFlags, type SettingsState } from './actions';
import styles from './settings.module.css';

const INITIAL: SettingsState = {};

/** Product copy, pt-BR: what each flag actually changes for the clinic. */
const FLAG_NOTES: Record<keyof Flags, string> = {
  patientPortal: 'A paciente entra para confirmar horário, ver orientações e baixar documentos.',
  clinicalPhotos: 'Fotos antes e depois na ficha, em bucket privado e com acesso registrado.',
  automaticPricing: 'Preço sugerido à vista e parcelado calculado a partir dos parâmetros.',
  automaticStockDeduction: 'Fechar o atendimento baixa o lote usado do estoque.',
  multiplePractitioners: 'Mais de um profissional na agenda, com comissão por atendimento.',
  multipleUnits: 'Mais de uma unidade, cada uma com suas salas.',
};

export function FlagsForm({ flags }: { flags: Flags }) {
  const [state, action, pending] = useActionState(saveFlags, INITIAL);

  return (
    <form action={action}>
      {state.saved ? (
        <p className={styles.feedback} role="status">
          {state.saved}
        </p>
      ) : null}

      <div className={styles.flags}>
        {(Object.keys(FLAG_LABELS) as Array<keyof Flags>).map((flag) => (
          <label className={styles.flag} key={flag}>
            <input type="checkbox" name={flag} defaultChecked={flags[flag]} />
            <span>
              <strong>{FLAG_LABELS[flag]}</strong>
              <br />
              <span className={styles.contrast}>{FLAG_NOTES[flag]}</span>
            </span>
          </label>
        ))}
      </div>

      <div className={styles.actions}>
        <button className="btn btn-primary touch" type="submit" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar módulos'}
        </button>
      </div>
    </form>
  );
}
