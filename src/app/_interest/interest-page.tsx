import { issueFormStamp, INTEREST_FORM } from '@/lib/lead-stamp';
import { InterestForm } from './interest-form';
import styles from './interest.module.css';

/**
 * The product's public page, served at the root of its contact address
 * (`contato.prumo.in`). The institutional site at the apex is another deployment; it links
 * here.
 *
 * In a private folder (`_interest`), so it is NOT a route of its own: `/interest`
 * answering on a clinic's hostname would be the product talking over the clinic's brand.
 * src/app/page.tsx decides who gets it.
 *
 * No session, no tenant — the only page in the system where "no clinic here" is the
 * expected state rather than a 404.
 *
 * Not indexed: the root layout says noindex for everything, and that stays. The link is
 * something you send, for now.
 */
export function InterestPage() {
  const stamp = issueFormStamp(INTEREST_FORM);

  return (
    <main className={styles.screen} id="content">
      <aside className={styles.pitch}>
        <div className={styles.brandTop}>
          <div className={`monogram ${styles.brandMonogram}`}>PR</div>
          <div>
            <div className={styles.brandName}>Prumo</div>
            <div className={styles.brandSubtitle}>GESTÃO CLÍNICA</div>
          </div>
        </div>

        <div>
          <div className="kicker kicker-accent">Para clínicas de estética injetável</div>
          <h1 className={styles.headline}>Prontuário, agenda e caixa em um só lugar.</h1>
          <div className={styles.rule} />
          <ul className={styles.points}>
            <li>
              Agenda do dia, ficha de atendimento e prontuário no celular, onde o atendimento
              acontece.
            </li>
            <li>
              Preço calculado com o custo real do insumo, a hora da sala e a sua margem — e a baixa
              do estoque sai do lote certo.
            </li>
            <li>
              Termo de consentimento assinado, em PDF, guardado com a versão do texto que foi
              assinada.
            </li>
            <li>
              Cada clínica é uma instância, com o seu endereço e a sua marca. Dado de paciente não
              atravessa de uma para outra.
            </li>
          </ul>
        </div>

        <div className={styles.pitchFooter}>
          LGPD · Dados sensíveis de saúde · Acesso individual e registrado em log de auditoria
        </div>
      </aside>

      <section className={styles.panel}>
        <h2 className={styles.title}>Tenho interesse</h2>
        <p className={styles.subtitle}>
          Conte o que você precisa e respondemos com o que o sistema já faz — e com o que ainda não
          faz, se for o seu caso.
        </p>
        <InterestForm stamp={stamp} />
      </section>
    </main>
  );
}
