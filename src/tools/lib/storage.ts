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
  set(key: string, value: string): void;
  readonly persistent: boolean;
}

function createStore(): FxStore {
  const mem: Record<string, string> = {};
  let ok = false;
  try {
    localStorage.setItem('__fx_t', '1');
    localStorage.removeItem('__fx_t');
    ok = true;
  } catch {
    ok = false;
  }

  return {
    get(key: string, fallback: string): string {
      try {
        if (ok) {
          const v = localStorage.getItem(key);
          return v === null ? fallback : v;
        }
      } catch {
        /* fall through to memory */
      }
      return key in mem ? mem[key] : fallback;
    },
    set(key: string, value: string): void {
      try {
        if (ok) {
          localStorage.setItem(key, value);
          notifyWrite(key);
          return;
        }
      } catch {
        /* fall through to memory */
      }
      mem[key] = value;
      notifyWrite(key);
    },
    persistent: ok,
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
