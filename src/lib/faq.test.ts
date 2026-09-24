import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { blockText, parseFaq, parseInline, searchFaq, slug } from './faq';

describe('parseInline', () => {
  it('reads bold and inline code', () => {
    expect(parseInline('Responda **1** para `confirmar`.')).toEqual([
      { kind: 'text', text: 'Responda ' },
      { kind: 'strong', text: '1' },
      { kind: 'text', text: ' para ' },
      { kind: 'code', text: 'confirmar' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('keeps a plain line as one piece', () => {
    expect(parseInline('Sem formatação alguma.')).toEqual([
      { kind: 'text', text: 'Sem formatação alguma.' },
    ]);
  });

  it('links only what the browser can actually open', () => {
    // The FAQ also points at sibling documents, which the application does not serve; a
    // dead link in a help screen is worse than plain text.
    expect(parseInline('veja [`operacao.md`](operacao.md)')).toEqual([
      { kind: 'text', text: 'veja ' },
      { kind: 'text', text: 'operacao.md' },
    ]);
    expect(parseInline('em [claude](https://exemplo.com)')).toEqual([
      { kind: 'text', text: 'em ' },
      { kind: 'link', text: 'claude', href: 'https://exemplo.com' },
    ]);
  });
});

describe('parseFaq', () => {
  const sample = [
    '# FAQ',
    '',
    'Uma introdução.',
    '',
    '## Agenda',
    '',
    '### Como vejo o dia?',
    '',
    'Em **Agenda**. Ela abre no dia de hoje,',
    'com uma faixa por hora.',
    '',
    '- primeiro item',
    '- segundo item que',
    '  continua na linha seguinte',
    '',
    '> Uma observação.',
    '',
    '### E no celular?',
    '',
    '| Perfil | Alcança |',
    '|---|---|',
    '| **Recepção** | agenda |',
    '',
    '---',
    '',
    '## Seção vazia',
    '',
  ].join('\n');

  const faq = parseFaq(sample);

  it('turns headings into sections and questions', () => {
    expect(faq.sections.map((s) => s.title)).toEqual(['Agenda']);
    expect(faq.sections[0]!.items.map((i) => i.question)).toEqual([
      'Como vejo o dia?',
      'E no celular?',
    ]);
  });

  it('keeps the introduction that comes before the first section', () => {
    expect(faq.intro).toHaveLength(1);
    expect(blockText(faq.intro[0]!)).toBe('Uma introdução.');
  });

  it('joins a wrapped paragraph back into one', () => {
    const [paragraph] = faq.sections[0]!.items[0]!.blocks;
    expect(blockText(paragraph!)).toBe('Em Agenda. Ela abre no dia de hoje, com uma faixa por hora.');
  });

  it('reads lists, including an item that wraps', () => {
    const list = faq.sections[0]!.items[0]!.blocks.find((b) => b.kind === 'list');
    expect(list && blockText(list)).toBe('primeiro item segundo item que continua na linha seguinte');
  });

  it('reads a block quote and a table', () => {
    const quote = faq.sections[0]!.items[0]!.blocks.find((b) => b.kind === 'quote');
    expect(quote && blockText(quote)).toBe('Uma observação.');

    const table = faq.sections[0]!.items[1]!.blocks.find((b) => b.kind === 'table');
    expect(table?.kind === 'table' && table.head.map((c) => c[0]!.text)).toEqual([
      'Perfil',
      'Alcança',
    ]);
    expect(table && blockText(table)).toContain('Recepção');
  });

  it('drops a section with nothing under it', () => {
    // A heading with no help below it is noise on the screen.
    expect(faq.sections.map((s) => s.title)).not.toContain('Seção vazia');
  });

  it('gives every section and question an anchor', () => {
    expect(slug('Termos de consentimento')).toBe('termos-de-consentimento');
    expect(faq.sections[0]!.id).toBe('agenda');
    expect(faq.sections[0]!.items[0]!.id).toBe('como-vejo-o-dia');
  });
});

describe('searchFaq', () => {
  const faq = parseFaq(
    [
      '## Estoque',
      '### O que significa Repor?',
      'A quantidade utilizável chegou a zero.',
      '### Como dou entrada de nota?',
      'Em Estoque, botão Entrada de nota.',
      '## Agenda',
      '### Como marco um horário?',
      'Pelo botão Novo agendamento.',
    ].join('\n'),
  );

  it('finds by question and by answer', () => {
    expect(searchFaq(faq.sections, 'Repor')[0]!.items.map((i) => i.question)).toEqual([
      'O que significa Repor?',
    ]);
    expect(searchFaq(faq.sections, 'novo agendamento')[0]!.items[0]!.question).toBe(
      'Como marco um horário?',
    );
  });

  it('ignores accents and case', () => {
    expect(searchFaq(faq.sections, 'HORARIO')).toHaveLength(1);
    expect(searchFaq(faq.sections, 'utilizavel')).toHaveLength(1);
  });

  it('keeps the whole section when the section name matches', () => {
    const [section] = searchFaq(faq.sections, 'estoque');
    expect(section!.items).toHaveLength(2);
  });

  it('returns everything for an empty search, and nothing for a miss', () => {
    expect(searchFaq(faq.sections, '   ')).toHaveLength(2);
    expect(searchFaq(faq.sections, 'ressonância magnética')).toHaveLength(0);
  });
});

describe('the real FAQ', () => {
  // The file the team edits is the one the screen shows: if a future edit breaks the
  // shape the parser expects, this fails before anyone sees an empty Ajuda.
  const faq = parseFaq(readFileSync('docs/FAQ.md', 'utf8'));

  it('parses into sections with questions under each', () => {
    expect(faq.sections.length).toBeGreaterThan(10);
    for (const section of faq.sections) {
      expect(section.items.length, section.title).toBeGreaterThan(0);
      for (const item of section.items) {
        expect(item.blocks.length, `${section.title} · ${item.question}`).toBeGreaterThan(0);
      }
    }
  });

  it('covers the screens the clinic uses every day', () => {
    const titles = faq.sections.map((s) => s.title);
    for (const expected of ['Agenda', 'Pacientes', 'Estoque', 'Financeiro']) {
      expect(titles).toContain(expected);
    }
  });

  it('leaves no unrendered markdown behind', () => {
    // If the FAQ starts using a syntax the parser does not know, it would show up raw.
    const everything = faq.sections
      .flatMap((s) => s.items.flatMap((i) => i.blocks.map(blockText)))
      .join('\n');
    expect(everything).not.toMatch(/\*\*/);
    expect(everything).not.toMatch(/^\s*[-|>]/m);
  });
});
