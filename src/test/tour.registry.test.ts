import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CHAPTERS, chapterForPath } from '../tour/chapters';

/**
 * The tour's registry is authored by hand, chapter by chapter, often by
 * different people in parallel. These checks are what keep that safe: every
 * chapter routes somewhere real, every step has copy, every anchor it points
 * at exists in the source, and ids (which progress is stored by) never clash.
 */

const srcRoot = join(__dirname, '..');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // The chapters name anchors; they must not count as carrying them.
      if (entry === 'test' || entry === 'chapters') continue;
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const SOURCE = sourceFiles(srcRoot).map((f) => readFileSync(f, 'utf8')).join('\n');

/** Tool ids routed by ToolRoute's page registry (`budget: lazy(...)`). */
const ROUTED_TOOLS = new Set(
  [...readFileSync(join(srcRoot, 'tools/ToolRoute.tsx'), 'utf8').matchAll(/^\s+([a-z]+): lazy\(/gm)].map((m) => m[1]),
);

const ANCHOR = /^\[data-tour="([a-z0-9-]+)"\]$/;

describe('tour registry', () => {
  it('has chapters with unique ids', () => {
    expect(CHAPTERS.length).toBeGreaterThan(0);
    const ids = CHAPTERS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('routes every chapter to a page the app actually serves', () => {
    expect(ROUTED_TOOLS.size).toBeGreaterThan(5); // the parse found the registry
    for (const c of CHAPTERS) {
      const m = /^\/tools\/([a-z]+)$/.exec(c.route);
      expect(m, `${c.id}: route ${c.route} is not a tools route`).not.toBeNull();
      const page = m![1];
      expect(page === 'dashboard' || ROUTED_TOOLS.has(page), `${c.id}: /tools/${page} is not routed`).toBe(true);
      for (const s of c.steps) {
        if (s.route) expect(/^\/tools\/[a-z]+$/.test(s.route), `${c.id}.${s.id}: step route`).toBe(true);
      }
      expect(chapterForPath(c.route)?.id).toBe(c.id);
      expect(chapterForPath(`${c.route}/`)?.id).toBe(c.id);
    }
  });

  it('gives every chapter its card copy, an intro and an honest length', () => {
    for (const c of CHAPTERS) {
      expect(c.title.trim(), c.id).not.toBe('');
      expect(c.tagline.trim(), c.id).not.toBe('');
      expect(c.minutes, c.id).toBeGreaterThanOrEqual(1);
      expect(c.intro.headline.trim(), c.id).not.toBe('');
      expect(c.intro.body.trim(), c.id).not.toBe('');
      expect(typeof c.intro.Art, c.id).toBe('function');
      expect(c.intro.orb.length, c.id).toBeGreaterThan(0);
      expect(c.intro.duration, c.id).toBeGreaterThan(0);
    }
  });

  it('has unique step ids and short, complete copy on every step', () => {
    for (const c of CHAPTERS) {
      const ids = c.steps.map((s) => s.id);
      expect(new Set(ids).size, `${c.id}: duplicate step id`).toBe(ids.length);
      for (const s of c.steps) {
        const where = `${c.id}.${s.id}`;
        expect(/^[a-z][a-z0-9-]*$/.test(s.id), `${where}: id`).toBe(true);
        expect(s.title.trim(), where).not.toBe('');
        expect(s.title.split(/\s+/).length, `${where}: title is 2–6 words`).toBeLessThanOrEqual(6);
        expect(s.body.trim(), where).not.toBe('');
        // 1–2 short sentences. Counted by terminators, so "e.g." style
        // abbreviations should be avoided in tour copy anyway.
        const sentences = s.body.split(/[.!?](?=\s|$)/).filter((x) => x.trim()).length;
        expect(sentences, `${where}: at most two sentences`).toBeLessThanOrEqual(2);
        expect(s.body.length, `${where}: body under 220 characters`).toBeLessThanOrEqual(220);
        if (s.hint) expect(s.hint.length, `${where}: hint`).toBeLessThanOrEqual(120);
      }
    }
  });

  it('points every step at a data-tour anchor that exists in the source', () => {
    for (const c of CHAPTERS) {
      for (const s of c.steps) {
        if (!s.target) continue;
        const m = ANCHOR.exec(s.target);
        expect(m, `${c.id}.${s.id}: target must be [data-tour="…"]`).not.toBeNull();
        const name = m![1];
        // Either a literal data-tour attribute, or a `tour` prop on a shared
        // component, or a literal string handed to one.
        const found = SOURCE.includes(`data-tour="${name}"`) || SOURCE.includes(`tour="${name}"`) || SOURCE.includes(`'${name}'`);
        expect(found, `${c.id}.${s.id}: no element carries data-tour="${name}"`).toBe(true);
      }
    }
  });

  it('ends every chapter with a "what good looks like" step that shows an example', () => {
    for (const c of CHAPTERS) {
      const last = c.steps[c.steps.length - 1];
      expect(last.output, `${c.id}: last step should carry an illustrative output`).toBeTypeOf('function');
    }
  });
});
