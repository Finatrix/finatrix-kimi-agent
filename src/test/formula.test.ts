import { describe, it, expect } from 'vitest';
import {
  evaluateFormula, formulaAmount, isFormula, roundAmount,
} from '../tools/lib/formula';

/**
 * The amount field accepts arithmetic, which means untrusted text reaches an
 * evaluator on every keystroke. These tests pin two things: the maths is right,
 * and there is no path from a keystroke to code execution.
 */

const value = (src: string) => {
  const r = evaluateFormula(src);
  if (!r.ok) throw new Error(`expected ${src} to evaluate, got: ${r.error}`);
  return r.value;
};

const error = (src: string) => {
  const r = evaluateFormula(src);
  if (r.ok) throw new Error(`expected ${src} to be rejected, got ${r.value}`);
  return r.error;
};

describe('evaluateFormula — the documented examples', () => {
  it('evaluates every example from the product spec', () => {
    expect(value('10-5')).toBe(5);
    expect(value('10+15')).toBe(25);
    expect(value('100/4')).toBe(25);
    expect(value('25*3')).toBe(75);
    expect(value('(100-25)/5')).toBe(15);
    expect(value('50+(20*2)')).toBe(90);
  });

  it('still accepts a plain number', () => {
    expect(value('42')).toBe(42);
    expect(value('42.5')).toBe(42.5);
    expect(value('  7  ')).toBe(7);
    expect(value('.5')).toBe(0.5);
  });
});

describe('evaluateFormula — arithmetic correctness', () => {
  it('honours operator precedence', () => {
    expect(value('2+3*4')).toBe(14);
    expect(value('100-10/2')).toBe(95);
    expect(value('(2+3)*4')).toBe(20);
  });

  it('is left-associative for subtraction and division', () => {
    expect(value('100-50-25')).toBe(25);
    expect(value('100/5/2')).toBe(10);
  });

  it('handles nested brackets', () => {
    expect(value('((10+5)*2)/3')).toBe(10);
  });

  it('accepts unary signs', () => {
    expect(value('-5+10')).toBe(5);
    expect(value('+7')).toBe(7);
    expect(value('10*-2')).toBe(-20);
  });

  it('accepts the × and ÷ symbols a phone keyboard offers', () => {
    expect(value('6×7')).toBe(42);
    expect(value('84÷2')).toBe(42);
  });

  it('rounds to the cent a money field can actually hold', () => {
    expect(value('10/3')).toBe(3.33);
    expect(value('0.1+0.2')).toBe(0.3); // not 0.30000000000000004
    expect(roundAmount(2.005)).toBe(2.01);
  });
});

describe('evaluateFormula — refusals', () => {
  it('never evaluates code, only arithmetic', () => {
    // Each of these is valid JavaScript and would do something under eval().
    for (const attack of [
      'alert(1)',
      'window.location',
      '1;alert(1)',
      'constructor',
      '[].constructor',
      'process.exit(0)',
      'fetch("//evil")',
      '`${1}`',
      '1,2',
      'Math.max(1,2)',
    ]) {
      const r = evaluateFormula(attack);
      expect(r.ok, `${attack} must not evaluate`).toBe(false);
    }
  });

  it('names the reason instead of silently coercing', () => {
    expect(error('abc')).toMatch(/only numbers/i);
    expect(error('(1+2')).toMatch(/brackets/i);
    expect(error('1+2)')).toMatch(/brackets/i);
    expect(error('1+')).toMatch(/incomplete/i);
    expect(error('1.2.3')).toMatch(/not valid/i);
    expect(error('10/0')).toMatch(/divide by zero/i);
    expect(error('')).toMatch(/incomplete/i);
  });

  it('refuses an absurdly long expression rather than parsing it', () => {
    expect(error('1+'.repeat(200) + '1')).toMatch(/too long/i);
  });

  it('refuses results that stop being believable amounts', () => {
    expect(error('999999999*999999999')).toMatch(/not a valid amount/i);
  });
});

describe('isFormula', () => {
  it('is true only when the user actually typed arithmetic', () => {
    expect(isFormula('10+5')).toBe(true);
    expect(isFormula('(100-25)/5')).toBe(true);
    expect(isFormula('42')).toBe(false);
    expect(isFormula('42.50')).toBe(false);
    expect(isFormula('-42')).toBe(false); // a signed number is not "a formula"
    expect(isFormula('')).toBe(false);
  });
});

describe('formulaAmount', () => {
  it('gives callers the same "number or nothing" shape they already use', () => {
    expect(formulaAmount('120/4')).toBe(30);
    expect(formulaAmount('42')).toBe(42);
    expect(formulaAmount('nonsense')).toBe(0);
    expect(formulaAmount('')).toBe(0);
  });

  it('clamps negatives to zero, matching Math.max(0, …) elsewhere', () => {
    expect(formulaAmount('5-10')).toBe(0);
  });
});
