/**
 * pdf.js 6's legacy distribution supports Chrome 125+ and Safari 18+.
 * Keep its higher floor local to PDF import; calculators and CSV import work
 * on older engines. The capability checks cover WebViews with unusual user
 * agents, while the engine checks cover requirements a simple API probe misses.
 */
export function pdfCompatibilityMessage(userAgent: string = navigator.userAgent): string | null {
  if (typeof Worker !== 'function' || typeof WebAssembly !== 'object' || typeof ReadableStream !== 'function') {
    return 'PDF import is unavailable in this browser. Please import a CSV statement instead.';
  }

  const ios = /(?:iPhone|iPad|iPod).*?OS (\d+)[_.]/.exec(userAgent);
  if (ios && Number(ios[1]) < 18) {
    return 'PDF import needs iOS 18 or later. You can still import CSV or Excel statements on this device.';
  }

  const chromium = /(?:Chrome|Chromium|CriOS)\/(\d+)/.exec(userAgent);
  if (chromium && Number(chromium[1]) < 125) {
    return 'PDF import needs a newer Android System WebView or browser. Update it from the app store, or import a CSV or Excel statement.';
  }

  const safari = /Version\/(\d+)(?:\.\d+)?[^\n]*Safari\//.exec(userAgent);
  if (safari && !chromium && Number(safari[1]) < 18) {
    return 'PDF import needs Safari 18 or later. You can still import CSV or Excel statements.';
  }
  return null;
}
