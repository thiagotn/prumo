import type { Metadata } from 'next';
import Link from 'next/link';
import { requireModule } from '@/lib/auth/guards';
import { loadFaq } from '@/lib/faq-source';
import { searchFaq, type Block, type Faq, type Inline } from '@/lib/faq';
import styles from './help.module.css';

export const metadata: Metadata = { title: 'Ajuda' };

/** Bold, inline code and the odd external link — the FAQ uses nothing else. */
function Text({ content }: { content: Inline[] }) {
  return (
    <>
      {content.map((token, index) => {
        if (token.kind === 'strong') return <strong key={index}>{token.text}</strong>;
        if (token.kind === 'code')
          return (
            <code className={styles.code} key={index}>
              {token.text}
            </code>
          );
        if (token.kind === 'link')
          return (
            <a href={token.href} key={index} rel="noreferrer noopener" target="_blank">
              {token.text}
            </a>
          );
        return <span key={index}>{token.text}</span>;
      })}
    </>
  );
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        if (block.kind === 'paragraph') {
          return (
            <p className={styles.paragraph} key={index}>
              <Text content={block.content} />
            </p>
          );
        }
        if (block.kind === 'list') {
          return (
            <ul className={styles.list} key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <Text content={item} />
                </li>
              ))}
            </ul>
          );
        }
        if (block.kind === 'quote') {
          return (
            <p className={styles.quote} key={index}>
              <Text content={block.content} />
            </p>
          );
        }
        return (
          <div className={styles.tableWrap} key={index}>
            <table className="table">
              <thead>
                <tr>
                  {block.head.map((cell, cellIndex) => (
                    <th key={cellIndex}>
                      <Text content={cell} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex}>
                        <Text content={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}

export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireModule('help');
  const { q } = await searchParams;
  const query = (q ?? '').trim();

  const faq: Faq | null = await loadFaq();
  if (!faq) {
    return (
      <p className="card-body" style={{ maxWidth: '44em' }}>
        A ajuda não está disponível nesta instalação — o arquivo com as perguntas não foi
        encontrado. Avise quem cuida do sistema; nada mais é afetado por isso.
      </p>
    );
  }

  const sections = searchFaq(faq.sections, query);
  const answers = sections.reduce((total, section) => total + section.items.length, 0);

  return (
    <div className={styles.layout}>
      <aside className={styles.index} aria-label="Assuntos">
        <div className="kicker">Assuntos</div>
        <ul className={styles.indexList}>
          {sections.map((section) => (
            <li key={section.id}>
              <a className={styles.indexLink} href={`#${section.id}`}>
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </aside>

      <div className={styles.content}>
        <form action="/help" className={styles.search}>
          <input
            className="input"
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Buscar na ajuda: repor, termo, margem…"
            aria-label="Buscar na ajuda"
            style={{ flex: 1 }}
          />
          <button className="btn btn-secondary touch" type="submit" style={{ fontSize: 12 }}>
            Buscar
          </button>
          {query ? (
            <Link className="btn btn-ghost touch" href="/help" style={{ fontSize: 12 }}>
              Limpar
            </Link>
          ) : null}
        </form>

        {query ? (
          <p className={styles.paragraph}>
            {answers === 0
              ? 'Nenhuma resposta com esse termo.'
              : `${answers} resposta${answers === 1 ? '' : 's'} para “${query}”.`}
          </p>
        ) : (
          <div className={styles.intro}>
            <Blocks blocks={faq.intro} />
          </div>
        )}

        {sections.length === 0 ? (
          <p className={styles.empty}>
            Tente outra palavra — o nome da tela costuma funcionar: agenda, estoque, termo,
            financeiro.
          </p>
        ) : null}

        {sections.map((section) => (
          <section className={styles.section} id={section.id} key={section.id}>
            <h2 className={styles.sectionTitle}>{section.title}</h2>
            {section.items.map((item) => (
              <article className={styles.item} id={item.id} key={item.id}>
                <h3 className={styles.question}>{item.question}</h3>
                <Blocks blocks={item.blocks} />
              </article>
            ))}
          </section>
        ))}

        <p className={styles.footer}>
          Esta ajuda é o mesmo texto que o time mantém junto com o sistema: quando uma tela muda, ela
          muda no mesmo commit. Se algo aqui não corresponde ao que você vê, o sistema está errado,
          não o texto — avise.
        </p>
      </div>
    </div>
  );
}
