'use client';

import { useActionState, useState } from 'react';
import { contrastRatio, MIN_CONTRAST, normalizeHex, CLASSICAL_BACKGROUND } from '@/lib/color';
import { saveIdentity, type SettingsState } from './actions';
import styles from './settings.module.css';

const INITIAL: SettingsState = {};

type Props = {
  name: string;
  subtitle: string | null;
  monogram: string;
  defaultUnit: string | null;
  accentColor: string;
  domain: string;
};

export function IdentityForm(props: Props) {
  const [state, action, pending] = useActionState(saveIdentity, INITIAL);
  const [color, setColor] = useState(props.accentColor);
  const [name, setName] = useState(props.name);
  const [subtitle, setSubtitle] = useState(props.subtitle ?? '');
  const [monogram, setMonogram] = useState(props.monogram);

  // The contrast is shown while typing, against the same background the application
  // uses, so the rule is visible before the save refuses it.
  const normalized = normalizeHex(color);
  const contrast = normalized ? contrastRatio(normalized, CLASSICAL_BACKGROUND) : null;
  const tooLow = contrast !== null && contrast < MIN_CONTRAST;

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

      <div className={styles.grid}>
        <div className="field">
          <label htmlFor="name">Nome da clínica</label>
          <input
            className="input"
            id="name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="subtitle">Subtítulo</label>
          <input
            className="input"
            id="subtitle"
            name="subtitle"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="Estética Avançada · Bairro, UF"
          />
        </div>

        <div className="field">
          <label htmlFor="monogram">Monograma</label>
          <input
            className="input"
            id="monogram"
            name="monogram"
            value={monogram}
            onChange={(e) => setMonogram(e.target.value.toUpperCase().slice(0, 3))}
            maxLength={3}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="defaultUnit">Unidade</label>
          <input
            className="input"
            id="defaultUnit"
            name="defaultUnit"
            defaultValue={props.defaultUnit ?? ''}
            placeholder="Coworking Centro"
          />
        </div>

        <div className="field">
          <label htmlFor="accentColor">Cor de acento</label>
          <div className={styles.colorRow}>
            <input
              type="color"
              value={normalized ?? '#000000'}
              onChange={(e) => setColor(e.target.value)}
              aria-label="Seletor de cor"
            />
            <input
              className="input"
              id="accentColor"
              name="accentColor"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              spellCheck={false}
              required
            />
          </div>
          <p className={`${styles.contrast} ${tooLow ? styles.contrastBad : ''}`}>
            {contrast === null
              ? 'Informe a cor em hexadecimal, como #b68235.'
              : tooLow
                ? `Contraste ${contrast.toFixed(2)}:1 — abaixo do mínimo de ${MIN_CONTRAST}:1. Escolha um tom mais escuro.`
                : `Contraste ${contrast.toFixed(2)}:1 contra o fundo — dentro do mínimo de ${MIN_CONTRAST}:1.`}
          </p>
        </div>

        <div className="field">
          <label htmlFor="domain">Domínio</label>
          <input className="input" id="domain" value={props.domain} readOnly disabled />
          <p className={styles.contrast}>
            Trocar o domínio mexe em DNS e no túnel — é operação de infraestrutura, fora desta tela.
          </p>
        </div>
      </div>

      <div className={styles.wide} style={{ marginTop: 'var(--space-4)' }}>
        <div className="kicker">Prévia do login</div>
        <div className={styles.preview} style={{ marginTop: 'var(--space-2)' }} aria-hidden="true">
          <div className={styles.previewBrand}>
            <div className={styles.previewTop}>
              <div
                className={`monogram ${styles.previewMonogram}`}
                style={{ borderColor: normalized ?? undefined, color: normalized ?? undefined }}
              >
                {monogram || '—'}
              </div>
              <div>
                <div className={styles.previewName}>{name || 'Nome da clínica'}</div>
                {subtitle ? <div className={styles.previewSubtitle}>{subtitle}</div> : null}
              </div>
            </div>
            <div>
              <div className="kicker" style={{ color: normalized ?? undefined, letterSpacing: '0.24em' }}>
                Acesso restrito
              </div>
              <p className={styles.previewHeadline}>Prontuário, agenda e caixa em um só lugar.</p>
              <div className={styles.previewRule} style={{ background: normalized ?? undefined }} />
            </div>
          </div>
          <div className={styles.previewForm}>
            <div className={styles.previewLabel}>E-mail</div>
            <div className={styles.previewInput} />
            <div className={styles.previewLabel}>Senha</div>
            <div className={styles.previewInput} />
            <div
              className={styles.previewButton}
              style={{ borderColor: normalized ?? undefined, color: normalized ?? undefined }}
            >
              Entrar
            </div>
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <button className="btn btn-primary touch" type="submit" disabled={pending || tooLow}>
          {pending ? 'Salvando…' : 'Salvar identidade'}
        </button>
        {tooLow ? (
          <span className={`${styles.contrast} ${styles.contrastBad}`}>
            Ajuste a cor para poder salvar.
          </span>
        ) : null}
      </div>
    </form>
  );
}
