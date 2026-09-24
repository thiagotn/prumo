import type { Metadata } from 'next';
import { requireModuleWrite } from '@/lib/auth/guards';
import { withTenant } from '@/lib/db';
import { currency } from '@/lib/format';
import { EntryForm } from '../entry-form';
import styles from '../inventory.module.css';

export const metadata: Metadata = { title: 'Entrada de nota' };

export default async function StockEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const { tenant } = await requireModuleWrite('inventory', { full: true });
  const { product } = await searchParams;
  if (!tenant) return <p className="card-body">Esta tela pertence a uma clínica.</p>;

  const { products, procedures } = await withTenant(tenant.id, async (tx) => ({
    products: await tx.product.findMany({
      where: { active: true },
      orderBy: [{ procedure: { name: 'asc' } }, { brand: 'asc' }],
      include: { procedure: { select: { name: true } } },
    }),
    procedures: await tx.procedure.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  }));

  return (
    <div>
      <div className="kicker">Estoque</div>
      <h2 className={styles.title}>Entrada de nota</h2>
      <p className="card-body" style={{ maxWidth: '44em', marginBottom: 'var(--space-4)' }}>
        Lance o que chegou: escolha o produto — ou cadastre um novo, se a marca é a primeira vez na
        clínica — e informe o lote, a validade e quantas unidades vieram. A saída acontece sozinha
        ao fechar cada atendimento, pelo lote que vence primeiro.
      </p>

      <EntryForm
        products={products.map((item) => ({
          id: item.id,
          brand: item.brand,
          procedureName: item.procedure.name,
          purchaseUnit: item.purchaseUnit,
          purchaseCost: currency(Number(item.purchaseCost)),
        }))}
        procedures={procedures}
        defaults={{ productId: product ?? '' }}
      />
    </div>
  );
}
