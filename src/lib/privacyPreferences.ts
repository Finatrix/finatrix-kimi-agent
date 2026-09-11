const KEY = 'fx_analytics_opt_out';
let sessionOptOut = false;

/** A device preference, never part of the financial cloud payload. */
export function analyticsOptedOut(): boolean {
  try { const raw = localStorage.getItem(KEY); return raw === null ? sessionOptOut : raw === '1'; } catch { return sessionOptOut; }
}

export function setAnalyticsOptOut(value: boolean): boolean {
  sessionOptOut = value;
  let persisted = true;
  try { localStorage.setItem(KEY, value ? '1' : '0'); } catch { persisted = false; }
  window.dispatchEvent(new Event('fx:privacy'));
  return persisted;
}

export function browserPrivacyRequested(): boolean {
  if (typeof navigator === 'undefined') return true;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  return nav.doNotTrack === '1' || nav.msDoNotTrack === '1' || nav.globalPrivacyControl === true
    || (typeof window !== 'undefined' && (window as Window & { doNotTrack?: string }).doNotTrack === '1');
}
