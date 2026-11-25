/**
 * Photos in the bill locker, kept on this device only.
 *
 * IndexedDB, one record per photo, keyed by an id the locker's records hold.
 * Nothing here is uploaded or synced (decided 24 Nov 2026: synced photos can
 * come later, once there is file storage to put them in). The same store
 * survives the app being closed; it does not survive the app being deleted or
 * its data cleared, which the locker page says in plain words.
 *
 * Reads and writes go through `PhotoBackend`, so tests can swap in a memory
 * store. The default backend is IndexedDB; with none (a locked-down browser),
 * every call fails soft and the locker simply holds records without photos.
 */

export const PHOTO_DB = 'fx-bill-locker';
export const PHOTO_STORE = 'photos';
export const PHOTO_DB_VERSION = 1;

/** Largest photo accepted from the camera or gallery, before it is shrunk. */
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
/** Longest side kept. A bill is readable at this size and a phone photo is not megabytes. */
export const MAX_PHOTO_SIDE = 2000;
const JPEG_QUALITY = 0.82;

export interface StoredPhoto {
  id: string;
  type: string;
  /**
   * The bytes, not a Blob: WebKit refuses to store a Blob in IndexedDB in a
   * private window, and an ArrayBuffer works everywhere.
   */
  data: ArrayBuffer;
  /** `Date.now()` when stored. */
  at: number;
}

export interface PhotoBackend {
  put(photo: StoredPhoto): Promise<void>;
  get(id: string): Promise<StoredPhoto | undefined>;
  delete(ids: readonly string[]): Promise<void>;
  keys(): Promise<string[]>;
  clear(): Promise<void>;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable.'));
      return;
    }
    const req = indexedDB.open(PHOTO_DB, PHOTO_DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(PHOTO_STORE)) {
        req.result.createObjectStore(PHOTO_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open the bill locker.'));
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Bill locker read failed.'));
  });
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Bill locker write failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('Bill locker write aborted.'));
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => Promise<T> | T): Promise<T> {
  const db = await open();
  try {
    const tx = db.transaction(PHOTO_STORE, mode);
    const result = await run(tx.objectStore(PHOTO_STORE));
    if (mode === 'readwrite') await finished(tx);
    return result;
  } finally {
    db.close();
  }
}

const indexedDbBackend: PhotoBackend = {
  put: (photo) => withStore('readwrite', (s) => { s.put(photo); }),
  get: (id) => withStore('readonly', (s) => request(s.get(id))).then((r) => r as StoredPhoto | undefined),
  delete: (ids) => withStore('readwrite', (s) => { ids.forEach((id) => s.delete(id)); }),
  keys: () => withStore('readonly', (s) => request(s.getAllKeys())).then((k) => k.filter((x): x is string => typeof x === 'string')),
  clear: () => withStore('readwrite', (s) => { s.clear(); }),
};

let backend: PhotoBackend = indexedDbBackend;

/** For tests: swap the store. Pass nothing to go back to IndexedDB. */
export function setPhotoBackend(next?: PhotoBackend): void {
  backend = next ?? indexedDbBackend;
}

function toBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the photo.'));
    reader.readAsArrayBuffer(blob);
  });
}

export function newPhotoId(): string {
  return `ph_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** What a chosen file is allowed to be. */
export function acceptPhoto(file: Pick<Blob, 'size' | 'type'>): 'ok' | 'empty' | 'big' | 'type' {
  if (file.size === 0) return 'empty';
  if (file.size > MAX_PHOTO_BYTES) return 'big';
  if (file.type && !/^image\//i.test(file.type)) return 'type';
  return 'ok';
}

/** Scale (width, height) so the longer side is at most `max`. Never scales up. */
export function fitWithin(width: number, height: number, max: number = MAX_PHOTO_SIDE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const k = max / longest;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/**
 * A smaller copy of the photo as a JPEG, so a locker of fifty bills is tens of
 * megabytes and not gigabytes. Falls back to the original when the browser
 * cannot decode or draw it, or when the copy is not smaller.
 */
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  try {
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;
    const bitmap = await createImageBitmap(file);
    try {
      const { width, height } = fitWithin(bitmap.width, bitmap.height);
      if (width === bitmap.width && file.type === 'image/jpeg') return file;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0, width, height);
      const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
      return out && out.size > 0 && out.size < file.size ? out : file;
    } finally {
      bitmap.close?.();
    }
  } catch {
    return file;
  }
}

/** Store a photo (shrunk) and return its id, or null when this device would not keep it. */
export async function savePhoto(file: Blob): Promise<string | null> {
  try {
    const blob = await shrinkPhoto(file);
    const id = newPhotoId();
    await backend.put({ id, type: blob.type || 'image/jpeg', data: await toBuffer(blob), at: Date.now() });
    return id;
  } catch {
    return null;
  }
}

export async function loadPhoto(id: string): Promise<Blob | null> {
  try {
    const row = await backend.get(id);
    return row ? new Blob([row.data], { type: row.type }) : null;
  } catch {
    return null;
  }
}

export async function deletePhotos(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    await backend.delete(ids);
  } catch {
    /* A photo that cannot be deleted now is swept up the next time the locker opens. */
  }
}

/** Remove every stored photo that no record holds (a save that was abandoned, a record deleted elsewhere). */
export async function sweepOrphans(keep: ReadonlySet<string>): Promise<number> {
  try {
    const orphans = (await backend.keys()).filter((k) => !keep.has(k));
    if (orphans.length) await backend.delete(orphans);
    return orphans.length;
  } catch {
    return 0;
  }
}

/** Remove every photo. Called when the account changes or the person resets their data. */
export async function clearPhotos(): Promise<void> {
  try {
    await backend.clear();
  } catch {
    /* Nothing stored, or storage unavailable: either way nothing is left to show. */
  }
}

/**
 * Ask the browser not to evict the photos when the device runs low on space.
 * Best effort: the installed apps and an installed PWA are usually granted it.
 */
export async function requestDurableStorage(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
