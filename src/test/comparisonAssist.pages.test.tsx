import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import InvestMatchPage from '../tools/pages/InvestMatchPage';
import ParkSmartPage from '../tools/pages/ParkSmartPage';
import PeerComparePage from '../tools/pages/PeerComparePage';
import { MARKETS, type MarketId } from '../tools/lib/markets';
import { IM_DEFAULTS } from '../tools/lib/investmatch';
import { computePeerCompare } from '../tools/lib/peercompare';
import { faqForMarket, guideForMarket } from '../tools/lib/markets/guides';

let active: MarketId = 'IN';
let currency = 'INR';
const { notify, setCode } = vi.hoisted(() => ({ notify: vi.fn(), setCode: vi.fn() }));
vi.mock('../tools/MarketContext', () => ({ useMarket: () => ({ market: MARKETS[active] }) }));
vi.mock('../tools/CurrencyContext', () => ({ useCurrency: () => ({ code: currency, sym: currency, setCode, cfmt: (n: number) => `${currency} ${n.toFixed(2)}` }) }));
vi.mock('../tools/ui/Toast', () => ({ useToast: () => ({ notify }) }));
vi.mock('../lib/analytics', () => ({ track: vi.fn() }));

beforeEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); active = 'IN'; currency = 'INR'; });
afterEach(cleanup);
const mount = (page: React.ReactNode) => render(<MemoryRouter>{page}</MemoryRouter>);
const change = (name: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(name), { target: { value } });

