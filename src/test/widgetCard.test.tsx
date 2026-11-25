import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const platform = vi.hoisted(() => ({ value: 'ios' as 'ios' | 'android' | null }));
vi.mock('../native/platform', async (orig) => ({
  ...(await orig<typeof import('../native/platform')>()),
  nativePlatform: () => platform.value,
}));

import { WidgetCard } from '../tools/ui/WidgetCard';
import { WIDGET_LOCK_AMOUNTS_KEY } from '../tools/lib/widgetData';

afterEach(() => {
  localStorage.clear();
  platform.value = 'ios';
});

describe('Settings → Widget', () => {
  it('on iPhone, offers the Lock Screen switch, off until turned on', () => {
    render(<WidgetCard />);
    const toggle = screen.getByRole('checkbox', { name: 'Show the amount on the Lock Screen' });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
    expect(localStorage.getItem(WIDGET_LOCK_AMOUNTS_KEY)).toBe('1');
    fireEvent.click(toggle);
    expect(localStorage.getItem(WIDGET_LOCK_AMOUNTS_KEY)).toBe('0');
  });

  it('on Android, explains how to add it and has no Lock Screen switch', () => {
    platform.value = 'android';
    render(<WidgetCard />);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByText(/tap Widgets, and choose FinatriX/)).toBeInTheDocument();
  });

  it('shows nothing in a browser', () => {
    platform.value = null;
    const { container } = render(<WidgetCard />);
    expect(container).toBeEmptyDOMElement();
  });
});
