/**
 * Step 3.5: warranty and bill locker.
 *
 * - The one piece of date arithmetic: a length in months becomes the last
 *   covered day (purchase day, N months later, minus one day), clamped to the
 *   target month's last day.
 * - Records validate on the way in and on the way out of storage.
 * - Search, order, reminders (30 and 7 days, in the evening slot) and the bell.
 * - Photos live in their own store, behind a swappable backend.
 * - The add sheet keeps a photo, fills only empty fields from a scan, and
 *   drops photos it never saved.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  buildItem, daysLeft, endingSoon, loadLocker, saveLocker, searchLocker, sortLocker, upsertItem, removeItem,
  warrantyEndFor, warrantyEvents, warrantyLabel, warrantyState, LOCKER_KEY, type ItemDraft, type LockerItem,
} from '../tools/lib/locker';
import {
  DEFAULT_REMINDER_PREFS, planReminders, type ReminderContext, type ReminderPrefs,
} from '../tools/lib/reminders';
import { buildNotifications } from '../tools/lib/notifications';
import {
  acceptPhoto, clearPhotos, deletePhotos, fitWithin, loadPhoto, savePhoto, setPhotoBackend, sweepOrphans,
  type PhotoBackend, type StoredPhoto,
} from '../lib/billPhotos';

const receipt = vi.hoisted(() => ({ readReceiptPhoto: vi.fn() }));
vi.mock('../tools/lib/import/receipt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tools/lib/import/receipt')>()),
  readReceiptPhoto: receipt.readReceiptPhoto,
}));

import { LockerSheet } from '../tools/ui/LockerSheet';
import { CurrencyProvider } from '../tools/CurrencyContext';

function memoryBackend(): PhotoBackend & { rows: Map<string, StoredPhoto> } {
  const rows = new Map<string, StoredPhoto>();
  return {
    rows,
    put: async (p) => { rows.set(p.id, p); },
    get: async (id) => rows.get(id),
    delete: async (ids) => { ids.forEach((id) => rows.delete(id)); },
    keys: async () => [...rows.keys()],
    clear: async () => { rows.clear(); },
  };
}

function item(over: Partial<LockerItem> = {}): LockerItem {
  return {
    id: 'a', product: 'Samsung TV', shop: 'Croma', purchased: '2026-03-15', warrantyEnd: '2027-03-14',
    price: 42000, note: '', photoIds: [], remind: true, addedAt: 1, ...over,
  };
}

describe('warrantyEndFor', () => {
  it('ends the day before the anniversary: 12 months from 15 Mar 2026 is 14 Mar 2027', () => {
    expect(warrantyEndFor('2026-03-15', 12)).toBe('2027-03-14');
  });
  it('crosses the year: 1 Jan 2026 + 12 months is 31 Dec 2026', () => {
    expect(warrantyEndFor('2026-01-01', 12)).toBe('2026-12-31');
  });
  it('clamps to the last day of a shorter month: 31 Jan 2026 + 1 month is 27 Feb 2026', () => {
    expect(warrantyEndFor('2026-01-31', 1)).toBe('2026-02-27');
  });
  it('handles a leap day: 29 Feb 2024 + 12 months is 27 Feb 2025; + 48 months is 28 Feb 2028', () => {
    expect(warrantyEndFor('2024-02-29', 12)).toBe('2025-02-27');
    expect(warrantyEndFor('2024-02-29', 48)).toBe('2028-02-28');
  });
  it('handles 6 and 36 months across a year boundary', () => {
    expect(warrantyEndFor('2026-08-20', 6)).toBe('2027-02-19');
    expect(warrantyEndFor('2026-11-25', 36)).toBe('2029-11-24');
  });
  it('refuses a bad date or a length outside 1 to 120 months', () => {
    expect(warrantyEndFor('2026-02-30', 12)).toBeNull();
    expect(warrantyEndFor('nope', 12)).toBeNull();
    expect(warrantyEndFor('2026-03-15', 0)).toBeNull();
    expect(warrantyEndFor('2026-03-15', 121)).toBeNull();
    expect(warrantyEndFor('2026-03-15', 1.5)).toBeNull();
  });
});

describe('days left and state', () => {
  it('counts whole calendar days, 0 on the last covered day', () => {
    expect(daysLeft('2027-03-14', '2027-03-14')).toBe(0);
    expect(daysLeft('2027-03-14', '2027-02-12')).toBe(30);
    expect(daysLeft('2027-03-14', '2027-03-15')).toBe(-1);
  });
  it('states: none, active, soon (30 days or fewer), ended', () => {
    expect(warrantyState({ warrantyEnd: null }, '2026-11-25')).toBe('none');
    expect(warrantyState({ warrantyEnd: '2027-03-14' }, '2026-11-25')).toBe('active');
    expect(warrantyState({ warrantyEnd: '2026-12-25' }, '2026-11-25')).toBe('soon');
    expect(warrantyState({ warrantyEnd: '2026-12-26' }, '2026-11-25')).toBe('active');
    expect(warrantyState({ warrantyEnd: '2026-11-24' }, '2026-11-25')).toBe('ended');
  });
  it('words it', () => {
    expect([30, 1, 0, -1, -9].map(warrantyLabel)).toEqual([
      'Ends in 30 days', 'Ends tomorrow', 'Ends today', 'Ended yesterday', 'Ended 9 days ago',
    ]);
  });
});

describe('buildItem and storage', () => {
  const draft: ItemDraft = {
    product: '  Samsung   TV ', shop: 'Croma', purchased: '2026-03-15', months: 12, warrantyEnd: null,
    price: 42000, note: '', photoIds: [], remind: true,
  };
  beforeEach(() => localStorage.clear());

  it('builds a record, working the end date from the length', () => {
    const out = buildItem(draft, [], 'x', 5);
    expect(out).toEqual({ item: expect.objectContaining({ id: 'x', product: 'Samsung TV', warrantyEnd: '2027-03-14', addedAt: 5 }) });
  });
  it('takes a typed end date as given, and refuses one before the purchase', () => {
    expect(buildItem({ ...draft, months: null, warrantyEnd: '2030-01-01' }, [])).toEqual({ item: expect.objectContaining({ warrantyEnd: '2030-01-01' }) });
    expect(buildItem({ ...draft, months: null, warrantyEnd: '2026-03-14' }, [])).toEqual({ error: 'warranty' });
  });
  it('keeps a bill with no warranty', () => {
    expect(buildItem({ ...draft, months: null }, [])).toEqual({ item: expect.objectContaining({ warrantyEnd: null }) });
  });
  it('names the field to fix', () => {
    expect(buildItem({ ...draft, product: '  ' }, [])).toEqual({ error: 'product' });
    expect(buildItem({ ...draft, purchased: '' }, [])).toEqual({ error: 'purchased' });
    expect(buildItem({ ...draft, price: Number.NaN }, [])).toEqual({ error: 'price' });
    expect(buildItem({ ...draft, price: -1 }, [])).toEqual({ error: 'price' });
  });
  it('round-trips through storage and drops damaged records', () => {
    expect(saveLocker([item()])).toBe(true);
    expect(loadLocker()).toEqual([item()]);
    localStorage.setItem(LOCKER_KEY, JSON.stringify([item(), { id: 'b' }, null, { ...item({ id: 'c' }), purchased: '2026-02-30' }, 'x']));
    expect(loadLocker().map((i) => i.id)).toEqual(['a']);
    localStorage.setItem(LOCKER_KEY, '{"not":"a list"}');
    expect(loadLocker()).toEqual([]);
  });
  it('upserts, keeping the first addedAt on an edit, and removes', () => {
    const first = upsertItem([], item({ addedAt: 1 }));
    const edited = upsertItem(first, item({ product: 'LG TV', addedAt: 99 }));
    expect(edited).toHaveLength(1);
    expect(edited[0]).toMatchObject({ product: 'LG TV', addedAt: 1 });
    expect(removeItem(edited, 'a')).toEqual([]);
  });
});

describe('search and order', () => {
  const tv = item({ id: 'tv', product: 'Samsung TV', shop: 'Croma', warrantyEnd: '2027-03-14' });
  const fridge = item({ id: 'fr', product: 'LG Fridge', shop: 'Reliance Digital', warrantyEnd: '2026-12-01', purchased: '2025-12-02' });
  const old = item({ id: 'old', product: 'Old mixer', shop: 'Croma', warrantyEnd: '2026-01-10' });
  const bare = item({ id: 'bare', product: 'Shoes', shop: 'Bata', warrantyEnd: null, purchased: '2026-10-01' });

  it('matches product, shop and note, every word, ignoring case', () => {
    const all = [tv, fridge, old, bare];
    expect(searchLocker(all, 'croma').map((i) => i.id)).toEqual(['tv', 'old']);
    expect(searchLocker(all, 'reliance fridge').map((i) => i.id)).toEqual(['fr']);
    expect(searchLocker(all, 'reliance tv')).toEqual([]);
    expect(searchLocker(all, '  ').length).toBe(4);
    expect(searchLocker([item({ note: 'Serial XK-99' })], 'xk-99')).toHaveLength(1);
  });
  it('orders running warranties by end date, then no-warranty, then ended', () => {
    expect(sortLocker([old, bare, tv, fridge], '2026-11-25').map((i) => i.id)).toEqual(['fr', 'tv', 'bare', 'old']);
  });
});

describe('reminders', () => {
  const on: ReminderPrefs = { ...DEFAULT_REMINDER_PREFS, enabled: true, morning: false, midday: false, weekly: false, daily: false };
  const ctx = (warranties: ReminderContext['warranties']): ReminderContext => ({ expenses: [], upcoming: [], overspent: false, warranties });
  /** Wednesday 7 Oct 2026, 10:00. */
  const now = new Date(2026, 9, 7, 10, 0, 0);

  it('names a warranty 30 days and 7 days before its last day, in the evening slot', () => {
    const plan = planReminders(now, on, ctx([{ id: 'a', product: 'Samsung TV', end: '2026-11-08' }]));
    // 8 Nov is 32 days out: the 30-day line is on 9 Oct (2 days from now), the 7-day line is 1 Nov (outside the week).
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ title: 'Samsung TV warranty ends in 30 days', href: '/tools/locker', kind: 'upcoming' });
    expect(plan[0].at.getDate()).toBe(9);
    const week = planReminders(now, on, ctx([{ id: 'a', product: 'Samsung TV', end: '2026-10-14' }]));
    expect(week[0]).toMatchObject({ title: 'Samsung TV warranty ends in 7 days' });
    expect(week[0].at.getDate()).toBe(7);
  });
  it('adds no notification: two things on one evening become one', () => {
    const plan = planReminders(now, on, ctx([
      { id: 'a', product: 'TV', end: '2026-10-14' }, { id: 'b', product: 'Fridge', end: '2026-10-14' },
    ]));
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ title: '2 warranties ending soon', href: '/tools/locker' });
  });
  it('says nothing about a warranty with its reminder off or already ended', () => {
    const events = warrantyEvents([
      item({ id: 'a', remind: false, warrantyEnd: '2026-12-01' }),
      item({ id: 'b', warrantyEnd: '2026-10-01' }),
      item({ id: 'c', warrantyEnd: null }),
      item({ id: 'd', warrantyEnd: '2026-12-01' }),
    ], '2026-11-25');
    expect(events.map((e) => e.id)).toEqual(['d']);
  });
  it('carries no amount', () => {
    const plan = planReminders(now, on, ctx([{ id: 'a', product: 'TV', end: '2026-10-14' }]));
    expect(`${plan[0].title} ${plan[0].body}`).not.toMatch(/[₹$]|\d{4,}/);
  });
});

