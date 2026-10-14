import { describe, expect, it } from 'vitest';
import { MIDDAY_LINES, MORNING_LINES, dayNumber, lineForDay } from '../tools/lib/dailyLines';

const pools = { morning: MORNING_LINES, midday: MIDDAY_LINES };

describe.each(Object.entries(pools))('the %s lines', (_name, lines) => {
  it('are plenty: a couple of months before any comes round again', () => {
    expect(lines.length).toBeGreaterThanOrEqual(60);
  });

  it('are all different', () => {
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('fit on a lock screen in a line or two', () => {
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(90);
  });

  it('are tidy sentences', () => {
    for (const line of lines) {
      expect(line).toBe(line.trim());
      expect(line).not.toMatch(/ {2}/);
      expect(line).toMatch(/[.?]$/);
      expect(line[0]).toMatch(/[A-Z]/);
    }
  });

  it('carry no figure, no currency and no emoji', () => {
    for (const line of lines) {
      expect(line).not.toMatch(/\d/);
      expect(line).not.toMatch(/[₹$£€]/);
      expect(line).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it('promise no return and tell nobody what to buy', () => {
    for (const line of lines) {
      expect(line).not.toMatch(/\bguarantee[sd]?\b|\brisk[- ]free\b|\bget rich\b|\bsure thing\b|\binvest in\b/i);
    }
  });
});

describe('the two pools', () => {
  it('share no line', () => {
    expect(new Set([...MORNING_LINES, ...MIDDAY_LINES]).size).toBe(MORNING_LINES.length + MIDDAY_LINES.length);
  });
});

describe('lineForDay', () => {
  const START = 20_000;

  it.each(Object.entries(pools))('uses every %s line once before any repeats', (_name, lines) => {
    const seen = Array.from({ length: lines.length }, (_, d) => lineForDay(lines, START + d));
    expect(new Set(seen).size).toBe(lines.length);
  });

  it.each(Object.entries(pools))('never gives the %s line twice in a row, including where a pass ends', (_name, lines) => {
    for (let d = START; d < START + lines.length * 3; d += 1) {
      expect(lineForDay(lines, d + 1)).not.toBe(lineForDay(lines, d));
    }
  });

  it('is the same for the same day', () => {
    expect(lineForDay(MORNING_LINES, START)).toBe(lineForDay(MORNING_LINES, START));
  });

  it('copes with a day before 1970 without reaching outside the list', () => {
    for (const d of [-1, -365, -100_000]) expect(MORNING_LINES).toContain(lineForDay(MORNING_LINES, d));
  });

  it('works for a list of any size, not just these', () => {
    for (const size of [1, 2, 7, 12, 30, 49, 64, 100]) {
      const list = Array.from({ length: size }, (_, i) => `line ${i}`);
      const seen = Array.from({ length: size }, (_, d) => lineForDay(list, START + d));
      expect(new Set(seen).size).toBe(size);
    }
  });
});

describe('dayNumber', () => {
  it('is the same whatever the time of day', () => {
    expect(dayNumber(new Date(2026, 9, 7, 0, 5))).toBe(dayNumber(new Date(2026, 9, 7, 23, 59)));
  });

  it('goes up by exactly one for each calendar day, across clock changes and a year end', () => {
    let day = new Date(2026, 0, 1, 12, 0);
    let previous = dayNumber(day);
    for (let i = 0; i < 800; i += 1) {
      day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, 12, 0);
      const current = dayNumber(day);
      expect(current - previous).toBe(1);
      previous = current;
    }
  });
});
