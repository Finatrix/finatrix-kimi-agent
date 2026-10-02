import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';
import { CurrencyProvider } from '../tools/CurrencyContext';
import { MarketProvider } from '../tools/MarketContext';
import { ToastProvider } from '../tools/ui/Toast';
import GoalPlannerPage from '../tools/pages/GoalPlannerPage';
import LifeMapPage from '../tools/pages/LifeMapPage';
import CalendarPage from '../tools/pages/CalendarPage';
import { getJSON, setJSON } from '../tools/lib/storage';
import { downloadBlob } from '../tools/lib/exporters';
import { getMonthEvents } from '../tools/lib/calendar';
import { currentMonth } from '../tools/lib/month';

vi.mock('../tools/lib/exporters', () => ({ downloadBlob: vi.fn() }));
vi.mock('chart.js/auto', () => ({ default: class { data = { labels: [], datasets: [{ data: [] }, { data: [] }] }; update() {} destroy() {} } }));
const investment = { a: { age: 30, income: 80000, monthly: 10000, risk: 'moderate', horizon: '5-10', goal: 'wealth' } };
function show(children: ReactNode) {
  render(<MemoryRouter><CurrencyProvider><MarketProvider><ToastProvider>{children}</ToastProvider></MarketProvider></CurrencyProvider></MemoryRouter>);
}

describe('planning smart assists in the actual pages', () => {
  beforeEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });

  it('finds a fitting goal deadline, applies it and exports the selected plan', () => {
    show(<GoalPlannerPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Show me the path' }));
    // The finder sits under the result, collapsed until asked for.
    fireEvent.click(screen.getByRole('button', { name: 'Show the deadline finder' }));
    fireEvent.change(screen.getByLabelText('Monthly contribution limit'), { target: { value: '100000' } });
    const useDeadline = screen.getAllByRole('button', { name: /^Use \d+-year deadline/ }).find((button) => !(button as HTMLButtonElement).disabled)!;
    const years = Number(useDeadline.textContent!.match(/Use (\d+)-year/)![1]);
    fireEvent.click(useDeadline);
    expect(getJSON<Record<string, string>>('fx_goals', {})['gp-years']).toBe(String(years));
    expect(getJSON<Record<string, string>>('fx_goals', {})['gp-planned-on']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    fireEvent.click(screen.getByText('Check the full 10% step-up commitment'));
    expect(screen.getByRole('region', { name: 'Yearly step-up contribution schedule' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Export plan and yearly schedule' }));
    expect(downloadBlob).toHaveBeenCalledWith('finatrix-goal-plan.csv', expect.any(Blob));
  });

  it('blocks zero income instead of silently launching with an invented LifeMap value', () => {
    show(<LifeMapPage />);
    fireEvent.change(screen.getByLabelText(/Monthly income/), { target: { value: '0' } });
    expect(screen.getByRole('button', { name: 'Launch my LifeMap →' })).toBeDisabled();
    expect(screen.getByText(/Zero would otherwise be replaced by example amounts/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Monthly income/), { target: { value: '35000' } });
    expect(screen.getByRole('button', { name: 'Launch my LifeMap →' })).toBeEnabled();
  });

  it('attributes refreshed LifeMap data accurately and drops source labels after a manual edit', () => {
    localStorage.setItem('fx_bb_data', JSON.stringify({ [currentMonth()]: { vals: { rent: 20000 }, income: '90000', n: '50', w: '30', s: '20', inc: {} } }));
    localStorage.setItem('fx_lifemap', JSON.stringify({ 'lm-income': '70000' }));
    show(<LifeMapPage />);
    const income = screen.getByLabelText(/Monthly income/);
    expect(income).toHaveValue(70000);
    expect(income).not.toHaveAttribute('aria-describedby');
    fireEvent.click(screen.getByText('Refresh from your other tools'));
    fireEvent.click(screen.getByRole('button', { name: 'Use latest saved figures' }));
    expect(income).toHaveValue(90000);
    expect(income).toHaveAccessibleDescription('From your Budget');
    fireEvent.change(income, { target: { value: '85000' } });
    expect(income).not.toHaveAttribute('aria-describedby');
    expect(getJSON<Record<string, string>>('fx_lifemap', {})['lm-income']).toBe('85000');
  });

  it('compares a pinned LifeMap scenario and jumps to a modelled target age', () => {
    show(<LifeMapPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Launch my LifeMap →' }));
    fireEvent.change(screen.getByRole('slider', { name: /Travel through time/ }), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show scenario checks' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pin this scenario for comparison' }));
    const originalComparison = screen.getByText(/above the pinned scenario \(0 decisions\)/).textContent;
    fireEvent.click(screen.getByRole('button', { name: /^Start NPS \/ PPF for retirement/ }));
    expect(screen.getByText(/above the pinned scenario \(0 decisions\)/)).toBeInTheDocument();
    expect(screen.getByText(/above the pinned scenario \(0 decisions\)/).textContent).not.toBe(originalComparison);
    fireEvent.change(screen.getByLabelText('Find the first modelled age for a wealth target'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Jump to age 22' }));
    expect(screen.getByRole('slider', { name: /Travel through time/ })).toHaveValue('22');
    fireEvent.click(screen.getByRole('button', { name: 'Clear active decisions' }));
    expect(screen.getByText('Decisions activated').previousElementSibling?.textContent).toMatch(/^0\//);
  });

  it('refreshes calendar sources, preserves the invest plan while choosing a day, filters and exports', () => {
    show(<CalendarPage />);
    expect(screen.getByRole('button', { name: 'Export visible events to calendar' })).toBeDisabled();
    act(() => setJSON('fx_investmatch', investment));
    fireEvent.change(screen.getByLabelText('Preferred monthly investing day'), { target: { value: '31' } });
    expect(getJSON('fx_investmatch', {})).toEqual({ ...investment, calendarDay: 31 });
    const [year, month] = currentMonth().split('-').map(Number);
    expect(getMonthEvents(currentMonth()).find((event) => event.type === 'invest')?.date).toBe(`${currentMonth()}-${new Date(year, month, 0).getDate()}`);
    fireEvent.change(screen.getByLabelText('Event type'), { target: { value: 'bill' } });
    expect(screen.getByText('No events match these filters')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show all events' }));
    fireEvent.change(screen.getByLabelText('Find an event'), { target: { value: 'unmatched' } });
    expect(screen.getByRole('button', { name: 'Export visible events to calendar' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Find an event'), { target: { value: 'Investing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Export visible events to calendar' }));
    expect(downloadBlob).toHaveBeenCalledWith(`finatrix-calendar-${currentMonth()}.ics`, expect.any(Blob));
  });
});
