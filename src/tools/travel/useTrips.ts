import { useCallback, useEffect, useMemo, useState } from 'react';
import { ymdLocal } from '../../lib/date';
import { loadExpenses } from '../lib/expense';
import { effectiveRates, loadLiveRates } from '../lib/fx';
import { refreshLiveRates } from '../lib/fxLive';
import { onLocalWrite } from '../lib/storage';
import {
  TRIPS_KEY, firstDayRefresh, liveTrips, loadAllTrips, saveAllTrips, tripOn, upsertTrip, type Trip,
} from '../lib/trips';

/**
 * The user's trips, kept in step with storage (including trips merged in from
 * another device), plus the once-only rate refresh on a trip's first day.
 */
export function useTrips() {
  const [all, setAll] = useState<Trip[]>(loadAllTrips);

  useEffect(() => onLocalWrite((key) => {
    if (key === TRIPS_KEY) setAll(loadAllTrips());
  }), []);

  const trips = useMemo(() => liveTrips(all), [all]);

  /** Save one trip, re-reading storage first so a trip merged in meanwhile is kept. */
  const saveTrip = useCallback((trip: Trip) => {
    const next = upsertTrip(loadAllTrips(), trip);
    saveAllTrips(next);
    setAll(next);
  }, []);

  /** Delete a trip. Its record stays, marked, so the deletion syncs; its expenses stay too. */
  const deleteTrip = useCallback((trip: Trip) => {
    const nowIso = new Date().toISOString();
    const next = upsertTrip(loadAllTrips(), { ...trip, deletedAt: nowIso, updatedAt: nowIso });
    saveAllTrips(next);
    setAll(next);
  }, []);

  // A trip set up before it started takes the live rate again, once, on its
  // first day (lib/trips.ts `firstDayRefresh`), after today's rates arrive.
  useEffect(() => {
    let alive = true;
    void refreshLiveRates().then(() => {
      if (!alive) return;
      const today = ymdLocal(new Date());
      const trip = tripOn(loadAllTrips(), today);
      if (!trip) return;
      const live = loadLiveRates();
      const updated = firstDayRefresh(trip, {
        today,
        liveToday: live?.checkedOn === today,
        liveAsOf: live?.asOf ?? null,
        rates: effectiveRates(),
        hasExpenses: loadExpenses().some((e) => e.tripId === trip.id),
        nowIso: new Date().toISOString(),
      });
      if (updated) saveTrip(updated);
    });
    return () => { alive = false; };
  }, [saveTrip]);

  return { trips, saveTrip, deleteTrip };
}
