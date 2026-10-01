import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ExportMenu } from '../tools/ui/ExportMenu';
import { track } from '../lib/analytics';

vi.mock('../lib/analytics', () => ({ track: vi.fn() }));

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('export recovery', () => {
  it('shows a recoverable error instead of an unhandled rejection, then supports retry', async () => {
    const exportPdf = vi.fn().mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce(undefined);
    render(<ExportMenu onCsv={vi.fn()} onXlsx={vi.fn()} onPdf={exportPdf} source="budget" />);
    fireEvent.click(screen.getByRole('button', { name: 'Export ▾' }));
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: 'Download PDF' })); });
    expect(screen.getByRole('alert')).toHaveTextContent('The export could not be created. Please try again.');
    expect(track).toHaveBeenLastCalledWith('report_exported', { kind: 'pdf', where: 'budget', ok: false });
    fireEvent.click(screen.getByRole('button', { name: 'Export ▾' }));
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: 'Download PDF' })); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(exportPdf).toHaveBeenCalledTimes(2);
    expect(track).toHaveBeenLastCalledWith('report_exported', { kind: 'pdf', where: 'budget', ok: true });
  });

  it('keeps the action disabled while an export is pending', async () => {
    let finish: () => void = () => {};
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    render(<ExportMenu onCsv={vi.fn()} onXlsx={vi.fn()} onPdf={() => pending} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export ▾' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Download PDF' }));
    expect(screen.getByRole('button', { name: 'Exporting…' })).toBeDisabled();
    await act(async () => { finish(); });
    expect(screen.getByRole('button', { name: 'Export ▾' })).toBeEnabled();
  });
});

it('supports arrow navigation, Home/End, and returns focus on Escape', () => {
  vi.useFakeTimers();
  render(<ExportMenu onCsv={vi.fn()} onXlsx={vi.fn()} onPdf={vi.fn()} />);
  const trigger = screen.getByRole('button', { name: 'Export ▾' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  act(() => vi.advanceTimersByTime(20));
  expect(screen.getByRole('menuitem', { name: 'Download CSV' })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
  expect(screen.getByRole('menuitem', { name: 'Download PDF' })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: 'Home' });
  expect(screen.getByRole('menuitem', { name: 'Download CSV' })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: 'End' });
  expect(screen.getByRole('menuitem', { name: 'Download PDF' })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
