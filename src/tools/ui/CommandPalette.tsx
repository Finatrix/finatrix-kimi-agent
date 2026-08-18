import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useOptionalCurrency } from '../CurrencyContext';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { track } from '../../lib/analytics';
import { Icon } from './Icon';
import { useOptionalToast } from './Toast';
import {
  buildCommands, searchCommands, spendCommandFor, loadRecents, rememberRecent,
  type Command, type CommandGroup,
} from '../lib/commands';

/**
 * ⌘K — one keyboard-first way to reach anything in the money workspace.
 *
 * WHY
 * ---
 * Everything the workspace can do was reachable only by pointing at it: eleven
 * screens across a tab bar that collapses to "More" on a phone, a currency
 * select in the app bar, a theme toggle beside it, and a library of guides
 * behind the footer. Frequency of use varies enormously between people, so no
 * fixed navigation ranks correctly for everyone. A command bar sidesteps the
 * problem: the ranking is the query.
 *
 * ACCESSIBILITY
 * -------------
 * The APG combobox pattern, in full. Focus never leaves the input — the active
 * option is conveyed with `aria-activedescendant`, so a screen reader announces
 * each result as it is arrowed to without the caret leaving the search field.
 * The result count is announced through a polite live region, Escape closes,
 * focus returns to whatever opened it, and Tab cycles only between the input
 * and the close button so the dialog cannot be escaped by tabbing.
 *
 * NOT a calculation change: every effect here navigates, or flips a display
 * preference the app already exposes. The one ledger-adjacent command hands the
 * typed line to the Expense Tracker's quick-add field, which still previews it
 * and commits it through the existing path.
 */

const LIST_ID = 'fx-cmdk-list';
const optionId = (i: number) => `fx-cmdk-opt-${i}`;

/** Order the visible groups appear in. Only groups with results are rendered. */
const GROUP_ORDER: readonly CommandGroup[] = [
  'Actions', 'Tools', 'Workspace', 'Careers', 'Learn', 'Currency', 'Account',
];

/**
 * Mounting IS opening: the shell renders this only while the palette is open,
 * so first-run state is initial state and there is no closed branch to keep
 * consistent (or to leave a stale query sitting in).
 */
