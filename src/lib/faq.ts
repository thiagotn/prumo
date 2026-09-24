// Reading docs/FAQ.md into something the Ajuda screen can render.
//
// The FAQ is written for whoever runs the clinic, and it is the same file the team
// edits — there is no second copy to drift. What is here is a parser for the small
// subset of Markdown that file actually uses: headings, paragraphs, lists, block quotes,
// tables, bold, inline code and links.
//
// Deliberately not a Markdown library: the input is ours, the subset is fixed, and a
// dependency that renders arbitrary HTML is a liability on a screen behind a login.

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; text: string; href: string };

export type Block =
  | { kind: 'paragraph'; content: Inline[] }
  | { kind: 'list'; items: Inline[][] }
  | { kind: 'quote'; content: Inline[] }
  | { kind: 'table'; head: Inline[][]; rows: Inline[][][] };

export type FaqItem = { id: string; question: string; blocks: Block[] };
export type FaqSection = { id: string; title: string; items: FaqItem[] };
export type Faq = { intro: Block[]; sections: FaqSection[] };

/** A stable anchor from a heading, so a section can be linked to. */
export function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Splits a line into inline pieces.
 *
 * Only a link with an http(s) target becomes a link: the FAQ also points at sibling
 * documents (`operacao.md`), which are not served by the application, and a dead link in
 * a help screen is worse than plain text.
 */
export function parseInline(text: string): Inline[] {
  const tokens: Inline[] = [];
  const pattern = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;

  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (match.index > last) tokens.push({ kind: 'text', text: text.slice(last, match.index) });

    if (match[1] !== undefined) tokens.push({ kind: 'strong', text: match[1] });
    else if (match[2] !== undefined) tokens.push({ kind: 'code', text: match[2] });
    else if (match[3] !== undefined && match[4] !== undefined) {
      const href = match[4];
      // A label like `operacao.md` keeps its own inline formatting.
      const label = match[3].replace(/`/g, '');
      tokens.push(
        /^https?:\/\//.test(href)
          ? { kind: 'link', text: label, href }
          : { kind: 'text', text: label },
      );
    }
    last = match.index + match[0].length;
  }

  if (last < text.length) tokens.push({ kind: 'text', text: text.slice(last) });
  return tokens.length > 0 ? tokens : [{ kind: 'text', text }];
}

/** Everything a block holds, as plain text — what the search looks at. */
export function blockText(block: Block): string {
  switch (block.kind) {
    case 'paragraph':
    case 'quote':
      return block.content.map((token) => token.text).join('');
    case 'list':
      return block.items.map((item) => item.map((token) => token.text).join('')).join(' ');
    case 'table':
      return [block.head, ...block.rows]
        .flat()
        .map((cell) => cell.map((token) => token.text).join(''))
        .join(' ');
  }
}

type Raw = { lines: string[] };

function flush(raw: Raw, blocks: Block[]): void {
  const lines = raw.lines;
  raw.lines = [];
  if (lines.length === 0) return;

  if (lines[0]!.startsWith('|')) {
    // A table: header, the |---| separator, then the rows.
    const cells = (line: string) =>
      line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => parseInline(cell.trim()));
    const [head, , ...rows] = lines;
    blocks.push({ kind: 'table', head: cells(head!), rows: rows.map(cells) });
    return;
  }

  if (lines[0]!.startsWith('- ')) {
    blocks.push({
      kind: 'list',
      // A wrapped list item continues on the next line, indented.
      items: lines
        .join('\n')
        .split(/\n(?=- )/)
        .map((item) => parseInline(item.replace(/^- /, '').replace(/\s*\n\s*/g, ' ').trim())),
    });
    return;
  }

  if (lines[0]!.startsWith('>')) {
    blocks.push({
      kind: 'quote',
      content: parseInline(lines.map((line) => line.replace(/^>\s?/, '')).join(' ').trim()),
    });
    return;
  }

  blocks.push({ kind: 'paragraph', content: parseInline(lines.join(' ').trim()) });
}

/**
 * Parses the file. Headings are the structure: `##` opens a section, `###` a question,
 * and everything between them is the answer.
 */
export function parseFaq(markdown: string): Faq {
  const intro: Block[] = [];
  const sections: FaqSection[] = [];
  const raw: Raw = { lines: [] };

  let section: FaqSection | null = null;
  let item: FaqItem | null = null;

  const target = () => (item ? item.blocks : section ? [] : intro);

  for (const line of markdown.split('\n')) {
    const trimmed = line.trimEnd();

    if (trimmed.startsWith('# ')) {
      flush(raw, target());
      continue; // the document title; the screen has its own heading
    }

    if (trimmed.startsWith('## ')) {
      flush(raw, target());
      item = null;
      const title = trimmed.slice(3).trim();
      section = { id: slug(title), title, items: [] };
      sections.push(section);
      continue;
    }

    if (trimmed.startsWith('### ')) {
      flush(raw, target());
      const question = trimmed.slice(4).trim();
      item = { id: slug(question), question, blocks: [] };
      // A question before any section still belongs somewhere.
      if (!section) {
        section = { id: 'geral', title: 'Geral', items: [] };
        sections.push(section);
      }
      section.items.push(item);
      continue;
    }

    // A horizontal rule separates sections in the source and carries no meaning here.
    if (trimmed === '---' || trimmed === '') {
      flush(raw, target());
      continue;
    }

    raw.lines.push(trimmed);
  }
  flush(raw, target());

  // A section that opened and holds nothing is a heading with no help under it.
  return { intro, sections: sections.filter((s) => s.items.length > 0) };
}

/** Folds accents and case, so "prontuario" finds "prontuário". */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Filters the FAQ by what was typed. A section survives when its title matches — the
 * whole section is then relevant — or through the questions that match.
 */
export function searchFaq(sections: FaqSection[], query: string): FaqSection[] {
  const needle = fold(query.trim());
  if (!needle) return sections;

  return sections
    .map((section) => {
      if (fold(section.title).includes(needle)) return section;
      const items = section.items.filter((item) => {
        const haystack = fold(`${item.question} ${item.blocks.map(blockText).join(' ')}`);
        return haystack.includes(needle);
      });
      return { ...section, items };
    })
    .filter((section) => section.items.length > 0);
}
