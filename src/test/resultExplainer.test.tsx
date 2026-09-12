/**
 * The Result → Explanation → Action → Next step block.
 *
 * This component is the shape of the product's central promise — "personal
 * finance, with the workings shown" — so the assertions here are about the
 * promise rather than the markup:
 *
 *   • The workings really are the ones the calculator uses. `method` and
 *     `limits` come from `TOOL_GUIDES`, the same registry the tool page's
 *     education footer and the crawlable HTML render, so the drawer cannot
 *     describe a different calculation from the page it sits on.
 *   • They are behind progressive disclosure, not dumped into the result.
 *   • The disclosure is operable from a keyboard and announced as one, because
 *     a transparency feature only screen users can reach is not transparency.
 *   • Opening it is measured, because whether anyone looks is the only evidence
 *     the claim is real.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Methodology, ResultExplainer } from '../tools/ui/ResultExplainer';
import { TOOL_GUIDES } from '../shared/toolGuides';
import { TOOL_OUTCOMES } from '../shared/nextSteps';
import { MARKETS } from '../tools/lib/markets';
import { track } from '../lib/analytics';

vi.mock('../lib/analytics', () => ({ track: vi.fn() }));

function wrap(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const INPUTS = [{ label: 'Amount', value: '₹1,00,000' }];
const ASSUMPTIONS = [{ label: 'Assumed return', value: '11%' }];

/** The drawer subsection introduced by `heading`. */
function block(heading: string): HTMLElement {
  return screen.getByRole('heading', { name: heading }).parentElement as HTMLElement;
}

beforeEach(() => {
  cleanup();
  vi.mocked(track).mockClear();
});

describe('Methodology disclosure', () => {
  it('is closed by default, so a result stays a result', () => {
    wrap(<Methodology toolId="parksmart" />);
    const details = screen.getByText('How this is calculated').closest('details')!;
    expect(details.open).toBe(false);
  });

  it('shows the calculator’s real method, not a second description of it', () => {
    wrap(<Methodology toolId="goals" />);
    const details = screen.getByText('How this is calculated').closest('details')!;
    for (const line of TOOL_GUIDES.goals.method) {
      expect(within(details).getByText(line)).toBeInTheDocument();
    }
  });

  it('shows the calculator’s stated limits alongside the method', () => {
    wrap(<Methodology toolId="goals" />);
    const details = screen.getByText('How this is calculated').closest('details')!;
    for (const limit of TOOL_GUIDES.goals.limits) {
      expect(within(details).getByText(limit)).toBeInTheDocument();
    }
  });

  it('separates what the reader entered from what FinatriX assumed', () => {
    wrap(<Methodology toolId="parksmart" inputs={INPUTS} assumptions={ASSUMPTIONS} />);
    const yours = block('Your inputs');
    const ours = block('Assumptions used');
    expect(within(yours).getByText('₹1,00,000')).toBeInTheDocument();
    expect(within(ours).getByText('11%')).toBeInTheDocument();
    // …and they are not the same block wearing two headings.
    expect(within(yours).queryByText('11%')).toBeNull();
  });

  it('names the market, its review date and its sources when the result depends on one', () => {
    wrap(<Methodology toolId="parksmart" market={MARKETS.GB} />);
    const sources = block('Market and sources');
    expect(within(sources).getByText('United Kingdom')).toBeInTheDocument();
    expect(within(sources).getByText('June 2026')).toBeInTheDocument();
    expect(within(sources).getByText(/ONS Annual Survey of Hours and Earnings/)).toBeInTheDocument();
    // The date is only worth showing if the reader is told it is maintained by
    // hand rather than fetched live.
    expect(within(sources).getByText(/Maintained by hand/)).toBeInTheDocument();
  });

  it('omits the sources block entirely for a tool with no market data', () => {
    wrap(<Methodology toolId="networth" />);
    expect(screen.queryByRole('heading', { name: 'Market and sources' })).toBeNull();
  });

  it('structures the drawer with headings rather than nested landmarks', () => {
    // Four labelled <section>s inside a disclosure would each be a `region`
    // landmark, which turns landmark navigation into noise. Headings are the
    // right structure, and they must not skip a level under the block's h2.
    wrap(<Methodology toolId="parksmart" inputs={INPUTS} market={MARKETS.IN} />);
    for (const name of ['The method', 'Your inputs', 'Market and sources']) {
      expect(screen.getByRole('heading', { level: 3, name })).toBeInTheDocument();
    }
    expect(screen.queryAllByRole('region')).toHaveLength(0);
  });

  it('always carries the educational disclaimer and a route to the standards', () => {
    wrap(<Methodology toolId="budget" />);
    expect(screen.getByText(/not financial advice/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /How we check our work/i })).toHaveAttribute(
      'href',
      '/editorial-standards',
    );
  });

  it('is a native disclosure: focusable, and toggled by the keyboard', () => {
    wrap(<Methodology toolId="budget" />);
    const summary = screen.getByText('How this is calculated');
    expect(summary.tagName).toBe('SUMMARY');
    const details = summary.closest('details')!;
    fireEvent.click(summary);
    expect(details.open).toBe(true);
  });

  it('counts the first open, and does not double-count re-openings', () => {
    wrap(<Methodology toolId="lifemap" />);
    const summary = screen.getByText('How this is calculated');
    const details = summary.closest('details')!;

    details.open = true;
    fireEvent(details, new Event('toggle'));
    expect(track).toHaveBeenCalledWith('methodology_opened', { tool: 'lifemap' });
    expect(vi.mocked(track).mock.calls).toHaveLength(1);

    details.open = false;
    fireEvent(details, new Event('toggle'));
    details.open = true;
    fireEvent(details, new Event('toggle'));
    expect(vi.mocked(track).mock.calls).toHaveLength(1);
  });
});

