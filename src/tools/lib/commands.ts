/**
 * The command registry behind ⌘K — every place you can go and every thing you
 * can do in the money workspace, as data.
 *
 * WHY
 * ---
 * The workspace has grown to eleven screens, thirty-nine display currencies,
 * two themes and a knowledge library of its own. Reaching any of them costs a
 * scan of the tab bar, a drawer, or a trip through the footer — and on a phone
 * the tab bar hides most of it behind "More". A single keyboard-first surface
 * collapses all of that into one interaction: type what you want, press Enter.
 *
 * CONTRACT
 * --------
 * Pure and framework-free — no React, no DOM. Commands describe an *effect*
 * rather than closing over a handler, so the whole registry can be built,
 * searched and asserted in a unit test, and so one component owns the single
 * place where an effect actually happens.
 *
 * NOT a calculation change. Nothing here computes money. The one command that
 * touches the ledger ("log a spend") only carries the words the user typed into
 * the Expense Tracker's own quick-add line, which still previews and commits it
 * through the existing path — the palette never writes a transaction itself.
 */
import { TOOLS } from '../../lib/tools';
import { CAREERS_ROUTES } from '../../careers/constants';
import { TOPICS, ARTICLES, topicPath, articlePath } from '../../shared/content';
import { CURRENCY_CODES, currencySym } from './format';
import { parseQuickAdd } from './quickAdd';
import { getJSON, setJSON } from './storage';
import type { IconName } from '../ui/Icon';

/** Section a command is listed under. Also drives the visual grouping. */
export type CommandGroup =
  | 'Actions'
  | 'Tools'
  | 'Workspace'
  | 'Careers'
  | 'Learn'
  | 'Currency'
  | 'Account';

/**
 * What running a command does. A closed union rather than a callback so the
 * registry stays serialisable and testable, and so every side effect in the
 * palette is applied in one reviewed place (`CommandPalette`).
 */
export type CommandEffect =
  | { kind: 'navigate'; to: string }
  | { kind: 'theme'; theme: 'light' | 'dark' }
  | { kind: 'currency'; code: string }
  /** Open the Expense Tracker with its quick-add line seeded and focused. */
  | { kind: 'logSpend'; text: string }
  | { kind: 'signOut' };

export interface Command {
  /** Stable across sessions — recents are stored by id. */
  id: string;
  title: string;
  /** One line of context. Never repeats the title. */
  subtitle?: string;
  group: CommandGroup;
  icon: IconName;
  effect: CommandEffect;
  /**
   * Extra words that should find this command but do not belong in its label —
   * synonyms ("dark mode" → theme), old names, and the vocabulary someone
   * arrives with rather than the one the product happens to use.
   */
  keywords?: readonly string[];
  /**
   * Show in the empty-query list. Reserved for the handful of destinations that
   * are worth offering before the user has typed anything; everything else is
   * one keystroke away and stays out of the way until then.
   */
  promoted?: boolean;
}

export interface CommandContext {
  /** Drives sign in vs sign out, and whether account commands make sense. */
  signedIn: boolean;
  /** Active display currency — the current one is not offered as a switch. */
  currency: string;
  /** Active theme — only the *other* one is offered. */
  theme: 'light' | 'dark';
}

const TOOL_ICON: Record<string, IconName> = {
  budget: 'budget',
  expenses: 'expense',
  investmatch: 'invest',
  parksmart: 'park',
  peercompare: 'peer',
  goals: 'goal',
  lifemap: 'lifemap',
};

/**
 * Search words for each calculator that the tool's own name never contains.
 *
 * A first-time visitor types the job ("rent", "sip", "retirement"), not the
 * product name — a palette that only matches its own labels is a menu with
 * extra steps.
 */
