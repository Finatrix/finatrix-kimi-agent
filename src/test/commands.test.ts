import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildCommands, searchCommands, scoreCommand, spendCommandFor,
  loadRecents, rememberRecent, type Command, type CommandContext,
} from '../tools/lib/commands';

const CTX: CommandContext = { signedIn: false, currency: 'INR', theme: 'dark' };
const titles = (list: readonly Command[]) => list.map((c) => c.title);
const find = (list: readonly Command[], id: string) => list.find((c) => c.id === id);

describe('command registry', () => {
  beforeEach(() => localStorage.clear());

  it('offers every calculator and every workspace screen', () => {
    const cmds = buildCommands(CTX);
    for (const name of [
      'Budget Builder', 'Expense Tracker', 'InvestMatch', 'ParkSmart',
      'PeerCompare', 'Reverse Goal Planner', 'LifeMap', 'Net Worth',
    ]) {
      expect(titles(cmds)).toContain(name);
    }
    for (const id of ['dashboard', 'reports', 'calendar', 'settings']) {
      expect(find(cmds, `workspace:${id}`)?.effect).toEqual({ kind: 'navigate', to: `/tools/${id}` });
    }
  });

  it('names the theme the user would be switching TO, not the one they are on', () => {
    expect(find(buildCommands({ ...CTX, theme: 'dark' }), 'action:theme')).toMatchObject({
      title: 'Switch to light theme',
      effect: { kind: 'theme', theme: 'light' },
    });
    expect(find(buildCommands({ ...CTX, theme: 'light' }), 'action:theme')).toMatchObject({
      title: 'Switch to dark theme',
      effect: { kind: 'theme', theme: 'dark' },
    });
  });

  it('never offers a switch to the currency already in use', () => {
    const cmds = buildCommands({ ...CTX, currency: 'USD' });
    expect(find(cmds, 'currency:USD')).toBeUndefined();
    expect(find(cmds, 'currency:INR')?.effect).toEqual({ kind: 'currency', code: 'INR' });
  });

  it('offers sign out only to a signed-in user, and sign in only to everyone else', () => {
    expect(find(buildCommands({ ...CTX, signedIn: true }), 'account:sign-out')).toBeDefined();
    expect(find(buildCommands({ ...CTX, signedIn: true }), 'account:sign-in')).toBeUndefined();
    expect(find(buildCommands(CTX), 'account:sign-in')).toBeDefined();
    expect(find(buildCommands(CTX), 'account:sign-out')).toBeUndefined();
  });

  it('routes every command somewhere real — no empty or relative targets', () => {
    for (const cmd of buildCommands({ ...CTX, signedIn: true })) {
      if (cmd.effect.kind === 'navigate') expect(cmd.effect.to).toMatch(/^\//);
      expect(cmd.title.trim()).not.toBe('');
      expect(cmd.id.trim()).not.toBe('');
    }
  });

  it('gives every command a unique id, so recents can address them', () => {
    const ids = buildCommands({ ...CTX, signedIn: true }).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('searchCommands', () => {
  const cmds = buildCommands(CTX);
  beforeEach(() => localStorage.clear());

  it('puts the exact tool first for its own name', () => {
    expect(searchCommands('lifemap', cmds)[0].title).toBe('LifeMap');
    expect(searchCommands('budget', cmds)[0].title).toBe('Budget Builder');
  });

  it('finds a tool by the job it does, not only by its name', () => {
    expect(titles(searchCommands('portfolio', cmds))).toContain('InvestMatch');
    expect(titles(searchCommands('idle cash', cmds))).toContain('ParkSmart');
    expect(titles(searchCommands('dark mode', cmds))).toContain('Switch to light theme');
  });

  it('matches a word inside a multi-word title', () => {
    expect(titles(searchCommands('goal', cmds))).toContain('Reverse Goal Planner');
  });

  it('tolerates an abbreviation typed as a subsequence', () => {
    expect(titles(searchCommands('lfmp', cmds))).toContain('LifeMap');
  });

  it('reaches a currency by code or by name', () => {
    expect(searchCommands('usd', cmds)[0].effect).toEqual({ kind: 'currency', code: 'USD' });
    expect(titles(searchCommands('dirham', cmds))).toContain('Display in AED');
  });

  it('returns nothing rather than something irrelevant', () => {
    expect(searchCommands('zzzzqqq', cmds)).toEqual([]);
  });

  it('honours the result limit', () => {
    expect(searchCommands('a', cmds, { limit: 5 }).length).toBe(5);
  });

  it('opens on recents, then the promoted commands', () => {
    const out = searchCommands('', cmds, { recents: ['tool:parksmart'], limit: 6 });
    expect(out[0].title).toBe('ParkSmart');
    // No duplicate when a recent is also promoted.
    expect(new Set(out.map((c) => c.id)).size).toBe(out.length);
    // Nothing unpromoted sneaks into the resting list.
    expect(out.slice(1).every((c) => c.promoted)).toBe(true);
  });

  it('ignores a recent id that no longer exists', () => {
    const out = searchCommands('', cmds, { recents: ['tool:deleted-tool'] });
    expect(out.every((c) => c.id !== 'tool:deleted-tool')).toBe(true);
    expect(out.length).toBeGreaterThan(0);
  });

  it('lets recency break a tie without overturning a better text match', () => {
    const withRecency = searchCommands('budget', cmds, { recents: ['tool:expenses'] });
    expect(withRecency[0].title).toBe('Budget Builder');
  });
});

describe('scoreCommand', () => {
  const cmd = buildCommands(CTX).find((c) => c.title === 'LifeMap')!;

  it('ranks exact above prefix above word-start above substring', () => {
    expect(scoreCommand('lifemap', cmd)).toBeGreaterThan(scoreCommand('life', cmd));
    expect(scoreCommand('life', cmd)).toBeGreaterThan(scoreCommand('map', cmd));
    expect(scoreCommand('map', cmd)).toBeGreaterThan(scoreCommand('lfmp', cmd));
  });

  it('is -1 for no match at all, and 0 for an empty query', () => {
    expect(scoreCommand('quarterly', cmd)).toBe(-1);
    expect(scoreCommand('  ', cmd)).toBe(0);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(scoreCommand('  LIFEMAP ', cmd)).toBe(scoreCommand('lifemap', cmd));
  });
});

describe('spendCommandFor', () => {
  const now = new Date(2026, 7, 18);

  it('offers to log a line that reads like a spend', () => {
    const cmd = spendCommandFor('340 lunch yesterday upi', now);
    expect(cmd?.effect).toEqual({ kind: 'logSpend', text: '340 lunch yesterday upi' });
    expect(cmd?.title).toBe('Log spend: 340 lunch yesterday upi');
  });

  it('stays silent for a line with no amount in it', () => {
    expect(spendCommandFor('lifemap', now)).toBeNull();
    expect(spendCommandFor('   ', now)).toBeNull();
  });

  it('carries the text through untouched — it never computes or stores anything', () => {
    const cmd = spendCommandFor('120/4 coffee', now);
    expect(cmd?.effect).toEqual({ kind: 'logSpend', text: '120/4 coffee' });
  });
});

describe('recents', () => {
  beforeEach(() => localStorage.clear());

  it('remembers newest first, without duplicates, capped at five', () => {
    ['a', 'b', 'c', 'd', 'e', 'f'].forEach(rememberRecent);
    expect(loadRecents()).toEqual(['f', 'e', 'd', 'c', 'b']);
    rememberRecent('c');
    expect(loadRecents()).toEqual(['c', 'f', 'e', 'd', 'b']);
  });

  it('does not remember the parsed spend command — its title is one past line', () => {
    rememberRecent('tool:budget');
    rememberRecent('action:log-spend:parsed');
    expect(loadRecents()).toEqual(['tool:budget']);
  });

  it('survives corrupt storage', () => {
    localStorage.setItem('fx_cmd_recents', '{"not":"an array"}');
    expect(loadRecents()).toEqual([]);
    localStorage.setItem('fx_cmd_recents', 'not json at all');
    expect(loadRecents()).toEqual([]);
  });
});
