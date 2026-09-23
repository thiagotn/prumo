import type { Metadata } from 'next';
import { requireModule } from '@/lib/auth/guards';
import { withTenant } from '@/lib/db';
import { currency, longDate } from '@/lib/format';
import { materialCost } from '@/lib/pricing';
import { lotStatus, productStatus, STATUS_LABELS, STATUS_TAG, usableQuantity } from '@/lib/stock';
import styles from './inventory.module.css';

export const metadata: Metadata = { title: 'Estoque' };

export default async function InventoryPage() {
  const { tenant, level } = await requireModule('inventory');
  if (!tenant) return <p className="card-body">Esta tela pertence a uma clínica.</p>;

  const products = await withTenant(tenant.id, (tx) =>
    tx.product.findMany({
      where: { active: true },
      include: { procedure: true, stockLots: { orderBy: { expiresAt: 'asc' } } },
      orderBy: [{ procedure: { name: 'asc' } }, { brand: 'asc' }],
    }),
  );

  const now = new Date();
  // Reception and finance see quantities and status but not what the clinic pays.
  const showsCost = level === 'full';

  const needingAttention = products.filter((p) =>
    ['out', 'low', 'expiring', 'expired'].includes(productStatus(p.stockLots, now)),
  ).length;

  return (
    <div>
      <div className={styles.summary}>
        <div>
          <div className="kicker">Produtos cadastrados</div>
          <div className={`${styles.summaryValue} num`}>{products.length}</div>
        </div>
        <div>
          <div className="kicker">Pedindo atenção</div>
          <div className={`${styles.summaryValue} num`}>{needingAttention}</div>
        </div>
        <p className={styles.summaryNote}>
          A baixa acontece ao fechar o atendimento: sai do lote que vence primeiro, para não perder
          produto na validade. A entrada de nota entra junto com o financeiro (etapa 6).
        </p>
      </div>

      <div className={styles.tableWrap}>
        <table className="table">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Procedimento</th>
              <th>Unidade</th>
              {showsCost ? <th>Custo</th> : null}
              <th>Rend.</th>
              {showsCost ? <th>Custo/atend.</th> : null}
              <th>Qtd.</th>
              <th>Lote · validade</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const status = productStatus(product.stockLots, now);
              const quantity = usableQuantity(product.stockLots, now);
              // The lot that would actually be used next — the one expiring soonest.
              const nextLot = product.stockLots.find(
                (l) => l.quantityRemaining > 0 && lotStatus(l, now) !== 'expired',
              );
              return (
                <tr key={product.id}>
                  <td>{product.brand}</td>
                  <td>{product.procedure.name}</td>
                  <td>{product.purchaseUnit}</td>
                  {showsCost ? (
                    <td className="num">{currency(Number(product.purchaseCost))}</td>
                  ) : null}
                  <td className="num">{Number(product.yieldPerUnit).toLocaleString('pt-BR')}</td>
                  {showsCost ? (
                    <td className="num">
                      {currency(
                        materialCost(Number(product.purchaseCost), Number(product.yieldPerUnit)),
                      )}
                    </td>
                  ) : null}
                  <td className="num">{quantity}</td>
                  <td className="num">
                    {nextLot
                      ? `${nextLot.lotNumber}${nextLot.expiresAt ? ` · ${longDate(nextLot.expiresAt)}` : ''}`
                      : '—'}
                  </td>
                  <td>
                    <span className={`tag ${STATUS_TAG[status]}`}>{STATUS_LABELS[status]}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
