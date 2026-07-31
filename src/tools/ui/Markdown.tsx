import { Fragment, type ReactNode } from 'react';

/**
 * A small, safe markdown renderer for model output.
 *
 * It builds React elements directly — there is no `dangerouslySetInnerHTML` and
 * no HTML parsing anywhere in this file, so markup in the source text can only
 * ever be displayed as text. That is the whole reason this exists rather than a
 * markdown dependency: the input is generated text, the surface is inside the
 * user's own finance app, and the safest parser is one that cannot emit HTML at
 * all. It also keeps the lazy AI chunk small.
 *
 * Supported, because it is what the assistant is asked to produce:
 * headings (## to ####), paragraphs, unordered and ordered lists, tables,
 * horizontal rules, blockquotes, `**bold**`, `*italic*` and `` `code` ``.
 *
 * Anything else renders as plain text rather than disappearing — an unsupported
 * construct should look inelegant, never invisible.
 */

export function Markdown({ text }: { text: string }) {
  return <div className="fx-md">{renderBlocks(text)}</div>;
}

type Block =
  | { t: 'heading'; level: number; text: string }
  | { t: 'para'; text: string }
  | { t: 'ul'; items: string[] }
  | { t: 'ol'; items: string[] }
  | { t: 'quote'; text: string }
  | { t: 'table'; head: string[]; rows: string[][] }
  | { t: 'rule' };

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const RULE = /^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/;
const TABLE_ROW = /^\s*\|(.*)\|\s*$/;
const TABLE_DIVIDER = /^\s*\|[\s:|-]+\|\s*$/;
/** Code fences are stripped rather than rendered — the assistant is told not to emit them. */
const FENCE = /^\s*```/;

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    if (FENCE.test(line)) {
      i++;
      while (i < lines.length && !FENCE.test(lines[i])) i++;
      i++; // closing fence
      continue;
    }

    if (RULE.test(line)) { blocks.push({ t: 'rule' }); i++; continue; }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ t: 'heading', level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }

    // A table needs its divider row; without one the pipes are just text.
    if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_DIVIDER.test(lines[i + 1])) {
      const head = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i])) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push({ t: 'table', head, rows });
      continue;
    }

    if (BULLET.test(line)) {
      const items: string[] = [];
      while (i < lines.length && BULLET.test(lines[i])) {
        items.push(BULLET.exec(lines[i])![1]);
        i++;
      }
      blocks.push({ t: 'ul', items });
      continue;
    }

    if (NUMBERED.test(line)) {
      const items: string[] = [];
      while (i < lines.length && NUMBERED.test(lines[i])) {
        items.push(NUMBERED.exec(lines[i])![1]);
        i++;
      }
      blocks.push({ t: 'ol', items });
      continue;
    }

    if (QUOTE.test(line)) {
      const parts: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        parts.push(QUOTE.exec(lines[i])![1]);
        i++;
      }
      blocks.push({ t: 'quote', text: parts.join(' ') });
      continue;
    }

    // Paragraph: consecutive lines up to the next blank line or block start.
    const parts: string[] = [];
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i])) {
      parts.push(lines[i].trim());
      i++;
    }
    if (parts.length) {
      blocks.push({ t: 'para', text: parts.join(' ') });
    } else {
      // A line that looks like the start of a block but matched no branch —
      // in practice a table row whose divider row is missing (a partial or
      // malformed table). Dropping it violated this file's contract that an
      // unsupported construct "should look inelegant, never invisible": the
      // row simply vanished from the answer. Render it as literal text.
      blocks.push({ t: 'para', text: line.trim() });
      i++;
    }
  }

  return blocks;
}

function startsBlock(line: string): boolean {
  return HEADING.test(line) || BULLET.test(line) || NUMBERED.test(line)
    || QUOTE.test(line) || RULE.test(line) || TABLE_ROW.test(line) || FENCE.test(line);
}

function splitRow(line: string): string[] {
  const inner = TABLE_ROW.exec(line)?.[1] ?? '';
  return inner.split('|').map((c) => c.trim());
}

function renderBlocks(src: string): ReactNode {
  return parseBlocks(src).map((b, i) => {
    switch (b.t) {
      case 'heading': {
        // Clamped to h3/h4: these headings sit inside a dialog whose own title
        // is an h2, and jumping the outline is a real navigation problem for
        // anyone browsing by heading.
        const Tag = (b.level <= 2 ? 'h3' : 'h4') as 'h3' | 'h4';
        return <Tag key={i}>{inline(b.text)}</Tag>;
      }
      case 'para':
        return <p key={i}>{inline(b.text)}</p>;
      case 'ul':
        return <ul key={i}>{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ul>;
      case 'ol':
        return <ol key={i}>{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ol>;
      case 'quote':
        return <blockquote key={i}>{inline(b.text)}</blockquote>;
      case 'rule':
        return <hr key={i} />;
      case 'table':
        return (
          // Wide tables scroll inside their own box; the message column must
          // never scroll sideways.
          <div className="fx-md-tablewrap" key={i}>
            <table>
              <thead>
                <tr>{b.head.map((h, j) => <th key={j} scope="col">{inline(h)}</th>)}</tr>
              </thead>
              <tbody>
                {b.rows.map((row, j) => (
                  <tr key={j}>{row.map((c, k) => <td key={k}>{inline(c)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        );
    }
  });
}

/** `**bold**`, `*italic*`, `_italic_` and `` `code` ``, in one pass. */
const INLINE_TOKEN = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/g;

function inline(text: string): ReactNode {
  const parts = text.split(INLINE_TOKEN).filter((p) => p !== '' && p !== undefined);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={i}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('_') && part.endsWith('_') && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
