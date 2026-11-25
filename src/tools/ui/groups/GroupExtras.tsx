import { useCallback, useEffect, useMemo, useState } from 'react';
import { ToolSheet } from '../ToolSheet';
import { AmountInput } from '../AmountInput';
import { useOptionalToast } from '../Toast';
import { evaluateFormula } from '../../lib/formula';
import { ymdLocal } from '../../../lib/date';
import { currencySym } from '../../lib/format';
import { fmtExact } from '../../lib/trips';
import { currentMembers, groupAmount, groupCategoryLabel, memberName, type GroupMemberRow } from '../../lib/groups';
import { GroupsError } from '../../lib/groupsApi';
import {
  CHILD_NAME_MAX, GOAL_NAME_MAX, MAX_CHILDREN, canManageChild, childSpend, goalProgress, liveGoals, monthBounds, stage3ErrorMessage,
  type DependentExpense, type GroupDependentRow, type GroupGoalRow,
} from '../../lib/groupGoals';
import {
  addChild, addContribution, addGoal, fetchStage3, fetchTaggable, removeChild, removeContribution, removeGoal,
  subscribeStage3, tagExpense, type Stage3Bundle,
} from '../../lib/groupGoalsApi';

/**
 * Groups stage 3 (step 3.9) inside a group: shared savings goals, and
 * children as names a parent manages. Every figure comes from the group's own
 * rows (lib/groupGoals.ts). Nothing here moves money: a contribution is a
 * record of money a member set aside.
 */

const errCode = (e: unknown) => (e instanceof GroupsError ? e.message : undefined);
const EMPTY: Stage3Bundle = { goals: [], contributions: [], children: [] };

function useStage3(groupId: string) {
  const [data, setData] = useState<Stage3Bundle>(EMPTY);
  const [failed, setFailed] = useState(false);
  const reload = useCallback(() => fetchStage3(groupId).then(
    (next) => { setData(next); setFailed(false); },
    () => setFailed(true),
  ), [groupId]);
  useEffect(() => {
    void reload();
    return subscribeStage3(groupId, () => { void reload(); });
  }, [groupId, reload]);
  return { ...data, failed, reload };
}

export function GroupExtras({ groupId, currency, members, meId, isAdmin, month, showChildren }: {
  groupId: string;
  /** Family and Couple groups: children's names a parent manages. */
  showChildren: boolean;
  currency: string;
  members: readonly GroupMemberRow[];
  meId: string;
  isAdmin: boolean;
  /** The month Budget together is showing (YYYY-MM), for children's spending. */
  month: string;
}) {
  const s = useStage3(groupId);
  return (
    <>
      <GoalsSection groupId={groupId} currency={currency} members={members} meId={meId} data={s} />
      {showChildren && <ChildrenSection groupId={groupId} currency={currency} meId={meId} isAdmin={isAdmin} month={month} data={s} />}
    </>
  );
}

/* ── Goals ─────────────────────────────────────────────────────────────── */

