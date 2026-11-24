import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { PageHead, ToolFoot, MethodologyNote } from '../ui/common';
import { Icon } from '../ui/Icon';
import { useCurrency } from '../CurrencyContext';
import { useOptionalToast } from '../ui/Toast';
import { ymdLocal, ymLocal } from '../../lib/date';
import { loadExpenses } from '../lib/expense';
import {
  addTrial, computeRadar, loadRadarPrefs, logSubscriptionPayment, radarCatMeta, removeTrial, saveRadarPrefs,
  toggleMuted, type RadarPrefs, type SubscriptionRow,
} from '../lib/subscriptions';

function ordinal(n: number): string {
  const rem = n % 100;
  if (rem >= 11 && rem <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

function shortDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function daysLabel(n: number): string {
  if (n < 0) return 'Ended';
  if (n === 0) return 'Ends today';
  if (n === 1) return 'Ends tomorrow';
  return `Ends in ${n} days`;
}

export default function SubscriptionsPage() {
  const { notify } = useOptionalToast();
  const { cfmt } = useCurrency();
  const [revision, setRevision] = useState(0);
  const [trialName, setTrialName] = useState('');
  const [trialEnd, setTrialEnd] = useState('');

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

  const now = new Date();
  const today = ymdLocal(now);
  // A storage, focus or write event re-reads the ledger; the date alone does not change within a visit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const radar = useMemo(() => computeRadar(loadExpenses(), radarCatMeta(ymLocal(new Date())), loadRadarPrefs(), new Date()), [revision]);

  const update = (next: RadarPrefs | null) => {
    if (!next) return false;
    if (!saveRadarPrefs(next)) notify('This device could not save that. Please try again.', 'error');
    setRevision((value) => value + 1);
    return true;
  };

  const logIt = (row: SubscriptionRow) => {
    if (logSubscriptionPayment(row, new Date())) {
      notify(`Logged ${row.name} for today.`, 'ok');
      setRevision((value) => value + 1);
    } else {
      notify('That could not be saved. Please try again.', 'error');
    }
  };

  const submitTrial = (event: React.FormEvent) => {
    event.preventDefault();
    if (update(addTrial(loadRadarPrefs(), trialName, trialEnd))) {
      setTrialName('');
      setTrialEnd('');
    } else {
      notify('Add a name and the last day of the trial.', 'error');
    }
  };

  const { subscriptions, trials } = radar;
  const dueToLog = subscriptions.filter((s) => s.dueToLog);
  const count = subscriptions.length;

  return (
    <div className="fx-page">
      <PageHead chip="Subscriptions" chipColor="var(--gold)" icon="subs" title="What your subscriptions cost a year.">
        Every subscription and recurring payment FinatriX has seen repeat in your expenses, with a
        reminder before each renewal and before a free trial ends. Nothing here is invented.
      </PageHead>

      {count === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px', marginBottom: 14 }}>
          <Icon name="subs" size={40} style={{ color: 'var(--ink3)', marginBottom: 12 }} />
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No subscriptions spotted yet</div>
          <p className="note" style={{ maxWidth: 380, margin: '0 auto 16px' }}>
            A subscription shows up once it has repeated: log it in the Subscriptions category, or mark an
            expense as recurring, in two different months.
          </p>
          <Link to="/tools/expenses" className="btn btn-sm" style={{ textDecoration: 'none' }}>Log expenses</Link>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 14 }} role="group" aria-label="Yearly cost">
          <div className="note" style={{ marginBottom: 4 }}>{count} {count === 1 ? 'subscription' : 'subscriptions'} cost about</div>
          <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1 }}>{cfmt(radar.yearlyTotal)} <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink2)' }}>a year</span></div>
          <p className="note" style={{ marginTop: 6 }}>About {cfmt(radar.monthlyTotal)} a month, from the average of what you logged. An estimate: prices change.</p>
        </div>
      )}

      {dueToLog.length > 0 && (
        <section className="card" style={{ marginBottom: 14 }} aria-labelledby="sub-due-h">
          <h2 id="sub-due-h" style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>Paid it? Log it</h2>
          <p className="note" style={{ marginTop: 0 }}>Usually paid by now this month, but nothing is logged. One tap logs it today at the usual amount.</p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {dueToLog.map((row) => (
              <li key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--hair2)' }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</span>
                  <span className="note" style={{ fontSize: 11 }}>Usually on the {ordinal(row.day)}</span>
                </span>
                <button type="button" className="btn btn-sm" onClick={() => logIt(row)}>Log {cfmt(row.monthly)}</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {count > 0 && (
        <section className="card" style={{ marginBottom: 14 }} aria-labelledby="sub-list-h">
          <h2 id="sub-list-h" style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>Your subscriptions</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {subscriptions.map((row) => (
              <li key={row.key} style={{ padding: '12px 0', borderTop: '1px solid var(--hair2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'color-mix(in srgb, var(--orange) 14%, transparent)', color: 'var(--orange)' }}>
                    <Icon name={row.icon} size={16} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</span>
                    <span className="note" style={{ fontSize: 11 }}>
                      Usually on the {ordinal(row.day)}, about {cfmt(row.monthly)} · next around {shortDate(row.nextDate)}
                    </span>
                  </span>
                  <span style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{cfmt(row.yearly)}</span>
                    <span className="note" style={{ fontSize: 11 }}>a year</span>
                  </span>
                </div>
                <label className="fx-checkrow" style={{ marginTop: 8, marginLeft: 46 }}>
                  <input className="fx-check" type="checkbox" checked={!row.muted}
                    onChange={() => update(toggleMuted(loadRadarPrefs(), row.key))} />
                  Remind me about {row.name}
                </label>
                <div className="note" style={{ fontSize: 11, marginLeft: 46 }}>
                  Last logged {shortDate(row.lastDate)} · seen in {row.monthsSeen} {row.monthsSeen === 1 ? 'month' : 'months'}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card" style={{ marginBottom: 14 }} aria-labelledby="sub-trial-h">
        <h2 id="sub-trial-h" style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>Free trials</h2>
        <p className="note" style={{ marginTop: 0 }}>Type in a trial and its last day. You get a reminder three days before it ends.</p>
        <form onSubmit={submitTrial} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 8 }}>
          <div style={{ flex: '1 1 160px' }}>
            <label className="fl" htmlFor="sub-trial-name">Service</label>
            <input id="sub-trial-name" className="fi" type="text" maxLength={60} value={trialName}
              onChange={(e) => setTrialName(e.target.value)} placeholder="e.g. Spotify" autoComplete="off" />
          </div>
          <div style={{ flex: '0 1 170px' }}>
            <label className="fl" htmlFor="sub-trial-end">Trial ends on</label>
            <input id="sub-trial-end" className="fi" type="date" min={today} value={trialEnd} onChange={(e) => setTrialEnd(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-sm" disabled={!trialName.trim() || !trialEnd}>Add trial</button>
        </form>
        {trials.length > 0 && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {trials.map((t) => (
              <li key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--hair2)' }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                  <span className="note" style={{ fontSize: 11 }}>{daysLabel(t.daysLeft)} · {shortDate(t.end)}</span>
                </span>
                <button type="button" className="btn btn-ghost btn-sm" aria-label={`Remove the ${t.name} trial`}
                  onClick={() => update(removeTrial(loadRadarPrefs(), t.id))}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <MethodologyNote summary="How this is worked out">
        A subscription appears once it has repeated: expenses in the Subscriptions category, or marked
        recurring, logged with the same merchant in two or more months. The yearly cost is the average
        you logged times twelve. The usual day is the day of your last logged payment, and the next date
        follows from it. Reminders arrive in the evening notification, never more than the three a day
        the app already sends, and carry no amounts. A subscription you have cancelled keeps showing,
        because the app cannot know, so switch its reminder off.
        Reminders and trials live on this device.
      </MethodologyNote>

      <ToolFoot>
        Educational tools — not financial advice · <a href="/privacy" target="_top">Privacy</a> ·{' '}
        <a href="/terms" target="_top">Terms</a> · Built with care by <b>FinatriX</b>
      </ToolFoot>
    </div>
  );
}
