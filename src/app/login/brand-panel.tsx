import styles from './login.module.css';

/** The dark left-hand panel: tenant branding, the headline and the LGPD notice. */
export function BrandPanel({
  name,
  subtitle,
  monogram,
}: {
  name: string;
  subtitle: string | null;
  monogram: string;
}) {
  return (
    <aside className={styles.brand}>
      <div className={styles.brandTop}>
        <div className={`monogram ${styles.brandMonogram}`}>{monogram}</div>
        <div>
          <div className={styles.brandName}>{name}</div>
          {subtitle ? <div className={styles.brandSubtitle}>{subtitle}</div> : null}
        </div>
      </div>

      <div>
        <div className="kicker kicker-accent">Acesso restrito</div>
        <h1 className={styles.headline}>Prontuário, agenda e caixa em um só lugar.</h1>
        <div className={styles.rule} />
        <p className={styles.brandText}>
          Cada acesso é individual e registrado. Dados de saúde são sigilosos: o que você vê depende
          do seu perfil, e toda visualização de prontuário fica em log de auditoria.
        </p>
      </div>

      <div className={styles.brandFooter}>
        LGPD · Dados sensíveis de saúde · Logs de auditoria por 5 anos
      </div>
    </aside>
  );
}