describe('InvestMatch smart interactions', () => {
  it('keeps blank and invalid numeric answers on their own question instead of silently clamping', () => {
    mount(<InvestMatchPage />);
    change('How old are you?', '');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('alert')).toHaveTextContent('will not be silently changed');
    expect(screen.getByText('Question 1 of 6')).toBeInTheDocument();
    change('How old are you?', '25');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    change(/Monthly income/, '-1');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Question 2 of 6')).toBeInTheDocument();
  });

  it('requires review before reusing tagged answers and keeps scenarios out of the saved result', () => {
    const answers = { ...IM_DEFAULTS, age: 41, risk: 'aggressive', horizon: '10+' };
    localStorage.setItem('fx_investmatch', JSON.stringify({ a: answers, market: 'IN', currency: 'INR', calendarDay: 15 }));
    mount(<InvestMatchPage />);
    expect(screen.getByLabelText('How old are you?')).toHaveValue(IM_DEFAULTS.age);
    fireEvent.click(screen.getByRole('button', { name: 'Review saved answers' }));
    expect(screen.getByRole('heading', { name: 'Review your answers' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use these answers' }));
    const section = screen.getByRole('region', { name: 'Explore what changes the outcome' });
    fireEvent.click(within(section).getByRole('button', { name: 'Show the scenario explorer' }));
    fireEvent.click(within(section).getByRole('button', { name: '2 years · Conservative' }));
    expect(within(section).getByRole('status')).toHaveTextContent('Applied risk: Conservative');
    fireEvent.click(within(section).getByRole('button', { name: /20% more/ }));
    expect(within(section).getByRole('status')).toHaveTextContent('INR 12000.00/month over 15 years');
    expect(JSON.parse(localStorage.getItem('fx_investmatch')!)).toMatchObject({ a: answers, calendarDay: 15 });
  });

  it('retains a valid edited answer when going back but lets the user leave an invalid draft', () => {
    mount(<InvestMatchPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    change(/Monthly income/, '60000');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByLabelText(/Monthly income/)).toHaveValue(60000);
    change(/Monthly income/, '');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Question 1 of 6')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByLabelText(/Monthly income/)).toHaveValue(60000);
  });

  it.each([{ market: 'US', currency: 'INR' }, { market: 'IN', currency: 'USD' }, {}])('does not reuse answers with incompatible or absent provenance: %j', (provenance) => {
    localStorage.setItem('fx_investmatch', JSON.stringify({ a: IM_DEFAULTS, ...provenance }));
    mount(<InvestMatchPage />);
    expect(screen.queryByRole('button', { name: 'Review saved answers' })).not.toBeInTheDocument();
  });
});

describe('ParkSmart smart interactions', () => {
  it('restores an amount only after an explicit action and does not restore quotes', () => {
    active = 'AU'; currency = 'AUD';
    localStorage.setItem('fx_parksmart', JSON.stringify({ 'ps-amount': '47000', 'ps-duration': '6-12', market: 'AU', currency: 'AUD' }));
    mount(<ParkSmartPage />);
    expect(screen.getByLabelText(/Amount to park/)).toHaveValue(5000);
    fireEvent.click(screen.getByRole('button', { name: 'Use saved amount and duration' }));
    expect(screen.getByLabelText(/Amount to park/)).toHaveValue(47000);
    expect(screen.getByLabelText('Parking duration')).toHaveValue('6-12');
    expect(screen.getByLabelText('Annual net rate for option 1 (%)')).toHaveValue(null);
  });

  it('uses access preferences to exclude a higher quote and keeps the zero-rate alternative valid', () => {
    active = 'AU'; currency = 'AUD';
    mount(<ParkSmartPage />);
    change(/Amount to park/, '1000');
    change('Option 1 name (optional)', 'Accessible cash');
    change('Option 2 name (optional)', 'Locked quote');
    change('Annual net rate for option 1 (%)', '0');
    change('Annual net rate for option 2 (%)', '8');
    change('Access for option 2', 'false');
    fireEvent.click(screen.getByRole('checkbox', { name: /Only compare options/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Compare the options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show the comparison tools' }));
    expect(screen.getByRole('combobox', { name: 'Compare the leader with' }).querySelectorAll('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: 'Accessible cash (option 1)' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Locked quote (option 2)' })).not.toBeInTheDocument();
    change('Explore another holding period', '0-1');
    expect(screen.getByText(/0.5 months, the representative period/)).toBeInTheDocument();
    expect(screen.getByText('Entered net 0%')).toBeInTheDocument();
  });

  it('shows a recoverable error for an empty accessible shortlist', () => {
    active = 'AU'; currency = 'AUD';
    mount(<ParkSmartPage />);
    for (const index of [1, 2]) { change(`Annual net rate for option ${index} (%)`, '3'); change(`Access for option ${index}`, 'false'); }
    fireEvent.click(screen.getByRole('checkbox', { name: /Only compare options/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Compare the options' }));
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('No options match'), 'error');
    expect(screen.getByRole('button', { name: 'Compare the options' })).toBeInTheDocument();
  });
});

describe('PeerCompare smart interactions', () => {
  it.each(['IN', 'US', 'GB', 'AE'] as const)('presents the unchanged %s model score without inventing a measured population rank', (id) => {
    active = id; currency = MARKETS[id].currency;
    const market = MARKETS[id];
    const computed = computePeerCompare(market.peer.defaults, market.peer);
    const { container } = mount(<PeerComparePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Show the comparison' }));
    expect(screen.getByText('Illustrative benchmark score')).toBeInTheDocument();
    expect(screen.getByText(String(computed.score), { exact: true })).toBeInTheDocument();
    for (const metric of computed.metrics) expect(screen.getAllByText(`Model score ${metric.pct}/100`, { exact: false }).length).toBeGreaterThan(0);
    expect(container).toHaveTextContent('not a percentile');
    expect(container.textContent).not.toMatch(/\d+(?:st|nd|rd|th) percentile|Among \d|You earn more than the typical|below the .+ average for your age|Savings below peers|ahead of peers|Mean of the six percentiles|Read a percentile as a description of a sample/);
    expect(container).toHaveTextContent('No population rank or prevalence is measured');
    expect(container).toHaveTextContent('model reference:');
    expect(guideForMarket('peercompare', market).method.join(' ')).toContain('Age selects an age band');
    expect(guideForMarket('peercompare', market).method.join(' ')).toContain('not a measured population percentile');
    expect(faqForMarket('peercompare', market)[0].a).toContain('not a measured population percentile');
  });

  it('blocks unlike currency units before a legacy comparison and offers an explicit currency switch', () => {
    currency = 'USD';
    mount(<PeerComparePage />);
    expect(screen.queryByRole('button', { name: 'Show the comparison' })).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Match the benchmark currency' })).toHaveTextContent('Switching does not convert your amounts');
    fireEvent.click(screen.getByRole('button', { name: 'Switch to INR' }));
    expect(setCode).toHaveBeenCalledWith('INR');
  });

  it('keeps published comparisons in their native reference currency regardless of display currency', () => {
    active = 'AU'; currency = 'USD';
    mount(<PeerComparePage />);
    expect(screen.getByLabelText(/Your matching figure \(AUD/)).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Match the benchmark currency' })).not.toBeInTheDocument();
  });

  it('cross-checks surplus but only changes the savings rate when asked', () => {
    mount(<PeerComparePage />);
    change(/Monthly income/, '1000'); change(/Monthly expenses/, '900'); change('Monthly savings rate (%)', '20');
    expect(screen.getByText(/implies more savings than/)).toBeInTheDocument();
    expect(screen.getByLabelText('Monthly savings rate (%)')).toHaveValue(20);
    fireEvent.click(screen.getByRole('button', { name: 'Use the income-minus-expenses rate' }));
    expect(screen.getByLabelText('Monthly savings rate (%)')).toHaveValue(10);
    change(/Total savings/, '');
    fireEvent.click(screen.getByRole('button', { name: 'Show the comparison' }));
    expect(screen.getByRole('alert')).toHaveTextContent('savings');
  });

  it('changes comparison context without changing the entered income', () => {
    mount(<PeerComparePage />);
    change(/Monthly income/, '1000');
    fireEvent.click(screen.getByRole('button', { name: 'Show the comparison' }));
    const section = screen.getByRole('region', { name: 'Understand the comparison' });
    fireEvent.click(within(section).getByRole('button', { name: 'Show the location explorer' }));
    fireEvent.change(within(section).getByLabelText('Explore a location'), { target: { value: 'mumbai' } });
    expect(within(section).getByRole('status')).toHaveTextContent('Your monthly income: INR 1000.00');
    expect(within(section).getByRole('status')).toHaveTextContent('Mumbai');
  });

  it('builds an explicit matching total, resets confirmations and isolates the second comparison', () => {
    active = 'AU'; currency = 'AUD';
    mount(<PeerComparePage />);
    screen.getAllByRole('checkbox').forEach((checkbox) => fireEvent.click(checkbox));
    fireEvent.click(screen.getByRole('button', { name: 'Build my matching figure from parts' }));
    expect(screen.getByRole('button', { name: 'Use component total' })).toBeDisabled();
    change('Component 1 (AUD)', '1000');
    expect(screen.getByRole('button', { name: 'Use component total' })).toBeDisabled();
    change('Component 2 (AUD)', '786');
    fireEvent.click(screen.getByRole('button', { name: 'Use component total' }));
    expect(screen.getByLabelText(/Your matching figure/)).toHaveValue(1786);
    screen.getAllByRole('checkbox').forEach((checkbox) => expect(checkbox).not.toBeChecked());
    fireEvent.click(screen.getByRole('button', { name: 'Build my matching figure from parts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compare matching figures' }));
    expect(screen.getByRole('alert')).toHaveTextContent('all three');
    screen.getAllByRole('checkbox').forEach((checkbox) => fireEvent.click(checkbox));
    fireEvent.click(screen.getByRole('button', { name: 'Compare matching figures' }));
    expect(screen.getByRole('status')).toHaveTextContent('equal to this dated median');
    change('Second matching figure (AUD)', '2000');
    const section = screen.getByRole('region', { name: 'Compare a second matching figure' });
    expect(section).toHaveTextContent('$214 above the published median');
    expect(screen.getByRole('status')).toHaveTextContent('$1,786 compared with $1,786');
    change('Published reference', 'AU-SIH-2019-20-WEALTH-MEDIAN');
    expect(screen.queryByRole('region', { name: 'Compare a second matching figure' })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Your matching figure/)).toHaveValue(null);
    expect(screen.getByRole('link', { name: 'Track my own net worth' })).toHaveAttribute('href', '/tools/networth');
  });
});
