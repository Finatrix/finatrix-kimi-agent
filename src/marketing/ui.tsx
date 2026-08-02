/**
 * Shared building blocks for the public marketing/trust pages.
 *
 * Deliberately small and unopinionated: a heading, a prose block, a card grid,
 * an FAQ and a related-links strip. Each page composes these rather than
 * bringing its own layout, which is what keeps eight new pages from becoming
 * eight new design languages — and what makes an accessibility fix here a fix
 * everywhere instead of eight separate ones.
 */

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { contentLinkFor } from '../shared/content';
import type { FaqEntry } from '../shared/publicPages';
import { publicPageFor } from '../shared/publicPages';

/* ------------------------------------------------------------------------- *
 * Text
 * ------------------------------------------------------------------------- */

/**
 * A titled section.
 *
 * The heading is a real `<h2>` with a stable id, so every section is a
 * link target and the page has one unbroken h1 → h2 → h3 outline. Screen-reader
 * users navigate long pages by heading; a page built from styled `<div>`s is one
 * they have to read start to finish.
 */
export function Section({
  id,
  title,
  intro,
  children,
  className = '',
}: {
  id: string;
  title: string;
  intro?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={`mt-14 first:mt-0 ${className}`}>
      <h2
        id={id}
        className="scroll-mt-24 text-[22px] sm:text-[26px] font-semibold tracking-[-0.02em] text-ink"
      >
        {title}
      </h2>
      {intro && <p className="mt-3 max-w-[68ch] text-[15px] leading-[1.7] text-ink-2">{intro}</p>}
      {children && <div className="mt-6">{children}</div>}
    </section>
  );
}

/** Body copy. */
export function P({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`mb-4 max-w-[68ch] text-[15px] leading-[1.75] text-ink-2 ${className}`}>
      {children}
    </p>
  );
}

/** A bulleted list with the brand's gold markers. */
export function UL({ children }: { children: ReactNode }) {
  return (
    <ul className="mb-5 ml-5 max-w-[68ch] list-disc space-y-2 text-[15px] leading-[1.7] text-ink-2 marker:text-accent-text">
      {children}
    </ul>
  );
}

/* ------------------------------------------------------------------------- *
 * Layout
 * ------------------------------------------------------------------------- */

