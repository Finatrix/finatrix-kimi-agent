import { useEffect, useMemo, useState } from 'react';
import { CURRENCY_CODES } from '../lib/format';
import { effectiveRates, loadLiveRates, ratesAreLive, ratesAsOf, ratesDateLabel } from '../lib/fx';
import { refreshLiveRates } from '../lib/fxLive';
import { PLACES } from '../lib/travelPlaces';
import {
  addDays, daysInclusive, defaultHomeCats, fmtRate, fmtTripDay, genTripId, overlappingTrip, rateWithFee,
  tripLabel, tripRateFor, type Trip,
} from '../lib/trips';
import { FxAttribution } from '../ui/FxNote';
import { PercentField } from '../ui/MoneyField';
import { ToolSheet } from '../ui/ToolSheet';
import type { FlatCat } from '../ui/TransactionModal';

/**
 * Travel mode setup, and editing a trip.
 *
 * One short screen: where, when, the rate (fetched, fixed, editable), an
 * optional card fee, what stays in the home currency, and an optional name.
 * The rate is never guessed: with no rate for the currency, the sheet asks.
 * Changing the rate or fee of a trip with expenses asks before re-pricing them.
 */
export interface TripSheetProps {
  /** The trip being edited, or null to set one up. */
  trip: Trip | null;
  /** Starting values for a new trip ("Next stop?"). */
  prefill?: Partial<Trip>;
  trips: readonly Trip[];
  homeCode: string;
  homeSym: string;
  cats: readonly FlatCat[];
  today: string;
  /** How many of a trip's expenses a new rate or fee would re-price. */
  repriceCount: (tripId: string) => number;
  onSave: (trip: Trip, opts: { reprice: boolean }) => void;
  onEndNow?: (trip: Trip) => void;
  onDelete?: (trip: Trip) => void;
  onClose: () => void;
}

const QUICK_PICKS = [
  { days: 3, label: '3 days' },
  { days: 7, label: '1 week' },
  { days: 14, label: '2 weeks' },
] as const;


