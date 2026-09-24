'use client';

import { useActionState } from 'react';
import { FLAG_LABELS, FLAG_NOTES, type Flags } from '@/lib/flags';
import { saveFlags, type SettingsState } from './actions';
import styles from './settings.module.css';

const INITIAL: SettingsState = {};

/** Product copy, pt-BR: what each flag actually changes for the clinic. */

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
