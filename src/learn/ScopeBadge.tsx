import { SCOPE_LABEL, type ContentScope } from '../shared/content';

/**
 * Says who a guide is for, before someone spends four minutes finding out.
 *
 * The knowledge layer is a mix: a third of it describes Indian statute, most of
 * the rest is portable reasoning that happens to price its examples in rupees,
 * and the careers half was never about one country at all. Until now a reader
 * could only tell which was which by reading — so somebody arriving from a
 * search in Toronto got three paragraphs into the old-versus-new tax regime
 * before discovering it was about a country they do not file in.
 *
 * The badge is deliberately not a warning. `'in-examples'` guides are good
 * guides for anyone; saying "examples in ₹" sets an expectation rather than
 * turning a reader away. Only `'in-only'` says stop.
 */
export function ScopeBadge({ scope, size = 'sm' }: { scope?: ContentScope; size?: 'sm' | 'md' }) {
  if (!scope) return null;
  const label = SCOPE_LABEL[scope];
  const strong = scope === 'in-only';

  return (
    <span
      title={label.long}
      className={[
        'inline-flex items-center gap-1 rounded-full border font-mono uppercase tracking-[0.1em]',
        size === 'md' ? 'px-2.5 py-1 text-[10px]' : 'px-2 py-0.5 text-[9px]',
        strong
          ? 'border-[color:var(--accent-text)]/40 bg-[color:var(--accent-text)]/10 text-accent-text'
          : 'border-hairline text-ink-3',
      ].join(' ')}
    >
      <span aria-hidden="true">{strong ? '🇮🇳' : '₹'}</span>
      {label.short}
    </span>
  );
}

/**
 * The same information as a sentence, for the top of an article where there is
 * room to say what it actually means for the reader in front of it.
 */
export function ScopeNote({ scope }: { scope?: ContentScope }) {
  if (!scope) return null;
  return (
    <p
      className="mt-4 rounded-[12px] border border-hairline px-4 py-3 text-[13.5px] leading-[1.65] text-ink-2"
      role="note"
    >
      <b className="text-ink">{SCOPE_LABEL[scope].short}.</b> {SCOPE_LABEL[scope].long}
    </p>
  );
}