const TOOL_KEYWORDS: Record<string, readonly string[]> = {
  budget: ['50/30/20', 'income', 'salary', 'allocate', 'needs', 'wants', 'savings', 'plan'],
  expenses: ['spend', 'spending', 'transactions', 'log', 'ledger', 'tracker', 'receipts'],
  investmatch: ['portfolio', 'risk', 'equity', 'debt', 'allocation', 'mutual fund', 'sip'],
  parksmart: ['idle cash', 'fd', 'fixed deposit', 'liquid fund', 'savings account', 'post tax'],
  peercompare: ['benchmark', 'peers', 'percentile', 'average', 'how do i compare'],
  goals: ['target', 'sip', 'monthly saving', 'reverse', 'corpus', 'down payment'],
  lifemap: ['simulate', 'projection', 'retirement', 'timeline', 'forecast'],
  networth: ['assets', 'liabilities', 'debt', 'balance sheet', 'what i own', 'loans', 'wealth'],
};

/** The workspace screens that are not calculators. */
const WORKSPACE: readonly { id: string; title: string; subtitle: string; icon: IconName; keywords: readonly string[] }[] = [
  { id: 'dashboard', title: 'Dashboard', subtitle: 'Everything at a glance', icon: 'pie', keywords: ['home', 'hub', 'overview', 'summary'] },
  { id: 'reports', title: 'Reports', subtitle: 'Export a full financial report', icon: 'layers', keywords: ['pdf', 'export', 'download', 'statement', 'summary'] },
  { id: 'calendar', title: 'Calendar', subtitle: 'Bills, SIPs and goal dates', icon: 'clock', keywords: ['bills', 'due', 'upcoming', 'month', 'schedule'] },
  { id: 'settings', title: 'Settings', subtitle: 'Data, sync and preferences', icon: 'shield', keywords: ['preferences', 'privacy', 'reset', 'delete data', 'sync'] },
];

/** Careers workspace destinations worth reaching from the money side. */
const CAREERS: readonly { title: string; to: string; keywords: readonly string[] }[] = [
  { title: 'Careers dashboard', to: CAREERS_ROUTES.dashboard, keywords: ['job', 'work'] },
  { title: 'Resume library', to: CAREERS_ROUTES.resumes, keywords: ['cv', 'resume'] },
  { title: 'Job search', to: CAREERS_ROUTES.jobs, keywords: ['roles', 'openings', 'vacancies'] },
  { title: 'Applications', to: CAREERS_ROUTES.applications, keywords: ['applied', 'pipeline', 'tracker'] },
  { title: 'Interview prep', to: CAREERS_ROUTES.interviews, keywords: ['interview', 'questions', 'star'] },
];

/**
 * Every command available in the workspace, in a deterministic order.
 *
 * Order matters only as the tie-break for equally-scored matches and as the
 * order of the promoted (empty-query) list, so it is written as the order a
 * person would expect to read them in.
 */
