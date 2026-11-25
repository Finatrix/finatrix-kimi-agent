import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GROUP_CODE_ALPHABET, normalizeGroupCode } from '../../supabase/functions/group-join/code';

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
