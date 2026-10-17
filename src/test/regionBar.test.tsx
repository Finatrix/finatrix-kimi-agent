import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { CurrencyProvider } from '../tools/CurrencyContext';
import { MarketProvider } from '../tools/MarketContext';
import { RegionBar } from '../tools/ui/RegionBar';

function renderBar() {
  return render(
    <MemoryRouter><CurrencyProvider><MarketProvider><RegionBar /></MarketProvider></CurrencyProvider></MemoryRouter>,
  );
}

describe('RegionBar', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('choosing a country sets its currency and remembers both', () => {
    renderBar();
    fireEvent.change(screen.getByLabelText('Your country'), { target: { value: 'GB' } });
    expect((screen.getByLabelText('Currency') as HTMLSelectElement).value).toBe('GBP');
    expect(localStorage.getItem('fx_market')).toBe('GB');
    expect(localStorage.getItem('fx_currency')).toContain('GBP');
  });

  it('keeps currency independent once the country is chosen', () => {
    renderBar();
    fireEvent.change(screen.getByLabelText('Your country'), { target: { value: 'AE' } });
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'INR' } });
    expect((screen.getByLabelText('Your country') as HTMLSelectElement).value).toBe('AE');
    expect((screen.getByLabelText('Currency') as HTMLSelectElement).value).toBe('INR');
  });

  it('leaves a currency the person already chose alone on first render', () => {
    localStorage.setItem('fx_currency', 'EUR');
    renderBar();
    expect((screen.getByLabelText('Currency') as HTMLSelectElement).value).toBe('EUR');
  });
});