export default function CommandPalette({
  onClose,
  surface = 'money',
}: {
  onClose: () => void;
  /** Which workspace opened it — decides what the resting list offers first. */
  surface?: 'money' | 'careers';
}) {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  // Optional: the Careers shell has no currency, and a palette that threw there
  // would be a shell-level control that only works on half the product.
  const currency = useOptionalCurrency();
  const toast = useOptionalToast();

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [recents, setRecents] = useState<string[]>(loadRecents);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useBodyScrollLock(true);

  const commands = useMemo(
    () => buildCommands({ signedIn: !!user, currency: currency?.code ?? null, theme, surface }),
    [user, currency?.code, theme, surface],
  );

  const results = useMemo(() => {
    const hits = searchCommands(query, commands, { recents });
    // A line that reads like a transaction ("340 lunch yesterday upi") gets its
    // own top result. It is computed from the query rather than stored, so it
    // is offered only while the line still parses as a spend.
    const spend = spendCommandFor(query, new Date());
    return spend ? [spend, ...hits.filter((c) => c.effect.kind !== 'logSpend')] : hits;
  }, [query, commands, recents]);

  // Remember what opened us, then take the caret. Focus lands after paint so
  // the browser does not scroll the page behind the overlay while the dialog is
  // still being laid out.
  useEffect(() => {
    opener.current = document.activeElement as HTMLElement | null;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  // Return focus to the trigger, but only when it is still in the document and
  // focus has not already moved on (a command that navigated owns focus now).
  const close = useCallback(() => {
    onClose();
    const el = opener.current;
    if (el && document.contains(el)) el.focus?.();
  }, [onClose]);

  const run = useCallback(
    (cmd: Command) => {
      track('command_run', { action: cmd.id, kind: cmd.effect.kind });
      setRecents(rememberRecent(cmd.id));
      onClose();
      const effect = cmd.effect;
      switch (effect.kind) {
        case 'navigate':
          navigate(effect.to);
          break;
        case 'logSpend':
          navigate(`/tools/expenses?add=${encodeURIComponent(effect.text)}`);
          break;
        case 'theme':
          setTheme(effect.theme);
          toast?.notify(`${effect.theme === 'light' ? 'Light' : 'Dark'} theme on`, 'ok');
          break;
        case 'currency':
          currency?.setCode(effect.code);
          toast?.notify(`Now showing amounts in ${effect.code}`, 'ok');
          break;
        case 'signOut':
          void signOut();
          break;
      }
    },
    [currency, navigate, onClose, setTheme, signOut, toast],
  );

  // Keep the active option in view as it moves under the arrow keys.
  useEffect(() => {
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        close();
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (results.length) setActive((i) => (i + 1) % results.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (results.length) setActive((i) => (i - 1 + results.length) % results.length);
        break;
      case 'Home':
        if (results.length) { e.preventDefault(); setActive(0); }
        break;
      case 'End':
        if (results.length) { e.preventDefault(); setActive(results.length - 1); }
        break;
      case 'Enter': {
        const cmd = results[active];
        if (cmd) { e.preventDefault(); run(cmd); }
        break;
      }
      case 'Tab': {
        // Two focusable elements, so the trap is a two-step cycle rather than a
        // generic sentinel dance.
        e.preventDefault();
        (document.activeElement === closeRef.current ? inputRef : closeRef).current?.focus();
        break;
      }
    }
  };

  // Group the flat, already-ranked result list without reordering it: a group
  // appears where its best result ranked, and options keep their global index
  // so `aria-activedescendant` and the arrow keys agree with what is on screen.
  const groups = GROUP_ORDER
    .map((g) => ({
      group: g,
      items: results
        .map((cmd, index) => ({ cmd, index }))
        .filter((r) => r.cmd.group === g),
    }))
    .filter((g) => g.items.length > 0)
    .sort((a, b) => a.items[0].index - b.items[0].index);

  return createPortal(
    <div className="fx-cmdk-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <style>{STYLES}</style>
      <div
        className="fx-cmdk"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={onKeyDown}
      >
        <div className="fx-cmdk-head">
          <Icon name="compass" size={17} className="fx-cmdk-lead" />
          <input
            ref={inputRef}
            className="fx-cmdk-input"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={LIST_ID}
            aria-autocomplete="list"
            aria-activedescendant={results.length ? optionId(active) : undefined}
            aria-label="Search tools, guides and actions"
            placeholder="Search or type a spend — “340 lunch yesterday upi”"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
          />
          <button ref={closeRef} type="button" className="fx-cmdk-close" onClick={close}>
            Esc
          </button>
        </div>

        <div className="fx-cmdk-list" id={LIST_ID} role="listbox" aria-label="Results" ref={listRef}>
          {groups.map(({ group, items }) => (
            <div key={group} role="group" aria-labelledby={`fx-cmdk-g-${group}`}>
              <div className="fx-cmdk-group" id={`fx-cmdk-g-${group}`}>{group}</div>
              {items.map(({ cmd, index }) => (
                <div
                  key={cmd.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === active}
                  className={`fx-cmdk-opt${index === active ? ' on' : ''}`}
                  onMouseMove={() => setActive(index)}
                  onClick={() => run(cmd)}
                >
                  <Icon name={cmd.icon} size={16} className="fx-cmdk-ic" />
                  <span className="fx-cmdk-text">
                    <span className="fx-cmdk-title">{cmd.title}</span>
                    {cmd.subtitle && <span className="fx-cmdk-sub">{cmd.subtitle}</span>}
                  </span>
                  {index === active && <span className="fx-cmdk-enter" aria-hidden="true">↵</span>}
                </div>
              ))}
            </div>
          ))}
          {results.length === 0 && (
            <p className="fx-cmdk-empty">
              Nothing matches “{query.trim()}”. Try a tool name, a guide, a currency — or type an
              amount to log a spend.
            </p>
          )}
        </div>

        <p className="fx-cmdk-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> to move</span>
          <span><kbd>↵</kbd> to open</span>
          <span><kbd>Esc</kbd> to close</span>
        </p>
        <p className="sr-only" role="status" aria-live="polite">
          {results.length === 0
            ? 'No results'
            : `${results.length} result${results.length === 1 ? '' : 's'}`}
        </p>
      </div>
    </div>,
    document.body,
  );
}

const STYLES = `
.fx-cmdk-overlay{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.5);
  backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);
  display:flex;align-items:flex-start;justify-content:center;padding:10vh 16px 16px;}
.fx-cmdk{width:min(640px,100%);max-height:min(70vh,560px);display:flex;flex-direction:column;
  background:var(--card-solid);border:1px solid var(--hair);border-radius:16px;
  box-shadow:0 24px 60px -20px rgba(0,0,0,.6);overflow:hidden;
  animation:fx-cmdk-in .16s var(--ease-in-out) both;}
@keyframes fx-cmdk-in{from{opacity:0;transform:translateY(-6px) scale(.99)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.fx-cmdk{animation:none}}
.fx-cmdk-head{display:flex;align-items:center;gap:10px;padding:12px 12px 12px 14px;
  border-bottom:1px solid var(--hair2);}
.fx-cmdk-lead{color:var(--ink3);flex:0 0 auto;}
.fx-cmdk-input{flex:1 1 auto;min-width:0;background:transparent;border:0;outline:none;
  color:var(--ink);font:inherit;font-size:15px;padding:4px 0;}
.fx-cmdk-input::placeholder{color:var(--ink3);}
.fx-cmdk-close{flex:0 0 auto;font-family:var(--mono,ui-monospace,monospace);font-size:11px;
  letter-spacing:.06em;color:var(--ink3);background:var(--fill-05);border:1px solid var(--hair2);
  border-radius:6px;padding:4px 8px;cursor:pointer;min-height:24px;}
.fx-cmdk-close:hover{color:var(--ink);}
.fx-cmdk-close:focus-visible,.fx-cmdk-input:focus-visible{box-shadow:var(--ring-gold);border-radius:6px;}
.fx-cmdk-list{overflow-y:auto;padding:6px;flex:1 1 auto;overscroll-behavior:contain;}
.fx-cmdk-group{font-family:var(--mono,ui-monospace,monospace);font-size:10px;text-transform:uppercase;
  letter-spacing:.12em;color:var(--ink3);padding:10px 10px 6px;}
.fx-cmdk-opt{display:flex;align-items:center;gap:11px;padding:9px 10px;border-radius:10px;
  cursor:pointer;min-height:44px;}
.fx-cmdk-opt.on{background:var(--gold-bg);}
.fx-cmdk-ic{color:var(--ink3);flex:0 0 auto;}
.fx-cmdk-opt.on .fx-cmdk-ic{color:var(--gold);}
.fx-cmdk-text{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1 1 auto;}
.fx-cmdk-title{font-size:14px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.fx-cmdk-sub{font-size:12px;color:var(--ink3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.fx-cmdk-enter{color:var(--gold);font-size:13px;flex:0 0 auto;}
.fx-cmdk-empty{padding:22px 14px;color:var(--ink2);font-size:13.5px;line-height:1.55;}
.fx-cmdk-foot{display:flex;gap:16px;flex-wrap:wrap;padding:9px 14px;border-top:1px solid var(--hair2);
  font-size:11px;color:var(--ink3);margin:0;}
.fx-cmdk-foot kbd{font-family:var(--mono,ui-monospace,monospace);border:1px solid var(--hair2);
  border-radius:4px;padding:0 4px;margin-right:3px;background:var(--fill-05);}
@media (max-width:520px){.fx-cmdk-overlay{padding:6vh 10px 10px;}.fx-cmdk{max-height:82vh;}}
`;
