import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import ReferencePage from '../tools/pages/ReferencePage';
import { MARKET_IDS } from '../tools/lib/markets/types';
import { REFERENCE_MARKETS } from '../reference';

vi.mock('../lib/analytics', () => ({ track: vi.fn() }));

/**
 * The reference page is where the research that has no home in a calculator
 * becomes visible: Australia's deposit cap, Singapore's tax schedule, Mainland
 * China's retirement reform — and the absences, which took just as much work.
 *
 * Its one hard requirement is that it must never blur into a claim that the
 * tools work in those markets. Everything below defends that line.
 */

function wrap() {
  return render(
    <MemoryRouter>
      <ReferencePage />
    </MemoryRouter>,
  );
}

beforeEach(cleanup);

describe('the market picker', () => {
  it('offers every researched market, not only the ones the tools support', () => {
    wrap();
    const select = screen.getByLabelText('Market') as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual([...REFERENCE_MARKETS]);
    expect(select.options.length).toBe(MARKET_IDS.length);
  });

  it('has no reference-only markets', () => {
    wrap();
    const select = screen.getByLabelText('Market') as HTMLSelectElement;
    const flagged = [...select.options].filter((o) => o.text.includes('reference only')).map((o) => o.value);
    expect(flagged).toEqual([]);
  });

  it('says out loud that choosing here does not change the tools', () => {
    // The page must not become a second, contradictory market setting.
    wrap();
    expect(screen.getByText(/only changes what this page shows/i)).toBeInTheDocument();
  });
});

describe('a newly enabled market', () => {
  beforeEach(() => {
    wrap();
    fireEvent.change(screen.getByLabelText('Market'), { target: { value: 'AU' } });
  });

  it('states that tools are available with explicit input modes', () => {
    expect(screen.getByText('Available in the tools')).toBeInTheDocument();
    expect(screen.getByText(/use your entered net rates/i)).toBeInTheDocument();
  });

  it('says why, rather than leaving it to be guessed', () => {
    expect(screen.getByText(/Tax and statutory retirement calculations remain outside/i)).toBeInTheDocument();
  });

  it('still shows the verified facts that do exist', () => {
    expect(screen.getByText('A$250,000')).toBeInTheDocument();
    expect(screen.getByText('APRA (Financial Claims Scheme)')).toBeInTheDocument();
    expect(screen.getByText('1 February 2012')).toBeInTheDocument();
  });

  it('renders the tax schedule as a real table with its exclusions named', () => {
    const table = screen.getByRole('table');
    expect(within(table).getByRole('rowheader', { name: 'A$190,000 and above' })).toBeInTheDocument();
    expect(screen.getByText(/Medicare levy and surcharge/)).toBeInTheDocument();
  });

  it('never claims to compute a tax liability', () => {
    expect(screen.getByText(/does not work out a tax liability in any market/i)).toBeInTheDocument();
  });
});

describe('a market the tools do support', () => {
  it('says so, and points at the setting', () => {
    wrap();
    fireEvent.change(screen.getByLabelText('Market'), { target: { value: 'GB' } });
    expect(screen.getByText('Available in the tools')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Settings' }).length).toBeGreaterThan(0);
  });

  it('carries the corrected UK deposit limit and its commencement date', () => {
    wrap();
    fireEvent.change(screen.getByLabelText('Market'), { target: { value: 'GB' } });
    expect(screen.getByText('£120,000')).toBeInTheDocument();
    expect(screen.getByText('1 December 2025')).toBeInTheDocument();
  });
});

describe('absences are published too', () => {
  it('shows the UAE as unverified rather than as zero', () => {
    wrap();
    fireEvent.change(screen.getByLabelText('Market'), { target: { value: 'AE' } });
    expect(screen.getByText('Not verified')).toBeInTheDocument();
    expect(screen.getByText(/not a finding that deposits here are unprotected/i)).toBeInTheDocument();
  });

  it('says China’s joint-account rule is unsettled rather than assuming it', () => {
    wrap();
    fireEvent.change(screen.getByLabelText('Market'), { target: { value: 'CN' } });
    expect(screen.getByText(/Not settled by the source text/i)).toBeInTheDocument();
  });

  it('names a market with no usable wealth distribution instead of showing nothing', () => {
    wrap();
    fireEvent.change(screen.getByLabelText('Market'), { target: { value: 'SG' } });
    expect(screen.getByText(/No usable wealth distribution found/i)).toBeInTheDocument();
  });

  it('lists what is deliberately switched off, and what would switch it on', () => {
    wrap();
    fireEvent.change(screen.getByLabelText('Market'), { target: { value: 'SG' } });
    expect(screen.getByRole('heading', { name: /CPF contribution and allocation engine/ })).toBeInTheDocument();
    expect(screen.getByText(/no single percentage is right for every member/i)).toBeInTheDocument();
  });
});

describe('published inflation is context, never a planning rate', () => {
  it('says so on every market that has an observation', () => {
    wrap();
    for (const market of ['IN', 'US', 'CN']) {
      fireEvent.change(screen.getByLabelText('Market'), { target: { value: market } });
      expect(screen.getByText(/separate long-run assumption/i)).toBeInTheDocument();
    }
  });

  it('does not badge an unconfirmed release as the latest', () => {
    wrap();
    fireEvent.change(screen.getByLabelText('Market'), { target: { value: 'IN' } });
    expect(screen.getByText(/A newer release may exist and has not been verified/i)).toBeInTheDocument();
  });
});

describe('structure', () => {
  it('gives every section a heading, under one page h1', () => {
    wrap();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    for (const name of ['Deposit protection', 'Published inflation', 'Income tax', 'Retirement']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
  });

  it('opens every source in a new tab without handing it window.opener', () => {
    wrap();
    for (const link of screen.getAllByRole('link')) {
      if (!link.getAttribute('href')?.startsWith('http')) continue;
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
      expect(link).toHaveAttribute('target', '_blank');
    }
  });
});
