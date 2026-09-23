import type { Metadata } from 'next';
import { Role } from '@prisma/client';
import { requireModule } from '@/lib/auth/guards';
import { withTenant } from '@/lib/db';
import { currency } from '@/lib/format';
import { MODULE_DEFS, MODULES } from '@/lib/modules';
import { currentPricingParams } from '@/lib/pricing-params';
import { accessLevel, ROLE_LABELS, type AccessLevel } from '@/lib/rbac';
import { FlagsForm } from './flags-form';
import { IdentityForm } from './identity-form';
import { PricingForm } from './pricing-form';
import styles from './settings.module.css';

export const metadata: Metadata = { title: 'Configurações' };

/** Product copy, pt-BR. */
const LEVEL_LABELS: Record<AccessLevel, string> = {
  full: 'total',
  partial: 'parcial',
  own: 'próprios',
  none: '—',
};

/** The roles that work inside a clinic; the reseller admin is not shown here. */
const CLINIC_ROLES = [Role.OWNER, Role.RECEPTION, Role.FINANCE, Role.PRACTITIONER, Role.PATIENT];

export default async function SettingsPage() {
  const { tenant } = await requireModule('settings');

  const params = tenant ? await withTenant(tenant.id, (tx) => currentPricingParams(tx, tenant.id)) : null;

  if (!tenant) {
    return (
      <p className="card-body">
        Esta tela configura uma clínica. O painel da plataforma entra na etapa 8.
      </p>
    );
  }

  return (
    <div className={styles.sections}>
      <section className={styles.section}>
        <div className="kicker">Identidade</div>
        <h2 className={styles.sectionTitle}>Marca da clínica</h2>
        <p className={styles.sectionNote}>
          O nome e o monograma aparecem no login e no menu. A cor de acento substitui o dourado
          padrão em botões, bordas e destaques — e precisa de contraste suficiente contra o fundo
          claro, senão o contorno do botão some no papel.
        </p>
        <IdentityForm
          name={tenant.name}
          subtitle={tenant.subtitle}
          monogram={tenant.monogram}
          defaultUnit={tenant.defaultUnit}
          accentColor={tenant.accentColor}
          domain={tenant.domain}
        />
      </section>

      <section className={styles.section}>
        <div className="kicker">Precificação</div>
        <h2 className={styles.sectionTitle}>Parâmetros de preço</h2>
        <p className={styles.sectionNote}>
          A margem é líquida: os dois preços já embutem impostos e a taxa correspondente da
          maquininha, então a margem definida aqui sobra de fato no caixa em qualquer forma de
          pagamento. Pix e dinheiro não pagam maquininha — nesses casos a margem sai maior.
        </p>
        {params ? (
          <PricingForm
            taxRate={params.taxRate}
            cardFeeUpfront={params.cardFeeUpfront}
            cardFeeInstallment={params.cardFeeInstallment}
            fixedMonthlyCosts={params.fixedMonthlyCosts}
            expectedAppointments={params.expectedAppointments}
            defaultMargin={params.defaultMargin}
          />
        ) : (
          <p className="card-body">
            Esta clínica ainda não tem parâmetros. Rode <code>npm run db:seed</code> em
            desenvolvimento, ou cadastre-os pelo painel quando a etapa 8 chegar.
          </p>
        )}
        {params ? (
          <p className={styles.contrast} style={{ marginTop: 'var(--space-3)' }}>
            Em vigor desde {params.validFrom.toLocaleDateString('pt-BR')} · rateio de{' '}
            {currency(params.overhead)} por atendimento. Reavalie os custos a cada 3 meses: produto
            importado varia com o dólar e o valor da sala muda por contrato.
          </p>
        ) : null}
      </section>

      <section className={styles.section}>
        <div className="kicker">Módulos</div>
        <h2 className={styles.sectionTitle}>O que esta clínica usa</h2>
        <p className={styles.sectionNote}>
          Desligar um módulo some com ele do menu de todo mundo, inclusive do seu. Religar traz de
          volta com os dados intactos.
        </p>
        <FlagsForm flags={tenant.flags} />
      </section>

      <section className={styles.section}>
        <div className="kicker">Permissões</div>
        <h2 className={styles.sectionTitle}>O que cada perfil alcança</h2>
        <p className={styles.sectionNote}>
          Esta matriz é fixa no sistema — ela é conferida no servidor a cada acesso, não apenas
          escondendo item de menu. Perfis com acesso a prontuário ou fotos exigem verificação em duas
          etapas.
        </p>
        <div className={styles.matrixWrap}>
          <table className={styles.matrix}>
            <thead>
              <tr>
                <th>Módulo</th>
                {CLINIC_ROLES.map((role) => (
                  <th key={role}>{ROLE_LABELS[role].split(' (')[0]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULES.filter((m) => MODULE_DEFS[m].group || MODULE_DEFS[m].sensitive)
                .filter((m) => m !== 'tenants')
                .map((module) => (
                  <tr key={module}>
                    <td>
                      {MODULE_DEFS[module].label}
                      {MODULE_DEFS[module].sensitive ? ' *' : ''}
                    </td>
                    {CLINIC_ROLES.map((role) => {
                      const level = accessLevel(role, module);
                      return (
                        <td
                          key={role}
                          className={level === 'none' ? styles.levelNone : level === 'full' ? styles.levelFull : ''}
                        >
                          {LEVEL_LABELS[level]}
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <p className={styles.contrast} style={{ marginTop: 'var(--space-3)' }}>
          * Módulo com dado sensível de saúde: exige 2FA e grava toda visualização no log de
          auditoria.
        </p>
      </section>
    </div>
  );
}
