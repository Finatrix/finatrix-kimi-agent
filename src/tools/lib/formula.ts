/**
 * Formula-aware amount parsing.
 *
 * Money is often arithmetic before it is a number: a bill split four ways, a
 * receipt minus the returned item, three coffees at the same price. Typing
 * `120/4` should be as valid as typing `30`.
 *
 * The evaluator is a hand-written tokenizer + recursive-descent parser over a
 * deliberately tiny grammar — numbers, `+ - * /` (with `×` and `÷` accepted as
 * typed aliases), unary sign and parentheses. It never calls `eval`, `Function`
 * or any dynamic-code path, so there is no route from a keystroke to code
 * execution. Anything outside the grammar is refused by name rather than
 * silently coerced.
 *
 * Pure and side-effect free: the same string always produces the same result.
 */

/** The evaluated amount, plus whether the user actually typed arithmetic. */
export interface FormulaOk {
  ok: true;
  value: number;
  /**
   * True when the input was more than a bare number.
   *
   * Documented for years as "drives the live preview". It does not: `AmountInput`
   * calls `isFormula` on the raw string instead, and this field has no callers
   * at all. It was also computed wrongly — from the body AFTER the leading `=`
   * was stripped, so `evaluateFormula('=250').isExpression` was `false`,
   * contradicting the note on `isFormula` three functions below saying the `=`
   * prefix is itself the signal. `toMatchObject` in the tests never asserted it,
   * so nothing caught either problem.
   *
   * Now computed from the original input, so it means what it says if anyone
   * does reach for it.
   */
  isExpression: boolean;
}
export interface FormulaError {
  ok: false;
  /** Sentence-cased, user-facing reason. Never a parser internal. */
  error: string;
}
export type FormulaResult = FormulaOk | FormulaError;

/** Longest expression we will parse. Well past any real receipt maths. */
const MAX_LENGTH = 120;

/** Characters the grammar accepts, before tokenizing. */
const ALLOWED = /^[0-9.+\-*/×÷() \t]*$/;

const OPERATORS = new Set(['+', '-', '*', '/']);

type Token =
  | { t: 'num'; v: number }
  | { t: 'op'; v: '+' | '-' | '*' | '/' }
  | { t: '(' }
  | { t: ')' };

const ERR = {
  chars: 'Use only numbers and + − × ÷ ( ).',
  number: 'That number is not valid.',
  brackets: 'Check the brackets in this formula.',
  incomplete: 'This formula is incomplete.',
  divZero: 'Cannot divide by zero.',
  range: 'That result is not a valid amount.',
  tooLong: 'That formula is too long.',
} as const;

function tokenize(src: string): Token[] | FormulaError {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (c === '(') { tokens.push({ t: '(' }); i++; continue; }
    if (c === ')') { tokens.push({ t: ')' }); i++; continue; }
    if (c === '×') { tokens.push({ t: 'op', v: '*' }); i++; continue; }
    if (c === '÷') { tokens.push({ t: 'op', v: '/' }); i++; continue; }
    if (OPERATORS.has(c)) { tokens.push({ t: 'op', v: c as '+' }); i++; continue; }
    if ((c >= '0' && c <= '9') || c === '.') {
      let j = i;
      let dots = 0;
      while (j < src.length && ((src[j] >= '0' && src[j] <= '9') || src[j] === '.')) {
        if (src[j] === '.') dots++;
        j++;
      }
      const raw = src.slice(i, j);
      // `1.2.3` is a typo, not a number — refusing beats guessing.
      if (dots > 1 || raw === '.') return { ok: false, error: ERR.number };
      const v = Number(raw);
      if (!Number.isFinite(v)) return { ok: false, error: ERR.number };
      tokens.push({ t: 'num', v });
      i = j;
      continue;
    }
    return { ok: false, error: ERR.chars };
  }
  return tokens;
}

/**
 * expr   := term (('+' | '-') term)*
 * term   := unary (('*' | '/') unary)*
 * unary  := ('+' | '-')* primary
 * primary:= number | '(' expr ')'
 */
class Parser {
  private pos = 0;
  private readonly tokens: Token[];

  // Assigned in the body rather than as a parameter property: this project
  // compiles with `erasableSyntaxOnly`, which rejects TypeScript syntax that
  // emits runtime code.
  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token | undefined { return this.tokens[this.pos]; }

  parse(): number {
    const v = this.expr();
    if (this.pos !== this.tokens.length) {
      // A trailing ')' means unbalanced brackets; anything else is a dangling token.
      throw new FormulaFailure(this.peek()?.t === ')' ? ERR.brackets : ERR.incomplete);
    }
    return v;
  }

  private expr(): number {
    let left = this.term();
    for (;;) {
      const tk = this.peek();
      if (tk?.t !== 'op' || (tk.v !== '+' && tk.v !== '-')) return left;
      this.pos++;
      const right = this.term();
      left = tk.v === '+' ? left + right : left - right;
    }
  }

  private term(): number {
    let left = this.unary();
    for (;;) {
      const tk = this.peek();
      if (tk?.t !== 'op' || (tk.v !== '*' && tk.v !== '/')) return left;
      this.pos++;
      const right = this.unary();
      if (tk.v === '*') {
        left = left * right;
      } else {
        if (right === 0) throw new FormulaFailure(ERR.divZero);
        left = left / right;
      }
    }
  }

