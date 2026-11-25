import { registerPlugin } from '@capacitor/core';
import type { WatchContext } from '../tools/lib/watchData';

/**
 * The web side of the in-repo `FxWatch` plugin (iOS only so far):
 *   ios/App/App/FxWatchPlugin.swift, backed by ios/App/App/WatchBridge.swift
 *
 * The phone side of WatchConnectivity has to be active before the web layer
 * loads (a watch can wake the app in the background), so the native side keeps
 * expenses from the watch in its own inbox until this layer takes them in and
 * acknowledges them. Wear OS will get the same three calls (docs/WATCH.md).
 * Loaded only inside the apps.
 */
interface FxWatchPlugin {
  /** Hand the watch its context (a JSON string of `WatchContext`). */
  publish(options: { payload: string }): Promise<void>;
  /** Expenses from the watch not yet acknowledged, as JSON strings. */
  drain(): Promise<{ items: string[] }>;
  /** Drop these ids from the inbox and tell the watch they are in. */
  ack(options: { ids: string[] }): Promise<void>;
  addListener(event: 'watchExpenses', fn: () => void): Promise<{ remove: () => Promise<void> }>;
}

const FxWatch = registerPlugin<FxWatchPlugin>('FxWatch');

/** Never throws: a watch that missed one update catches the next. */
export async function publishWatch(context: WatchContext): Promise<void> {
  try {
    await FxWatch.publish({ payload: JSON.stringify(context) });
  } catch {
    /* An app build without the plugin, or no watch paired: nothing to do. */
  }
}

/** Parsed entries from the native inbox. Anything unparseable is dropped here. */
export async function drainWatchInbox(): Promise<unknown[]> {
  try {
    const { items } = await FxWatch.drain();
    return (items ?? []).map((s) => { try { return JSON.parse(s) as unknown; } catch { return null; } });
  } catch {
    return [];
  }
}

export async function ackWatchExpenses(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try { await FxWatch.ack({ ids }); } catch { /* it is sent again next time, and the phone ignores repeats */ }
}

/** Calls `fn` when the native inbox has something new. Returns an unsubscribe. */
export function onWatchExpenses(fn: () => void): () => void {
  let handle: { remove: () => Promise<void> } | undefined;
  let gone = false;
  void FxWatch.addListener('watchExpenses', fn).then((h) => { if (gone) void h.remove(); else handle = h; }).catch(() => {});
  return () => { gone = true; if (handle) void handle.remove(); };
}
