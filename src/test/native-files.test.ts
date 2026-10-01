import { beforeEach, describe, expect, it, vi } from 'vitest';

const { saveFile } = vi.hoisted(() => ({ saveFile: vi.fn(async () => ({ saved: true })) }));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({ saveFile }) }));

import { saveNativeFile } from '../native/files';

describe('native file export', () => {
  beforeEach(() => saveFile.mockClear());

  it('preserves binary PDF bytes and provides a filename and media type to the system picker', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0, 0xff, 0x80]);
    await expect(saveNativeFile(new Blob([bytes], { type: 'application/pdf' }), 'budget.pdf')).resolves.toBe(true);
    const options = saveFile.mock.calls[0] as unknown as [{ data: string; filename: string; mimeType: string }];
    expect(options[0].filename).toBe('budget.pdf');
    expect(options[0].mimeType).toBe('application/pdf');
    expect(Uint8Array.from(atob(options[0].data), (c) => c.charCodeAt(0))).toEqual(bytes);
  });

  it('uses a filename rather than allowing a user-supplied label to become a path', async () => {
    await saveNativeFile(new Blob(['income'], { type: 'text/csv;charset=utf-8' }), '../private/export.csv');
    expect(saveFile).toHaveBeenCalledWith(expect.objectContaining({ filename: '_private_export.csv', mimeType: 'text/csv' }));
  });

  it('supplies safe defaults for files without a type or a usable name', async () => {
    await saveNativeFile(new Blob(['{}']), '..');
    expect(saveFile).toHaveBeenCalledWith(expect.objectContaining({ filename: 'finatrix-export', mimeType: 'application/octet-stream' }));
  });

  it('treats dismissing the sheet as a cancellation, not a failure', async () => {
    saveFile.mockResolvedValueOnce({ saved: false });
    await expect(saveNativeFile(new Blob(['{}']), 'backup.json')).resolves.toBe(false);
  });

  it('propagates native save errors so the export control can offer a retry', async () => {
    saveFile.mockRejectedValueOnce(new Error('Disk full'));
    await expect(saveNativeFile(new Blob(['{}']), 'backup.json')).rejects.toThrow('Disk full');
  });
});
