import { Icon } from '../ui/Icon';
import type { ExpenseItem } from '../lib/expense';
import {
  addDays, daysLeft, fmtForeign, fmtTripDay, isHomeTrip, summarizeTrip, tripBudgetProgress, tripLabel, type Trip,
} from '../lib/trips';

/**
 * The top of the Expense Tracker while travel mode matters: the trip strip
 * during a trip, an end-of-trip card for a week afterwards, the next trip when
 * one is set up, and otherwise the "Travel mode" button that starts one.
 */
export interface TravelBarProps {
  trips: readonly Trip[];
  items: readonly ExpenseItem[];
  today: string;
  /** Formats a home-currency amount (whole units), like the rest of the page. */
  cfmt: (n: number) => string;
  /** The ended trip whose card the user closed, so it stays closed. */
  dismissedEnded: string | null;
  onSetUp: () => void;
  onOpenTrip: (trip: Trip) => void;
  onSummary: (trip: Trip) => void;
  onExtend: (trip: Trip) => void;
  onNextStop: (trip: Trip) => void;
  onDismissEnded: (trip: Trip) => void;
}


/** How long after a trip its summary card stays at the top. */
const ENDED_CARD_DAYS = 7;

export function TravelBar({
  trips, items, today, cfmt, dismissedEnded, onSetUp, onOpenTrip, onSummary, onExtend, onNextStop, onDismissEnded,
}: TravelBarProps) {
  const active = trips.find((t) => t.start <= today && today <= t.end) ?? null;
  const upcoming = trips.find((t) => t.start > today) ?? null;
  const ended = [...trips].reverse().find(
    (t) => t.end < today && addDays(t.end, ENDED_CARD_DAYS) >= today && t.id !== dismissedEnded,
  ) ?? null;

  if (active) {
    const s = summarizeTrip(active, items, today);
    const left = daysLeft(active, today) ?? 0;
    const lastDay = left === 1;
    const amounts = isHomeTrip(active)
      ? cfmt(s.homeTotal)
      : `${fmtForeign(s.foreignTotal, active.currency)} (${cfmt(s.homeTotal)})`;
    // Optional trip budget (travel stage 2): what is left, with a bar whose
    // length is the share spent. The words carry the meaning; the bar is extra.
    const budget = tripBudgetProgress(s.homeTotal, active.budget);
    return (
      <section className="fx-travel" aria-label="Travel mode">
        <style>{TRAVEL_STYLES}</style>
        <button type="button" className="fx-travel-strip" onClick={() => onSummary(active)}>
          <Icon name="travel" size={16} aria-hidden="true" />
          <span className="fx-travel-text">
            <b>{tripLabel(active)}</b>
            {' · '}
            {lastDay ? 'Last day' : `${left} days left`}
            {' · '}
            {amounts}
            {budget && (
              <>
                {' · '}
                <span className={budget.over ? 'fx-travel-over' : undefined}>
                  {budget.over ? `${cfmt(-budget.left)} over budget` : `${cfmt(budget.left)} left`}
                </span>
                <span className="fx-travel-meter" aria-hidden="true">
                  <span
                    className={budget.over ? 'is-over' : budget.pct >= 80 ? 'is-near' : undefined}
                    style={{ width: `${Math.min(100, budget.pct)}%` }}
                  />
                </span>
              </>
            )}
          </span>
          <span className="fx-travel-more">Summary</span>
        </button>
        {lastDay && (
          <div className="fx-travel-ask">
            <span>Still travelling?</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onExtend(active)}>Extend a day</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNextStop(active)}>Next stop?</button>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="fx-travel" aria-label="Travel mode">
      <style>{TRAVEL_STYLES}</style>
      {ended && (
        <div className="fx-travel-ended">
          <button type="button" className="fx-travel-strip" onClick={() => onSummary(ended)}>
            <Icon name="travel" size={16} aria-hidden="true" />
            <span className="fx-travel-text">
              <b>{tripLabel(ended)}</b> trip ended
              {' · '}
              {cfmt(summarizeTrip(ended, items, today).homeTotal)}
            </span>
            <span className="fx-travel-more">Summary</span>
          </button>
          <button
            type="button"
            className="fx-travel-x"
            aria-label={`Hide the ${tripLabel(ended)} trip card`}
            onClick={() => onDismissEnded(ended)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      )}
      {upcoming ? (
        <button type="button" className="btn btn-ghost btn-sm fx-travel-btn" onClick={() => onOpenTrip(upcoming)}>
          <Icon name="travel" size={15} aria-hidden="true" />
          {tripLabel(upcoming)} trip · starts {fmtTripDay(upcoming.start)}
        </button>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm fx-travel-btn" onClick={onSetUp}>
          <Icon name="travel" size={15} aria-hidden="true" />
          Travel mode
        </button>
      )}
    </section>
  );
}

const TRAVEL_STYLES = `
.fx-travel{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:0 0 14px;}
.fx-travel-btn{gap:8px;}
.fx-travel-strip{flex:1 1 280px;display:flex;align-items:center;gap:10px;min-height:var(--ctl-h-lg);padding:10px 14px;
  border-radius:14px;border:1px solid color-mix(in srgb, var(--blue) 35%, transparent);
  background:color-mix(in srgb, var(--blue) 8%, var(--card));color:var(--ink);font:inherit;font-size:14px;text-align:left;cursor:pointer;
  transition:background .15s,border-color .15s;}
@media (hover: hover) and (pointer: fine){.fx-travel-strip:hover{border-color:color-mix(in srgb, var(--blue) 60%, transparent);}}
.fx-travel-strip svg{color:var(--blue);flex-shrink:0;}
.fx-travel-text{flex:1;min-width:0;line-height:1.4;}
.fx-travel-over{color:var(--red);font-weight:600;}
.fx-travel-meter{display:block;height:4px;margin-top:6px;border-radius:4px;background:color-mix(in srgb, var(--blue) 16%, transparent);overflow:hidden;}
.fx-travel-meter > span{display:block;height:100%;border-radius:inherit;background:var(--blue);}
.fx-travel-meter > span.is-near{background:var(--orange);}
.fx-travel-meter > span.is-over{background:var(--red);}
.fx-travel-more{flex-shrink:0;font-size:13px;font-weight:600;color:var(--ink2);}
.fx-travel-ask{flex:1 1 100%;display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:14px;font-weight:600;}
.fx-travel-ask .btn{width:auto;}
.fx-travel-ended{flex:1 1 100%;display:flex;align-items:center;gap:8px;}
.fx-travel-x{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:var(--ctl-h-md);height:var(--ctl-h-md);
  border-radius:10px;border:1px solid var(--hair2);background:var(--fill-03);color:var(--ink2);cursor:pointer;}
`;