export function TripSheet({
  trip, prefill, trips, homeCode, homeSym, cats, today, repriceCount, onSave, onEndNow, onDelete, onClose,
}: TripSheetProps) {
  const editing = !!trip;
  const seed = trip ?? prefill ?? {};
  const [place, setPlace] = useState(seed.place ?? '');
  const [currency, setCurrency] = useState(seed.currency ?? '');
  const [start, setStart] = useState(seed.start ?? today);
  const [end, setEnd] = useState(seed.end ?? addDays(seed.start ?? today, 6));
  const [rateText, setRateText] = useState(trip ? String(trip.rate) : '');
  /** True once the user has typed their own rate (or the trip already had one). */
  const [manualRate, setManualRate] = useState(trip ? true : false);
  const [feeText, setFeeText] = useState(seed.feePct ? String(seed.feePct) : '');
  const [homeCats, setHomeCats] = useState<string[]>(() => seed.homeCats ?? defaultHomeCats(cats));
  const [catsOpen, setCatsOpen] = useState(false);
  const [name, setName] = useState(trip?.name ?? '');
  const [errors, setErrors] = useState<{ where?: string; dates?: string; rate?: string }>({});
  const [step, setStep] = useState<'form' | 'reprice' | 'delete'>('form');
  const [pending, setPending] = useState<Trip | null>(null);
  /** Bumped when today's rates arrive, so the rate line re-reads them. */
  const [ratesTick, setRatesTick] = useState(0);

  // Setting up a trip is exactly when today's rate matters: ask for it now
  // (at most once a day, shared with the app's own check).
  useEffect(() => {
    let live = true;
    void refreshLiveRates().then((r) => { if (live && r === 'updated') setRatesTick((n) => n + 1); });
    return () => { live = false; };
  }, []);

  const domestic = !!currency && currency === homeCode;
  const autoRate = useMemo(() => {
    void ratesTick;
    return currency && !domestic ? tripRateFor(currency, homeCode, effectiveRates()) : null;
  }, [currency, domestic, homeCode, ratesTick]);
  const typedRate = Number(rateText);
  const rate = domestic ? 1 : manualRate ? (Number.isFinite(typedRate) && typedRate > 0 ? typedRate : null) : autoRate;
  const fee = Number(feeText) > 0 ? Number(feeText) : undefined;
  const live = loadLiveRates();
  const rateDate = ratesDateLabel(ratesAsOf(live));
  const lockedCurrency = editing && repriceCount(trip!.id) > 0;

  const pickPlace = (name: string) => {
    setPlace(name);
    const found = PLACES.find((p) => p.name === name);
    if (found && !lockedCurrency) setCurrency(found.currency);
  };

  const quick = (days: number) => setEnd(addDays(start, days - 1));
  const tripLength = start && end && end >= start ? daysInclusive(start, end) : 0;

  const toggleCat = (k: string) =>
    setHomeCats((list) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k]));
  const homeCatLabels = cats.filter((c) => homeCats.includes(c.k)).map((c) => c.l);

  const build = (): Trip | null => {
    const e: typeof errors = {};
    if (!currency) e.where = 'Pick where you are going, or a currency.';
    if (!start || !end) e.dates = 'Pick the first and last day.';
    else if (end < start) e.dates = 'The last day is before the first.';
    else {
      const clash = overlappingTrip(trips, { id: trip?.id ?? '', start, end });
      if (clash) {
        e.dates = `This overlaps your ${tripLabel(clash)} trip (${fmtTripDay(clash.start)} to ${fmtTripDay(clash.end)}). Trips can't overlap.`;
      }
    }
    if (currency && !domestic && rate === null) {
      e.rate = `Enter the rate: what 1 ${currency} costs in ${homeCode}.`;
    }
    setErrors(e);
    if (Object.keys(e).length) return null;

    const nowIso = new Date().toISOString();
    const rateSource = domestic ? 'manual' : manualRate ? 'manual' : ratesAreLive(live) ? 'live' : 'builtin';
    const sameRate = trip && trip.rate === rate;
    const base: Trip = {
      id: trip?.id ?? genTripId(),
      ...(name.trim() ? { name: name.trim() } : {}),
      ...(place ? { place } : {}),
      currency,
      homeCurrency: trip?.homeCurrency ?? homeCode,
      start,
      end,
      rate: rate ?? 1,
      rateSource: sameRate ? trip!.rateSource : rateSource,
      ...(sameRate && trip!.rateAsOf ? { rateAsOf: trip!.rateAsOf }
        : rateSource !== 'manual' ? { rateAsOf: ratesAsOf(live) } : {}),
      // Set up on or after the first day: today's rate is already in, nothing to refresh.
      ...((trip?.rateRefreshed || start <= today) ? { rateRefreshed: true } : {}),
      ...(fee && !domestic ? { feePct: fee } : {}),
      homeCats,
      createdAt: trip?.createdAt ?? nowIso,
      updatedAt: nowIso,
    };
    return base;
  };

  const submit = () => {
    const next = build();
    if (!next) return;
    if (trip && (next.rate !== trip.rate || next.feePct !== trip.feePct) && repriceCount(trip.id) > 0) {
      setPending(next);
      setStep('reprice');
      return;
    }
    onSave(next, { reprice: false });
  };

  const active = !!trip && trip.start <= today && today <= trip.end;
  const title = editing ? 'Edit trip' : prefill ? 'Next stop' : 'Travel mode';

  if (step === 'reprice' && pending && trip) {
    const n = repriceCount(trip.id);
    return (
      <ToolSheet
        title={`Update ${n} trip expense${n === 1 ? '' : 's'} to the new rate?`}
        description="Each one is worked out again from its own foreign amount. Cash spends still skip the card fee."
        onClose={() => setStep('form')}
        footer={(
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onSave(pending, { reprice: false })}>
              Keep their amounts
            </button>
            <button type="button" className="btn btn-sm" onClick={() => onSave(pending, { reprice: true })}>
              Update {n} expense{n === 1 ? '' : 's'}
            </button>
          </>
        )}
      >
        <p className="note" style={{ margin: 0 }}>
          New rate: 1 {pending.currency} = {homeSym}{fmtRate(pending.rate)}
          {pending.feePct ? ` + ${pending.feePct}% card fee` : ''}. Keeping their amounts leaves those
          expenses at the rate they were saved with; new spends use the new rate.
        </p>
      </ToolSheet>
    );
  }

  if (step === 'delete' && trip) {
    return (
      <ToolSheet
        title={`Delete the ${tripLabel(trip)} trip?`}
        description="Its expenses stay in your tracker, because they are real spending."
        onClose={() => setStep('form')}
        footer={(
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep('form')}>Cancel</button>
            <button type="button" className="btn btn-sm fx-trip-danger" onClick={() => onDelete?.(trip)}>Delete trip</button>
          </>
        )}
      >
        <p className="note" style={{ margin: 0 }}>Travel mode turns off for these dates.</p>
      </ToolSheet>
    );
  }

  return (
    <ToolSheet
      title={title}
      description={editing ? `${fmtTripDay(trip!.start)} to ${fmtTripDay(trip!.end)}` : 'Spend in the local currency; your tracker stays in your own.'}
      onClose={onClose}
      footer={(
        <>
          {editing && active && onEndNow && trip!.end > today && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEndNow(trip!)}>End trip now</button>
          )}
          {editing && onDelete && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep('delete')}>Delete trip</button>
          )}
          <button type="button" className="btn btn-sm" onClick={submit}>
            {editing ? 'Save changes' : 'Start travel mode'}
          </button>
        </>
      )}
    >
      <style>{TRIP_SHEET_STYLES}</style>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
        <fieldset className="fx-trip-set">
          <legend className="fl">Where are you going?</legend>
          <div className="grid2">
            <div className="fg">
              <label className="fl" htmlFor="trip-place">Country</label>
              <select
                id="trip-place"
                className="fs"
                value={place}
                onChange={(e) => pickPlace(e.target.value)}
                aria-describedby={errors.where ? 'trip-where-err' : undefined}
              >
                <option value="">Choose a country</option>
                {PLACES.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
            </div>
            <div className="fg">
              <label className="fl" htmlFor="trip-currency">Currency</label>
              <select
                id="trip-currency"
                className="fs"
                value={currency}
                disabled={lockedCurrency}
                onChange={(e) => setCurrency(e.target.value)}
                aria-describedby={lockedCurrency ? 'trip-currency-note' : undefined}
              >
                <option value="">Choose</option>
                {CURRENCY_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          {lockedCurrency && (
            <p id="trip-currency-note" className="note fx-trip-hint">Expenses are already logged in {currency}, so the currency stays.</p>
          )}
          {errors.where && <p id="trip-where-err" className="fx-trip-err" role="alert">{errors.where}</p>}
        </fieldset>

        <fieldset className="fx-trip-set">
          <legend className="fl">When?</legend>
          <div className="grid2">
            <div className="fg">
              <label className="fl" htmlFor="trip-start">From</label>
              <input
                id="trip-start" className="fi" type="date" value={start}
                onChange={(e) => {
                  const next = e.target.value;
                  // Keep the trip's length when the first day moves.
                  if (next && tripLength) setEnd(addDays(next, tripLength - 1));
                  setStart(next);
                }}
                aria-describedby={errors.dates ? 'trip-dates-err' : undefined}
              />
            </div>
            <div className="fg">
              <label className="fl" htmlFor="trip-end">To</label>
              <input
                id="trip-end" className="fi" type="date" value={end} min={start || undefined}
                onChange={(e) => setEnd(e.target.value)}
                aria-describedby={errors.dates ? 'trip-dates-err' : undefined}
              />
            </div>
          </div>
          <div className="fx-trip-picks" role="group" aria-label="Trip length">
            {QUICK_PICKS.map((p) => (
              <button
                key={p.days}
                type="button"
                className="fx-trip-pill"
                aria-pressed={tripLength === p.days}
                onClick={() => quick(p.days)}
              >
                {p.label}
              </button>
            ))}
          </div>
          {errors.dates && <p id="trip-dates-err" className="fx-trip-err" role="alert">{errors.dates}</p>}
        </fieldset>

        {currency && (
          <fieldset className="fx-trip-set">
            <legend className="fl">Rate</legend>
            {domestic ? (
              <p className="note" style={{ margin: 0 }}>
                A trip at home: nothing to convert. You still get the trip strip and the summary.
              </p>
            ) : manualRate || autoRate === null ? (
              <>
                <label className="fl" htmlFor="trip-rate">1 {currency} in {homeCode}</label>
                <input
                  id="trip-rate"
                  className="fi"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={rateText}
                  placeholder={autoRate !== null ? fmtRate(autoRate) : 'e.g. 24.15'}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
                      setRateText(raw);
                      setManualRate(true);
                    }
                  }}
                  aria-invalid={!!errors.rate}
                  aria-describedby={`trip-rate-help${errors.rate ? ' trip-rate-err' : ''}`}
                />
                <p id="trip-rate-help" className="note fx-trip-hint">
                  {autoRate === null
                    ? `There is no rate for ${currency} on this device yet, so enter the one you'll get. It is never guessed.`
                    : 'Your own rate, for example your forex card’s. It stays fixed for the trip.'}
                </p>
                {autoRate !== null && (
                  <button
                    type="button"
                    className="fx-trip-link"
                    onClick={() => { setManualRate(false); setRateText(''); }}
                  >
                    Use the live rate (1 {currency} = {homeSym}{fmtRate(autoRate)})
                  </button>
                )}
                {errors.rate && <p id="trip-rate-err" className="fx-trip-err" role="alert">{errors.rate}</p>}
              </>
            ) : (
              <div className="fx-trip-rate">
                <p style={{ margin: 0, fontWeight: 600 }}>
                  1 {currency} = {homeSym}{fmtRate(autoRate)}
                </p>
                <p className="note fx-trip-hint" style={{ marginTop: 2 }}>
                  {ratesAreLive(live) ? 'Live rate' : 'Built-in rate'} from {rateDate}, fixed for this trip
                  {ratesAreLive(live) && <> · <FxAttribution live /></>}
                </p>
                <button
                  type="button"
                  className="fx-trip-link"
                  onClick={() => { setManualRate(true); setRateText(String(autoRate)); }}
                >
                  Change the rate
                </button>
              </div>
            )}
          </fieldset>
        )}

        {currency && !domestic && (
          <fieldset className="fx-trip-set">
            <legend className="fl">Card fee (optional)</legend>
            <label className="fl" htmlFor="trip-fee">Your card’s forex fee, in %</label>
            <PercentField id="trip-fee" value={feeText} onChange={setFeeText} />
            <p className="note fx-trip-hint">
              {fee && rate
                ? `1 ${currency} = ${homeSym}${fmtRate(rate)} + ${fee}% card fee = ${homeSym}${fmtRate(rateWithFee(rate, fee))}. Added to every trip spend except cash.`
                : 'It’s on your card’s fee page. Leave it blank if you’re not sure. Cash spends never get it.'}
            </p>
          </fieldset>
        )}

        <fieldset className="fx-trip-set">
          <legend className="fl">These stay in {homeSym}</legend>
          <p className="note fx-trip-hint" style={{ marginTop: 0 }}>
            {homeCatLabels.length ? homeCatLabels.join(', ') : 'No categories'}, and anything marked recurring.{' '}
            <button
              type="button"
              className="fx-trip-link"
              aria-expanded={catsOpen}
              aria-controls="trip-homecats"
              onClick={() => setCatsOpen((v) => !v)}
            >
              {catsOpen ? 'Done' : 'Change'}
            </button>
          </p>
          {catsOpen && (
            <div id="trip-homecats" className="fx-trip-picks" role="group" aria-label={`Categories that stay in ${homeCode}`}>
              {cats.map((c) => (
                <button
                  key={c.k}
                  type="button"
                  className="fx-trip-pill"
                  aria-pressed={homeCats.includes(c.k)}
                  onClick={() => toggleCat(c.k)}
                >
                  {c.l}
                </button>
              ))}
            </div>
          )}
        </fieldset>

        <div className="fg" style={{ marginBottom: 0 }}>
          <label className="fl" htmlFor="trip-name">Trip name (optional)</label>
          <input
            id="trip-name"
            className="fi"
            type="text"
            maxLength={60}
            placeholder={place ? `${place.replace(/\s*\(.*\)$/, '')} trip` : 'e.g. Dubai trip'}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </form>
    </ToolSheet>
  );
}

