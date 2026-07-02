import { currentMonth, monthLabel, prevMonth, nextMonth } from '../lib/month';

/**
 * Month navigator shared by Budget Builder and Expense Tracker — a faithful
 * reproduction of bbRenderMonthNav / etRenderMonthNav (prev/next arrows, a
 * "current vs past month" note, and quick-jump chips when >1 month has data).
 */
export function MonthNav({
  activeMonth,
  months,
  onSwitch,
  pastNote,
  pastColor,
}: {
  activeMonth: string;
  months: string[]; // months to show as chips (already includes current)
  onSwitch: (m: string) => void;
  pastNote: string;
  pastColor: string;
}) {
  const cur = currentMonth();
  const isNow = activeMonth === cur;
  const prev = prevMonth(activeMonth);
  const next = nextMonth(activeMonth);
  const chips = months.length > 1 ? months : [];

  const arrowStyle: React.CSSProperties = {
    width: 34,
    height: 34,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg)',
    border: '1px solid var(--hair2)',
    borderRadius: 8,
    fontSize: 16,
    color: 'var(--ink2)',
    transition: 'all .15s',
  };

  return (
    <div
      style={{
        background: 'var(--card)',
        borderRadius: 14,
        boxShadow: 'var(--shadow)',
        padding: '14px 18px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: chips.length ? 10 : 0,
        }}
      >
        <button
          type="button"
          onClick={() => onSwitch(prev)}
          style={{ ...arrowStyle, cursor: 'pointer' }}
          title="Previous month"
          aria-label="Previous month"
        >
          ‹
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
            {monthLabel(activeMonth)}
          </div>
          {!isNow ? (
            <div style={{ fontSize: 11, color: pastColor, fontWeight: 600, marginTop: 2 }}>
              {pastNote}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>Current month</div>
          )}
        </div>
        <button
          type="button"
          onClick={() => next && onSwitch(next)}
          disabled={isNow}
          style={{
            ...arrowStyle,
            opacity: isNow ? 0.3 : 1,
            cursor: isNow ? 'default' : 'pointer',
          }}
          title="Next month"
          aria-label="Next month"
        >
          ›
        </button>
      </div>
      {chips.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {chips.map((m) => {
            const active = m === activeMonth;
            return (
              <button
                type="button"
                key={m}
                onClick={() => onSwitch(m)}
                style={{
                  fontSize: 11,
                  padding: '3px 10px',
                  borderRadius: 980,
                  border: `1px solid ${active ? 'var(--gold)' : 'var(--hair2)'}`,
                  background: active ? 'var(--gold)' : 'var(--card)',
                  color: active ? 'var(--card)' : 'var(--ink2)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  transition: 'all .15s',
                }}
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
