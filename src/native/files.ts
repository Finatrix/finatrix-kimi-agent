import { registerPlugin } from '@capacitor/core';

const FileExport = registerPlugin<{
  saveFile(options: { data: string; filename: string; mimeType: string }): Promise<{ saved: boolean }>;
}>('FxFileExport');

/** A display name, never a path into the app's private files. */
function safeFilename(filename: string): string {
  return filename.replace(/[\\/:*?"<>|\p{Cc}]/gu, '_')
    .trim().replace(/^\.+/, '').slice(0, 180) || 'finatrix-export';
}

/**
 * Save a generated file through Android's document picker or the iOS share
 * sheet. WKWebView and Android WebView do not implement browser blob downloads.
 * Keep this lazy: web callers retain their ordinary browser download path.
 * Dismissing the native sheet is a normal outcome, represented by false.
 */
export async function saveNativeFile(blob: Blob, filename: string): Promise<boolean> {
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string' || !result.includes(',')) {
        reject(new Error('Could not prepare the export. Please try again.'));
        return;
      }
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('Could not read the export. Please try again.'));
    reader.onabort = () => reject(new Error('Export preparation was interrupted. Please try again.'));
    reader.readAsDataURL(blob);
  });
  const result = await FileExport.saveFile({
    data,
    filename: safeFilename(filename),
    mimeType: blob.type.split(';')[0] || 'application/octet-stream',
  });
  return result.saved;
}
