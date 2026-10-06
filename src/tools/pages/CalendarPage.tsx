import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { PageHead, ToolFoot, MethodologyNote } from '../ui/common';
import { Icon } from '../ui/Icon';
import { MonthNav } from '../ui/MonthNav';
import { useCurrency } from '../CurrencyContext';
import { ymdLocal, ymLocal } from '../../lib/date';
import { currentMonth, monthLabel } from '../lib/month';
import { getMonthEvents, type FinEvent, type FinEventType } from '../lib/calendar';
import { calendarIcs, calendarOutflows } from '../lib/planningAutomation';
import { getJSON, setJSON } from '../lib/storage';
import { downloadBlob } from '../lib/exporters';
import { SmartAssist } from '../ui/SmartAssist';
import { Disclosure } from '../ui/Disclosure';
import { useOptionalToast } from '../ui/Toast';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const TYPE_LABEL: Record<FinEventType, string> = { bill: 'Recurring bill', invest: 'Investing SIP', goal: 'Goal maturity' };
const TYPE_ACCENT: Record<FinEventType, string> = { bill: 'var(--orange)', invest: 'var(--blue)', goal: 'var(--green)' };

/** A forward-looking window of months (1 back … 4 ahead) for navigation. */
function monthWindow(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = -1; i <= 4; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    out.push(ymLocal(d));
  }
  return out;
}