/** Auto-fitting card grid. `min` controls how early it collapses to one column. */
export function Grid({ children, min = 260 }: { children: ReactNode; min?: number }) {
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))` }}
    >
      {children}
    </div>
  );
}

/** A glass panel. `as="li"` when the card is an item in a real list. */
export function Card({
  title,
  children,
  eyebrow,
  as: Tag = 'div',
}: {
  title?: string;
  children: ReactNode;
  eyebrow?: string;
  as?: 'div' | 'li';
}) {
  return (
    <Tag className="fx-glass rounded-[18px] p-6 h-full">
      {eyebrow && (
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent-text">
          {eyebrow}
        </span>
      )}
      {title && (
        <h3 className="mt-2 text-[16px] font-semibold tracking-[-0.01em] text-ink">{title}</h3>
      )}
      <div className="mt-2.5 text-[14px] leading-[1.65] text-ink-2">{children}</div>
    </Tag>
  );
}

/**
 * A key/value fact strip — "₹199/mo", "7 free tools", "0 trackers".
 *
 * A `<dl>` rather than divs: the number and its label are a genuine
 * term/definition pair, and that is the one structure that tells a screen reader
 * the two belong together.
 */
export function Facts({ items }: { items: Array<{ value: string; label: string }> }) {
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-px overflow-hidden rounded-[18px] border border-hairline bg-hairline">
      {items.map((f) => (
        <div key={f.label} className="bg-surface-base px-5 py-5">
          <dt className="sr-only">{f.label}</dt>
          <dd>
            <span className="block text-[22px] font-semibold tracking-[-0.02em] text-ink">
              {f.value}
            </span>
            <span
              aria-hidden="true"
              className="mt-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3"
            >
              {f.label}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A two-or-more-option segmented control — the monthly/yearly price toggle.
 *
 * A `radiogroup`, not a `tablist`. The tools' `Tabs` component implements the
 * WAI-ARIA tabs pattern, which promises a `tabpanel` for each tab; a price
 * toggle has no panels, it re-renders figures that are already on screen. It is
 * also styled by `.fx-tabs`, which is injected with the expense tool's CSS and
 * simply does not exist on a marketing route — the control would have rendered
 * as two unstyled buttons here.
 *
 * Roving tabindex with arrow-key selection, per the APG radio-group pattern:
 * one Tab stop for the whole control, arrows move and select within it.
 */
export function SegmentedControl<K extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: ReadonlyArray<{ key: K; label: string; hint?: string }>;
  value: K;
  onChange: (key: K) => void;
  label: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = options.findIndex((o) => o.key === value);
    if (i < 0) return;
    let next = i;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (i + 1) % options.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (i - 1 + options.length) % options.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = options.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    const key = options[next].key;
    onChange(key);
    refs.current[key]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="inline-flex gap-1 rounded-full border border-hairline bg-surface-2 p-1"
    >
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            ref={(el) => {
              refs.current[o.key] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.key)}
            className={`rounded-full px-4 py-2 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors ${
              on
                ? 'bg-[#D4AF37] text-black'
                : 'text-ink-2 hover:text-ink'
            }`}
          >
            {o.label}
            {o.hint && <span className="ml-1.5 normal-case tracking-normal">{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------------- *
 * FAQ
 * ------------------------------------------------------------------------- */

/**
 * The visible FAQ.
 *
 * Native `<details>`/`<summary>` rather than a scripted accordion, for four
 * reasons that all matter here: it is keyboard-operable and announced correctly
 * with no ARIA of our own, it costs zero JavaScript on a page whose whole job is
 * to load fast from a search result, browser find-in-page can open a closed
 * answer, and the answer text is in the DOM for crawlers and AI answer engines
 * whether or not it is expanded.
 *
 * `entries` is the SAME array `seo.ts` turns into the `FAQPage` node, which is
 * what makes the markup compliant with Google's "must be visible on the page"
 * rule by construction.
 */
export function Faq({ entries, id = 'faq' }: { entries: readonly FaqEntry[]; id?: string }) {
  return (
    <Section id={id} title="Frequently asked questions">
      <div className="divide-y divide-hairline border-y border-hairline">
        {entries.map((entry) => (
          <details key={entry.q} className="group">
            <summary className="flex cursor-pointer items-start justify-between gap-4 py-4 text-[15px] font-medium text-ink marker:content-[''] [&::-webkit-details-marker]:hidden">
              <span className="max-w-[62ch]">{entry.q}</span>
              <span
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-accent-text transition-transform duration-200 group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mb-5 max-w-[68ch] text-[14.5px] leading-[1.75] text-ink-2">{entry.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------------- *
 * Calls to action and internal links
 * ------------------------------------------------------------------------- */

export function CtaRow({
  primary,
  secondary,
  note,
}: {
  primary: { to: string; label: string };
  secondary?: { to: string; label: string };
  note?: string;
}) {
  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to={primary.to}
          className="fx-btn-gold inline-flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.1em] px-7 py-3.5 rounded-full"
        >
          {primary.label} <span aria-hidden="true">→</span>
        </Link>
        {secondary && (
          <Link
            to={secondary.to}
            className="fx-btn-ghost inline-flex items-center font-mono text-[12px] uppercase tracking-[0.1em] px-6 py-3.5 rounded-full"
          >
            {secondary.label}
          </Link>
        )}
      </div>
      {note && (
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">{note}</p>
      )}
    </div>
  );
}

/**
 * "Related pages" — internal links resolved from the registries.
 *
 * Takes paths, not titles, so a link can never name a page something the page
 * does not call itself, and an unregistered path is dropped rather than rendered
 * as a link into a 404.
 *
 * Resolves against BOTH registries — the marketing pages in `publicPages.ts` and
 * the knowledge layer in `content.ts` — so a trust page can link to a guide and
 * a guide can link back without either needing to know which registry the other
 * lives in. That is what makes internal linking a site-wide property rather than
 * one that stops at the boundary between the two.
 */
export function RelatedPages({
  paths,
  title = 'Related pages',
}: {
  paths: readonly string[];
  title?: string;
}) {
  const pages = paths
    .map((path) => {
      const page = publicPageFor(path);
      if (page) return { path: page.path, name: page.name, blurb: page.lede ?? page.description };
      return contentLinkFor(path);
    })
    .filter((p) => p !== null);
  if (!pages.length) return null;

  return (
    <Section id="related" title={title} className="mt-16 border-t border-hairline pt-10">
      <ul className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))' }}>
        {pages.map((p) => (
          <li key={p.path}>
            <Link
              to={p.path}
              className="group block h-full rounded-[14px] border border-hairline p-4 transition-colors hover:border-[color:var(--accent-text)] focus-visible:border-[color:var(--accent-text)]"
            >
              <span className="block text-[14px] font-medium text-ink group-hover:text-accent-text transition-colors">
                {p.name}
              </span>
              <span className="mt-1 block text-[13px] leading-[1.55] text-ink-3">{p.blurb}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
