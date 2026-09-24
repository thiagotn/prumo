import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireOwnerOf } from '@/lib/auth/guards';
import { withTenant } from '@/lib/db';
import { TemplateForm } from '../../../template-form';
import styles from '../../../consents.module.css';

export const metadata: Metadata = { title: 'Nova edição do termo' };

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { tenant } = await requireOwnerOf('consents');
  const { id } = await params;
  if (!tenant) return <p className="card-body">Esta tela pertence a uma clínica.</p>;

  const data = await withTenant(tenant.id, async (tx) => {
    const template = await tx.consentTemplate.findUnique({ where: { id } });
    if (!template) return null;
    return {
      template,
      procedures: await tx.procedure.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      // What was signed under this wording. Shown because it is the reason editing in
      // place is not on offer.
      signed: await tx.consent.count({ where: { templateId: template.id, status: 'SIGNED' } }),
    };
  });
  if (!data) notFound();

  return (
    <div>
      <div className="kicker">Termos · edição {data.template.version} em vigor</div>
      <h2 className={styles.title}>{data.template.title}</h2>
      <p className="card-body" style={{ maxWidth: '44em', marginBottom: 'var(--space-5)' }}>
        Salvar publica a <strong>edição {data.template.version + 1}</strong> e passa a oferecê-la
        daqui para frente.{' '}
        {data.signed > 0
          ? `Os ${data.signed} termo${data.signed === 1 ? '' : 's'} já assinado${data.signed === 1 ? '' : 's'} continua${data.signed === 1 ? '' : 'm'} com o texto de antes — é para isso que as edições existem.`
          : 'Nada do que já foi assinado muda.'}
      </p>

      <TemplateForm
        procedures={data.procedures}
        values={{
          slug: data.template.slug,
          title: data.template.title,
          body: data.template.body,
          procedureId: data.template.procedureId ?? '',
        }}
        nextVersion={data.template.version + 1}
      />
    </div>
  );
}
