import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SECTION_COLOR, SECTION_FILL } from '../tools/lib/sectionColors';

/**
 * Guards the single source of truth for budget-section colour.
 *
 * This map used to live inline in five components, and the copies had drifted:
 * two of them painted Wants with the brand gold instead of the amber every
 * other surface used, so the same category was a different colour depending on
 * which screen you were on. A value that is cheap to copy will be copied, so
 * the structural assertion below matters more than the value ones.
 */

const TOOLS = resolve(process.cwd(), 'src/tools');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.tsx?$/.test(entry) ? [p] : [];
  });
}

describe('budget section colours', () => {
  it('covers all three sections in both roles', () => {
    expect(Object.keys(SECTION_COLOR).sort()).toEqual(['needs', 'save', 'wants']);
    expect(Object.keys(SECTION_FILL).sort()).toEqual(['needs', 'save', 'wants']);
  });

  /**
   * Wants is amber, never the brand gold. Gold is the FinatriX accent; spending
   * it on one of three budget bands both weakens the brand signal and makes the
   * bands rely on brightness alone to be told apart.
   */
  it('keeps Wants on the amber token, not the brand gold', () => {
    expect(SECTION_COLOR.wants).toBe('var(--wants)');
    expect(SECTION_FILL.wants).toBe('var(--wants-fill)');
    for (const v of [...Object.values(SECTION_COLOR), ...Object.values(SECTION_FILL)]) {
      expect(v).not.toBe('var(--gold)');
    }
  });

  it('routes text to the AA tokens and fills to the -fill tokens', () => {
    for (const v of Object.values(SECTION_COLOR)) expect(v).not.toMatch(/-fill\)/);
    for (const v of Object.values(SECTION_FILL)) expect(v).toMatch(/-fill\)/);
  });

  /**
   * The structural guard: no component may re-declare the map locally. Without
   * this, the next component to need a section colour copies the object literal
   * from its neighbour and the drift starts over.
   */
  it('is not re-declared anywhere under src/tools', () => {
    const offenders = walk(TOOLS)
      .filter((f) => !f.endsWith(join('lib', 'sectionColors.ts')))
      .filter((f) => /const\s+(SECTION_COLOR|CAT_COLOR|SECTION_FILL)\s*[:=]/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(TOOLS.length + 1));

    expect(offenders, `re-declared in: ${offenders.join(', ')}`).toEqual([]);
  });
});