function GoalsSection({ groupId, currency, members, meId, data }: {
  groupId: string;
  currency: string;
  members: readonly GroupMemberRow[];
  meId: string;
  data: ReturnType<typeof useStage3>;
}) {
  const { notify } = useOptionalToast();
  const [sheet, setSheet] = useState<'new' | GroupGoalRow | null>(null);
  const goals = useMemo(() => liveGoals(data.goals), [data.goals]);
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const who = (id: string) => (id === meId ? 'You' : memberName(byId.get(id)));
  const show = (paise: number) => fmtExact(paise / 100, currency);

  const remove = async (goal: GroupGoalRow) => {
    try {
      await removeGoal(goal, true);
      await data.reload();
      notify(`${goal.name} removed for everyone in the group.`, 'ok');
    } catch (e) { notify(stage3ErrorMessage(errCode(e)), 'error'); }
  };

  return (
    <section className="card" style={{ marginBottom: 14 }} aria-labelledby="grp-goals-h" data-testid="grp-goals">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <h2 id="grp-goals-h" style={{ fontSize: 14, fontWeight: 700, margin: 0, flex: 1 }}>Saving together</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSheet('new')}>New goal</button>
      </div>
      {data.failed && <p className="note">Goals couldn’t load. They’ll appear when you’re back online.</p>}
      {!data.failed && goals.length === 0 && (
        <p className="note" style={{ margin: 0 }}>Save towards something together, like a family holiday. Everyone records what they put aside.</p>
      )}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {goals.map((goal) => {
          const p = goalProgress(goal, data.contributions);
          return (
            <li key={goal.id} className="fx-grp-row" style={{ display: 'block' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span className="fx-grp-name" style={{ flex: 1, minWidth: 0 }}>{goal.emoji} {goal.name}</span>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{p.percent}%</span>
              </div>
              <span className="fx-grp-bar" role="progressbar" aria-label={`${goal.name}: ${p.percent}% saved`}
                aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.percent}>
                <span style={{ width: `${p.percent}%`, background: 'var(--green)' }} />
              </span>
              <span className="fx-grp-sub" style={{ marginTop: 4 }}>
                {show(p.savedPaise)} of {show(p.targetPaise)}
                {p.leftPaise > 0 ? ` · ${show(p.leftPaise)} to go` : ' · reached'}
                {goal.target_date ? ` · by ${new Date(`${goal.target_date}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
              </span>
              {p.byMember.length > 0 && (
                <span className="fx-grp-sub">{p.byMember.map((m) => `${who(m.memberId)} ${show(m.paise)}`).join(' · ')}</span>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-sm" onClick={() => setSheet(goal)}>Add money</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void remove(goal)}
                  aria-label={`Remove the goal ${goal.name}`}>Remove</button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="note" style={{ margin: '8px 0 0' }}>FinatriX doesn’t hold or move money. This keeps track of what each of you has put aside.</p>

      {sheet === 'new' && (
        <NewGoalSheet currency={currency} onClose={() => setSheet(null)} onSave={async (row) => {
          try {
            await addGoal({ group_id: groupId, ...row });
            await data.reload();
            setSheet(null);
            notify('Goal added for everyone in the group.', 'ok');
          } catch (e) { notify(stage3ErrorMessage(errCode(e)), 'error'); }
        }} />
      )}
      {sheet && sheet !== 'new' && (
        <ContributionSheet goal={sheet} currency={currency} members={members} meId={meId}
          recent={data.contributions.filter((c) => c.goal_id === sheet.id).slice(0, 5)} who={who}
          onClose={() => setSheet(null)}
          onRemove={async (c) => {
            try { await removeContribution(c); await data.reload(); } catch (e) { notify(stage3ErrorMessage(errCode(e)), 'error'); }
          }}
          onSave={async (row) => {
            try {
              await addContribution({ group_id: groupId, goal_id: sheet.id, ...row });
              await data.reload();
              setSheet(null);
              notify('Added to the goal.', 'ok');
            } catch (e) { notify(stage3ErrorMessage(errCode(e)), 'error'); }
          }} />
      )}
    </section>
  );
}

function readAmount(raw: string): number | null {
  const parsed = evaluateFormula(raw);
  return parsed.ok ? groupAmount(parsed.value) : null;
}

function NewGoalSheet({ currency, onSave, onClose }: {
  currency: string;
  onSave: (row: { name: string; emoji: string; target: number; target_date: string | null }) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    const value = readAmount(target);
    if (!clean) { setError('Give the goal a name.'); return; }
    if (value === null) { setError('Enter a target above 0.'); return; }
    if (date && (date < '2000-01-01' || date > '2100-12-31')) { setError('Pick a date, or leave it empty.'); return; }
    setBusy(true);
    await onSave({ name: clean.slice(0, GOAL_NAME_MAX), emoji: '🎯', target: value, target_date: date || null });
    setBusy(false);
  };
  return (
    <ToolSheet title="New goal" description="Everyone in the group can add to it." onClose={onClose}
      footer={(
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button type="submit" form="grp-goal" className="btn btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Add goal'}</button>
        </div>
      )}>
      <form id="grp-goal" onSubmit={submit} noValidate>
        <div className="fg" style={{ marginBottom: 10 }}>
          <label className="fl" htmlFor="grp-goal-name">Name</label>
          <input id="grp-goal-name" className="fi" type="text" maxLength={GOAL_NAME_MAX} autoComplete="off"
            placeholder="e.g. Goa holiday" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="fg" style={{ marginBottom: 10 }}>
          <label className="fl" htmlFor="grp-goal-target">Target ({currency})</label>
          <AmountInput id="grp-goal-target" sym={currencySym(currency) || `${currency} `} value={target} onChange={setTarget} />
        </div>
        <div className="fg" style={{ marginBottom: 10 }}>
          <label className="fl" htmlFor="grp-goal-date">By (optional)</label>
          <input id="grp-goal-date" className="fi" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {error && <p className="fx-grp-err" role="alert">{error}</p>}
      </form>
    </ToolSheet>
  );
}

function ContributionSheet({ goal, currency, members, meId, recent, who, onSave, onRemove, onClose }: {
  goal: GroupGoalRow;
  currency: string;
  members: readonly GroupMemberRow[];
  meId: string;
  recent: ReadonlyArray<Stage3Bundle['contributions'][number]>;
  who: (id: string) => string;
  onSave: (row: { member_id: string; amount: number; added_on: string; note: string | null }) => Promise<void>;
  onRemove: (row: Stage3Bundle['contributions'][number]) => Promise<void>;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [member, setMember] = useState(meId);
  const [date, setDate] = useState(() => ymdLocal(new Date()));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const people = currentMembers(members);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = readAmount(amount);
    if (value === null) { setError('Enter an amount above 0.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setError('Pick a date.'); return; }
    setBusy(true);
    await onSave({ member_id: member, amount: value, added_on: date, note: note.trim().slice(0, 200) || null });
    setBusy(false);
  };
  return (
    <ToolSheet title={`Add to ${goal.name}`} description="Record money put aside for this goal. Nothing is moved." onClose={onClose}
      footer={(
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button type="submit" form="grp-con" className="btn btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Add'}</button>
        </div>
      )}>
      <form id="grp-con" onSubmit={submit} noValidate>
        <div className="fg" style={{ marginBottom: 10 }}>
          <label className="fl" htmlFor="grp-con-amt">Amount ({currency})</label>
          <AmountInput id="grp-con-amt" sym={currencySym(currency) || `${currency} `} value={amount} onChange={setAmount} />
        </div>
        <div className="fg" style={{ marginBottom: 10 }}>
          <label className="fl" htmlFor="grp-con-who">Put aside by</label>
          <select id="grp-con-who" className="fs" value={member} onChange={(e) => setMember(e.target.value)}>
            {people.map((m) => <option key={m.id} value={m.id}>{m.id === meId ? 'You' : memberName(m)}</option>)}
          </select>
        </div>
        <div className="fg" style={{ marginBottom: 10 }}>
          <label className="fl" htmlFor="grp-con-date">Date</label>
          <input id="grp-con-date" className="fi" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="fg" style={{ marginBottom: 10 }}>
          <label className="fl" htmlFor="grp-con-note">Note (optional)</label>
          <input id="grp-con-note" className="fi" type="text" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {error && <p className="fx-grp-err" role="alert">{error}</p>}
      </form>
      {recent.length > 0 && (
        <>
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: '12px 0 2px' }}>Recent</h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {recent.map((c) => (
              <li key={c.id} className="fx-grp-row" style={{ padding: '6px 0' }}>
                <span style={{ flex: 1, minWidth: 0 }} className="fx-grp-sub">{who(c.member_id)} · {c.added_on}{c.note ? ` · ${c.note}` : ''}</span>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{fmtExact(c.amount, currency)}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void onRemove(c)}
                  aria-label={`Remove ${fmtExact(c.amount, currency)} added by ${who(c.member_id)}`}>Remove</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </ToolSheet>
  );
}

/* ── Children ──────────────────────────────────────────────────────────── */

function ChildrenSection({ groupId, currency, meId, isAdmin, month, data }: {
  groupId: string;
  currency: string;
  meId: string;
  isAdmin: boolean;
  month: string;
  data: ReturnType<typeof useStage3>;
}) {
  const { notify } = useOptionalToast();
  const [sheet, setSheet] = useState<'add' | GroupDependentRow | null>(null);
  const [expenses, setExpenses] = useState<DependentExpense[]>([]);
  const childCount = data.children.length;
  const loadExpenses = useCallback(() => (childCount === 0
    ? Promise.resolve()
    // On a failure the totals stay as they were.
    : fetchTaggable(groupId, ...monthBounds(month)).then(setExpenses, () => {})), [groupId, month, childCount]);
  useEffect(() => { void loadExpenses(); }, [loadExpenses]);
  const spend = useMemo(() => childSpend(expenses, month), [expenses, month]);

  return (
    <section className="card" style={{ marginBottom: 14 }} aria-labelledby="grp-kids-h" data-testid="grp-children">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <h2 id="grp-kids-h" style={{ fontSize: 14, fontWeight: 700, margin: 0, flex: 1 }}>Children</h2>
        {childCount < MAX_CHILDREN && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSheet('add')}>Add a child</button>}
      </div>
      {childCount === 0 ? (
        <p className="note" style={{ margin: 0 }}>Add a child’s first name to mark school fees or pocket money as theirs. Children don’t get an account.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {data.children.map((c) => (
            <li key={c.id} className="fx-grp-row">
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="fx-grp-name">{c.display_name}</span>
                <span className="fx-grp-sub">{c.created_by === meId ? 'Managed by you' : 'Managed by their parent'}</span>
              </span>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{fmtExact((spend.get(c.id) ?? 0) / 100, currency)}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSheet(c)}
                aria-label={`Expenses for ${c.display_name}`}>Expenses</button>
            </li>
          ))}
        </ul>
      )}

      {sheet === 'add' && (
        <AddChildSheet onClose={() => setSheet(null)} onSave={async (name, confirmed) => {
          try {
            await addChild(groupId, name, confirmed);
            await data.reload();
            setSheet(null);
            notify(`${name} added. Only you and the group’s admin can change or remove them.`, 'ok');
          } catch (e) { notify(stage3ErrorMessage(errCode(e)), 'error'); }
        }} />
      )}
      {sheet && sheet !== 'add' && (
        <ChildSheet child={sheet} currency={currency} expenses={expenses} canManage={canManageChild(sheet, meId, isAdmin)}
          onClose={() => setSheet(null)}
          onTag={async (expenseId, on) => {
            try {
              await tagExpense(groupId, expenseId, on ? sheet.id : null);
              await loadExpenses();
            } catch (e) { notify(stage3ErrorMessage(errCode(e)), 'error'); }
          }}
          onRemove={async () => {
            try {
              await removeChild(sheet);
              await data.reload();
              await loadExpenses();
              setSheet(null);
              notify(`${sheet.display_name}’s name is deleted. Their expenses stay in the group.`, 'ok');
            } catch (e) { notify(stage3ErrorMessage(errCode(e)), 'error'); }
          }} />
      )}
    </section>
  );
}

function AddChildSheet({ onSave, onClose }: { onSave: (name: string, confirmed: boolean) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) { setError('Add their first name.'); return; }
    if (!confirmed) { setError('Confirm you’re their parent or guardian.'); return; }
    setBusy(true);
    await onSave(clean.slice(0, CHILD_NAME_MAX), confirmed);
    setBusy(false);
  };
  return (
    <ToolSheet title="Add a child" description="Just a first name, so expenses can be marked as theirs. No account, age or photo." onClose={onClose}
      footer={(
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button type="submit" form="grp-kid" className="btn btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Add'}</button>
        </div>
      )}>
      <form id="grp-kid" onSubmit={submit} noValidate>
        <div className="fg" style={{ marginBottom: 10 }}>
          <label className="fl" htmlFor="grp-kid-name">First name</label>
          <input id="grp-kid-name" className="fi" type="text" maxLength={CHILD_NAME_MAX} autoComplete="off"
            value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aarav" />
        </div>
        <label className="fx-checkrow" style={{ marginBottom: 10 }}>
          <input type="checkbox" className="fx-check" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          <span>I’m their parent or guardian, and I agree to their first name being shown to this group.</span>
        </label>
        <p className="note" style={{ margin: 0 }}>Only you and the group’s admin can change or remove it. It’s deleted if you leave the group.</p>
        {error && <p className="fx-grp-err" role="alert">{error}</p>}
      </form>
    </ToolSheet>
  );
}

function ChildSheet({ child, currency, expenses, canManage, onTag, onRemove, onClose }: {
  child: GroupDependentRow;
  currency: string;
  expenses: readonly DependentExpense[];
  canManage: boolean;
  onTag: (expenseId: string, on: boolean) => Promise<void>;
  onRemove: () => Promise<void>;
  onClose: () => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const open = expenses.filter((e) => !e.for_dependent || e.for_dependent === child.id);
  return (
    <ToolSheet title={`Expenses for ${child.display_name}`} description="Tick the group’s expenses this month that were for them."
      onClose={onClose}
      footer={(
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          {canManage ? (
            confirmRemove
              ? <button type="button" className="btn btn-sm" onClick={() => void onRemove()}>Delete {child.display_name}’s name</button>
              : <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmRemove(true)}>Remove child</button>
          ) : <span />}
          <button type="button" className="btn btn-sm" onClick={onClose}>Done</button>
        </div>
      )}>
      {open.length === 0 ? (
        <p className="note">No group expenses this month yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {open.map((e) => (
            <li key={e.id} className="fx-grp-row" style={{ padding: '6px 0' }}>
              <label className="fx-checkrow" style={{ flex: 1, minWidth: 0, margin: 0 }}>
                <input type="checkbox" className="fx-check" checked={e.for_dependent === child.id}
                  onChange={(ev) => void onTag(e.id, ev.target.checked)} />
                <span>{e.note || groupCategoryLabel(e.category)} · {e.spent_on} · {fmtExact(e.amount, currency)}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </ToolSheet>
  );
}
