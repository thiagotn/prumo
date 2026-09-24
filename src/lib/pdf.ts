// Shared mechanics for the PDFs the system hands over: the page box, the colours, line
// wrapping and the character folding the standard fonts need.
//
// Standard fonts rather than the Classical faces on purpose: they carry no licence to
// embed, they keep the file small, and a consent term or a ledger is read for what it
// says, not for its typography.
import 'server-only';
import { rgb, type PDFFont } from 'pdf-lib';

/** A4, in points. */
export const PAGE = { width: 595.28, height: 841.89 };
export const MARGIN = 56;
export const CONTENT_WIDTH = PAGE.width - MARGIN * 2;

export const INK = rgb(0.1, 0.1, 0.1);
export const MUTED = rgb(0.45, 0.45, 0.45);
export const RULE = rgb(0.8, 0.8, 0.8);

/**
 * Breaks a paragraph into lines that fit a column.
 *
 * A word longer than the column (a pasted URL, a long product code) is broken by
 * character rather than left to run off the page.
 */
export function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = '';

  const push = () => {
    if (line) lines.push(line);
    line = '';
  };

  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      line = candidate;
      continue;
    }
    push();
    if (font.widthOfTextAtSize(word, size) <= width) {
      line = word;
      continue;
    }
    let chunk = '';
    for (const char of word) {
      if (font.widthOfTextAtSize(chunk + char, size) > width) {
        lines.push(chunk);
        chunk = char;
      } else {
        chunk += char;
      }
    }
    line = chunk;
  }
  push();
  return lines;
}

/**
 * WinAnsi — what the standard fonts can encode — covers Portuguese, but not the
 * typographic dashes and quotes a word processor produces. Those are folded rather than
 * allowed to throw halfway through generating a document somebody is waiting for.
 */
export function toWinAnsi(text: string): string {
  return text
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    // Anything still outside Latin-1 would make the encoder throw; a visible box beats a
    // 500 on a document the clinic is waiting for.
    .replace(/[^\u0000-ÿ]/g, '?');
}

/** Cuts a cell to fit a column, with an ellipsis, so a table never overflows sideways. */
export function truncate(text: string, font: PDFFont, size: number, width: number): string {
  const folded = toWinAnsi(text);
  if (font.widthOfTextAtSize(folded, size) <= width) return folded;
  let cut = folded;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}...`, size) > width) {
    cut = cut.slice(0, -1);
  }
  return `${cut}...`;
}
