import { useMemo, useState } from 'react';
import { PageHead, ToolFoot, MethodologyNote } from '../ui/common';
import { Icon } from '../ui/Icon';
import { MonthNav } from '../ui/MonthNav';
import { useCurrency } from '../CurrencyContext';
import { currentMonth, monthLabel } from '../lib/month';
import { getMonthEvents, type FinEvent, type FinEventType } from '../lib/calendar';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const TYPE_LABEL: Record<FinEventType, string> = { bill: 'Recurring bill', invest: 'Investing SIP', goal: 'Goal maturity' };
const TYPE_ACCENT: Record<FinEventType, string> = { bill: 'var(--orange)', invest: 'var(--blue)', goal: 'var(--green)' };

/** A forward-looking window of months (1 back … 4 ahead) for navigation. */
function monthWindow(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = -1; i <= 4; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export default function CalendarPage() {
  const { cfmt } = useCurrency();
  const months = useMemo(() => monthWindow(), []);
  const [selMonth, setSelMonth] = useState(currentMonth());

  const events = useMemo(() => getMonthEvents(selMonth), [selMonth]);
  const byDay = useMemo(() => {
    const m = new Map<number, FinEvent[]>();
    events.forEach((e) => {
      const day = Number(e.date.slice(8, 10));
      if (!m.has(day)) m.set(day, []);
      m.get(day)!.push(e);
    });
    return m;
  }, [events]);

  const monthTotal = useMemo(() => events.reduce((s, e) => s + (e.amount || 0), 0), [events]);

  const [y, mo] = selMonth.split('-').map(Number);
  const firstWeekday = new Date(y, mo - 1, 1).getDay();
  const daysInMonth = new Date(y, mo, 0).getDate();
  const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="fx-page">
      <PageHead chip="Calendar" chipColor="var(--gold)" chipBg="rgba(212,175,55,.1)" icon="clock" title="Your money month, at a glance.">
        Upcoming recurring bills, your investing SIP and goal dates — all projected from what you've
        already tracked. Nothing here is invented; events only appear when your data supports them.
      </PageHead>

      <div style={{ marginBottom: 14 }}>
        <MonthNav activeMonth={selMonth} months={months} onSwitch={setSelMonth} pastNote="Viewing another month" pastColor="var(--gold)" />
      </div>

      {/* Legend + month total */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
        {(Object.keys(TYPE_LABEL) as FinEventType[]).map((t) => (
          <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink2)' }}>
            <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: TYPE_ACCENT[t] }} />
            {TYPE_LABEL[t]}
          </span>
        ))}
        {events.length > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink2)' }}>
            Projected this month: <b style={{ color: 'var(--ink)' }}>{cfmt(monthTotal)}</b>
          </span>
        )}
      </div>

      {/* Month grid */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div role="grid" aria-label={`${monthLabel(selMonth)} calendar`} className="fx-cal-grid">
          {WEEKDAYS.map((w) => (
            <div key={w} role="columnheader" className="fx-cal-dow">{w}</div>
          ))}
          {cells.map((day, i) => {
            if (day == null) return <div key={`b${i}`} className="fx-cal-cell empty" aria-hidden="true" />;
            const dayStr = `${selMonth}-${String(day).padStart(2, '0')}`;
            const dayEvents = byDay.get(day) || [];
            const isToday = dayStr === todayStr;
            const label = dayEvents.length
              ? `${monthLabel(selMonth)} ${day}: ${dayEvents.map((e) => e.title).join(', ')}`
              : `${monthLabel(selMonth)} ${day}`;
            return (
              <div key={dayStr} role="gridcell" aria-label={label} className={`fx-cal-cell${isToday ? ' today' : ''}`}>
                <span className="fx-cal-num">{day}</span>
                {dayEvents.length > 0 && (
                  <span className="fx-cal-dots" aria-hidden="true">
                    {dayEvents.slice(0, 3).map((e, j) => (
                      <span key={j} style={{ background: e.accent }} />
                    ))}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Event list (accessible primary representation) */}
      {events.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <Icon name="clock" size={40} style={{ color: 'var(--ink3)', marginBottom: 12 }} />
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Nothing scheduled yet</div>
          <p className="note" style={{ maxWidth: 360, margin: '0 auto 16px' }}>
            Log recurring expenses, set up an investing plan or define a goal, and your calendar will
            fill in automatically — no manual entry needed.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/tools/expenses" className="btn btn-sm" style={{ textDecoration: 'none' }}>Log expenses</a>
            <a href="/tools/goals" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>Set a goal</a>
          </div>
        </div>
      ) : (
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{monthLabel(selMonth)} — {events.length} event{events.length === 1 ? '' : 's'}</div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {events.map((e) => (
              <li key={e.id}>
                <a
                  href={e.href}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--hair2)', textDecoration: 'none', color: 'inherit' }}
                >
                  <span aria-hidden="true" style={{ width: 40, textAlign: 'center', flexShrink: 0 }}>
                    <span style={{ display: 'block', fontSize: 16, fontWeight: 700, lineHeight: 1 }}>{Number(e.date.slice(8, 10))}</span>
                    <span className="note" style={{ fontSize: 10 }}>{monthLabel(selMonth).slice(0, 3)}</span>
                  </span>
                  <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'grid', placeItems: 'center', background: `color-mix(in srgb, ${e.accent} 14%, transparent)`, color: e.accent }}>
                    <Icon name={e.icon} size={16} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</span>
                    <span className="note" style={{ fontSize: 11 }}>{e.detail}</span>
                  </span>
                  {e.amount != null && <span style={{ fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{cfmt(e.amount)}</span>}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <style>{`
        .fx-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
        .fx-cal-dow { text-align: center; font-size: 10.5px; font-weight: 700; letter-spacing: .04em; color: var(--ink3); padding-bottom: 6px; text-transform: uppercase; }
        .fx-cal-cell { position: relative; min-height: 46px; border-radius: 10px; border: 1px solid var(--hair2); padding: 5px 6px; display: flex; flex-direction: column; }
        .fx-cal-cell.empty { border: none; background: none; min-height: 0; }
        .fx-cal-cell.today { border-color: color-mix(in srgb, var(--gold) 55%, transparent); background: color-mix(in srgb, var(--gold) 8%, transparent); }
        .fx-cal-num { font-size: 12px; font-weight: 600; color: var(--ink2); }
        .fx-cal-cell.today .fx-cal-num { color: var(--accent-text); font-weight: 800; }
        .fx-cal-dots { display: flex; gap: 3px; margin-top: auto; }
        .fx-cal-dots > span { width: 6px; height: 6px; border-radius: 50%; }
        @media (max-width: 480px) { .fx-cal-cell { min-height: 40px; } }
      `}</style>

      <MethodologyNote summary="How these events are derived">
        Recurring bills are detected from expenses you've logged in the same category and merchant across
        multiple months — the date shown is taken from your last real payment. The investing SIP and goal
        maturity come from your saved InvestMatch and Goal plans. If a signal isn't backed by your own data,
        it never appears.
      </MethodologyNote>

      <ToolFoot>
        Educational tools — not financial advice · <a href="/privacy" target="_top">Privacy</a> ·{' '}
        <a href="/terms" target="_top">Terms</a> · Built with care by <b>FinatriX</b>
      </ToolFoot>
    </div>
  );
}