export function buildCommands(ctx: CommandContext): Command[] {
  const list: Command[] = [];

  // ── Actions ──────────────────────────────────────────────────────────────
  list.push({
    id: 'action:log-spend',
    title: 'Log a spend',
    subtitle: 'Open the Expense Tracker’s quick-add line',
    group: 'Actions',
    icon: 'plus',
    effect: { kind: 'logSpend', text: '' },
    keywords: ['add expense', 'new transaction', 'record', 'spent', 'quick add'],
    promoted: true,
  });
  const nextTheme = ctx.theme === 'dark' ? 'light' : 'dark';
  list.push({
    id: 'action:theme',
    title: nextTheme === 'light' ? 'Switch to light theme' : 'Switch to dark theme',
    subtitle: `Currently ${ctx.theme}`,
    group: 'Actions',
    icon: 'sun',
    effect: { kind: 'theme', theme: nextTheme },
    keywords: ['dark mode', 'light mode', 'appearance', 'contrast', 'night'],
    promoted: true,
  });

  // ── Tools ────────────────────────────────────────────────────────────────
  for (const t of TOOLS) {
    list.push({
      id: `tool:${t.id}`,
      title: t.name,
      subtitle: t.blurb,
      group: 'Tools',
      icon: TOOL_ICON[t.id] ?? 'pie',
      effect: { kind: 'navigate', to: t.href },
      keywords: TOOL_KEYWORDS[t.id],
      promoted: true,
    });
  }

  // ── Workspace ────────────────────────────────────────────────────────────
  for (const w of WORKSPACE) {
    list.push({
      id: `workspace:${w.id}`,
      title: w.title,
      subtitle: w.subtitle,
      group: 'Workspace',
      icon: w.icon,
      effect: { kind: 'navigate', to: `/tools/${w.id}` },
      keywords: w.keywords,
      promoted: w.id === 'dashboard',
    });
  }

  // ── Careers ──────────────────────────────────────────────────────────────
  for (const c of CAREERS) {
    list.push({
      id: `careers:${c.to}`,
      title: c.title,
      subtitle: 'FinatriX Careers',
      group: 'Careers',
      icon: 'briefcase',
      effect: { kind: 'navigate', to: c.to },
      keywords: c.keywords,
    });
  }

  // ── Learn ────────────────────────────────────────────────────────────────
  // Money cluster only: the palette opens over the money workspace, and a
  // careers article surfacing while someone is mid-budget is noise, not reach.
  list.push({
    id: 'learn:hub',
    title: 'Learn',
    subtitle: 'Guides behind every calculator',
    group: 'Learn',
    icon: 'education',
    effect: { kind: 'navigate', to: '/learn' },
    keywords: ['guides', 'articles', 'help', 'how it works', 'methodology'],
  });
  const moneyTopics = TOPICS.filter((t) => t.cluster === 'money');
  for (const t of moneyTopics) {
    list.push({
      id: `learn:topic:${t.slug}`,
      title: t.name,
      subtitle: t.lede,
      group: 'Learn',
      icon: 'education',
      effect: { kind: 'navigate', to: topicPath(t) },
    });
  }
  const moneyTopicSlugs = new Set(moneyTopics.map((t) => t.slug));
  for (const a of ARTICLES) {
    if (!moneyTopicSlugs.has(a.topic)) continue;
    list.push({
      id: `learn:article:${a.topic}/${a.slug}`,
      title: a.crumb,
      subtitle: a.heading,
      group: 'Learn',
      icon: 'education',
      effect: { kind: 'navigate', to: articlePath(a) },
    });
  }

  // ── Currency ─────────────────────────────────────────────────────────────
  // Never promoted: thirty-nine of them would bury everything else. They exist
  // so "usd" or "dollar" reaches the switch in two keystrokes.
  for (const code of CURRENCY_CODES) {
    if (code === ctx.currency) continue;
    list.push({
      id: `currency:${code}`,
      title: `Display in ${code}`,
      subtitle: `Switch the workspace currency to ${currencySym(code).trim()} ${code}`,
      group: 'Currency',
      icon: 'dollar',
      effect: { kind: 'currency', code },
      keywords: [CURRENCY_NAME[code] ?? '', 'currency', 'symbol'].filter(Boolean),
    });
  }

  // ── Account ──────────────────────────────────────────────────────────────
  list.push({
    id: 'account:home',
    title: 'Back to home',
    subtitle: 'The FinatriX landing page',
    group: 'Account',
    icon: 'home',
    effect: { kind: 'navigate', to: '/' },
    keywords: ['exit', 'landing', 'marketing'],
  });
  if (ctx.signedIn) {
    list.push({
      id: 'account:profile',
      title: 'Profile',
      subtitle: 'Your account details',
      group: 'Account',
      icon: 'users',
      effect: { kind: 'navigate', to: '/profile' },
      keywords: ['account', 'name', 'email'],
    });
    list.push({
      id: 'account:sign-out',
      title: 'Sign out',
      subtitle: 'End this session on this device',
      group: 'Account',
      icon: 'lock',
      effect: { kind: 'signOut' },
      keywords: ['log out', 'logout', 'leave'],
    });
  } else {
    list.push({
      id: 'account:sign-in',
      title: 'Sign in',
      subtitle: 'Sync your data across devices',
      group: 'Account',
      icon: 'lock',
      effect: { kind: 'navigate', to: '/login' },
      keywords: ['log in', 'login', 'account', 'sync'],
    });
  }

  return list;
}

/**
 * Spoken names for the currencies people are most likely to type by word rather
 * than by code. Deliberately partial: a wrong name is worse than none, and any
 * code still matches on the code itself.
 */
