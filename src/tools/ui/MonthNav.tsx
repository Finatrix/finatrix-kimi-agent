import { currentMonth, monthLabel, prevMonth, nextMonth, nextMonthUnclamped } from '../lib/month';

/**
 * Month navigator shared by Budget Builder and Expense Tracker — a faithful
 * reproduction of bbRenderMonthNav / etRenderMonthNav (prev/next arrows, a
 * "current vs past month" note, and quick-jump chips when >1 month has data).
 * `allowFuture` lifts the next-arrow clamp for forward-looking views (Calendar).
 */
export function MonthNav({
  activeMonth,
  months,
  onSwitch,
  pastNote,
  pastColor,
  allowFuture = false,
  maxMonth,
  futureNote = 'Planning ahead',
  futureColor,
}: {
  activeMonth: string;
  months: string[]; // months to show as chips (already includes current)
  onSwitch: (m: string) => void;
  pastNote: string;
  pastColor: string;
  allowFuture?: boolean;
  /**
   * Furthest month reachable with the next arrow (inclusive, "YYYY-MM").
   * Lets a forward-planning view open exactly one month ahead without
   * lifting the clamp entirely the way `allowFuture` does.
   */
  maxMonth?: string;
  /** Note shown when the active month is in the future. */
  futureNote?: string;
  futureColor?: string;
}) {
  const cur = currentMonth();
  const isNow = activeMonth === cur;
  const isFuture = activeMonth > cur;
  const prev = prevMonth(activeMonth);
  const nextRaw = nextMonthUnclamped(activeMonth);
  const next = maxMonth
    ? (nextRaw <= maxMonth ? nextRaw : null)
    : allowFuture ? nextRaw : nextMonth(activeMonth);
  const chips = months.length > 1 ? months : [];

  // The status line under the month name. Only the colour varies, so it is
  // resolved once rather than through three near-identical branches of JSX.
  const status = isFuture
    ? { text: futureNote, color: futureColor ?? pastColor }
    : !isNow
      ? { text: pastNote, color: pastColor }
      : { text: 'Current month', color: undefined };

  return (
    <div className="fx-mnav">
      <div className="fx-mnav-top">
        <button
          type="button"
          className="fx-mnav-arrow"
          onClick={() => onSwitch(prev)}
          title="Go to previous month"
          aria-label="Go to previous month"
        >
          <span aria-hidden="true">‹</span>
        </button>
        <div className="fx-mnav-label">
          <div className="fx-mnav-month">{monthLabel(activeMonth)}</div>
          <div className="fx-mnav-note" style={status.color ? { color: status.color } : undefined}>
            {status.text}
          </div>
        </div>
        <button
          type="button"
          className="fx-mnav-arrow"
          onClick={() => next && onSwitch(next)}
          disabled={!next}
          title="Go to next month"
          aria-label="Go to next month"
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
      {chips.length > 0 && (
        <div className="fx-mnav-chips">
          {chips.map((m) => {
            const active = m === activeMonth;
            return (
              <button
                type="button"
                key={m}
                className={`fx-mnav-chip${active ? ' on' : ''}`}
                // The chips are a set of alternatives, one of which is showing
                // — without this a screen reader hears eight identical buttons
                // and no indication of which month is on screen.
                aria-pressed={active}
                onClick={() => onSwitch(m)}
              >
                {monthLabel(m)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
