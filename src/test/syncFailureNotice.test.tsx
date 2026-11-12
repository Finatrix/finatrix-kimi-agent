/**
 * A save to the account that has stopped working must be visible on a phone,
 * where the "Sync error" label beside the account menu is not shown at all.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ToastProvider } from '../tools/ui/Toast';
import { SyncFailureNotice } from '../tools/ui/SyncFailureNotice';
import type { SyncStatus } from '../tools/cloudSync';

const tree = (sync: SyncStatus) => (
  <ToastProvider>
    <SyncFailureNotice sync={sync} />
  </ToastProvider>
);
const notices = () => screen.queryAllByRole('status').filter((el) => /not to your account yet/.test(el.textContent ?? ''));

afterEach(cleanup);

describe('SyncFailureNotice', () => {
  it('says nothing while saving works', () => {
    const { rerender } = render(tree('idle'));
    rerender(tree('saving'));
    rerender(tree('saved'));
    expect(notices()).toHaveLength(0);
  });

  it('says so when a save fails, and that the data is still on this device', () => {
    const { rerender } = render(tree('saving'));
    rerender(tree('error'));
    expect(notices()).toHaveLength(1);
    expect(notices()[0]).toHaveTextContent(/Saved on this device/);
  });

  it('says it once per failure, not once per retry', () => {
    const { rerender } = render(tree('error'));
    rerender(tree('saving'));
    rerender(tree('error'));
    rerender(tree('saving'));
    rerender(tree('error'));
    expect(notices()).toHaveLength(1);
  });
});