describe('the bell', () => {
  beforeEach(() => localStorage.clear());
  it('lists warranties ending within 30 days, soonest first', () => {
    saveLocker([
      item({ id: 'a', product: 'TV', warrantyEnd: '2026-12-20' }),
      item({ id: 'b', product: 'Fridge', warrantyEnd: '2026-11-27' }),
      item({ id: 'c', product: 'Mixer', warrantyEnd: '2027-06-01' }),
    ]);
    const now = new Date(2026, 10, 25, 9);
    expect(endingSoon(loadLocker(), '2026-11-25').map((i) => i.id)).toEqual(['b', 'a']);
    const titles = buildNotifications(now).filter((n) => n.href === '/tools/locker').map((n) => n.title);
    expect(titles).toEqual(['Fridge warranty ends in 2 days', 'TV warranty ends in 25 days']);
  });
});

describe('photo store', () => {
  let backend: ReturnType<typeof memoryBackend>;
  beforeEach(() => { backend = memoryBackend(); setPhotoBackend(backend); });
  afterEach(() => setPhotoBackend());

  it('keeps, reads and deletes photos', async () => {
    const id = await savePhoto(new Blob(['abc'], { type: 'image/jpeg' }));
    expect(id).toBeTruthy();
    expect(await loadPhoto(id as string)).toBeInstanceOf(Blob);
    await deletePhotos([id as string]);
    expect(await loadPhoto(id as string)).toBeNull();
  });
  it('sweeps photos no record holds, and clears everything on request', async () => {
    const keep = await savePhoto(new Blob(['1'], { type: 'image/jpeg' }));
    await savePhoto(new Blob(['2'], { type: 'image/jpeg' }));
    expect(await sweepOrphans(new Set([keep as string]))).toBe(1);
    expect([...backend.rows.keys()]).toEqual([keep]);
    await clearPhotos();
    expect(backend.rows.size).toBe(0);
  });
  it('fails soft when the device will not store', async () => {
    setPhotoBackend({ ...backend, put: async () => { throw new Error('quota'); } });
    expect(await savePhoto(new Blob(['x'], { type: 'image/jpeg' }))).toBeNull();
  });
  it('checks a file and fits it to the longest side without scaling up', () => {
    expect(acceptPhoto({ size: 0, type: 'image/png' })).toBe('empty');
    expect(acceptPhoto({ size: 21 * 1024 * 1024, type: 'image/png' })).toBe('big');
    expect(acceptPhoto({ size: 10, type: 'application/pdf' })).toBe('type');
    expect(acceptPhoto({ size: 10, type: 'image/heic' })).toBe('ok');
    expect(fitWithin(4000, 3000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(1000, 800)).toEqual({ width: 1000, height: 800 });
  });
});

describe('the add sheet', () => {
  let backend: ReturnType<typeof memoryBackend>;
  beforeEach(() => {
    localStorage.clear();
    backend = memoryBackend();
    setPhotoBackend(backend);
    receipt.readReceiptPhoto.mockReset();
    // jsdom has no object URLs.
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => { cleanup(); setPhotoBackend(); });

  const open = (props: Partial<React.ComponentProps<typeof LockerSheet>> = {}) => {
    const onSave = vi.fn();
    render(<CurrencyProvider><LockerSheet existing={[]} onSave={onSave} onClose={() => {}} {...props} /></CurrencyProvider>);
    return onSave;
  };
  const photo = () => new File([new Uint8Array(30)], 'bill.jpg', { type: 'image/jpeg' });

  it('saves a bill with its warranty worked out from the length', () => {
    const onSave = open();
    fireEvent.change(screen.getByLabelText('What did you buy?'), { target: { value: 'Samsung TV' } });
    fireEvent.change(screen.getByLabelText('Bought on'), { target: { value: '2026-03-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to locker' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({ product: 'Samsung TV', warrantyEnd: '2027-03-14' });
    expect(screen.getByText('Covered up to 14 March 2027.')).toBeTruthy();
  });
  it('asks for a product instead of saving without one', () => {
    const onSave = open();
    fireEvent.click(screen.getByRole('button', { name: 'Add to locker' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('Say what you bought.');
  });
  it('a scan keeps the photo and fills only the empty fields', async () => {
    receipt.readReceiptPhoto.mockResolvedValue({ ok: true, reading: { amount: 772, merchant: 'SRI LAKSHMI SUPERMARKET', date: '2026-08-14' } });
    const onSave = open();
    fireEvent.change(screen.getByLabelText('Shop'), { target: { value: 'Croma' } });
    const input = document.querySelector('input[capture]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [photo()] } });
    await waitFor(() => expect(screen.getByText(/Photo kept\. Filled in the date, price/)).toBeTruthy());
    expect((screen.getByLabelText('Shop') as HTMLInputElement).value).toBe('Croma');
    expect((screen.getByLabelText('Bought on') as HTMLInputElement).value).toBe('2026-08-14');
    expect((screen.getByLabelText('Price (optional)') as HTMLInputElement).value).toBe('772');
    fireEvent.change(screen.getByLabelText('What did you buy?'), { target: { value: 'Groceries' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to locker' }));
    expect(onSave.mock.calls[0][0].photoIds).toHaveLength(1);
    expect(backend.rows.size).toBe(1);
  });
  it('keeps the photo even when the bill cannot be read', async () => {
    receipt.readReceiptPhoto.mockResolvedValue({ ok: false, message: 'No bill details were found in that photo.' });
    open();
    fireEvent.change(document.querySelector('input[capture]') as HTMLInputElement, { target: { files: [photo()] } });
    await waitFor(() => expect(screen.getByText(/Photo kept\. No bill details/)).toBeTruthy());
    expect(backend.rows.size).toBe(1);
  });
  it('drops photos it never saved when it closes', async () => {
    const view = render(<CurrencyProvider><LockerSheet existing={[]} onSave={() => {}} onClose={() => {}} /></CurrencyProvider>);
    fireEvent.change(document.querySelector('input[multiple]') as HTMLInputElement, { target: { files: [photo(), photo()] } });
    await waitFor(() => expect(backend.rows.size).toBe(2));
    view.unmount();
    await waitFor(() => expect(backend.rows.size).toBe(0));
  });
  it('turns away a file that is not a photo', async () => {
    open();
    fireEvent.change(document.querySelector('input[multiple]') as HTMLInputElement, {
      target: { files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] },
    });
    await waitFor(() => expect(screen.getByText('That is not a photo.')).toBeTruthy());
    expect(backend.rows.size).toBe(0);
  });
});
