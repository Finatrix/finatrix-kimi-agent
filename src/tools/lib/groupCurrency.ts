import { ymdLocal } from '../../lib/date';
import { effectiveRates, type RateTable } from './fx';
import { isHomeTrip, loadTrips, nextTripAfter, tripHomeAmount, tripOn, type Trip } from './trips';
import { shareRateFor } from './groupShare';

/**
 * Groups in another currency (step 3.9): trip groups in travel mode's
 * currency, and members in other countries. A group keeps one currency
 * (docs/GROUPS.md); each member's phone prices their own share into their
 * own home currency (groupShare.ts). These are the small helpers the screens
 * need on top.
 */

/** Your current trip, else your next one, when it is abroad: what a new Trip group starts in. */
export function groupTripCurrency(
  home: string,
  trips: readonly Trip[] = loadTrips(),
  today: string = ymdLocal(new Date()),
): Pick<Trip, 'currency' | 'name'> | null {
  const trip = tripOn(trips, today) ?? nextTripAfter(trips, today);
  if (!trip || isHomeTrip(trip) || trip.homeCurrency !== home) return null;
  return { currency: trip.currency, name: trip.name || `${trip.currency} trip` };
}

/**
 * A group amount in your home currency, for display beside a balance only
 * ("≈ ₹2,947.92"). Same formula and rate as your share's copy for today
 * (no fee). Null when the group is in your currency or there is no rate:
 * the screen then shows nothing rather than a guess.
 */
export function approxInHome(
  amount: number,
  groupCurrency: string,
  home: string,
  today: string = ymdLocal(new Date()),
  trips: readonly Trip[] = loadTrips(),
  rates: RateTable = effectiveRates(),
): number | null {
  if (groupCurrency.toUpperCase() === home.toUpperCase()) return null;
  const priced = shareRateFor(groupCurrency.toUpperCase(), home.toUpperCase(), trips, rates)(today);
  return priced ? tripHomeAmount(amount, priced.rate, undefined, undefined) : null;
}
