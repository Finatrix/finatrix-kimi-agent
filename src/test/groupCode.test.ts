import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GROUP_CODE_ALPHABET, normalizeGroupCode } from '../../supabase/functions/group-join/code';
import {
  formatGroupCode, groupInviteUrl, joinCodeFromSearch, normalizeGroupCode as appNormalize, readJoinInput,
} from '../lib/groupCode';

/**
 * Group room codes (build step 2.2): six characters of Crockford base32, shown
 * as FX-7K2P9Q. The edge function reads whatever people type; the database
 * draws and stores the codes. Both must agree on the alphabet, or a valid
 * code could be refused, or an impossible one looked up.
 */
const migration = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '20261124000100_groups.sql'),
  'utf8',
);

describe('group room codes', () => {
  it('reads a code however it was typed, pasted or shown', () => {
    expect(normalizeGroupCode('FX-7K2P9Q')).toBe('7K2P9Q');
    expect(normalizeGroupCode('fx-7k2p9q')).toBe('7K2P9Q');
    expect(normalizeGroupCode('7K2P9Q')).toBe('7K2P9Q');
    expect(normalizeGroupCode(' FX 7K2 P9Q ')).toBe('7K2P9Q');
    // A chat app turned the hyphen into an en dash.
    expect(normalizeGroupCode('FX–7K2P9Q')).toBe('7K2P9Q');
  });

  it('reads the letters Crockford leaves out the way they were meant', () => {
    expect(normalizeGroupCode('FX-7K2P9O')).toBe('7K2P90');
    expect(normalizeGroupCode('I1L1AB')).toBe('1111AB');
  });

  it('keeps a bare six-character code that happens to start with FX', () => {
    expect(normalizeGroupCode('FX12AB')).toBe('FX12AB');
  });

  it('refuses anything that cannot be a code', () => {
    for (const bad of ['', 'FX-', '7K2P9', '7K2P9QQ', 'UUUUUU', '7K2P9!', 'FX-FX-7K2P9Q', 'x'.repeat(100), null, 42, {}]) {
      expect(normalizeGroupCode(bad)).toBeNull();
    }
  });

  it('uses exactly the alphabet the database draws and stores', () => {
    expect(GROUP_CODE_ALPHABET).toHaveLength(32);
    expect(new Set(GROUP_CODE_ALPHABET).size).toBe(32);
    expect(migration.match(/v_alphabet constant text := '([0-9A-Z]+)'/)?.[1]).toBe(GROUP_CODE_ALPHABET);

    const storedClass = migration.match(/code ~ '\^\[([^\]]+)\]\{6\}\$'/)?.[1];
    expect(storedClass).toBe('0-9A-HJKMNP-TV-Z');
    const stored = new RegExp(`^[${storedClass}]$`);
    for (const ch of '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      expect(stored.test(ch)).toBe(GROUP_CODE_ALPHABET.includes(ch));
    }
  });
});

/**
 * Step 2.3: the app reads codes before it asks the server, with its own copy of
 * the rule (src/lib/groupCode.ts). The two must give the same answer for every
 * input, or the app could refuse a code the server would take, or send one the
 * server can only refuse.
 */
describe('the app reads codes exactly as the server does', () => {
  const samples: unknown[] = [
    'FX-7K2P9Q', 'fx-7k2p9q', '7K2P9Q', ' FX 7K2 P9Q ', 'FX–7K2P9Q', 'FX—7K2P9Q', 'FX_7K2.P9Q', 'FX-7K2P9O',
    'I1L1AB', 'FX12AB', 'FXFX12', 'FX-FX12AB', '', 'FX-', '7K2P9', '7K2P9QQ', 'UUUUUU', '7K2P9!', 'FX-FX-7K2P9Q',
    'x'.repeat(32), 'x'.repeat(33), 'ﬀ1234', 'ß12345', '\u00007K2P9Q', '7K2P9Q\n', null, undefined, 42, {}, [],
  ];

  it('agrees on a corpus of awkward inputs', () => {
    for (const input of samples) expect(appNormalize(input)).toBe(normalizeGroupCode(input));
  });

  it('agrees on thousands of random strings', () => {
    const pool = `${GROUP_CODE_ALPHABET}abcdefghijklmnopqrstuvwxyzILOU -–_.!fFxX\t`;
    let seed = 7;
    const next = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let i = 0; i < 5000; i += 1) {
      const length = Math.floor(next() * 12);
      let s = '';
      for (let j = 0; j < length; j += 1) s += pool[Math.floor(next() * pool.length)];
      if (next() < 0.3) s = `FX-${s}`;
      expect(appNormalize(s)).toBe(normalizeGroupCode(s));
    }
  });

  it('builds the invite link under /tools, which both apps already claim', () => {
    const url = new URL(groupInviteUrl('7K2P9Q'));
    expect(url.origin).toBe('https://finatrix.co');
    expect(url.pathname).toBe('/tools/groups');
    expect(url.searchParams.get('join')).toBe('FX-7K2P9Q');
    expect(formatGroupCode('7K2P9Q')).toBe('FX-7K2P9Q');
    expect(joinCodeFromSearch(url.search)).toBe('7K2P9Q');
  });

  it('reads a pasted code or a pasted invite link, and nothing else', () => {
    expect(readJoinInput(' fx-7k2p9q ')).toBe('7K2P9Q');
    expect(readJoinInput('Join us on FinatriX https://finatrix.co/tools/groups?join=FX-7K2P9Q')).toBe('7K2P9Q');
    expect(readJoinInput('https://www.finatrix.co/tools/groups/?join=7k2p9q')).toBe('7K2P9Q');
    expect(readJoinInput('https://evil.example/tools/groups?join=FX-7K2P9Q')).toBeNull();
    expect(readJoinInput('https://finatrix.co/tools/budget?join=FX-7K2P9Q')).toBeNull();
    expect(readJoinInput('hello')).toBeNull();
  });
});
