import type { ExpenseItem } from '../lib/expense';
import {
  daysLeft, fmtForeign, fmtRate, fmtTripDay, isHomeTrip, paidInTripCurrency, summarizeTrip, tripBudgetProgress, tripLabel, type Trip,
} from '../lib/trips';
import { ToolSheet } from '../ui/ToolSheet';

/**
 * A trip's summary: the total in both currencies, spending by category, the
 * daily average and the biggest spends. Opened from the trip strip during a
 * trip and from the end-of-trip card afterwards, which is also where "Next
 * stop?" starts the next leg of a multi-country trip.
 */
export interface TripSummarySheetProps {
  trip: Trip;
  items: readonly ExpenseItem[];
  today: string;
  homeSym: string;
  cfmt: (n: number) => string;
  labelOf: (category: string) => string;
  onEdit: (trip: Trip) => void;
  onEndNow: (trip: Trip) => void;
  onExtend: (trip: Trip) => void;
  onNextStop: (trip: Trip) => void;
  onClose: () => void;
}


export function TripSummarySheet({
  trip, items, today, homeSym, cfmt, labelOf, onEdit, onEndNow, onExtend, onNextStop, onClose,
}: TripSummarySheetProps) {
  const s = summarizeTrip(trip, items, today);
  const budget = tripBudgetProgress(s.homeTotal, trip.budget);
  const home = isHomeTrip(trip);
  const left = daysLeft(trip, today);
  const active = left !== null;
  const ended = today > trip.end;
  const status = active
    ? (left === 1 ? 'Last day' : `${left} days left`)
    : ended ? `Ended ${fmtTripDay(trip.end)}` : `Starts ${fmtTripDay(trip.start)}`;
  const both = (e: ExpenseItem) => (paidInTripCurrency(e, trip)
    ? `${fmtForeign(e.fxAmount!, trip.currency)} · ${cfmt(e.amount)}`
    : cfmt(e.amount));

  return (
    <ToolSheet
      title={`${tripLabel(trip)}`}
      description={`${fmtTripDay(trip.start)} to ${fmtTripDay(trip.end)} · ${status}`}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(trip)}>Edit trip</button>
          {active && left! > 1 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEndNow(trip)}>End trip now</button>
          )}
          {active && left === 1 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onExtend(trip)}>Still travelling? Extend a day</button>
          )}
          {(ended || left === 1) && (
            <button type="button" className="btn btn-sm" onClick={() => onNextStop(trip)}>Next stop?</button>
          )}
        </>
      )}
    >
      <style>{SUMMARY_STYLES}</style>
      <div className="fx-tsum-total">
        <div className="fx-tsum-big">{cfmt(s.homeTotal)}</div>
        {!home && (
          <div className="note" style={{ marginTop: 2 }}>
            {fmtForeign(s.foreignTotal, trip.currency)} spent in {trip.currency}
            {s.paidInHome > 0 && <>, plus {cfmt(s.paidInHome)} paid in {homeSym}</>}
          </div>
        )}
        {budget && (
          <div className="note" style={{ marginTop: 2 }}>
            {budget.over
              ? <><b className="fx-tsum-over">{cfmt(-budget.left)} over</b> the {cfmt(trip.budget!)} trip budget</>
              : <>{cfmt(budget.left)} left of the {cfmt(trip.budget!)} trip budget</>}
          </div>
        )}
      </div>

      <dl className="fx-tsum-facts">
        <div>
          <dt>Daily average</dt>
          <dd>{s.dailyAverage === null ? '—' : `${cfmt(s.dailyAverage)} a day`}</dd>
          <dd className="note">{s.days ? `over ${s.days} day${s.days === 1 ? '' : 's'}` : 'from the first day'}</dd>
        </div>
        <div>
          <dt>Spends</dt>
          <dd>{s.count}</dd>
        </div>
        {!home && (
          <div>
            <dt>Rate</dt>
            <dd>1 {trip.currency} = {homeSym}{fmtRate(trip.rate)}</dd>
            <dd className="note">{trip.feePct ? `+ ${trip.feePct}% card fee, not on cash` : 'No card fee'}</dd>
          </div>
        )}
      </dl>

      {s.count === 0 ? (
        <p className="note" style={{ margin: '4px 0 0' }}>
          Nothing logged for this trip yet. Spends dated inside it are added in {trip.currency} as you log them.
          A booking made earlier, such as the flight, joins the trip when you tick “Part of the {tripLabel(trip)} trip” as you add it.
        </p>
      ) : (
        <>
          <h3 className="fx-tsum-h">By category</h3>
          <ul className="fx-tsum-list">
            {s.byCategory.map((c) => (
              <li key={c.category}>
                <span>{labelOf(c.category)}</span>
                <span className="fx-tsum-amt">{cfmt(c.home)}</span>
              </li>
            ))}
          </ul>
          <h3 className="fx-tsum-h">Biggest spends</h3>
          <ul className="fx-tsum-list">
            {s.biggest.map((e) => (
              <li key={e.id}>
                <span>{e.merchant || e.note || labelOf(e.category)}<span className="note"> · {fmtTripDay(e.date)}</span></span>
                <span className="fx-tsum-amt">{both(e)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </ToolSheet>
  );
}

const SUMMARY_STYLES = `
.fx-tsum-total{padding:4px 0 14px;}
.fx-tsum-over{color:var(--red);}
.fx-tsum-big{font-size:28px;font-weight:700;letter-spacing:-.02em;}
.fx-tsum-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin:0 0 16px;}
.fx-tsum-facts div{padding:10px 12px;border:1px solid var(--hair2);border-radius:12px;}
.fx-tsum-facts dt{font-size:13px;font-weight:600;color:var(--ink2);margin-bottom:2px;}
.fx-tsum-facts dd{margin:0;font-weight:600;}
.fx-tsum-facts dd.note{font-weight:400;margin-top:2px;}
.fx-tsum-h{font-size:13px;font-weight:700;margin:6px 0 6px;color:var(--ink2);}
.fx-tsum-list{list-style:none;margin:0 0 12px;padding:0;}
.fx-tsum-list li{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--hair2);font-size:14px;}
.fx-tsum-list li:last-child{border-bottom:none;}
.fx-tsum-amt{font-weight:600;white-space:nowrap;font-variant-numeric:tabular-nums;}
`;
