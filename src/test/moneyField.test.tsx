import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { CurrencyProvider } from '../tools/CurrencyContext';
import BudgetPage from '../tools/pages/BudgetPage';

/**
 * Regression guard: **you can type a decimal point.**
 *
 * The reported bug was that decimals could not be entered in Budget Builder on
 * a phone. The cause was not mobile-specific at all. The amount fields were
 * `<input type="number">` bound to a numeric state:
 *
 *     value={vals[k] ? String(vals[k]) : ''}
 *     onChange={(e) => setVal(k, Math.max(0, Number(e.target.value) || 0))}
 *
 * A `type="number"` input reports `value === ''` for anything that is not yet a
 * valid number, and `"12."` is not one. So the instant the decimal key was
 * pressed the browser handed back an empty string, `Number('') || 0` produced
 * `0`, the falsy check blanked the field, and every digit already typed
 * vanished. It bit hardest on phones because that is where the decimal key sits
 * on the numeric keypad people reach for.
 *
 * The fix is `ui/MoneyField.tsx`: while the field has focus it renders the
 * user's own draft string, and commits the parsed number alongside it.
 */

function renderPage() {
  return render(<CurrencyProvider><BudgetPage /></CurrencyProvider>);
}

const savedVals = (): Record<string, number> => {
  const store = JSON.parse(localStorage.getItem('fx_bb_data') || '{}');
  return store[Object.keys(store)[0]]?.vals ?? {};
};

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

describe('typing a decimal amount', () => {
  it('keeps the decimal point on screen while it is being typed', () => {
    renderPage();
    const rent = screen.getByLabelText(/^Rent amount/) as HTMLInputElement;

    fireEvent.focus(rent);
    fireEvent.change(rent, { target: { value: '12' } });
    // The keystroke that used to wipe the whole field.
    fireEvent.change(rent, { target: { value: '12.' } });
    expect(rent).toHaveValue('12.');

    fireEvent.change(rent, { target: { value: '12.5' } });
    expect(rent).toHaveValue('12.5');
  });

  it('commits the decimal value, not a truncated integer', () => {
    renderPage();
    const rent = screen.getByLabelText(/^Rent amount/) as HTMLInputElement;

    fireEvent.focus(rent);
    fireEvent.change(rent, { target: { value: '1250.75' } });
    fireEvent.blur(rent);

    expect(savedVals().rent).toBe(1250.75);
  });

  it('is a text field with a decimal keypad, not a number field', () => {
    // `type="number"` is what discarded the intermediate value. `inputMode`
    // keeps the numeric keypad on mobile, which is the only part of
    // `type="number"` that was actually wanted here.
    renderPage();
    const rent = screen.getByLabelText(/^Rent amount/) as HTMLInputElement;
    expect(rent.getAttribute('type')).toBe('text');
    expect(rent.getAttribute('inputMode')).toBe('decimal');
  });

  it('normalises the draft once the field is left', () => {
    renderPage();
    const rent = screen.getByLabelText(/^Rent amount/) as HTMLInputElement;

    fireEvent.focus(rent);
    fireEvent.change(rent, { target: { value: '0900.50' } });
    fireEvent.blur(rent);
    expect(rent).toHaveValue('900.5');
  });

  it('leaves the committed value alone while an expression is half-typed', () => {
    renderPage();
    const rent = screen.getByLabelText(/^Rent amount/) as HTMLInputElement;

    fireEvent.focus(rent);
    fireEvent.change(rent, { target: { value: '500' } });
    expect(savedVals().rent).toBe(500);
    // "500+" cannot be parsed. Collapsing it to 0 mid-keystroke would be the
    // same class of bug as the one this component exists to fix.
    fireEvent.change(rent, { target: { value: '500+' } });
    expect(savedVals().rent).toBe(500);
    fireEvent.change(rent, { target: { value: '500+50' } });
    expect(savedVals().rent).toBe(550);
  });

  it('accepts arithmetic, the way the expense amount field already did', () => {
    renderPage();
    const rent = screen.getByLabelText(/^Rent amount/) as HTMLInputElement;
    fireEvent.focus(rent);
    fireEvent.change(rent, { target: { value: '120/4' } });
    expect(savedVals().rent).toBe(30);
  });

  it('clears to zero on an empty field rather than keeping a stale number', () => {
    renderPage();
    const rent = screen.getByLabelText(/^Rent amount/) as HTMLInputElement;
    fireEvent.focus(rent);
    fireEvent.change(rent, { target: { value: '400' } });
    fireEvent.change(rent, { target: { value: '' } });
    expect(savedVals().rent).toBe(0);
    fireEvent.blur(rent);
    expect(rent).toHaveValue('');
  });
});

describe('the income fields have the same fix', () => {
  it('keeps a decimal point in an income amount', () => {
    renderPage();
    const salary = screen.getByLabelText(/^Salary amount/) as HTMLInputElement;
    fireEvent.focus(salary);
    fireEvent.change(salary, { target: { value: '4820.' } });
    expect(salary).toHaveValue('4820.');
    fireEvent.change(salary, { target: { value: '4820.6' } });
    fireEvent.blur(salary);
    expect(salary).toHaveValue('4820.6');
  });
});

describe('the percentage fields', () => {
  it('lets a fractional percentage be typed one character at a time', () => {
    renderPage();
    const needs = screen.getByLabelText('Needs %') as HTMLInputElement;
    fireEvent.change(needs, { target: { value: '33.' } });
    expect(needs).toHaveValue('33.');
    fireEvent.change(needs, { target: { value: '33.3' } });
    expect(needs).toHaveValue('33.3');
  });

  it('refuses anything that is not a number, silently', () => {
    renderPage();
    const needs = screen.getByLabelText('Needs %') as HTMLInputElement;
    fireEvent.change(needs, { target: { value: '50' } });
    fireEvent.change(needs, { target: { value: '50a' } });
    // Rejected on the keystroke rather than accepted and then explained: there
    // is no valid percentage containing a letter, so there is nothing to say.
    expect(needs).toHaveValue('50');
  });

  it('clamps a share of income to 100', () => {
    renderPage();
    const needs = screen.getByLabelText('Needs %') as HTMLInputElement;
    fireEvent.change(needs, { target: { value: '400' } });
    expect(needs).toHaveValue('100');
  });

  it('normalises a trailing point on blur', () => {
    renderPage();
    const needs = screen.getByLabelText('Needs %') as HTMLInputElement;
    fireEvent.change(needs, { target: { value: '45.' } });
    fireEvent.blur(needs);
    expect(needs).toHaveValue('45');
  });
});

describe('a decimal budget reaches the figures on the page', () => {
  it('totals fractional allocations without dropping the fraction', () => {
    renderPage();
    const needsCard = screen.getByText(/^Needs · /).closest('.card') as HTMLElement;
    const rent = within(needsCard).getByLabelText(/^Rent amount/) as HTMLInputElement;
    const groceries = within(needsCard).getByLabelText(/^Groceries amount/) as HTMLInputElement;

    fireEvent.focus(rent);
    fireEvent.change(rent, { target: { value: '1000.25' } });
    fireEvent.blur(rent);
    fireEvent.focus(groceries);
    fireEvent.change(groceries, { target: { value: '499.75' } });
    fireEvent.blur(groceries);

    expect(savedVals().rent).toBe(1000.25);
    expect(savedVals().groceries).toBe(499.75);
    expect(within(needsCard).getByText('₹1,500 used')).toBeInTheDocument();
  });
});
