import { isNativeApp } from '../native/platform';

/** Save through the native picker, or a browser download with deferred cleanup. */
export function downloadBlob(filename: string, blob: Blob): boolean | Promise<boolean> {
  if (isNativeApp()) {
    return import('../native/files').then(({ saveNativeFile }) => saveNativeFile(blob, filename));
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  // WebKit may not have consumed the Blob when click() returns.
  setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 10_000);
  return true;
}

/** Keep jsPDF's browser delivery, using its Blob output in a native shell. */
export function downloadPdf(filename: string, doc: { output(type: 'blob'): Blob; save(filename: string): unknown }): boolean | Promise<boolean> {
  if (isNativeApp()) return downloadBlob(filename, doc.output('blob'));
  doc.save(filename);
  return true;
}
