import { describe, it, expect } from 'vitest';
import {
  evaluateFormula, formulaAmount, formulaSignedAmount, isFormula, roundAmount,
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

  it('treats a leading = as an explicit formula, even before a bare number', () => {
    expect(isFormula('=10+5')).toBe(true);
    expect(isFormula('=250')).toBe(true); // the prefix itself is the signal
  });
});

/**
 * Spreadsheet muscle memory. `=10+5+3+2` is how anyone who has used Excel
 * starts a calculation, and the key gets pressed before any thought about
 * whether this field is a spreadsheet. It used to be a dead end: `=` is not in
 * the character set, so the whole entry was rejected as invalid.
 */
describe('spreadsheet-style = prefix', () => {
  it('evaluates the form people actually type', () => {
    expect(evaluateFormula('=10+5+3+2')).toMatchObject({ ok: true, value: 20 });
    expect(evaluateFormula('=1200/4')).toMatchObject({ ok: true, value: 300 });
    expect(evaluateFormula('=(100-25)/5')).toMatchObject({ ok: true, value: 15 });
  });

  it('accepts a bare number and a negative behind the prefix', () => {
    // `isExpression` asserted explicitly: `toMatchObject` ignored it, which is
    // how it stayed wrong. The `=` prefix is the signal, so `=250` IS an
    // expression even though what follows is a bare number.
    expect(evaluateFormula('=250')).toMatchObject({ ok: true, value: 250, isExpression: true });
    expect(evaluateFormula('=-500')).toMatchObject({ ok: true, value: -500, isExpression: true });
  });

  it('tolerates whitespace around the prefix', () => {
    expect(evaluateFormula('  = 10 + 5  ')).toMatchObject({ ok: true, value: 15 });
  });

  it('reads a lone = as unfinished, not as a bad character', () => {
    const r = evaluateFormula('=');
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe('This formula is incomplete.');
  });

  it('strips only the leading =, so an = used as an operator still fails', () => {
    // Widening the character set instead would have let this reach the
    // tokenizer and fail with a confusing message.
    const r = evaluateFormula('1=2');
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe('Use only numbers and + − × ÷ ( ).');
    expect(evaluateFormula('==10').ok).toBe(false);
  });

  it('flows through the amount helpers both tools use', () => {
    expect(formulaAmount('=10+5+3+2')).toBe(20);
    expect(formulaSignedAmount('=0-300')).toBe(-300);
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
    // Still the right behaviour for its remaining callers: budget figures. A
    // negative allocation is a typo, not a refund. Ledger entries that CAN be
    // negative use formulaSignedAmount instead.
    expect(formulaAmount('5-10')).toBe(0);
  });
});

describe('formulaSignedAmount', () => {
  it('preserves a negative value so refunds can be recorded', () => {
    expect(formulaSignedAmount('-500')).toBe(-500);
    expect(formulaSignedAmount('5-10')).toBe(-5);
    expect(formulaSignedAmount('-1200/4')).toBe(-300);
  });

  it('behaves like formulaAmount for everything non-negative', () => {
    for (const input of ['120/4', '42', 'nonsense', '', '0']) {
      expect(formulaSignedAmount(input), input).toBe(formulaAmount(input));
    }
  });
});

describe('isExpression reports the original input, not the stripped body', () => {
  it('is true for arithmetic, with or without the = prefix', () => {
    for (const input of ['10+5', '120/4', '(100-25)/5', '=10+5', '=1200/4']) {
      expect(evaluateFormula(input), input).toMatchObject({ ok: true, isExpression: true });
    }
  });

  it('is true for an = prefix on a bare number', () => {
    expect(evaluateFormula('=250')).toMatchObject({ isExpression: true });
    expect(evaluateFormula('  =42  ')).toMatchObject({ isExpression: true });
  });

  it('is false for a plain number or a bare sign', () => {
    for (const input of ['250', '  42 ', '-500', '+30', '12.5']) {
      expect(evaluateFormula(input), input).toMatchObject({ ok: true, isExpression: false });
    }
  });

  it('agrees with isFormula on the same input', () => {
    for (const input of ['250', '=250', '10+5', '=10+5', '-500', '(4)']) {
      const r = evaluateFormula(input);
      if (r.ok) expect(r.isExpression, input).toBe(isFormula(input));
    }
  });
});
