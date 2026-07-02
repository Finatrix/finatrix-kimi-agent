import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { CurrencyProvider } from '../tools/CurrencyContext';
import LifeMapPage from '../tools/pages/LifeMapPage';

// jsdom has no canvas 2D context; stub Chart.js so the app screen can mount.
vi.mock('chart.js/auto', () => ({
  default: class {
    data = { labels: [], datasets: [{ data: [] }, { data: [] }] };
    update() {}
    destroy() {}
  },
}));

function renderPage() {
  return render(
    <CurrencyProvider>
      <LifeMapPage />
    </CurrencyProvider>
  );
}

describe('LifeMapPage (React) — setup → simulation', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  it('launches the simulation and shows the dashboard', async () => {
    renderPage();
    expect(screen.getByText('Simulate your entire financial life.')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Launch my LifeMap →'));

    // After the launch delay, the app dashboard renders.
    expect(await screen.findByText('Welcome, Friend')).toBeInTheDocument();
    expect(screen.getByText('Monthly surplus')).toBeInTheDocument();
    expect(screen.getByText('Financial score')).toBeInTheDocument();
    expect(screen.getByText('Wealth projection')).toBeInTheDocument();
  });

  it('activates a decision and updates the counter', async () => {
    renderPage();
    fireEvent.click(screen.getByText('Launch my LifeMap →'));
    await screen.findByText('Welcome, Friend');

    // Default invest category has "Start NPS / PPF for retirement" (non-custom).
    expect(screen.getByText('Decisions activated').previousElementSibling?.textContent).toMatch(/^0\//);
    fireEvent.click(screen.getByText('Start NPS / PPF for retirement'));
    await waitFor(() => {
      expect(screen.getByText('Decisions activated').previousElementSibling?.textContent).toMatch(/^1\//);
    });
  });
});
