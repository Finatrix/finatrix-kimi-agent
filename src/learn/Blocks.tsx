/**
 * Renders the article block vocabulary from `src/content/types.ts`.
 *
 * One renderer for the whole corpus, which is what makes an accessibility or
 * typography fix here a fix for every article at once. Three things are enforced
 * structurally rather than by review:
 *
 *   • The heading outline. Sections are `<h2>`, sub-headings are `<h3>`, and the
 *     vocabulary has no way to express anything else — so no article can skip a
 *     level or open a second `<h1>`.
 *   • Tables are real tables with a `<caption>` and `<th scope="col">`. A data
 *     table without those is a grid of numbers a screen-reader user has to hold
 *     in their head.
 *   • Notes and warnings are distinguished by a visible title, not by colour
 *     alone (WCAG 1.4.1), and are `<aside>` elements so they are skippable.
 */

import { Link } from 'react-router';
import { TOOLS } from '../lib/tools';
import type { Block } from '../content/types';
import { inline } from './inline';

/** `Post-tax return` → `post-tax-return`. Gives every `<h3>` a stable anchor. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function Note({ tone, title, text }: { tone: 'note' | 'warning'; title: string; text: string }) {
  const warn = tone === 'warning';
  return (
    <aside
      className={`my-6 rounded-[14px] border-l-[3px] p-5 ${
        warn
          ? 'border-l-[color:var(--accent-text)] bg-[color-mix(in_srgb,var(--accent-text)_7%,transparent)]'
          : 'border-l-hairline bg-surface-2'
      }`}
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent-text">
        {warn ? 'Worth knowing' : 'Note'}
      </p>
      <p className="mt-2 text-[15px] font-semibold text-ink">{title}</p>
      <p className="mt-2 text-[14.5px] leading-[1.7] text-ink-2">{inline(text, 'n')}</p>
    </aside>
  );
}

function Table({
  caption,
  head,
  rows,
  note,
}: {
  caption: string;
  head: readonly string[];
  rows: readonly (readonly string[])[];
  note?: string;
}) {
  return (
    <figure className="my-7">
      {/* The scroll container is focusable so a keyboard user can actually reach
          the overflow on a narrow screen — a `overflow-x:auto` region with no
          tab stop is unreachable without a mouse. */}
      <div
        tabIndex={0}
        role="group"
        aria-labelledby={`cap-${slugify(caption)}`}
        className="overflow-x-auto rounded-[14px] border border-hairline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-text)]"
      >
        <table className="w-full border-collapse text-left text-[14px]">
          <caption
            id={`cap-${slugify(caption)}`}
            className="caption-bottom px-4 py-3 text-left text-[12.5px] leading-[1.6] text-ink-3"
          >
            {caption}
          </caption>
          <thead>
            <tr className="border-b border-hairline bg-surface-2">
              {/* Index keys throughout this file, deliberately. These lists come
                  from a frozen content module: they are never reordered, never
                  filtered and never appended to at runtime, so an index is a
                  stable identity. Content-derived keys are actively WRONG here,
                  because a table header, a worked-example label or a list item
                  may legitimately repeat — a comparison table with the same row
                  label on both sides of a before/after is the normal case, and
                  React silently drops the duplicate. */}
              {head.map((h, i) => (
                <th
                  key={i}
                  scope="col"
                  className="whitespace-nowrap px-4 py-3 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-3"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={i ? 'border-t border-hairline' : ''}>
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className={`px-4 py-3 align-top leading-[1.6] ${
                      j === 0 ? 'font-medium text-ink' : 'text-ink-2'
                    }`}
                  >
                    {inline(cell, `t${i}${j}`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note && <figcaption className="mt-2.5 text-[12.5px] leading-[1.6] text-ink-3">{inline(note, 'tn')}</figcaption>}
    </figure>
  );
}

function Formula({
  label,
  expression,
  where,
}: {
  label: string;
  expression: string;
  where: readonly string[];
}) {
  return (
    <figure className="my-7 rounded-[14px] border border-hairline bg-surface-2 p-5">
      <figcaption className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent-text">
        {label}
      </figcaption>
      {/* Not a `<code>` block: this is mathematical notation for a human reader,
          not source code, and monospacing the whole expression makes the
          superscripts and the ÷ harder to read rather than easier. */}
      <p className="mt-3 overflow-x-auto text-[16px] leading-[1.6] tracking-[0.01em] text-ink">
        {expression}
      </p>
      {where.length > 0 && (
        <ul className="mt-4 ml-4 list-disc space-y-1.5 text-[13.5px] leading-[1.65] text-ink-3 marker:text-accent-text">
          {where.map((w, i) => (
            <li key={i}>{inline(w, `w${i}`)}</li>
          ))}
        </ul>
      )}
    </figure>
  );
}

function Worked({
  title,
  rows,
  conclusion,
}: {
  title: string;
  rows: readonly { label: string; value: string }[];
  conclusion: string;
}) {
  return (
    <figure className="my-7 rounded-[14px] border border-hairline p-5">
      <figcaption className="text-[14px] font-semibold text-ink">{title}</figcaption>
      {/* A `<dl>`: each row is a genuine term/value pair, and that is the one
          structure that tells assistive technology the two belong together. */}
      <dl className="mt-4 divide-y divide-hairline">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-2.5">
            <dt className="text-[13.5px] leading-[1.5] text-ink-2">{inline(r.label, `dl${i}`)}</dt>
            <dd className="text-[14px] font-medium tabular-nums text-ink">{r.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 border-t border-hairline pt-4 text-[14px] leading-[1.7] text-ink-2">
        {inline(conclusion, 'wc')}
      </p>
    </figure>
  );
}

function ToolCta({ toolId, text }: { toolId: string; text: string }) {
  const tool = TOOLS.find((t) => t.id === toolId);
  if (!tool) return null;
  return (
    <div className="my-7 rounded-[14px] border border-hairline bg-surface-2 p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent-text">
        Try it yourself
      </p>
      <p className="mt-2.5 text-[14.5px] leading-[1.7] text-ink-2">{inline(text, 'tc')}</p>
      <Link
        to={`/tools/${tool.id}`}
        className="fx-btn-ghost mt-4 inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.1em]"
      >
        Open {tool.name} <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}

export function Blocks({ blocks, idPrefix }: { blocks: readonly Block[]; idPrefix: string }) {
  return (
    <>
      {blocks.map((block, i) => {
        const key = `${idPrefix}-${i}`;
        switch (block.kind) {
          case 'p':
            return (
              <p key={key} className="my-4 max-w-[68ch] text-[15.5px] leading-[1.75] text-ink-2">
                {inline(block.text, key)}
              </p>
            );
          case 'h3':
            return (
              <h3
                key={key}
                id={slugify(block.text)}
                className="mt-8 scroll-mt-24 text-[17px] font-semibold tracking-[-0.01em] text-ink"
              >
                {block.text}
              </h3>
            );
          case 'list': {
            const Tag = block.ordered ? 'ol' : 'ul';
            return (
              <Tag
                key={key}
                className={`my-5 ml-5 max-w-[68ch] space-y-2.5 text-[15px] leading-[1.7] text-ink-2 marker:text-accent-text ${
                  block.ordered ? 'list-decimal' : 'list-disc'
                }`}
              >
                {block.items.map((item, j) => (
                  <li key={j}>{inline(item, `${key}-${j}`)}</li>
                ))}
              </Tag>
            );
          }
          case 'note':
          case 'warning':
            return <Note key={key} tone={block.kind} title={block.title} text={block.text} />;
          case 'table':
            return (
              <Table
                key={key}
                caption={block.caption}
                head={block.head}
                rows={block.rows}
                note={block.note}
              />
            );
          case 'formula':
            return (
              <Formula key={key} label={block.label} expression={block.expression} where={block.where} />
            );
          case 'worked':
            return (
              <Worked key={key} title={block.title} rows={block.rows} conclusion={block.conclusion} />
            );
          case 'tool':
            return <ToolCta key={key} toolId={block.toolId} text={block.text} />;
        }
      })}
    </>
  );
}
