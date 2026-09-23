import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSensitiveModule } from '@/lib/auth/guards';
import { withTenant } from '@/lib/db';
import { currency, longDate } from '@/lib/format';
import { costBreakdown, quote, toCents } from '@/lib/pricing';
import { currentPricingParams } from '@/lib/pricing-params';
import { slotLabel, STATUS_LABELS } from '@/lib/schedule';
import { PendingModule } from '../pending-module';
import { CloseForm } from './close-form';
import styles from './encounter.module.css';

export const metadata: Metadata = { title: 'Ficha de atendimento' };

/** Product copy, pt-BR. */
const ITEMS = [
  'Anamnese versionada, com a resposta anterior ao lado da nova.',
  'Fotos em quatro enquadramentos padronizados, com guia fantasma da foto anterior — depende do bucket privado com URL assinada (pendência de infraestrutura registrada na ADR 0010).',
  'Termo de consentimento com assinatura em tela ou por link (etapa 5).',
];

export default async function EncounterPage({
  searchParams,
}: {
  searchParams: Promise<{ appointment?: string }>;
}) {
  const { appointment: appointmentId } = await searchParams;

  // Opening a record is itself an event: this both requires 2FA and writes to audit_log.
  const { tenant, masked, level } = await requireSensitiveModule(
    'encounter',
    appointmentId ? { kind: 'appointment', id: appointmentId } : undefined,
  );
  if (!tenant) return <p className="card-body">Esta tela pertence a uma clínica.</p>;

  if (!appointmentId) {
    return (
      <>
        <p className="card-body" style={{ maxWidth: '54em' }}>
          Escolha um atendimento na <Link href="/schedule">agenda</Link> para abrir a ficha. O que já
          funciona aqui: registro do procedimento, baixa do lote no estoque e fechamento financeiro
          com o preço calculado a partir dos parâmetros da clínica.
        </p>
        <PendingModule stage={4} delivers="O que ainda falta na ficha" level={level} items={ITEMS} />
      </>
    );
  }

  const data = await withTenant(tenant.id, async (tx) => {
    const appointment = await tx.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: true,
        room: true,
        procedure: { include: { products: { where: { active: true }, orderBy: { brand: 'asc' } } } },
        encounter: { include: { payment: true, lot: true, product: true } },
      },
    });
    const params = await currentPricingParams(tx, tenant.id);
    return { appointment, params };
  });

  const { appointment, params } = data;
  if (!appointment) return <p className="card-body">Atendimento não encontrado nesta clínica.</p>;
  if (appointment.isBlock) {
    return <p className="card-body">Este horário é um bloqueio, não um atendimento.</p>;
  }
  if (!params) {
    return (
      <p className="card-body">
        Configure os <Link href="/settings">parâmetros de preço</Link> antes de fechar um atendimento.
      </p>
    );
  }

  const durationHours = (appointment.endsAt.getTime() - appointment.startsAt.getTime()) / 3_600_000;
  const roomRate = Number(appointment.room?.hourlyRate ?? 0);
  const disposables = Number(appointment.procedure?.disposablesCost ?? 0);
  const products = appointment.procedure?.products ?? [];

  const options = products.map((product) => {
    const q = quote(
      {
        purchaseCost: Number(product.purchaseCost),
        yieldPerUnit: Number(product.yieldPerUnit),
        roomHourlyRate: roomRate,
        durationHours,
        disposablesCost: disposables,
        overheadPerAppointment: params.overhead,
      },
      params,
    );
    return {
      id: product.id,
      brand: product.brand,
      suggestedUpfront: toCents(q.upfront),
      suggestedInstallment: toCents(q.installment),
    };
  });

  // The cost shown in the side panel follows the first product, which is what the form
  // starts on.
  const firstProduct = products[0];
  const cost = firstProduct
    ? costBreakdown({
        purchaseCost: Number(firstProduct.purchaseCost),
        yieldPerUnit: Number(firstProduct.yieldPerUnit),
        roomHourlyRate: roomRate,
        durationHours,
        disposablesCost: disposables,
        overheadPerAppointment: params.overhead,
      })
    : null;

  const closed = appointment.encounter?.closedAt;
  const payment = appointment.encounter?.payment;

  return (
    <div className={styles.layout}>
      <div className={styles.panel}>
        <div className="kicker">
          {longDate(appointment.startsAt)} · {slotLabel(appointment.startsAt, appointment.endsAt)} ·{' '}
          {appointment.room?.name ?? 'sala a definir'}
        </div>
        <h2 className={styles.patientName}>
          {masked ? '•••••••' : (appointment.patient?.name ?? '—')}
        </h2>
        <p className={styles.meta}>
          {appointment.procedure?.name ?? 'Procedimento a definir'} ·{' '}
          {STATUS_LABELS[appointment.status]}
        </p>

        {masked ? (
          <p className={styles.alert}>
            Sessão assumida pela plataforma: o prontuário está mascarado. Liberar exige autorização
            registrada.
          </p>
        ) : appointment.patient?.clinicalAlert ? (
          <p className={styles.alert}>
            <strong>Alerta clínico:</strong> {appointment.patient.clinicalAlert}
          </p>
        ) : null}

        {closed && payment ? (
          <div>
            <p className={styles.saved}>
              Fechado em {longDate(closed)}. Este atendimento não pode ser fechado de novo.
            </p>
            <dl className={styles.costs} style={{ marginTop: 'var(--space-4)' }}>
              <dt>Cobrado</dt>
              <dd className="num">{currency(Number(payment.charged))}</dd>
              <dt>Custo total</dt>
              <dd className="num">{currency(Number(payment.totalCost))}</dd>
              <dt>Impostos e maquininha</dt>
              <dd className="num">
                {currency(Number(payment.taxAmount) + Number(payment.cardFeeAmount))}
              </dd>
              <dt className={styles.costTotal}>Lucro líquido</dt>
              <dd className={`${styles.costTotal} num`}>{currency(Number(payment.netProfit))}</dd>
              <dt>Margem realizada</dt>
              <dd className="num">
                {(Number(payment.margin) * 100).toFixed(1).replace('.', ',')}%
              </dd>
            </dl>
            {appointment.encounter?.lot ? (
              <p className={styles.hint}>
                Lote usado: {appointment.encounter.lot.lotNumber}
                {appointment.encounter.product ? ` · ${appointment.encounter.product.brand}` : ''}
              </p>
            ) : null}
          </div>
        ) : options.length === 0 ? (
          <p className="card-body">
            Este procedimento não tem produto cadastrado. Cadastre em Estoque antes de fechar.
          </p>
        ) : (
          <CloseForm
            appointmentId={appointment.id}
            products={options}
            totalCost={cost ? toCents(cost.total) : 0}
          />
        )}
      </div>

      <aside className={styles.sidePanel} aria-label="Custos e preço sugerido">
        <div className="kicker">Composição do custo</div>
        {cost ? (
          <dl className={styles.costs} style={{ marginTop: 'var(--space-3)' }}>
            <dt>Material</dt>
            <dd className="num">{currency(toCents(cost.material))}</dd>
            <dt>Sala ({durationHours.toLocaleString('pt-BR')}h)</dt>
            <dd className="num">{currency(toCents(cost.room))}</dd>
            <dt>Descartáveis</dt>
            <dd className="num">{currency(toCents(cost.disposables))}</dd>
            <dt>Rateio fixo</dt>
            <dd className="num">{currency(toCents(cost.overhead))}</dd>
            <dt className={styles.costTotal}>Custo total</dt>
            <dd className={`${styles.costTotal} num`}>{currency(toCents(cost.total))}</dd>
          </dl>
        ) : (
          <p className={styles.hint}>Sem produto cadastrado para este procedimento.</p>
        )}

        {options[0] ? (
          <div className={styles.priceBox}>
            <div className={styles.priceLabel}>Preço sugerido à vista</div>
            <div className={`${styles.priceValue} num`}>
              {currency(options[0].suggestedUpfront)}
            </div>
            <div className={styles.priceLabel} style={{ marginTop: 'var(--space-2)' }}>
              Parcelado
            </div>
            <div className={`${styles.priceValue} num`}>
              {currency(options[0].suggestedInstallment)}
            </div>
            <p className={styles.hint}>
              Margem de {(params.defaultMargin * 100).toFixed(0)}% já líquida de impostos e
              maquininha.
            </p>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