const TRIP_SHEET_STYLES = `
.fx-trip-set{border:none;padding:0;margin:0 0 16px;min-width:0;}
.fx-trip-set > legend{padding:0;margin-bottom:8px;font-weight:700;}
.fx-trip-set .fg{margin-bottom:8px;}
.fx-trip-hint{margin-top:6px;}
.fx-trip-err{color:var(--red);font-size:13px;font-weight:600;margin:6px 0 0;}
.fx-trip-picks{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;}
.fx-trip-pill{display:inline-flex;align-items:center;min-height:var(--ctl-h-sm,34px);padding:0 14px;border-radius:980px;
  border:1.5px solid var(--hair2);background:var(--card);color:var(--ink);font:inherit;font-size:13px;font-weight:600;cursor:pointer;
  transition:border-color .15s,background .15s;}
@media (hover: hover) and (pointer: fine){.fx-trip-pill:hover{border-color:var(--ink3);}}
.fx-trip-pill[aria-pressed="true"]{border-color:var(--ink);background:var(--hair);}
.fx-trip-link{display:inline-flex;align-items:center;min-height:var(--ctl-h-sm,34px);padding:0;border:none;background:none;
  color:var(--ink);font:inherit;font-size:13px;font-weight:600;text-decoration:underline;text-underline-offset:3px;cursor:pointer;}
.fx-trip-rate{padding:12px 14px;border:1px solid var(--hair2);border-radius:14px;background:var(--fill-03);}
.fx-tools .btn.fx-trip-danger{background:var(--red);border-color:var(--red);color:#fff;box-shadow:none;}
`;