export default function CalendarPage() {
  const { notify } = useOptionalToast();
  const { cfmt, code } = useCurrency();
  const months = useMemo(() => monthWindow(), []);
  const [selMonth, setSelMonth] = useState(currentMonth());
  const [revision, setRevision] = useState(0);
  const [type, setType] = useState<FinEventType | 'all'>('all');
  const [query, setQuery] = useState('');
  const [upcomingOnly, setUpcomingOnly] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener('fx:write', refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => { window.removeEventListener('fx:write', refresh); window.removeEventListener('storage', refresh); window.removeEventListener('focus', refresh); };
  }, []);

  const todayStr = ymdLocal(new Date());
  const savedDay = useMemo(() => {
    const day = getJSON<{ calendarDay?: number }>('fx_investmatch', {}).calendarDay;
    return Number.isInteger(day) && Number(day) >= 1 && Number(day) <= 31 ? Number(day) : 1;
    // A revision represents a storage or focus event; read the latest saved preference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);
  // Storage revisions invalidate saved source data even when the selected month is unchanged.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const events = useMemo(() => getMonthEvents(selMonth), [selMonth, revision]);
  const filteredEvents = events.filter((event) => (type === 'all' || event.type === type)
    && (!upcomingOnly || event.date >= todayStr)
    && (selectedDay === null || Number(event.date.slice(8)) === selectedDay)
    && `${event.title} ${event.detail}`.toLowerCase().includes(query.trim().toLowerCase()));
  const upcoming = events.filter((event) => event.date >= todayStr);
  const busiest = useMemo(() => {
    const totals = new Map<string, number>();
    events.filter((event) => event.type !== 'goal').forEach((event) => totals.set(event.date, (totals.get(event.date) ?? 0) + (event.amount ?? 0)));
    return [...totals].sort((a, b) => b[1] - a[1])[0];
  }, [events]);

  const byDay = useMemo(() => {
    const m = new Map<number, FinEvent[]>();
    events.forEach((e) => {
      const day = Number(e.date.slice(8, 10));
      if (!m.has(day)) m.set(day, []);
      m.get(day)!.push(e);
    });
    return m;
  }, [events]);

  const monthTotal = calendarOutflows(events);

  const [y, mo] = selMonth.split('-').map(Number);
  const firstWeekday = new Date(y, mo - 1, 1).getDay();
  const daysInMonth = new Date(y, mo, 0).getDate();

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
        <MonthNav activeMonth={selMonth} months={months} onSwitch={(month) => { setSelMonth(month); setSelectedDay(null); }} pastNote="Viewing another month" pastColor="var(--gold)" allowFuture />
        {/* The arrows and month pills above cover the usual case; the free
            month field is the third way to do the same thing, so it waits
            behind a toggle instead of sitting between the month and its grid. */}
        <Disclosure variant="inline" showLabel="Jump to another month" hideLabel="Hide the month field">
        <label className="fl" htmlFor="calendar-jump-month">Jump to any planning month</label>
        <input className="fi" id="calendar-jump-month" type="month" value={selMonth} onChange={event => {
          if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) { setSelMonth(event.target.value); setSelectedDay(null); }
        }} />
        </Disclosure>
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
            Projected outflows this month: <b style={{ color: 'var(--ink)' }}>{cfmt(monthTotal)}</b>
          </span>
        )}
      </div>

      {/* Month grid */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div role="group" aria-label={`${monthLabel(selMonth)} calendar`} className="fx-cal-grid">
          {WEEKDAYS.map((w) => (
            <div key={w} aria-hidden="true" className="fx-cal-dow">{w}</div>
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
              <div key={dayStr} className={`fx-cal-cell${isToday ? ' today' : ''}`}>
                <button type="button" aria-label={`Show ${label}`} aria-pressed={selectedDay === day} onClick={() => setSelectedDay(selectedDay === day ? null : day)} className="fx-cal-day-button"><span className="fx-cal-num">{day}</span></button>
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

      <SmartAssist title="Plan around your busiest money days" description="Events are planning estimates from your saved tools. Confirm actual due dates with your provider; no payments or reminders are sent automatically.">
        <div className="grid2">
          <div><p className="note">Remaining projected outflows in this month</p><b>{cfmt(calendarOutflows(upcoming))}</b><p className="note">Bills and investment contributions; goal targets are excluded.</p></div>
          <div><p className="note">Largest projected outflow day</p><b>{busiest ? `${busiest[0]} · ${cfmt(busiest[1])}` : 'No outflows to compare'}</b>{busiest && <div><button className="btn btn-ghost btn-sm" type="button" onClick={() => { setSelectedDay(Number(busiest[0].slice(8))); setType('all'); setQuery(''); setUpcomingOnly(false); }}>Show this day</button></div>}</div>
        </div>
        {events.some((event) => event.type === 'invest') && <div style={{ marginTop: 16 }}>
          <label className="fl" htmlFor="calendar-invest-day">Preferred monthly investing day</label>
          <select id="calendar-invest-day" className="fs" value={savedDay} onChange={(event) => setJSON('fx_investmatch', { ...getJSON('fx_investmatch', {}), calendarDay: Number(event.target.value) })}>
            {Array.from({ length: 31 }, (_, i) => <option value={i + 1} key={i + 1}>{i + 1}</option>)}
          </select>
          <p className="note">Day 1 is a planning default until you choose a day. Days 29–31 move to the last day of shorter months. This changes the calendar only.</p>
        </div>}
        <div className="grid2" style={{ marginTop: 16 }}>
          <div><label className="fl" htmlFor="calendar-type">Event type</label><select id="calendar-type" className="fs" value={type} onChange={(e) => setType(e.target.value as FinEventType | 'all')}><option value="all">All events</option>{(Object.keys(TYPE_LABEL) as FinEventType[]).map((key) => <option value={key} key={key}>{TYPE_LABEL[key]}</option>)}</select></div>
          <div><label className="fl" htmlFor="calendar-search">Find an event</label><input id="calendar-search" type="search" className="fi" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title or source" /></div>
        </div>
        <label className="fx-checkrow" style={{ margin: '12px 0' }}><input className="fx-check" type="checkbox" checked={upcomingOnly} onChange={(e) => setUpcomingOnly(e.target.checked)} />Today and later only</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(selectedDay !== null || type !== 'all' || query || upcomingOnly) && <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setSelectedDay(null); setType('all'); setQuery(''); setUpcomingOnly(false); }}>Clear filters{selectedDay !== null ? ` · day ${selectedDay}` : ''}</button>}
          <button className="btn btn-ghost btn-sm" type="button" disabled={!filteredEvents.length} onClick={async () => {
            try {
              await downloadBlob(`finatrix-calendar-${selMonth}.ics`, new Blob([calendarIcs(filteredEvents, new Date(), code)], { type: 'text/calendar;charset=utf-8' }));
            } catch {
              notify('The calendar could not be exported. Please try again.', 'error');
            }
          }}>Export visible events to calendar</button>
        </div>
        <p className="note" role="status">{filteredEvents.length} of {events.length} events shown · {cfmt(calendarOutflows(filteredEvents))} projected outflows in this selection. Export creates all-day entries for you to import into your calendar.</p>
      </SmartAssist>

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
            <Link to="/tools/expenses" className="btn btn-sm" style={{ textDecoration: 'none' }}>Log expenses</Link>
            <Link to="/tools/goals" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>Set a goal</Link>
          </div>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="card"><b>No events match these filters</b><p className="note">Choose another day or clear the filters to see the full month.</p><button className="btn btn-ghost btn-sm" onClick={() => { setSelectedDay(null); setType('all'); setQuery(''); setUpcomingOnly(false); }}>Show all events</button></div>
      ) : (
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{monthLabel(selMonth)} — {filteredEvents.length} event{filteredEvents.length === 1 ? '' : 's'}</div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {filteredEvents.map((e) => (
              <li key={e.id}>
                <Link
                  to={e.href}
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
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <style>{`
        .fx-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
        .fx-cal-dow { text-align: center; font-size: 10.5px; font-weight: 700; letter-spacing: .04em; color: var(--ink3); padding-bottom: 6px; text-transform: uppercase; }
        .fx-cal-cell { position: relative; min-height: 46px; border-radius: 10px; border: 1px solid var(--hair2); padding: 5px 6px; display: flex; flex-direction: column; }
        .fx-cal-day-button { position: absolute; inset: 0; border: none; border-radius: inherit; background: transparent; cursor: pointer; text-align: left; padding: 5px 6px; display: flex; align-items: flex-start; }
        .fx-cal-day-button[aria-pressed="true"] { outline: 2px solid var(--gold); outline-offset: -2px; }
        .fx-cal-day-button:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
        .fx-cal-dots { pointer-events: none; }
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
        maturity come from your saved InvestMatch and Goal plans. The investing date is your chosen planning day (day 1 by default), not a verified debit date. Goal dates require a plan saved with a start date. If a signal isn't backed by your own data,
        it never appears.
      </MethodologyNote>

      <ToolFoot>
        Educational tools — not financial advice · <a href="/privacy" target="_top">Privacy</a> ·{' '}
        <a href="/terms" target="_top">Terms</a> · Built with care by <b>FinatriX</b>
      </ToolFoot>
    </div>
  );
}
