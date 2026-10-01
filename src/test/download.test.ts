import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob, downloadPdf } from '../lib/download';
import { isNativeApp } from '../native/platform';
import { saveNativeFile } from '../native/files';

vi.mock('../native/platform', () => ({ isNativeApp: vi.fn(() => false) }));
vi.mock('../native/files', () => ({ saveNativeFile: vi.fn(async () => true) }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isNativeApp).mockReturnValue(false);
  vi.mocked(saveNativeFile).mockResolvedValue(true);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); document.body.innerHTML = ''; });

describe('download delivery', () => {
  it('attaches browser downloads and waits before releasing their Blob URL', () => {
    vi.useFakeTimers();
    const revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:download'), revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.isConnected).toBe(true);
      expect(this.download).toBe('report.csv');
    });
    expect(downloadBlob('report.csv', new Blob(['data']))).toBe(true);
    expect(click).toHaveBeenCalledOnce();
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    expect(revoke).toHaveBeenCalledWith('blob:download');
    expect(document.querySelector('a')).toBeNull();
  });

  it('sends native exports to the platform picker and preserves cancellation', async () => {
    vi.mocked(isNativeApp).mockReturnValue(true);
    const blob = new Blob(['data'], { type: 'text/csv' });
    expect(await downloadBlob('report.csv', blob)).toBe(true);
    expect(saveNativeFile).toHaveBeenCalledWith(blob, 'report.csv');
    vi.mocked(saveNativeFile).mockResolvedValueOnce(false);
    expect(await downloadBlob('report.csv', blob)).toBe(false);
  });

  it('propagates native write failures to the calling UI', async () => {
    vi.mocked(isNativeApp).mockReturnValue(true);
    vi.mocked(saveNativeFile).mockRejectedValueOnce(new Error('No space'));
    await expect(downloadBlob('report.csv', new Blob(['data']))).rejects.toThrow('No space');
  });

  it('uses PDF Blob output in the app and the existing PDF save path in browsers', async () => {
    const blob = new Blob(['pdf'], { type: 'application/pdf' });
    const doc = { output: vi.fn(() => blob), save: vi.fn() };
    expect(downloadPdf('report.pdf', doc)).toBe(true);
    expect(doc.save).toHaveBeenCalledWith('report.pdf');
    expect(doc.output).not.toHaveBeenCalled();
    vi.mocked(isNativeApp).mockReturnValue(true);
    expect(await downloadPdf('report.pdf', doc)).toBe(true);
    expect(doc.output).toHaveBeenCalledWith('blob');
    expect(saveNativeFile).toHaveBeenCalledWith(blob, 'report.pdf');
    expect(doc.save).toHaveBeenCalledTimes(1);
  });
});