  private unary(): number {
    const tk = this.peek();
    if (tk?.t === 'op' && (tk.v === '+' || tk.v === '-')) {
      this.pos++;
      const v = this.unary();
      return tk.v === '-' ? -v : v;
    }
    return this.primary();
  }

  private primary(): number {
    const tk = this.peek();
    if (!tk) throw new FormulaFailure(ERR.incomplete);
    if (tk.t === 'num') { this.pos++; return tk.v; }
    if (tk.t === '(') {
      this.pos++;
      const v = this.expr();
      if (this.peek()?.t !== ')') throw new FormulaFailure(ERR.brackets);
      this.pos++;
      return v;
    }
    if (tk.t === ')') throw new FormulaFailure(ERR.brackets);
    throw new FormulaFailure(ERR.incomplete);
  }
}

class FormulaFailure extends Error {}

/** Round to the cent/paisa a money field can actually hold. */
export function roundAmount(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Strip the spreadsheet-style `=` that introduces a formula.
 *
 * `=10+5+3+2` is how anyone who has used Excel starts a calculation, and the
 * habit is strong enough that the leading key is pressed before any thought
 * about whether this field is a spreadsheet. Accepting it costs nothing and
 * removes a dead end.
 *
 * Deliberately stripped rather than added to `ALLOWED`: `=` is only meaningful
 * as a prefix, never as an operator. Widening the charset would let `1=2` reach
 * the tokenizer and fail with a confusing message instead of the honest
 * "Use only numbers and + − × ÷ ( )."
 */
function stripFormulaPrefix(body: string): string {
  return body.startsWith('=') ? body.slice(1).trim() : body;
}

/** True when the input contains arithmetic rather than a plain number. */
export function isFormula(input: string): boolean {
  const body = input.trim();
  if (!body) return false;
  // An explicit `=` says "this is a formula" even when what follows is a bare
  // number, so `=250` still previews and confirms the prefix was understood.
  if (body.startsWith('=')) return true;
  // A leading sign on an otherwise bare number is not "a formula" to the user.
  return /[+\-*/×÷()]/.test(body.replace(/^[+-]/, ''));
}

/**
 * Evaluate an amount field. Returns the numeric value for `42`, `(100-25)/5`
 * and the spreadsheet form `=10+5+3+2` alike; returns a named error for
 * anything the grammar rejects. An empty string is an error (`This formula is
 * incomplete.`) so callers can treat "nothing typed" and "typed nonsense" with
 * the same branch if they wish.
 */
export function evaluateFormula(input: string): FormulaResult {
  const src = String(input ?? '');
  if (src.length > MAX_LENGTH) return { ok: false, error: ERR.tooLong };
  // `=` first, so a lone "=" reads as an unfinished formula rather than a
  // character-set violation.
  const body = stripFormulaPrefix(src.trim());
  if (!body) return { ok: false, error: ERR.incomplete };
  if (!ALLOWED.test(body)) return { ok: false, error: ERR.chars };

  const tokens = tokenize(body);
  if (!Array.isArray(tokens)) return tokens;
  if (tokens.length === 0) return { ok: false, error: ERR.incomplete };

  let value: number;
  try {
    value = new Parser(tokens).parse();
  } catch (e) {
    return { ok: false, error: e instanceof FormulaFailure ? e.message : ERR.incomplete };
  }
  if (!Number.isFinite(value)) return { ok: false, error: ERR.range };

  const rounded = roundAmount(value);
  // Beyond this the value stops being a believable amount and starts being a
  // float-precision artefact.
  if (Math.abs(rounded) > 1e12) return { ok: false, error: ERR.range };

  // `src`, not `body`: the leading `=` is itself the signal, and stripping it
  // first is what made `=250` report as a bare number.
  return { ok: true, value: rounded, isExpression: isFormula(src.trim()) };
}

/**
 * Convenience for callers that only need "a number or nothing" — the same
 * `Math.max(0, Number(x) || 0)` shape the tools already use, but formula-aware.
 *
 * Keeps clamping at zero, because its remaining callers are budget figures: a
 * negative budget, target or allocation is not a refund, it is a typo. Expense
 * amounts, which CAN legitimately be negative, use `formulaSignedAmount`.
 */
export function formulaAmount(input: string): number {
  const r = evaluateFormula(input);
  return r.ok ? Math.max(0, r.value) : 0;
}

/**
 * As `formulaAmount`, but preserves sign.
 *
 * A negative expense is how a refund, a reimbursement, a cashback credit or a
 * corrected double-entry is recorded: it belongs to the category it reverses,
 * so netting it there is what makes the category total tell the truth. Booking
 * it as income instead would leave the original spend overstating that category
 * forever.
 *
 * Split from `formulaAmount` rather than adding a flag so the two intents can
 * never be confused at a call site — budgets clamp, ledger entries sign.
 */
export function formulaSignedAmount(input: string): number {
  const r = evaluateFormula(input);
  return r.ok ? r.value : 0;
}
