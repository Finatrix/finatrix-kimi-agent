import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { DepositProtectionNote, ReferenceRows } from '../tools/ui/ReferenceDisclosure';
import { Methodology } from '../tools/ui/ResultExplainer';
import { MARKETS } from '../tools/lib/markets';

vi.mock('../lib/analytics', () => ({ track: vi.fn() }));

/**
 * These components are the visible half of the promise the reference layer
 * makes: that a market-sensitive figure on screen can be traced to a source,
 * a date and a set of conditions — and that where no such figure exists, the
 * product says so rather than showing zero.
 *
 * So the assertions are about what a reader can and cannot conclude, not about
 * markup.
 */

function wrap(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

beforeEach(cleanup);

describe('the deposit protection note', () => {
  it('states the current UK limit rather than the one that lapsed', () => {
    wrap(<DepositProtectionNote market="GB" amount={50_000} amountCurrency="GBP" />);
    expect(screen.getByText('£120,000')).toBeInTheDocument();
    expect(screen.queryByText('£85,000')).toBeNull();
  });

  it('says an amount is within the limit only for a single holder at one institution', () => {
    wrap(<DepositProtectionNote market="GB" amount={50_000} amountCurrency="GBP" />);
    expect(screen.getByText(/within it for a single holder at a single institution/i)).toBeInTheDocument();
  });

  it('keeps the comparison conditional when the amount is above the limit', () => {
    wrap(<DepositProtectionNote market="US" amount={400_000} amountCurrency="USD" />);
    // Never "$150,000 of your money is uninsured" — cover depends on the
    // institution, the account type and the ownership category, none of which
    // this product knows.
    expect(screen.getByText(/if it sits in one name at one institution/i)).toBeInTheDocument();
    expect(screen.queryByText(/uninsured/i)).toBeNull();
  });

  it('shows no figure at all for the UAE, and does not imply zero', () => {
    wrap(<DepositProtectionNote market="AE" amount={1_000_000} amountCurrency="AED" />);
    const note = screen.getByLabelText('Deposit protection');
    expect(within(note).getByText(/No operative retail guarantee scheme was verified/i)).toBeInTheDocument();
    expect(within(note).getByText(/not a finding that deposits here are unprotected/i)).toBeInTheDocument();
    expect(note.textContent).not.toMatch(/AED\s?0\b|unlimited/i);
  });

  it('flags the unverified and over-limit states without flagging a balance within cover', () => {
    const { container: within_ } = wrap(<DepositProtectionNote market="IN" amount={100_000} amountCurrency="INR" />);
    expect(within_.querySelector('[data-state="within"]')).toBeTruthy();
    cleanup();
    const { container: above } = wrap(<DepositProtectionNote market="IN" amount={900_000} amountCurrency="INR" />);
    expect(above.querySelector('[data-state="above"]')).toBeTruthy();
    cleanup();
    const { container: unverified } = wrap(<DepositProtectionNote market="AE" amount={10} amountCurrency="AED" />);
    expect(unverified.querySelector('[data-state="unverified"]')).toBeTruthy();
  });

  it('shows the limit but draws no comparison when the reader’s currency differs', () => {
    // The bug this catches: someone reading totals in rupees while comparing
    // against UK rules would otherwise be told ₹700,000 is "above £120,000".
    wrap(<DepositProtectionNote market="GB" amount={700_000} amountCurrency="INR" />);
    expect(screen.getByText('£120,000')).toBeInTheDocument();
    expect(screen.getByText(/not compared here/i)).toBeInTheDocument();
    expect(screen.queryByText(/is larger, so if it sits in one name/i)).toBeNull();
  });

  it('shows the limit in the currency the law is written in, not the reader’s', () => {
    // Someone can hold AED while comparing against UK rules. £120,000 is the
    // figure the FSCS states; a converted one would be a number no source says.
    wrap(<DepositProtectionNote market="GB" amount={10} amountCurrency="GBP" />);
    expect(screen.getByText('£120,000')).toBeInTheDocument();
  });
});

describe('the reference rows', () => {
  it('cites a source a reader can actually open', () => {
    wrap(<ReferenceRows toolId="parksmart" market="GB" />);
    const link = screen.getByRole('link', { name: /FSCS — Deposit protection limit/ });
    expect(link).toHaveAttribute('href', expect.stringContaining('https://www.fscs.org.uk'));
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('gives every figure an effective date and a review date', () => {
    wrap(<ReferenceRows toolId="parksmart" market="GB" />);
    expect(screen.getByText('Applies from 1 December 2025')).toBeInTheDocument();
    expect(screen.getAllByText(/Last reviewed 12 September 2026/).length).toBeGreaterThan(0);
  });

  it('renders an absent value as “not available” with what to do instead', () => {
    wrap(<ReferenceRows toolId="parksmart" market="AE" />);
    expect(screen.getByText('Not available')).toBeInTheDocument();
    expect(screen.getByText(/need verification with your bank/i)).toBeInTheDocument();
  });

  it('marks a reference the research itself flagged as out of date', () => {
    // The UAE price series is a historical quarter, not a current reading.
    wrap(<ReferenceRows toolId="lifemap" market="AE" />);
    expect(screen.getByLabelText('This reference may be out of date')).toBeInTheDocument();
  });

  it('shows published inflation as comparison only, next to the planning rate', () => {
    wrap(<ReferenceRows toolId="goals" market="GB" />);
    expect(screen.getByText(/2\.9% \(July 2026\)/)).toBeInTheDocument();
    expect(screen.getByText(/Shown for comparison only/)).toBeInTheDocument();
    expect(screen.getByText(/separate long-run assumption/)).toBeInTheDocument();
  });

  it('renders nothing for a tool whose answer depends on no external figure', () => {
    const { container } = wrap(<ReferenceRows toolId="networth" market="IN" />);
    expect(container.textContent).toBe('');
  });
});

describe('the methodology drawer, with reference data', () => {
  it('carries the reference rows for the active market', () => {
    wrap(<Methodology toolId="parksmart" market={MARKETS.GB} subject={{ amount: 200_000, currency: 'GBP' }} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Reference data used' })).toBeInTheDocument();
    expect(screen.getByText('£120,000')).toBeInTheDocument();
    // The drawer is self-contained: it repeats the comparison rather than
    // relying on the reader having seen the card above it.
    expect(screen.getByText(/£80,000 sits beyond the limit/)).toBeInTheDocument();
  });

  it('draws no comparison when it is given an amount in another currency', () => {
    wrap(<Methodology toolId="parksmart" market={MARKETS.GB} subject={{ amount: 200_000, currency: 'INR' }} />);
    expect(screen.getByText(/not compared here/i)).toBeInTheDocument();
    expect(screen.queryByText(/sits beyond the limit/)).toBeNull();
  });

  it('adds limits that come from the evidence, not only from the method', () => {
    wrap(<Methodology toolId="parksmart" market={MARKETS.US} />);
    expect(screen.getByText(/Social and payroll contributions in this market are set regionally/)).toBeInTheDocument();
  });

  it('adds that limit only where it is true', () => {
    wrap(<Methodology toolId="parksmart" market={MARKETS.GB} />);
    expect(screen.queryByText(/set regionally/)).toBeNull();
  });

  it('labels which numbers are known, assumed and published', () => {
    wrap(
      <Methodology
        toolId="parksmart"
        market={MARKETS.IN}
        inputs={[{ label: 'Amount', value: '₹1,00,000' }]}
        assumptions={[{ label: 'Assumed return', value: '7%' }]}
      />,
    );
    // Each word appears twice by design: once as the tag on its block, once in
    // the legend that defines it.
    for (const tier of ['Known', 'Assumed', 'Published']) {
      expect(screen.getAllByText(tier).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps the tags out of the headings’ accessible names', () => {
    // A tag inside the heading would be read as "Your inputs, Known", which
    // turns a landmark a screen-reader user navigates by into a sentence.
    wrap(<Methodology toolId="parksmart" market={MARKETS.IN} inputs={[{ label: 'Amount', value: '₹1' }]} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Your inputs' })).toBeInTheDocument();
  });

  it('defines the three words once, at the foot of the drawer', () => {
    wrap(<Methodology toolId="budget" />);
    expect(screen.getByText(/entered from your information/i)).toBeInTheDocument();
    expect(screen.getByText(/a planning choice you can/i)).toBeInTheDocument();
  });

  it('still shows nothing market-specific for a tool with no market', () => {
    wrap(<Methodology toolId="networth" />);
    expect(screen.queryByRole('heading', { name: 'Reference data used' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Market and sources' })).toBeNull();
  });
});
