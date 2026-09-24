// Where the Ajuda screen gets its content: docs/FAQ.md, the same file the team edits.
//
// Read from disk rather than copied into the bundle so there is exactly one source. The
// production image copies the file next to the server (see Dockerfile); if it is ever
// missing, the screen says so instead of rendering an empty page.
import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFaq, type Faq } from './faq';

/** Parsed once per process: the file only changes with a deploy. */
let cached: Faq | null = null;

export async function loadFaq(): Promise<Faq | null> {
  if (cached) return cached;

  try {
    const markdown = await readFile(join(process.cwd(), 'docs', 'FAQ.md'), 'utf8');
    const faq = parseFaq(markdown);
    if (faq.sections.length === 0) return null;
    if (process.env.NODE_ENV === 'production') cached = faq;
    return faq;
  } catch (error) {
    console.error('[faq] docs/FAQ.md is not readable', error);
    return null;
  }
}
