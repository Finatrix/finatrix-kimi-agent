import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { addShared, SHARE_LANDING } from '../lib/shareInbox';

/**
 * Images shared to the installed app from another app's share sheet.
 *
 * The web side of the in-repo `FxShare` plugin:
 *   android/app/src/main/java/co/finatrix/app/SharePlugin.java
 *     (the share intent on MainActivity, copied into the app's cache)
 *   ios/App/App/FxSharePlugin.swift
 *     (files the Share Extension left in the App Group container)
 *
 * Both halves hand over the same thing: copies of the shared images inside the
 * app's own storage. They are read here, put in the share inbox, deleted, and
 * the Expense Tracker is opened to review them. Nothing leaves the device.
 */

interface SharedFile {
  /** Absolute path inside the app's own storage. */
  path: string;
  name: string;
  type: string;
}

interface FxSharePlugin {
  /** Shared files not yet handed to the page, emptied by this call. */
  takePending(): Promise<{ files: SharedFile[] }>;
  /** Delete the copies once read. Paths outside the plugin's own folder are ignored. */
  finish(options: { paths: string[] }): Promise<void>;
  /** A share arrived while the app was running (Android). */
  addListener(event: 'received', handler: () => void): Promise<{ remove: () => Promise<void> }>;
}

const FxShare = registerPlugin<FxSharePlugin>('FxShare');

/** The URL the iOS Share Extension opens the app with. */
export const SHARE_URL = 'co.finatrix.app://share';

async function readShared(file: SharedFile): Promise<File | null> {
  try {
    const res = await fetch(Capacitor.convertFileSrc(file.path));
    if (!res.ok) return null;
    const blob = await res.blob();
    return new File([blob], file.name || 'Shared image', { type: file.type || blob.type });
  } catch {
    return null;
  }
}

/**
 * Move whatever the native side is holding into the inbox, and open the review
 * when there was something. Safe to call at any time and as often as wanted:
 * an empty hand-over does nothing.
 */
export async function drainShares(go: (to: string) => void): Promise<void> {
  let files: SharedFile[];
  try {
    ({ files } = await FxShare.takePending());
  } catch {
    return; // A build without the plugin.
  }
  if (!files?.length) return;
  const read = (await Promise.all(files.map(readShared))).filter((f): f is File => f !== null);
  void FxShare.finish({ paths: files.map((f) => f.path) }).catch(() => {});
  const kept = read.length ? await addShared(read).catch(() => 0) : 0;
  go(kept ? SHARE_LANDING : '/tools/expenses?share=failed');
}

/**
 * Listen for shares for the life of the app: once now (a cold start from the
 * share sheet), whenever the app comes back to the front, when the extension
 * opens the app's share URL (iOS), and when a share arrives while it runs
 * (Android). Returns a function that stops listening.
 */
export function listenForShares(go: (to: string) => void): () => void {
  let stopped = false;
  let busy: Promise<void> = Promise.resolve();
  // One drain at a time, so two triggers for one share open it once.
  const drain = () => {
    busy = busy.then(() => (stopped ? undefined : drainShares(go)));
  };
  const handles: Array<Promise<{ remove: () => Promise<void> } | undefined>> = [
    App.addListener('resume', drain).catch(() => undefined),
    App.addListener('appUrlOpen', (e) => { if (e.url.startsWith(SHARE_URL)) drain(); }).catch(() => undefined),
    FxShare.addListener('received', drain).catch(() => undefined),
  ];
  drain();
  return () => {
    stopped = true;
    for (const h of handles) void h.then((x) => x?.remove()).catch(() => {});
  };
}
