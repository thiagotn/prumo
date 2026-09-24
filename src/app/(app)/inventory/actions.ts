'use server';

// Entrada de nota: the invoice arrived, the boxes are on the counter.
//
// One action for both halves of that moment — the brand may be new to the clinic, and the
// batch always is. They are written in one transaction: a product with no lot is a
// catalogue entry nobody asked for, and a lot with no product cannot exist.
import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { audit } from '@/lib/audit';
import { requireModuleWrite } from '@/lib/auth/guards';
import { withTenant } from '@/lib/db';
import { NEW_PRODUCT } from '@/lib/stock';

export type StockEntryState = { error?: string; values?: Record<string, string> };

const schema = z.object({
  productId: z.string(),
  /** Only read when productId is NEW_PRODUCT. */
  brand: z.string().trim().max(80).default(''),
  procedureId: z.string().trim().default(''),
  purchaseUnit: z.string().trim().max(60).default(''),
  purchaseCost: z.string().trim().default(''),
  yieldPerUnit: z.string().trim().default(''),

  lotNumber: z
    .string()
    .trim()
    .min(1, 'Informe o número do lote, como está impresso na caixa.')
    .max(60, 'O número do lote ficou longo demais.'),
  expiresAt: z.string().trim().max(10).default(''),
  unitCost: z.string().trim().default(''),
  quantity: z.coerce
    .number({ message: 'Informe quantas unidades chegaram.' })
    .int('A quantidade é em unidades inteiras.')
    .min(1, 'A quantidade precisa ser ao menos 1.')
    .max(10_000, 'Confira a quantidade: parece alta demais.'),
  invoiceRef: z.string().trim().max(60).default(''),
});

/** Money as the clinic types it: "1.234,56" or "1234.56". */
function parseMoney(raw: string): number | null {
  const normalized = raw.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** A date-only value, held at UTC midnight like every other date-only column. */
function parseDate(raw: string): Date | null | 'invalid' {
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return 'invalid';
  const [, year, month, day] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return 'invalid';
  return date;
}

export async function receiveStock(
  _previous: StockEntryState,
  formData: FormData,
): Promise<StockEntryState> {
  // Full access, not merely write: this types in what the clinic paid, and reception has
  // `partial` on Estoque exactly because cost is not theirs.
  const { tenant, session } = await requireModuleWrite('inventory', { full: true });

  const text = (field: string) => String(formData.get(field) ?? '');
  const values = Object.fromEntries(
    [
      'productId',
      'brand',
      'procedureId',
      'purchaseUnit',
      'purchaseCost',
      'yieldPerUnit',
      'lotNumber',
      'expiresAt',
      'unitCost',
      'quantity',
      'invoiceRef',
    ].map((field) => [field, text(field)]),
  );
  const fail = (error: string): StockEntryState => ({ error, values });

  if (!tenant) return fail('Esta tela pertence a uma clínica.');

  const parsed = schema.safeParse(values);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const input = parsed.data;

  const expiresAt = parseDate(input.expiresAt);
  if (expiresAt === 'invalid') return fail('Validade inválida.');

  const isNew = input.productId === NEW_PRODUCT;
  if (!isNew && !z.string().uuid().safeParse(input.productId).success) {
    return fail('Escolha o produto.');
  }

  // The batch price, which can differ from the catalogue price — that is the whole reason
  // the lot carries its own cost.
  let unitCost = input.unitCost ? parseMoney(input.unitCost) : null;
  if (input.unitCost && unitCost === null) return fail('Custo do lote inválido.');

  let newProduct: { brand: string; procedureId: string; purchaseUnit: string; purchaseCost: number; yieldPerUnit: number } | null = null;
  if (isNew) {
    if (input.brand.length < 2) return fail('Informe a marca do produto.');
    if (!z.string().uuid().safeParse(input.procedureId).success) {
      return fail('Escolha o procedimento deste produto.');
    }
    if (!input.purchaseUnit) return fail('Informe a unidade de compra (ex.: Frasco 50U).');

    const purchaseCost = parseMoney(input.purchaseCost);
    if (purchaseCost === null || purchaseCost === 0) {
      return fail('Informe o custo de compra — ele entra no preço sugerido de cada atendimento.');
    }
    const yieldPerUnit = parseMoney(input.yieldPerUnit);
    if (yieldPerUnit === null || yieldPerUnit === 0) {
      return fail('Informe o rendimento: quantos atendimentos uma unidade comprada cobre.');
    }

    newProduct = {
      brand: input.brand,
      procedureId: input.procedureId,
      purchaseUnit: input.purchaseUnit,
      purchaseCost,
      yieldPerUnit,
    };
    // Without a separate batch price, the batch cost the catalogue price.
    unitCost = unitCost ?? purchaseCost;
  }

  let productId = input.productId;
  try {
    const result = await withTenant(tenant.id, async (tx) => {
      if (newProduct) {
        const procedure = await tx.procedure.findUnique({
          where: { id: newProduct.procedureId },
          select: { id: true },
        });
        if (!procedure) return { ok: false, error: 'Procedimento não encontrado.' } as const;

        const created = await tx.product.create({
          data: {
            tenantId: tenant.id,
            procedureId: newProduct.procedureId,
            brand: newProduct.brand,
            purchaseUnit: newProduct.purchaseUnit,
            purchaseCost: newProduct.purchaseCost.toFixed(2),
            yieldPerUnit: newProduct.yieldPerUnit.toFixed(4),
          },
        });
        productId = created.id;
      }

      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) return { ok: false, error: 'Produto não encontrado.' } as const;

      const cost = unitCost ?? Number(product.purchaseCost);
      const lot = await tx.stockLot.create({
        data: {
          tenantId: tenant.id,
          productId: product.id,
          lotNumber: input.lotNumber,
          expiresAt,
          unitCost: cost.toFixed(2),
          quantityReceived: input.quantity,
          quantityRemaining: input.quantity,
          invoiceRef: input.invoiceRef || null,
        },
      });

      // The ledger that explains the quantity. Consumption already writes to it when an
      // encounter closes; an entry that did not would leave the count unexplainable.
      await tx.stockMovement.create({
        data: {
          tenantId: tenant.id,
          lotId: lot.id,
          kind: 'ENTRY',
          quantity: input.quantity,
          reason: input.invoiceRef ? `Entrada · ${input.invoiceRef}` : 'Entrada de nota',
          userId: session.userId,
        },
      });

      return { ok: true, brand: product.brand, lotId: lot.id, created: newProduct !== null } as const;
    });

    if (!result.ok) return fail(result.error);

    await audit({
      tenantId: tenant.id,
      userId: session.userId,
      action: 'stock.entry',
      resource: 'stockLot',
      resourceId: result.lotId,
      details: { quantity: input.quantity, newProduct: result.created },
    });

    revalidatePath('/inventory');
    revalidatePath('/dashboard');
    redirect(`/inventory?saved=${encodeURIComponent(result.brand)}`);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      // Two unique indexes can land here: the brand within a procedure, and the lot
      // number within a product.
      const target = String(error.meta?.target ?? '');
      return fail(
        target.includes('brand')
          ? 'Esse produto já está no catálogo desta clínica. Escolha-o na lista em vez de cadastrar de novo.'
          : 'Já existe um lote com esse número para este produto. Confira a caixa.',
      );
    }
    throw error;
  }
}
