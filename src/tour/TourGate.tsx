import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { currentClientHints } from '../walkthrough/gating';
import { passesOfferPrecheck, shouldOfferTour } from './gating';
import { TOUR_EVENT, tourRequestFromState, type TourRequest } from './launch';
import { browserStorage, recordOfferShown } from './progress';

/**
 * Mounted once by the tools shell, after its data has loaded. Everyone pays
 * for this component and nothing more: the tour itself (engine, chapters,
 * illustrations, stylesheets) is a separate chunk fetched the first time
 * something asks for it —
 *  - a `TOUR_EVENT` from ./launch (Settings, the command palette, the shell's
 *    "Tour this page" button);
 *  - router state on arrival (the landing page's "Full tutorial" link);
 *  - the automatic offer, when ./gating says this person qualifies.
 */

const TourRoot = lazy(() => import('./TourRoot'));

/** How long the dashboard gets to settle before the offer appears. */
const OFFER_DELAY_MS = 1600;

export default function TourGate() {
  const location = useLocation();
  const navigate = useNavigate();
  const [request, setRequest] = useState<{ r: TourRequest; n: number } | null>(null);

  // The storage the offer is judged on is read ONCE, at mount — before the
  // first-run intro (mounted beside this gate) marks itself seen. Someone
  // meeting the intro right now is therefore not "returning", and the offer
  // cannot stack on the intro.
  const [entry] = useState(() => {
    const snapshot = new Map<string, string | null>();
    const read = (key: string) => {
      if (!snapshot.has(key)) snapshot.set(key, browserStorage.read(key));
      return snapshot.get(key) ?? null;
    };
    for (const key of ['fx_walkthrough_seen', 'fx_onboarding_done', 'fx_last_tool']) read(key);
    return { path: location.pathname, read };
  });

  const open = useCallback((r: TourRequest) => setRequest((prev) => ({ r, n: (prev?.n ?? 0) + 1 })), []);

  useEffect(() => {
    const on = (e: Event) => {
      const detail = (e as CustomEvent<TourRequest>).detail;
      if (detail && typeof detail === 'object' && 'kind' in detail) open(detail);
    };
    window.addEventListener(TOUR_EVENT, on);
    return () => window.removeEventListener(TOUR_EVENT, on);
  }, [open]);

  // A link into the shell asked for the tour. Consume the state so a reload
  // or a Back to this entry does not reopen it.
  useEffect(() => {
    const r = tourRequestFromState(location.state);
    if (!r) return;
    open(r);
    navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null });
  }, [location.state, location.pathname, location.search, location.hash, navigate, open]);

  // The automatic offer.
  useEffect(() => {
    const input = {
      pathname: entry.path,
      client: currentClientHints(),
      testRun: import.meta.env.MODE === 'test',
      storage: { read: entry.read },
      now: Date.now(),
    };
    if (!passesOfferPrecheck(input)) return;
    let cancelled = false;
    let timer = 0;
    import('../tools/lib/settings')
      .then(({ hasAnyData }) => {
        if (cancelled || !shouldOfferTour({ ...input, hasData: hasAnyData })) return;
        timer = window.setTimeout(() => {
          // Never on top of another dialog (the intro, the palette, a sheet);
          // it simply waits for a later visit.
          if (document.querySelector('[aria-modal="true"]')) return;
          recordOfferShown();
          setRequest((prev) => prev ?? { r: { kind: 'offer' }, n: 1 });
        }, OFFER_DELAY_MS);
      })
      .catch(() => { /* offline chunk fetch — no offer rather than an error */ });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [entry]);

  const close = useCallback(() => setRequest(null), []);

  if (!request) return null;
  return (
    <Suspense fallback={null}>
      <TourRoot key={request.n} request={request.r} onClose={close} />
    </Suspense>
  );
}