describe('ResultExplainer', () => {
  it('leads with what the result means, as a heading a reader can navigate to', () => {
    wrap(<ResultExplainer toolId="budget" meaning="You have ₹8,000 unassigned." />);
    expect(screen.getByRole('heading', { name: 'What this means' })).toBeInTheDocument();
    expect(screen.getByText('You have ₹8,000 unassigned.')).toBeInTheDocument();
  });

  it('follows the result with the workings, the actions and the next steps, in that order', () => {
    wrap(<ResultExplainer toolId="budget" meaning="…" />);
    const headings = screen
      .getAllByRole('heading')
      .map((h) => h.textContent)
      .filter((t) => t === 'What this means' || t === 'What you could do next' || t === 'Continue in FinatriX');
    expect(headings).toEqual(['What this means', 'What you could do next', 'Continue in FinatriX']);
  });

  it('renders the registry’s next steps as real links with their reasons', () => {
    wrap(<ResultExplainer toolId="networth" meaning="…" />);
    for (const step of TOOL_OUTCOMES.networth.next) {
      const link = screen.getByRole('link', { name: new RegExp(step.label, 'i') });
      expect(link).toHaveAttribute('href', step.href);
      expect(screen.getByText(step.reason)).toBeInTheDocument();
    }
  });

  it('reports which next step was taken, and from where', () => {
    wrap(<ResultExplainer toolId="networth" meaning="…" />);
    const step = TOOL_OUTCOMES.networth.next[0];
    fireEvent.click(screen.getByRole('link', { name: new RegExp(step.label, 'i') }));
    expect(track).toHaveBeenCalledWith('next_step_clicked', {
      tool: 'networth',
      route: step.href,
    });
  });

  it('keeps the whole block inside one labelled region', () => {
    wrap(<ResultExplainer toolId="goals" meaning="…" />);
    const region = screen.getByRole('region', { name: 'What this means' });
    expect(within(region).getByRole('heading', { name: 'Continue in FinatriX' })).toBeInTheDocument();
  });
});