const CURRENCY_NAME: Record<string, string> = {
  INR: 'rupee', USD: 'dollar', EUR: 'euro', GBP: 'pound sterling', JPY: 'yen',
  CNY: 'yuan renminbi', AUD: 'australian dollar', CAD: 'canadian dollar',
  CHF: 'swiss franc', SGD: 'singapore dollar', HKD: 'hong kong dollar',
  NZD: 'new zealand dollar', AED: 'dirham', SAR: 'riyal', ZAR: 'rand',
  BRL: 'real', RUB: 'rouble', KRW: 'won', TRY: 'lira', THB: 'baht',
  PHP: 'peso', VND: 'dong', PKR: 'pakistani rupee', BDT: 'taka',
  NGN: 'naira', ILS: 'shekel', SEK: 'krona', NOK: 'krone', DKK: 'krone',
  PLN: 'zloty', HUF: 'forint',
};

/* ─────────────────────────────────────────────────────────────────────────
   Matching
   ───────────────────────────────────────────────────────────────────────── */

const norm = (s: string): string => s.toLowerCase().normalize('NFKD').replace(/\s+/g, ' ').trim();

/**
 * Is `q` a subsequence of `text`, and how tightly packed?
 *
 * Returns a 0–1 density (1 = contiguous) or -1 when it does not match at all.
 * This is what lets "lfmp" find LifeMap and "expt" find Expense Tracker without
 * a dependency: a subsequence with a span penalty is the whole of fuzzy search
 * that a list of a few hundred labels needs.
 */
function subsequenceDensity(q: string, text: string): number {
  if (!q) return -1;
  let i = 0;
  let first = -1;
  let last = -1;
  for (let j = 0; j < text.length && i < q.length; j++) {
    if (text[j] === q[i]) {
      if (first < 0) first = j;
      last = j;
      i++;
    }
  }
  if (i < q.length) return -1;
  const span = last - first + 1;
  return q.length / span;
}

/** Group ordering used only to break exact score ties, so results never jitter. */
const GROUP_RANK: Record<CommandGroup, number> = {
  Actions: 0, Tools: 1, Workspace: 2, Careers: 3, Learn: 4, Currency: 5, Account: 6,
};

/**
 * A thumb on the scale for what the workspace itself can do.
 *
 * "budget" has to open Budget Builder, not the Budgeting guide — both are prefix
 * matches, and without this the shorter title wins on the length tie-break
 * alone. Every weight is far smaller than the gap between two rungs of the
 * ladder below (the narrowest is 60), so this can only ever decide between
 * matches of the SAME strength; it can never float a weak match over a strong
 * one.
 */
const GROUP_WEIGHT: Record<CommandGroup, number> = {
  Actions: 14, Tools: 12, Workspace: 10, Careers: 4, Learn: 0, Currency: 0, Account: 2,
};

/**
 * How well `query` matches `cmd`. Higher is better; -1 means "do not show".
 *
 * The ladder is deliberately coarse and explicit rather than a tuned distance
 * metric: a person can read it and predict what the top hit will be, which is
 * the property a command bar lives or dies on.
 */
export function scoreCommand(query: string, cmd: Command): number {
  const q = norm(query);
  if (!q) return 0;
  const base = textScore(q, cmd);
  return base < 0 ? -1 : base + GROUP_WEIGHT[cmd.group];
}

