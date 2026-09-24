import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Role } from '@prisma/client';
import { requireModule } from '@/lib/auth/guards';
import { currentQuestionnaire } from '@/lib/anamnesis-source';
import { withTenant } from '@/lib/db';
import { QuestionsForm } from './questions-form';
import styles from '../anamnesis.module.css';

export const metadata: Metadata = { title: 'Questionário da anamnese' };

export default async function QuestionnairePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { tenant, session } = await requireModule('medicalRecord');
  const { saved } = await searchParams;
  if (!tenant) return <p className="card-body">Esta tela pertence a uma clínica.</p>;

  // The wording of the anamnesis is the doctor's, like the wording of a consent term.
  if (session.role !== Role.OWNER) redirect('/patients?denied=owner');

  const { questionnaire, answered } = await withTenant(tenant.id, async (tx) => ({
    questionnaire: await currentQuestionnaire(tx, tenant.id),
    answered: await tx.anamnesis.count(),
  }));

  return (
    <div style={{ maxWidth: '46em' }}>
      <div className="kicker">Prontuário · edição {questionnaire.version} em vigor</div>
      <h2 className={styles.title}>Questionário da anamnese</h2>
      <p className="card-body" style={{ marginBottom: 'var(--space-4)' }}>
        O que a clínica pergunta antes de qualquer aplicação. Salvar publica a{' '}
        <strong>edição {questionnaire.version + 1}</strong> e passa a perguntar assim daqui para
        frente.{' '}
        {answered > 0
          ? `As ${answered} anamneses já respondidas continuam com as perguntas de quando foram respondidas.`
          : 'Nada foi respondido ainda.'}
      </p>

      {saved ? (
        <p className={styles.saved} role="status">
          Questionário publicado.
        </p>
      ) : null}

      <QuestionsForm
        questions={questionnaire.questions}
        nextVersion={questionnaire.version + 1}
      />
    </div>
  );
}
