/**
 * Step 3.3: Share to FinatriX and receipt scan.
 *
 * - Several files read into one review (`extractStatements`), with the ones that
 *   cannot be read named instead of failing the batch.
 * - Shared files open the review sheet already chosen (`initialFiles`), and
 *   nothing is saved until Import.
 * - The web share target's three halves (manifest, service worker, page inbox)
 *   agree on their names.
 * - The camera button on the add form fills in the amount, shop and date from
 *   the bill and saves nothing by itself.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const receipt = vi.hoisted(() => ({
  readReceiptPhoto: vi.fn(),
}));
vi.mock('../tools/lib/import/receipt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tools/lib/import/receipt')>()),
  readReceiptPhoto: receipt.readReceiptPhoto,
}));

import StatementImport from '../tools/ui/StatementImport';
import TransactionModal, { type FlatCat } from '../tools/ui/TransactionModal';
import { extractStatements, ImportError } from '../tools/lib/import/extract';
import * as inbox from '../lib/shareInbox';

const CATS: FlatCat[] = [
  { k: 'groceries', l: 'Groceries', ic: 'layers', section: 'needs' },
  { k: 'eating_out', l: 'Eating Out', ic: 'layers', section: 'wants' },
];

/** jsdom's `File` has no `text()`; supply the one a browser provides. */
function csvFile(text: string, name: string): File {
  const file = new File([text], name, { type: 'text/csv' });
  if (typeof file.text !== 'function') Object.defineProperty(file, 'text', { value: async () => text });
  return file;
}

const FIRST = csvFile([
  'Date,Description,Debit,Credit,Balance',
  '03/11/2026,SWIGGY BANGALORE,450.00,,9550.00',
  '05/11/2026,UBER TRIP,220.50,,9329.50',
].join('\n'), 'first.csv');

const SECOND = csvFile([
  'Date,Description,Debit,Credit,Balance',
  '08/11/2026,BIG BASKET,1200.00,,500.00',
].join('\n'), 'second.csv');

const NOW = new Date(2026, 10, 24);

afterEach(() => {
  cleanup();
  receipt.readReceiptPhoto.mockReset();
});

describe('extractStatements', () => {
  it('puts the rows of several files side by side, each read on its own', async () => {
    const out = await extractStatements([FIRST, SECOND], { now: NOW });
    expect(out.doc.rows.map((r) => r.description)).toEqual(['SWIGGY BANGALORE', 'UBER TRIP', 'BIG BASKET']);
    expect(out.doc.rows.map((r) => r.amount)).toEqual([450, 220.5, 1200]);
    // Line numbers stay unique across the batch.
    expect(new Set(out.doc.rows.map((r) => r.line)).size).toBe(3);
    // A balance chain is never followed from one file into the next.
    expect(out.doc.rows.every((r) => r.balance === null)).toBe(true);
    expect(out.skipped).toEqual([]);
  });

  it('names a file it could not read instead of failing the batch', async () => {
    const empty = new File([], 'blank.png', { type: 'image/png' });
    const out = await extractStatements([FIRST, empty], { now: NOW });
    expect(out.doc.rows).toHaveLength(2);
    expect(out.skipped).toEqual([{ name: 'blank.png', reason: expect.stringMatching(/empty/i) }]);
  });

  it('fails only when nothing in the batch could be read', async () => {
    const a = new File([], 'a.png', { type: 'image/png' });
    const b = new File([], 'b.png', { type: 'image/png' });
    await expect(extractStatements([a, b], { now: NOW })).rejects.toBeInstanceOf(ImportError);
  });

  it('reads one file exactly as the single-file path does', async () => {
    const out = await extractStatements([FIRST], { now: NOW });
    expect(out.skipped).toBeUndefined();
    expect(out.doc.rows[0].balance).toBe(9550);
  });
});

