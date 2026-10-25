import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

/**
 * The sub-view of an area, kept in `?tab=` so a view can be linked to, shared,
 * bookmarked and restored with Back. Unknown values fall back to the first tab.
 */
export function useAreaTab<K extends string>(keys: readonly K[]): [K, (next: K) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const active = (keys as readonly string[]).includes(raw ?? '') ? (raw as K) : keys[0]!;
  const select = useCallback(
    (next: K) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === keys[0]) p.delete('tab');
          else p.set('tab', next);
          return p;
        },
        { replace: false },
      );
    },
    [keys, setParams],
  );
  return [active, select];
}
