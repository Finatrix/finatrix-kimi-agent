/**
 * Images shared to FinatriX, waiting for the import review.
 *
 * Three doors lead here: the web share target (the service worker receives the
 * POST and writes the files, public/sw.js), the Android share sheet and the iOS
 * share extension (both through src/native/shareIntake.ts). The Expense Tracker
 * then takes them out and opens the screenshot import with them, so a shared
 * image is reviewed exactly like a chosen one, and nothing is saved until the
 * user presses Import.
 *
 * IndexedDB, not memory: the service worker that receives a web share is not
 * the page that reviews it, and the page may be reloaded (or wait behind the
 * app lock) in between. Never synced, and emptied the moment it is read.
 *
 * public/sw.js writes the same store with the same names. src/test/shareInbox
 * holds the two together.
 */

export const SHARE_DB = 'fx-share-inbox';
export const SHARE_STORE = 'files';
export const SHARE_DB_VERSION = 1;

/** Where a share lands to be reviewed. */
export const SHARE_LANDING = '/tools/expenses?share=1';

/** Files older than this are dropped unread: a share that was never opened is not a pending task. */
export const SHARE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Most files kept from one share. */
export const SHARE_MAX_FILES = 10;

/** Largest file kept. The import itself refuses anything bigger. */
export const SHARE_MAX_BYTES = 15 * 1024 * 1024;

interface SharedRecord {
  name: string;
  type: string;
  blob: Blob;
  /** `Date.now()` when it arrived. */
  at: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable.'));
      return;
    }
    const req = indexedDB.open(SHARE_DB, SHARE_DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(SHARE_STORE)) {
        req.result.createObjectStore(SHARE_STORE, { autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open the share inbox.'));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Share inbox write failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('Share inbox write aborted.'));
  });
}

/** Only images of a readable size are kept; anything else in a share is ignored. */
export function acceptShared(file: Blob & { name?: string }): boolean {
  return file.size > 0 && file.size <= SHARE_MAX_BYTES && /^image\//i.test(file.type || '');
}

/** Put shared files in the inbox. Returns how many were kept. */
export async function addShared(files: readonly File[], now: number = Date.now()): Promise<number> {
  const kept = files.filter(acceptShared).slice(0, SHARE_MAX_FILES);
  if (!kept.length) return 0;
  const db = await open();
  try {
    const tx = db.transaction(SHARE_STORE, 'readwrite');
    const store = tx.objectStore(SHARE_STORE);
    // A new share replaces one never opened: the user is acting on this one.
    store.clear();
    for (const file of kept) {
      const record: SharedRecord = { name: file.name, type: file.type, blob: file, at: now };
      store.add(record);
    }
    await done(tx);
  } finally {
    db.close();
  }
  return kept.length;
}

/**
 * Take every waiting file out of the inbox, oldest first, and empty it.
 * Files past `SHARE_MAX_AGE_MS` are dropped. Never throws: no inbox is no files.
 */
export async function takeShared(now: number = Date.now()): Promise<File[]> {
  let db: IDBDatabase;
  try {
    db = await open();
  } catch {
    return [];
  }
  try {
    const tx = db.transaction(SHARE_STORE, 'readwrite');
    const store = tx.objectStore(SHARE_STORE);
    const all = store.getAll();
    store.clear();
    await done(tx);
    const records = (all.result ?? []) as SharedRecord[];
    return records
      .filter((r) => r && r.blob instanceof Blob && now - r.at <= SHARE_MAX_AGE_MS)
      .slice(0, SHARE_MAX_FILES)
      .map((r, i) => new File([r.blob], r.name || `Shared image ${i + 1}`, { type: r.type || r.blob.type }));
  } catch {
    return [];
  } finally {
    db.close();
  }
}
