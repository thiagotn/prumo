import type { Metadata } from 'next';
import { requireOwnerOf } from '@/lib/auth/guards';
import { withTenant } from '@/lib/db';
import { TemplateForm } from '../../template-form';
import styles from '../../consents.module.css';

export const metadata: Metadata = { title: 'Novo termo' };

/** A starting point, not legal advice: the clinic rewrites it in its own words. */
const STARTER = `Eu, {{paciente}}, declaro que fui informada de forma clara sobre o procedimento de {{procedimento}}, seus objetivos, a técnica empregada e os materiais utilizados.

Estou ciente de que reações como edema, hematoma e sensibilidade local podem ocorrer, e de que o resultado varia conforme a resposta individual de cada organismo.

Informei à equipe da {{clinica}} todas as condições de saúde, alergias e medicamentos em uso, e me comprometo a seguir as orientações recebidas antes e depois do procedimento.

Declaro que tive a oportunidade de fazer perguntas e que fui respondida, e autorizo a realização do procedimento nesta data, {{data}}.`;

export default async function NewTemplatePage() {
  const { tenant } = await requireOwnerOf('consents');
  if (!tenant) return <p className="card-body">Esta tela pertence a uma clínica.</p>;

  const procedures = await withTenant(tenant.id, (tx) =>
    tx.procedure.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  );

  return (
    <div>
      <div className="kicker">Termos</div>
      <h2 className={styles.title}>Novo termo</h2>
      <p className="card-body" style={{ maxWidth: '44em', marginBottom: 'var(--space-5)' }}>
        O texto abaixo é um ponto de partida — reescreva com as palavras da clínica. O que a
        paciente assinar fica guardado exatamente como estiver aqui no dia.
      </p>

      <TemplateForm
        procedures={procedures}
        values={{ slug: '', title: '', body: STARTER, procedureId: '' }}
        nextVersion={1}
      />
    </div>
  );
}
