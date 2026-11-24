import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { PageHead, ToolFoot, MethodologyNote } from '../ui/common';
import { Icon } from '../ui/Icon';
import { AmountInput } from '../ui/AmountInput';
import { useCurrency } from '../CurrencyContext';
import { useOptionalToast } from '../ui/Toast';
import { ymdLocal, ymLocal } from '../../lib/date';
import { monthLabel } from '../lib/month';
import { loadExpenses } from '../lib/expense';
import { plainAmount } from '../lib/formula';
import { readDashboard } from '../lib/dashboard';
import { radarCatMeta } from '../lib/subscriptions';
import {
  BALANCE_MAX_AGE_DAYS, HORIZONS, loadMoneyCalPrefs, projectMoney, saveMoneyCalPrefs, toggleSkipped,
  type Flow, type FlowKind, type Horizon, type MoneyCalPrefs, type ProjectedDay,
} from '../lib/moneyCalendar';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const KIND_ACCENT: Record<FlowKind, string> = { salary: 'var(--green)', bill: 'var(--orange)', saving: 'var(--blue)' };
const KIND_LABEL: Record<FlowKind, string> = { salary: 'Salary in', bill: 'Bill or subscription', saving: 'Saving or investing' };

function ordinal(n: number): string {
  const rem = n % 100;
  if (rem >= 11 && rem <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

function toDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function shortDate(ymd: string): string {
  return toDate(ymd).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function longDate(ymd: string): string {
  return toDate(ymd).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function MoneyCalendarPage() {
  const { notify } = useOptionalToast();
  const { cfmt, cfmtSh, sym } = useCurrency();
  const [revision, setRevision] = useState(0);
  const [balanceDraft, setBalanceDraft] = useState('');
  const [salaryDraft, setSalaryDraft] = useState<string | null>(null);
  const [selected, setSelected] = useState(() => ymdLocal(new Date()));
  const [monthIndex, setMonthIndex] = useState(0);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener('fx:write', refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('fx:write', refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  // A storage, focus or write event re-reads the saved data; nothing else changes it within a visit.
  const { prefs, budgetIncome, projection } = useMemo(() => {
    const now = new Date();
    const saved = loadMoneyCalPrefs();
    let income: number | null = null;
    try { income = readDashboard().income; } catch { income = null; }
    const salaryAmount = saved.salary ?? income ?? 0;
    return {
      prefs: saved,
      budgetIncome: income,
      projection: projectMoney({
        items: loadExpenses(),
        catMeta: radarCatMeta(ymLocal(now)),
        now,
        horizon: saved.horizon,
        balance: saved.balance !== null && saved.asOf ? { amount: saved.balance, asOf: saved.asOf } : null,
        salary: saved.payday !== null ? { amount: salaryAmount, day: saved.payday } : null,
        everyday: saved.everyday,
        skipped: saved.skipped,
      }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);

  const update = (next: MoneyCalPrefs) => {
    if (!saveMoneyCalPrefs(next)) notify('This device could not save that. Please try again.', 'error');
    setRevision((value) => value + 1);
  };

  const saveBalance = (event: React.FormEvent) => {
    event.preventDefault();
    const plain = plainAmount(balanceDraft);
    const value = Number(plain);
    if (plain === '' || !Number.isFinite(value)) {
      notify('Type your balance as a number, for example 42000.', 'error');
      return;
    }
    update({ ...loadMoneyCalPrefs(), balance: Math.round(value * 100) / 100, asOf: ymdLocal(new Date()) });
    setBalanceDraft('');
    notify('Balance saved for today.', 'ok');
  };

  const saveSalary = (event: React.FormEvent) => {
    event.preventDefault();
    if (salaryDraft === null) return;
    const plain = plainAmount(salaryDraft);
    const value = Number(plain);
    if (salaryDraft.trim() !== '' && (plain === '' || !Number.isFinite(value) || value < 0)) {
      notify('Type your monthly take-home pay as a number.', 'error');
      return;
    }
    update({ ...loadMoneyCalPrefs(), salary: salaryDraft.trim() === '' ? null : Math.round(value * 100) / 100 });
    setSalaryDraft(null);
  };

  const { days, start, shortfall, low, totals, recurring, everydayBasis, balanceStatus } = projection;
  const horizon = prefs.horizon;
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const months = useMemo(() => {
    const out: string[] = [];
    for (const d of days) if (!out.includes(d.date.slice(0, 7))) out.push(d.date.slice(0, 7));
    return out;
  }, [days]);
  const viewMonth = months[Math.min(monthIndex, months.length - 1)];
  const selectedDay = byDate.get(selected) ?? days[0];
  const agenda = days.filter((d) => d.flows.length > 0);
  const hasBalance = balanceStatus === 'ok' && start !== null;
  const salaryAmount = prefs.salary ?? budgetIncome;
  const nothingYet = recurring.length === 0 && prefs.payday === null;

  /** Page the grid, and select that month's first day in the window so the detail matches. */
  const showMonth = (index: number) => {
    const next = Math.max(0, Math.min(months.length - 1, index));
    setMonthIndex(next);
    const first = days.find((d) => d.date.startsWith(months[next]));
    if (first) setSelected(first.date);
  };

  const [y, mo] = viewMonth.split('-').map(Number);
  const firstWeekday = new Date(y, mo - 1, 1).getDay();
  const daysInMonth = new Date(y, mo, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const flowLine = (f: Flow) => `${f.label} ${f.kind === 'salary' ? '+' : '−'}${cfmt(f.amount)}`;
  const dayLabel = (d: ProjectedDay) => {
    const parts = [longDate(d.date)];
    if (d.flows.length) parts.push(d.flows.map(flowLine).join(', '));
    if (d.balance !== null) parts.push(`estimated balance ${cfmt(d.balance)}`);
    return parts.join('. ');
  };

  return (
    <div className="fx-page">
      <PageHead chip="Money calendar" chipColor="var(--gold)" icon="clock" title={`Your next ${horizon} days, estimated.`}>
        Salary in; rent, EMIs, bills and subscriptions out; and an estimated balance for each day. It is
        worked out only from what you have told FinatriX, so it is an estimate, not a promise.
      </PageHead>

      <section className="card fx-mc-summary" style={{ marginBottom: 14 }} aria-labelledby="mc-summary-h">
        <div className="fx-mc-row">
          <h2 id="mc-summary-h" className="fx-mc-h">
            The next {horizon} days <span className="fx-mc-badge">Estimate</span>
          </h2>
          <div className="fx-seg" role="group" aria-label="How far ahead">
            {HORIZONS.map((h) => (
              <button key={h} type="button" className={horizon === h ? 'on' : ''} aria-pressed={horizon === h}
                onClick={() => { setMonthIndex(0); setSelected(days[0].date); update({ ...loadMoneyCalPrefs(), horizon: h as Horizon }); }}>
                {h} days
              </button>
            ))}
          </div>
        </div>

        {hasBalance && shortfall ? (
          <div className="fx-mc-alert" role="status">
            <Icon name="warn" size={18} />
            <div>
              <b>Tight around the {ordinal(Number(shortfall.date.slice(8, 10)))}, about {cfmt(shortfall.about)} short.</b>
              <p className="note" style={{ margin: '2px 0 0' }}>
                Estimated to go below zero on {shortDate(shortfall.date)}, lowest on {shortDate(shortfall.lowDate)}.
                Moving a payment, or setting money aside now, would cover it.
              </p>
            </div>
          </div>
        ) : hasBalance && low ? (
          <div role="status">
            <div className="note" style={{ marginBottom: 2 }}>Estimated lowest balance</div>
            <div className="fx-mc-big">{cfmt(low.balance)} <span className="fx-mc-big-sub">around {shortDate(low.date)}</span></div>
          </div>
        ) : (
          <p className="note" style={{ margin: '4px 0 0' }}>
            Add today&apos;s balance below to see the estimated balance for each day and an early warning if it runs short.
          </p>
        )}

        <dl className="fx-mc-totals">
          <div><dt>Salary in</dt><dd>{cfmt(totals.salary)}</dd></div>
          <div><dt>Bills and subscriptions</dt><dd>{cfmt(totals.bills)}</dd></div>
          {totals.savings > 0 && <div><dt>Saving and investing</dt><dd>{cfmt(totals.savings)}</dd></div>}
          {projection.everydayApplied && <div><dt>Everyday spending</dt><dd>{cfmt(totals.everyday)}</dd></div>}
          {hasBalance && <div><dt>Balance on {shortDate(projection.end)}</dt><dd>{cfmt(days[days.length - 1].balance ?? 0)}</dd></div>}
        </dl>
        <p className="note" style={{ margin: '8px 0 0' }}>
          All figures are estimates from your own logged expenses and the salary you set. Real dates and amounts will differ.
        </p>
      </section>

      <section className="card" style={{ marginBottom: 14 }} aria-labelledby="mc-setup-h">
        <h2 id="mc-setup-h" className="fx-mc-h" style={{ marginBottom: 10 }}>What the estimate starts from</h2>

        <form onSubmit={saveBalance} className="fx-mc-form">
          <div style={{ flex: '1 1 180px' }}>
            <label className="fl" htmlFor="mc-balance">Balance in your account today</label>
            <AmountInput id="mc-balance" className="fi" value={balanceDraft} onChange={setBalanceDraft} sym={sym}
              placeholder={prefs.balance !== null ? String(prefs.balance) : 'e.g. 42000'} describedBy="mc-balance-note" />
          </div>
          <button type="submit" className="btn btn-sm" disabled={!balanceDraft.trim()}>{prefs.balance !== null ? 'Update balance' : 'Save balance'}</button>
          {prefs.balance !== null && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => update({ ...loadMoneyCalPrefs(), balance: null, asOf: null })}>Clear</button>
          )}
        </form>
        <p id="mc-balance-note" className="note" style={{ marginTop: 6 }}>
          {balanceStatus === 'expired' && prefs.asOf
            ? `The balance you saved on ${shortDate(prefs.asOf)} is more than ${BALANCE_MAX_AGE_DAYS} days old, so it is not used. Type today's.`
            : start && start.ageDays === 0
              ? `Saved today: ${cfmt(start.typed)}. Use one account, the one your salary and bills go through.`
              : start
                ? `Saved on ${shortDate(start.asOf)}: ${cfmt(start.typed)}. Carried to today: −${cfmt(start.loggedSince)} logged since${start.salarySince > 0 ? `, +${cfmt(start.salarySince)} salary since` : ''} = ${cfmt(start.amount)}.${start.stale ? ' Update it for a closer estimate.' : ''}`
                : 'Stays on this device. Use one account, the one your salary and bills go through.'}
        </p>

        <form onSubmit={saveSalary} className="fx-mc-form" style={{ marginTop: 14 }}>
          <div style={{ flex: '0 1 150px' }}>
            <label className="fl" htmlFor="mc-payday">Salary arrives on</label>
            <select id="mc-payday" className="fs" value={prefs.payday ?? ''}
              onChange={(e) => update({ ...loadMoneyCalPrefs(), payday: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Not set</option>
              {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>the {ordinal(i + 1)}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 180px' }}>
            <label className="fl" htmlFor="mc-salary">Monthly take-home pay</label>
            <AmountInput id="mc-salary" className="fi" sym={sym} describedBy="mc-salary-note"
              value={salaryDraft ?? (prefs.salary !== null ? String(prefs.salary) : '')}
              onChange={setSalaryDraft}
              placeholder={budgetIncome ? String(Math.round(budgetIncome)) : 'e.g. 60000'} />
          </div>
          <button type="submit" className="btn btn-ghost btn-sm" disabled={salaryDraft === null}>Save pay</button>
        </form>
        <p id="mc-salary-note" className="note" style={{ marginTop: 6 }}>
          {prefs.payday === null
            ? 'Choose your payday to include salary. Without it, nothing comes in.'
            : salaryAmount
              ? `${cfmt(salaryAmount)} on the ${ordinal(prefs.payday)} of each month (the last day in shorter months)${prefs.salary === null ? ', from your Budget Builder income' : ''}.`
              : 'Type your monthly take-home pay, or set your income in Budget Builder.'}
        </p>

        <label className="fx-checkrow" style={{ marginTop: 12 }}>
          <input className="fx-check" type="checkbox" checked={prefs.everyday && everydayBasis !== null} disabled={everydayBasis === null}
            onChange={() => update({ ...loadMoneyCalPrefs(), everyday: !prefs.everyday })} />
          Include everyday spending{everydayBasis ? `, about ${cfmt(everydayBasis.perDay)} a day` : ''}
        </label>
        <p className="note" style={{ margin: '2px 0 0 30px' }}>
          {everydayBasis
            ? `Your average for everything that isn't a regular payment, ${shortDate(everydayBasis.from)} to ${shortDate(everydayBasis.to)} (${cfmt(everydayBasis.total)} over ${everydayBasis.days} days). Trips abroad are left out.`
            : 'Needs about a month of logged expenses before this month.'}
        </p>
      </section>

      {nothingYet ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px', marginBottom: 14 }}>
          <Icon name="clock" size={40} style={{ color: 'var(--ink3)', marginBottom: 12 }} />
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Nothing to place on the calendar yet</div>
          <p className="note" style={{ maxWidth: 400, margin: '0 auto 16px' }}>
            Choose your payday above. Bills and subscriptions appear once the same one is logged in two different months.
          </p>
          <Link to="/tools/expenses" className="btn btn-sm" style={{ textDecoration: 'none' }}>Log expenses</Link>
        </div>
      ) : (
        <>
          <section className="card" style={{ marginBottom: 14 }} aria-labelledby="mc-cal-h">
            <div className="fx-mc-row" style={{ marginBottom: 10 }}>
              <h2 id="mc-cal-h" className="fx-mc-h">{monthLabel(viewMonth)}</h2>
              {months.length > 1 && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={monthIndex === 0}
                    onClick={() => showMonth(monthIndex - 1)} aria-label="Previous month">‹</button>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={monthIndex >= months.length - 1}
                    onClick={() => showMonth(monthIndex + 1)} aria-label="Next month">›</button>
                </div>
              )}
            </div>
            <div className="fx-mc-legend" aria-hidden="true">
              {(Object.keys(KIND_LABEL) as FlowKind[]).map((k) => (
                <span key={k}><span className="fx-mc-dot" style={{ background: KIND_ACCENT[k] }} />{KIND_LABEL[k]}</span>
              ))}
            </div>
            <div role="group" aria-label={`${monthLabel(viewMonth)}, estimated balance by day`} className="fx-mc-grid">
              {WEEKDAYS.map((w) => <div key={w} aria-hidden="true" className="fx-mc-dow">{w}</div>)}
              {cells.map((n, i) => {
                if (n === null) return <div key={`b${i}`} className="fx-mc-cell empty" aria-hidden="true" />;
                const date = `${viewMonth}-${String(n).padStart(2, '0')}`;
                const d = byDate.get(date);
                if (!d) return <div key={date} className="fx-mc-cell out" aria-hidden="true"><span className="fx-mc-num">{n}</span></div>;
                const negative = d.balance !== null && d.balance < 0;
                return (
                  <div key={date} className={`fx-mc-cell${date === projection.today ? ' today' : ''}${negative ? ' neg' : ''}`}>
                    <button type="button" className="fx-mc-day" aria-pressed={selected === date} aria-label={dayLabel(d)}
                      onClick={() => setSelected(date)}>
                      <span className="fx-mc-num">{n}</span>
                      {d.balance !== null && <span className="fx-mc-bal">{cfmtSh(d.balance)}</span>}
                      {d.flows.length > 0 && (
                        <span className="fx-mc-dots">
                          {d.flows.slice(0, 3).map((f) => <span key={f.key} style={{ background: KIND_ACCENT[f.kind] }} />)}
                        </span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="fx-mc-detail" aria-live="polite">
              <div style={{ fontWeight: 700, fontSize: 13 }}>{longDate(selectedDay.date)}</div>
              {selectedDay.flows.length === 0 && selectedDay.everyday === 0 && <p className="note" style={{ margin: '2px 0 0' }}>No regular payments estimated.</p>}
              <ul className="fx-mc-flows">
                {selectedDay.flows.map((f) => (
                  <li key={f.key}><span>{f.label}</span><b className={f.kind === 'salary' ? 'in' : ''}>{f.kind === 'salary' ? '+' : '−'}{cfmt(f.amount)}</b></li>
                ))}
                {selectedDay.everyday > 0 && <li><span>Everyday spending (average)</span><b>−{cfmt(selectedDay.everyday)}</b></li>}
              </ul>
              {selectedDay.balance !== null && (
                <div className="note" style={{ marginTop: 4 }}>Estimated balance at the end of the day: <b style={{ color: 'var(--ink)' }}>{cfmt(selectedDay.balance)}</b></div>
              )}
            </div>
          </section>

          {agenda.length > 0 && (
            <section className="card" style={{ marginBottom: 14 }} aria-labelledby="mc-agenda-h">
              <h2 id="mc-agenda-h" className="fx-mc-h" style={{ marginBottom: 4 }}>Coming up</h2>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {agenda.map((d) => (
                  <li key={d.date} className="fx-mc-agenda">
                    <span className="fx-mc-when" aria-hidden="true">
                      <b>{Number(d.date.slice(8, 10))}</b>
                      <span className="note">{monthLabel(d.date.slice(0, 7)).slice(0, 3)}</span>
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="sr-only">{longDate(d.date)}: </span>
                      {d.flows.map((f) => (
                        <span key={f.key} className="fx-mc-agenda-flow">
                          <span className="fx-mc-dot" aria-hidden="true" style={{ background: KIND_ACCENT[f.kind] }} />
                          <span className="fx-mc-agenda-name">{f.label}</span>
                          <b className={f.kind === 'salary' ? 'in' : ''}>{f.kind === 'salary' ? '+' : '−'}{cfmt(f.amount)}</b>
                        </span>
                      ))}
                      {d.balance !== null && <span className="note" style={{ display: 'block', fontSize: 13 }}>Balance after, estimated: {cfmt(d.balance)}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {recurring.length > 0 && (
        <section className="card" style={{ marginBottom: 14 }} aria-labelledby="mc-rec-h">
          <h2 id="mc-rec-h" className="fx-mc-h" style={{ marginBottom: 4 }}>Regular payments</h2>
          <p className="note" style={{ marginTop: 0 }}>Seen repeating in your expenses. Untick anything you have cancelled.</p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {recurring.map((r) => (
              <li key={r.key} className="fx-mc-rec">
                <label className="fx-checkrow" style={{ flex: 1, minWidth: 0 }}>
                  <input className="fx-check" type="checkbox" checked={r.included}
                    onChange={() => update(toggleSkipped(loadMoneyCalPrefs(), r.key))} />
                  <span style={{ minWidth: 0 }}>
                    <span className="fx-mc-rec-name">{r.name}</span>
                    <span className="note" style={{ display: 'block', fontSize: 13 }}>
                      {r.kind === 'saving' ? 'Saving' : 'Payment'} · usually on the {ordinal(r.day)} · last logged {shortDate(r.lastDate)}
                    </span>
                  </span>
                </label>
                <b style={{ fontSize: 13, flexShrink: 0 }}>{cfmt(r.amount)}</b>
              </li>
            ))}
          </ul>
        </section>
      )}

      <MethodologyNote summary="How the estimate is worked out">
        Salary is the take-home pay you type here, or your Budget Builder income, on the payday you choose
        (the last day of shorter months). It is added only on days after the day you saved your balance,
        because that balance may already include it. Regular payments are the ones FinatriX has seen repeat
        in your expenses, at their average amount, on the day of the last one you logged. This month, a
        payment counts only if its day is still ahead and nothing matching it is logged yet, the same rule
        as the Expense Tracker&apos;s &quot;already spoken for&quot;. Saving and investing payments count too,
        because they leave your account; transfers do not. Everyday spending, if included, is your average
        a day over the last three full months for everything that is not a regular payment, leaving out
        trips abroad. A balance saved on an earlier day is carried to today by taking off everything
        logged since and adding any payday since; after {BALANCE_MAX_AGE_DAYS} days it is not used.
        The balance and payday stay on this device. This is an estimate, not a forecast of your bank account.
      </MethodologyNote>

      <ToolFoot>
        Educational tools — not financial advice · <a href="/privacy" target="_top">Privacy</a> ·{' '}
        <a href="/terms" target="_top">Terms</a> · Built with care by <b>FinatriX</b>
      </ToolFoot>

      <style>{`
        .fx-mc-h { font-size: 14px; font-weight: 700; margin: 0; display: flex; align-items: center; gap: 8px; }
        .fx-mc-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .fx-mc-summary .fx-mc-row { margin-bottom: 12px; }
        .fx-mc-badge { font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--hair2); color: var(--ink2); }
        .fx-mc-big { font-size: 28px; font-weight: 800; line-height: 1.1; }
        .fx-mc-big-sub { font-size: 14px; font-weight: 600; color: var(--ink2); }
        .fx-mc-alert { display: flex; gap: 10px; align-items: flex-start; padding: 12px; border-radius: 12px; border: 1px solid color-mix(in srgb, var(--orange) 50%, transparent); background: color-mix(in srgb, var(--orange) 12%, transparent); }
        .fx-mc-alert > svg { color: var(--orange); flex-shrink: 0; margin-top: 2px; }
        .fx-mc-totals { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin: 14px 0 0; }
        .fx-mc-totals > div { min-width: 0; }
        .fx-mc-totals dt { font-size: 13px; color: var(--ink2); }
        .fx-mc-totals dd { margin: 0; font-size: 15px; font-weight: 700; }
        .fx-mc-form { display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end; }
        .fx-mc-legend { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; color: var(--ink2); margin-bottom: 8px; }
        .fx-mc-legend > span { display: inline-flex; align-items: center; gap: 6px; }
        .fx-mc-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
        .fx-mc-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
        .fx-mc-dow { text-align: center; font-size: 11px; font-weight: 700; letter-spacing: .04em; color: var(--ink3); padding-bottom: 6px; text-transform: uppercase; }
        .fx-mc-cell { position: relative; min-height: 56px; border-radius: 10px; border: 1px solid var(--hair2); min-width: 0; }
        .fx-mc-cell.empty { border: none; min-height: 0; }
        .fx-mc-cell.out { opacity: .45; padding: 5px 6px; }
        .fx-mc-cell.today { border-color: color-mix(in srgb, var(--gold) 55%, transparent); background: color-mix(in srgb, var(--gold) 8%, transparent); }
        .fx-mc-cell.neg { border-color: color-mix(in srgb, var(--red) 55%, transparent); background: color-mix(in srgb, var(--red) 10%, transparent); }
        .fx-mc-day { position: absolute; inset: 0; width: 100%; border: none; border-radius: inherit; background: transparent; cursor: pointer; text-align: left; padding: 5px 6px; display: flex; flex-direction: column; align-items: flex-start; gap: 1px; color: inherit; font: inherit; }
        .fx-mc-day[aria-pressed="true"] { outline: 2px solid var(--gold); outline-offset: -2px; }
        .fx-mc-day:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
        .fx-mc-num { font-size: 12px; font-weight: 600; color: var(--ink2); }
        .fx-mc-cell.today .fx-mc-num { color: var(--accent-text); font-weight: 800; }
        .fx-mc-bal { font-size: 11px; font-weight: 600; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
        .fx-mc-dots { display: flex; gap: 3px; margin-top: auto; }
        .fx-mc-dots > span { width: 6px; height: 6px; border-radius: 50%; }
        .fx-mc-detail { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--hair2); }
        .fx-mc-flows { list-style: none; margin: 6px 0 0; padding: 0; }
        .fx-mc-flows li { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; padding: 3px 0; }
        .fx-mc-flows b.in, .fx-mc-agenda b.in { color: var(--green); }
        .fx-mc-agenda { display: flex; gap: 12px; padding: 10px 0; border-top: 1px solid var(--hair2); }
        .fx-mc-when { width: 40px; text-align: center; flex-shrink: 0; }
        .fx-mc-when b { display: block; font-size: 16px; line-height: 1; }
        .fx-mc-when .note { font-size: 11px; }
        .fx-mc-agenda-flow { display: flex; align-items: center; gap: 8px; font-size: 13px; }
        .fx-mc-agenda-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .fx-mc-rec { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--hair2); }
        .fx-mc-rec-name { display: block; font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        @media (max-width: 480px) { .fx-mc-grid { gap: 3px; } .fx-mc-cell { min-height: 50px; } .fx-mc-day { padding: 4px 2px; align-items: center; } .fx-mc-bal { letter-spacing: -.03em; text-overflow: clip; } }
        /* Under 360px a day is too narrow for a figure; the day's label, the detail and Coming up carry it. */
        @media (max-width: 359px) { .fx-mc-bal { display: none; } }
      `}</style>
    </div>
  );
}
