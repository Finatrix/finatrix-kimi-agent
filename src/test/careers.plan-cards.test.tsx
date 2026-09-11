/**
 * The plan card is the only thing standing between a visitor and a purchase,
 * and it is now rendered by three surfaces (`/pricing`, the public `/careers`
 * landing page, and the in-app Careers Pro paywall). These pin the properties
 * that make it sellable and accessible, so a change on one surface cannot
 * quietly weaken the other two.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { PlanGrid, PlanCard } from '../marketing/PlanCards';
import { CAREERS_PLANS, formatInr, yearlySavingPct } from '../shared/plans';

afterEach(cleanup);

const renderGrid = (props: Partial<Parameters<typeof PlanGrid>[0]> = {}) =>
  render(
    <MemoryRouter>
      <PlanGrid
        period="monthly"
        onPeriodChange={() => {}}
        cta={{ kind: 'link', to: '/signup' }}
        {...props}
      />
    </MemoryRouter>
  );

const cardFor = (name: string) =>
  screen.getByRole('heading', { name }).closest('li') as HTMLElement;

describe('PlanGrid', () => {
  it('renders every advertised plan', () => {
    renderGrid();
    for (const plan of CAREERS_PLANS) {
      expect(screen.getByRole('heading', { name: plan.name })).toBeInTheDocument();
    }
  });

  it('shows the monthly price for each self-serve plan', () => {
    renderGrid();
    for (const plan of CAREERS_PLANS.filter((p) => p.priceMonthly > 0)) {
      expect(within(cardFor(plan.name)).getByText(formatInr(plan.priceMonthly))).toBeInTheDocument();
    }
  });

  it('shows the yearly price and a computed saving', () => {
    renderGrid({ period: 'yearly' });
    const plan = CAREERS_PLANS.find((p) => p.featured)!;
    const card = cardFor(plan.name);

    expect(within(card).getByText(formatInr(plan.priceYearly))).toBeInTheDocument();
    // Computed, never hardcoded — a written-down "save 17%" silently becomes a
    // false advertisement the first time a price moves.
    expect(within(card).getByText(`Save ${yearlySavingPct(plan)}% vs monthly`)).toBeInTheDocument();
  });

  it('marks exactly one plan as the recommendation', () => {
    renderGrid();
    expect(screen.getAllByText('Most chosen')).toHaveLength(1);
    expect(CAREERS_PLANS.filter((p) => p.featured)).toHaveLength(1);
  });

  it('gives every buy button a distinct accessible name', () => {
    // Four buttons all reading "Start Careers Pro" is what the paywall shipped;
    // a screen-reader user tabbing the grid heard the same label four times
    // with nothing to tell them apart (WCAG 2.4.4).
    renderGrid();
    const names = screen
      .getAllByRole('link')
      .map((el) => el.textContent?.trim())
      .filter(Boolean);
    expect(new Set(names).size).toBe(names.length);
  });

  it('routes the non-self-serve plan to sales rather than checkout', () => {
    renderGrid();
    const enterprise = CAREERS_PLANS.find((p) => p.priceMonthly === 0)!;
    const link = within(cardFor(enterprise.name)).getByRole('link');
    expect(link.getAttribute('href')).toMatch(/^mailto:/);
  });

  it('switches period through the segmented control', () => {
    const onPeriodChange = vi.fn();
    renderGrid({ onPeriodChange });
    fireEvent.click(screen.getByRole('radio', { name: 'Yearly' }));
    expect(onPeriodChange).toHaveBeenCalledWith('yearly');
  });
});

describe('PlanCard checkout action', () => {
  const plan = CAREERS_PLANS.find((p) => p.featured)!;

  const renderAction = (over: Partial<Extract<Parameters<typeof PlanCard>[0]['cta'], { kind: 'action' }>> = {}) => {
    const onSelect = vi.fn();
    render(
      <MemoryRouter>
        <ul>
          <PlanCard plan={plan} period="monthly" cta={{ kind: 'action', onSelect, ...over }} />
        </ul>
      </MemoryRouter>
    );
    return onSelect;
  };

  it('starts checkout for the plan that was clicked', () => {
    const onSelect = renderAction();
    fireEvent.click(screen.getByRole('button', { name: `Get ${plan.name}` }));
    expect(onSelect).toHaveBeenCalledWith(plan.id);
  });

  it('shows a busy state and blocks a double purchase', () => {
    const onSelect = renderAction({ busyPlanId: plan.id });
    const btn = screen.getByRole('button', { name: 'Starting…' });

    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(btn);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('disables every plan while any checkout is in flight', () => {
    // Two Stripe sessions opened from one page is a support ticket, not a sale.
    renderAction({ busyPlanId: 'some-other-plan' });
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
