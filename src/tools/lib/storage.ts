/**
 * Safe key/value storage for the tools — a faithful port of the original
 * `store` object that lived inside public/tools-app.html.
 *
 * Behaviour preserved exactly:
 *  - Uses localStorage when available; degrades to an in-memory map if blocked
 *    (private mode, storage disabled) so the tools never throw.
 *  - `get(k, d)` returns the stored string or the default `d`.
 *  - `set(k, v)` writes the string value.
 *
 * One addition (needed now that the tools run in the SAME document as the React
 * shell rather than inside a sandboxed iframe): every successful `set` also
 * dispatches a `fx:write` CustomEvent on `window`. Previously the shell learned
 * about tool writes via the cross-context `storage` event the iframe fired; that
 * event does NOT fire in the same document that made the change. The `fx:write`
 * event lets ToolsLayout trigger the exact same debounced cloud-sync push.
 */

const FX_WRITE_EVENT = 'fx:write';

interface FxStore {
  get(key: string, fallback: string): string;
  /**
   * The stored value, or `null` when the key is absent. Honours the in-memory
   * shadow exactly as `get` does. Callers that must distinguish "absent" from
   * "stored empty string" — cloud sync, which decides what to upload — have to
   * read through this rather than touching `localStorage` directly, or they
   * silently miss values that only ever made it into `mem`.
   */
  raw(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  readonly persistent: boolean;
  /** True while any latest value lives only in this session after a failed write. */
  readonly hasUnpersistedChanges: boolean;
}

function createStore(): FxStore {
  // A null entry is a failed deletion: it must hide the older disk value just
  // as a failed write does, including when cloud sync builds its next snapshot.
  const mem = new Map<string, string | null>();
  let ok = false;
  try {
    localStorage.setItem('__fx_t', '1');
    localStorage.removeItem('__fx_t');
    ok = true;
  } catch {
    ok = false;
  }

  // A key lands in `mem` only when a write to localStorage failed (or
  // localStorage is unavailable); that in-session value is newer than
  // whatever localStorage holds, so it must win.
  const raw = (key: string): string | null => {
    if (mem.has(key)) return mem.get(key) ?? null;
    try {
      if (ok) return localStorage.getItem(key);
    } catch {
      /* fall through */
    }
    return null;
  };

  return {
    raw,
    get(key: string, fallback: string): string {
      const v = raw(key);
      return v === null ? fallback : v;
    },
    set(key: string, value: string): void {
      try {
        if (ok) {
          localStorage.setItem(key, value);
          mem.delete(key); // localStorage is authoritative again
          notifyWrite(key);
          return;
        }
      } catch {
        /* quota/security error — shadow the value in memory so this session
           stays consistent even though the write did not persist */
      }
      mem.set(key, value);
      notifyWrite(key);
    },
    remove(key: string): void {
      try {
        if (ok) localStorage.removeItem(key);
        mem.delete(key);
      } catch {
        mem.set(key, null);
      }
      notifyWrite(key);
    },
    persistent: ok,
    get hasUnpersistedChanges() { return mem.size > 0; },
  };
}

function notifyWrite(key: string) {
  try {
    window.dispatchEvent(new CustomEvent(FX_WRITE_EVENT, { detail: { key } }));
  } catch {
    /* SSR / no window — ignore */
  }
}

/** Subscribe to same-document writes. Returns an unsubscribe function. */
export function onLocalWrite(handler: (key: string) => void): () => void {
  const listener = (e: Event) => {
    const key = (e as CustomEvent<{ key: string }>).detail?.key;
    if (key) handler(key);
  };
  window.addEventListener(FX_WRITE_EVENT, listener);
  return () => window.removeEventListener(FX_WRITE_EVENT, listener);
}

export const store = createStore();

/** Convenience helpers for JSON-encoded values (used by several tools). */
export function getJSON<T>(key: string, fallback: T): T {
  try {
    const raw = store.get(key, '');
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
}

export function setJSON(key: string, value: unknown): void {
  try {
    store.set(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