/** The textual half of the score, with no group preference applied. */
function textScore(q: string, cmd: Command): number {
  const title = norm(cmd.title);
  const subtitle = cmd.subtitle ? norm(cmd.subtitle) : '';

  if (title === q) return 1000;
  // Shorter prefix matches first: typing "budget" should reach "Budget Builder"
  // before "Budget Builder methodology, in full".
  if (title.startsWith(q)) return 800 - Math.min(title.length, 60);
  // Start of any word in the title — "goal" finding "Reverse Goal Planner".
  if (new RegExp(`\\b${escapeRe(q)}`).test(title)) return 640;
  if (title.includes(q)) return 480;

  for (const raw of cmd.keywords ?? []) {
    const k = norm(raw);
    if (!k) continue;
    if (k === q) return 420;
    if (k.startsWith(q)) return 360;
    if (k.includes(q)) return 260;
  }

  if (subtitle.includes(q)) return 180;

  const density = subsequenceDensity(q, title);
  if (density >= 0) return 60 + Math.round(density * 60);
  return -1;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface SearchOptions {
  /** Command ids most recently run, newest first. Boosts, never invents. */
  recents?: readonly string[];
  /** Hard cap on results. The list is keyboard-navigated, so it stays short. */
  limit?: number;
}

/**
 * The visible result list for `query`.
 *
 * With no query this is the recents followed by the promoted commands — a
 * useful first screen rather than an alphabetical dump. With a query it is
 * every command that matches at all, best first.
 */
export function searchCommands(
  query: string,
  commands: readonly Command[],
  { recents = [], limit = 12 }: SearchOptions = {},
): Command[] {
  const rank = new Map<string, number>();
  recents.forEach((id, i) => rank.set(id, recents.length - i));

  if (!norm(query)) {
    const byId = new Map(commands.map((c) => [c.id, c]));
    const out: Command[] = [];
    const seen = new Set<string>();
    for (const id of recents) {
      const c = byId.get(id);
      if (c && !seen.has(id)) {
        out.push(c);
        seen.add(id);
      }
    }
    for (const c of commands) {
      if (out.length >= limit) break;
      if (c.promoted && !seen.has(c.id)) {
        out.push(c);
        seen.add(c.id);
      }
    }
    return out.slice(0, limit);
  }

  const scored = commands
    .map((cmd, index) => ({ cmd, index, score: scoreCommand(query, cmd) }))
    .filter((r) => r.score >= 0)
    // A recently-run command wins a tie with one the user has never touched,
    // but a recency bonus can never outrank a materially better text match.
    .map((r) => ({ ...r, score: r.score + Math.min(rank.get(r.cmd.id) ?? 0, 6) * 5 }));

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      GROUP_RANK[a.cmd.group] - GROUP_RANK[b.cmd.group] ||
      a.index - b.index,
  );
  return scored.slice(0, limit).map((r) => r.cmd);
}

/**
 * The "log this spend" command for a line that reads like a transaction.
 *
 * `parseQuickAdd` is the Expense Tracker's own parser, used here only to decide
 * whether the typed line *looks* like a spend and to echo what it understood.
 * Nothing is computed or stored: running the command hands the raw text to the
 * quick-add line, which previews it and commits through the existing path.
 */
export function spendCommandFor(query: string, now: Date): Command | null {
  const text = query.trim();
  if (!text) return null;
  const parsed = parseQuickAdd(text, now);
  if (!parsed.ok || parsed.amount <= 0) return null;
  return {
    id: 'action:log-spend:parsed',
    title: `Log spend: ${text}`,
    subtitle: parsed.parts.length ? parsed.parts.join(' · ') : 'Opens the quick-add line, ready to confirm',
    group: 'Actions',
    icon: 'zap',
    effect: { kind: 'logSpend', text },
  };
}

/* ─────────────────────────────────────────────────────────────────────────
   Recents
   ───────────────────────────────────────────────────────────────────────── */

const RECENTS_KEY = 'fx_cmd_recents';
const RECENTS_MAX = 5;

/** Command ids most recently run, newest first. Never throws. */
export function loadRecents(): string[] {
  const raw = getJSON<unknown>(RECENTS_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string').slice(0, RECENTS_MAX);
}

/**
 * Record `id` as the newest recent and return the new list.
 *
 * The parsed spend command is deliberately not remembered: its id is stable but
 * its title is the exact words of one past transaction, which is not something
 * to offer back on an empty palette.
 */
export function rememberRecent(id: string): string[] {
  if (id === 'action:log-spend:parsed') return loadRecents();
  const next = [id, ...loadRecents().filter((x) => x !== id)].slice(0, RECENTS_MAX);
  setJSON(RECENTS_KEY, next);
  return next;
}
