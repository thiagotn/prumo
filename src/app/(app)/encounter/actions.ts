'use server';

// Closing an encounter. This is where the pricing, the stock ledger and the financial
// record meet, so it all happens in one transaction: a close either records the charge
// AND deducts the lot AND writes the movement, or it does none of them.
import { PaymentMethod, Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { audit } from '@/lib/audit';
import { requireSensitiveModule } from '@/lib/auth/guards';
import { withTenant } from '@/lib/db';
import { currentPricingParams } from '@/lib/pricing-params';
import { costBreakdown, realized, toCents } from '@/lib/pricing';
import { planConsumption } from '@/lib/stock';

export type CloseState = { error?: string; warning?: string; saved?: string };

const closeSchema = z.object({
  appointmentId: z.string().uuid(),
  productId: z.string().uuid('Escolha o produto usado.'),
  volume: z.coerce.number().min(0).optional(),
  technique: z.string().trim().max(200).optional(),
  evolution: z.string().trim().max(4000).optional(),
  method: z.nativeEnum(PaymentMethod),
  installments: z.coerce.number().int().min(2).max(24).optional(),
  charged: z.coerce.number({ message: 'Informe o valor cobrado.' }).min(0, 'O valor não pode ser negativo.'),
  /** Set once the person has seen the below-cost warning and chosen to go ahead. */
  confirmBelowCost: z.boolean().default(false),
});

export async function closeEncounter(_previous: CloseState, formData: FormData): Promise<CloseState> {
  // Sensitive module: this both requires 2FA and writes the access to audit_log.
  const { tenant, session } = await requireSensitiveModule('encounter');
  if (!tenant) return { error: 'Esta tela pertence a uma clínica.' };

  const parsed = closeSchema.safeParse({
    appointmentId: formData.get('appointmentId'),
    productId: formData.get('productId'),
    volume: formData.get('volume') || undefined,
    technique: formData.get('technique') || undefined,
    evolution: formData.get('evolution') || undefined,
    method: formData.get('method'),
    installments: formData.get('installments') || undefined,
    charged: formData.get('charged'),
    confirmBelowCost: formData.get('confirmBelowCost') === 'on',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  const input = parsed.data;

  if (input.method === PaymentMethod.CREDIT_INSTALLMENT && !input.installments) {
    return { error: 'Informe em quantas parcelas.' };
  }

  try {
    const result = await withTenant(tenant.id, async (tx) => {
      const appointment = await tx.appointment.findUnique({
        where: { id: input.appointmentId },
        include: { patient: true, room: true, procedure: true, encounter: true },
      });
      if (!appointment) return { outcome: 'error', error: 'Atendimento não encontrado.' } as const;
      if (appointment.isBlock) {
        return { outcome: 'error', error: 'Um bloqueio não tem fechamento.' } as const;
      }
      if (!appointment.patientId) {
        return { outcome: 'error', error: 'Este atendimento não tem paciente.' } as const;
      }
      if (appointment.encounter?.closedAt) {
        return { outcome: 'error', error: 'Este atendimento já foi fechado.' } as const;
      }

      const params = await currentPricingParams(tx, tenant.id);
      if (!params) {
        return { outcome: 'error', error: 'Configure os parâmetros de preço antes de fechar.' } as const;
      }

      const product = await tx.product.findUnique({
        where: { id: input.productId },
        include: { procedure: true },
      });
      if (!product) return { outcome: 'error', error: 'Produto não encontrado.' } as const;

      // ── stock ────────────────────────────────────────────────────────────
      const lots = await tx.stockLot.findMany({
        where: { productId: product.id, quantityRemaining: { gt: 0 } },
        orderBy: { expiresAt: 'asc' },
      });
      const plan = planConsumption(
        lots.map((l) => ({
          id: l.id,
          quantityRemaining: l.quantityRemaining,
          expiresAt: l.expiresAt,
          receivedAt: l.receivedAt,
        })),
        1,
      );
      if (!plan.ok) {
        return {
          outcome: 'error',
          error:
            plan.reason === 'no-stock'
              ? `Sem estoque utilizável de ${product.brand}. Dê entrada de nota antes de fechar.`
              : `Estoque insuficiente de ${product.brand}: ${plan.available} unidade(s) disponível(is).`,
        } as const;
      }

      // ── cost and result ──────────────────────────────────────────────────
      const durationHours =
        (appointment.endsAt.getTime() - appointment.startsAt.getTime()) / 3_600_000;
      const cost = costBreakdown({
        purchaseCost: Number(product.purchaseCost),
        yieldPerUnit: Number(product.yieldPerUnit),
        roomHourlyRate: Number(appointment.room?.hourlyRate ?? 0),
        durationHours,
        disposablesCost: Number(product.procedure.disposablesCost),
        overheadPerAppointment: params.overhead,
      });

      // Never price below cost without the person saying so explicitly.
      if (input.charged < cost.total && !input.confirmBelowCost) {
        return { outcome: 'below-cost', totalCost: toCents(cost.total) } as const;
      }

      const outcome = realized(input.charged, cost.total, input.method, params);

      // ── write ────────────────────────────────────────────────────────────
      const encounter = await tx.encounter.upsert({
        where: { appointmentId: appointment.id },
        update: {
          productId: product.id,
          lotId: plan.lotId,
          volume: input.volume?.toString(),
          technique: input.technique ?? null,
          evolution: input.evolution ?? null,
          closedAt: new Date(),
        },
        create: {
          tenantId: tenant.id,
          appointmentId: appointment.id,
          patientId: appointment.patientId,
          productId: product.id,
          lotId: plan.lotId,
          volume: input.volume?.toString(),
          technique: input.technique ?? null,
          evolution: input.evolution ?? null,
          closedAt: new Date(),
        },
      });

      // The database also guards this: quantity_remaining has a CHECK >= 0, so a double
      // submit fails loudly instead of taking the lot negative.
      await tx.stockLot.update({
        where: { id: plan.lotId },
        data: { quantityRemaining: { decrement: 1 } },
      });
      await tx.stockMovement.create({
        data: {
          tenantId: tenant.id,
          lotId: plan.lotId,
          kind: 'CONSUMPTION',
          quantity: -1,
          reason: `Atendimento de ${appointment.patient?.name ?? 'paciente'}`,
          encounterId: encounter.id,
          userId: session.userId,
        },
      });

      await tx.payment.upsert({
        where: { encounterId: encounter.id },
        update: {},
        create: {
          tenantId: tenant.id,
          encounterId: encounter.id,
          method: input.method,
          installments: input.method === PaymentMethod.CREDIT_INSTALLMENT ? input.installments : null,
          charged: toCents(input.charged).toFixed(2),
          materialCost: toCents(cost.material).toFixed(2),
          roomCost: toCents(cost.room).toFixed(2),
          disposablesCost: toCents(cost.disposables).toFixed(2),
          overheadCost: toCents(cost.overhead).toFixed(2),
          totalCost: toCents(cost.total).toFixed(2),
          taxAmount: toCents(outcome.tax).toFixed(2),
          cardFeeAmount: toCents(outcome.cardFee).toFixed(2),
          netProfit: toCents(outcome.netProfit).toFixed(2),
          margin: outcome.margin.toFixed(4),
          pricingParamsId: params.id,
        },
      });

      await tx.appointment.update({
        where: { id: appointment.id },
        data: { status: 'ATTENDED' },
      });

      return {
        outcome: 'closed',
        patientName: appointment.patient?.name ?? '',
        netProfit: toCents(outcome.netProfit),
        margin: outcome.margin,
        lotId: plan.lotId,
      } as const;
    });

    if (result.outcome === 'error') return { error: result.error };
    if (result.outcome === 'below-cost') {
      return {
        warning: `O valor cobrado está abaixo do custo total de R$ ${result.totalCost.toFixed(2).replace('.', ',')}. Confirme para fechar mesmo assim — o prejuízo sai da margem.`,
      };
    }

    await audit({
      tenantId: tenant.id,
      userId: session.userId,
      action: 'medicalRecord.view',
      resource: 'encounter.close',
      resourceId: input.appointmentId,
      details: { method: input.method, margin: Number(result.margin.toFixed(4)) },
    });

    revalidatePath('/encounter');
    revalidatePath('/schedule');
    revalidatePath('/inventory');

    const marginText = `${(result.margin * 100).toFixed(1).replace('.', ',')}%`;
    return {
      saved: `Atendimento de ${result.patientName} fechado. Lucro líquido R$ ${result.netProfit.toFixed(2).replace('.', ',')} · margem ${marginText}. Estoque baixado.`,
    };
  } catch (error) {
    // The CHECK constraints turn a race into an error here rather than corrupt stock.
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error('[encounter.close]', error.code, error.message);
      return { error: 'Não foi possível fechar: o estoque mudou no meio do caminho. Recarregue e tente de novo.' };
    }
    throw error;
  }
}