describe('shared files open the review', () => {
  it('reads the shared files on open, and saves nothing until Import', async () => {
    const onImport = vi.fn();
    render(
      <StatementImport
        cats={CATS} existing={[]} cfmt={(n) => `₹${n}`} sym="₹" currencyCode="INR"
        onImport={onImport} onClose={() => {}} aiEnabled={false}
        initialFiles={[FIRST, SECOND]}
      />,
    );
    expect(await screen.findByText('BIG BASKET', {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText(/2 files · nothing is saved until you press Import/)).toBeInTheDocument();
    expect(onImport).not.toHaveBeenCalled();
  });

  it('lets several files be chosen at once in the picker', () => {
    render(
      <StatementImport
        cats={CATS} existing={[]} cfmt={(n) => `₹${n}`} sym="₹" currencyCode="INR"
        onImport={() => {}} onClose={() => {}} aiEnabled={false}
      />,
    );
    expect(screen.getByLabelText('Statement file')).toHaveAttribute('multiple');
  });
});

describe('the web share target', () => {
  const root = resolve(__dirname, '../..');
  const manifest = JSON.parse(readFileSync(resolve(root, 'public/manifest.webmanifest'), 'utf8'));
  const sw = readFileSync(resolve(root, 'public/sw.js'), 'utf8');

  it('posts images to a path the service worker answers', () => {
    expect(manifest.share_target).toMatchObject({
      action: '/share-target', method: 'POST', enctype: 'multipart/form-data',
    });
    expect(manifest.share_target.params.files[0].name).toBe('files');
    expect(sw).toContain("const SHARE_TARGET_PATH = '/share-target';");
    expect(sw).toContain("form.getAll('files')");
  });

  it('writes the same inbox the page reads', () => {
    expect(sw).toContain(`const SHARE_DB = '${inbox.SHARE_DB}';`);
    expect(sw).toContain(`const SHARE_STORE = '${inbox.SHARE_STORE}';`);
    expect(sw).toContain(`const SHARE_DB_VERSION = ${inbox.SHARE_DB_VERSION};`);
    expect(sw).toContain(`const SHARE_MAX_FILES = ${inbox.SHARE_MAX_FILES};`);
    expect(sw).toContain(`const SHARE_LANDING = '${inbox.SHARE_LANDING}';`);
  });

  it('keeps only images of a readable size', () => {
    expect(inbox.acceptShared(new File(['x'], 'a.png', { type: 'image/png' }))).toBe(true);
    expect(inbox.acceptShared(new File(['x'], 'a.pdf', { type: 'application/pdf' }))).toBe(false);
    expect(inbox.acceptShared(new File([], 'a.png', { type: 'image/png' }))).toBe(false);
  });

  it('reads as empty, not as an error, where there is no IndexedDB', async () => {
    expect(await inbox.takeShared()).toEqual([]);
  });
});

describe('receipt scan on the add form', () => {
  function renderAdd(onSave = vi.fn()) {
    render(
      <TransactionModal
        editing={null} cats={CATS} sym="₹" defaultCat="groceries" todayKey="2026-11-24"
        onSave={onSave} onClose={() => {}}
      />,
    );
    return onSave;
  }

  const photo = () => new File(['jpeg'], 'bill.jpg', { type: 'image/jpeg' });

  it('fills in the amount, shop and date from the bill, and saves nothing by itself', async () => {
    receipt.readReceiptPhoto.mockResolvedValue({
      ok: true, reading: { amount: 772, merchant: 'Sri Lakshmi Supermarket', date: '2026-08-14' },
    });
    const onSave = renderAdd();
    fireEvent.change(screen.getByLabelText('Photo of a receipt'), { target: { files: [photo()] } });

    await waitFor(() => expect(screen.getByText(/Filled in the amount, shop and date from the bill/)).toBeInTheDocument());
    expect(screen.getByLabelText(/^Amount/)).toHaveValue('772');
    expect(screen.getByDisplayValue('Sri Lakshmi Supermarket')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-08-14')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('asks for the amount when the bill printed no total', async () => {
    receipt.readReceiptPhoto.mockResolvedValue({
      ok: true, reading: { amount: null, merchant: 'Corner Shop', date: null },
    });
    renderAdd();
    fireEvent.change(screen.getByLabelText('Photo of a receipt'), { target: { files: [photo()] } });
    await waitFor(() => expect(screen.getByText(/No total was found, so enter the amount/)).toBeInTheDocument());
    expect(screen.getByLabelText(/^Amount/)).toHaveValue('');
  });

  it('says why when the photo could not be read', async () => {
    receipt.readReceiptPhoto.mockResolvedValue({ ok: false, message: 'No bill details were found in that photo.' });
    renderAdd();
    fireEvent.change(screen.getByLabelText('Photo of a receipt'), { target: { files: [photo()] } });
    expect(await screen.findByText('No bill details were found in that photo.')).toBeInTheDocument();
  });

  it('is offered when adding, not when editing, and opens the camera on a phone', () => {
    renderAdd();
    expect(screen.getByRole('button', { name: /Scan a receipt/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Photo of a receipt')).toHaveAttribute('capture', 'environment');
  });
});

describe('the iOS Share Extension', () => {
  const root = resolve(__dirname, '../..');
  const pbx = readFileSync(resolve(root, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
  const values = (key: string) => [...pbx.matchAll(new RegExp(`${key} = ([^;]+);`, 'g'))].map((m) => m[1]);

  it('carries the same version and build number as the app, or App Store Connect refuses the upload', () => {
    expect(values('CURRENT_PROJECT_VERSION')).toHaveLength(4);
    expect(new Set(values('CURRENT_PROJECT_VERSION')).size).toBe(1);
    expect(values('MARKETING_VERSION')).toHaveLength(4);
    expect(new Set(values('MARKETING_VERSION')).size).toBe(1);
  });

  it('shares one App Group with the app, named the same in both entitlements and both Swift files', () => {
    const group = 'group.co.finatrix.app';
    for (const file of [
      'ios/App/App/App.entitlements',
      'ios/App/ShareExtension/ShareExtension.entitlements',
      'ios/App/App/FxSharePlugin.swift',
      'ios/App/ShareExtension/ShareViewController.swift',
    ]) {
      expect(readFileSync(resolve(root, file), 'utf8')).toContain(group);
    }
  });
});

