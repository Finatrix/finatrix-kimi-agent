import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ToolSheet } from '../ToolSheet';
import { MoneyField } from '../MoneyField';
import { AmountInput } from '../AmountInput';
import { Icon } from '../Icon';
import { useOptionalToast } from '../Toast';
import { cfmt, currencySym } from '../../lib/format';
import { useAmountsHidden } from '../../lib/hideAmounts';
import { evaluateFormula } from '../../lib/formula';
import { fmtExact } from '../../lib/trips';
import { ymdLocal, ymLocal } from '../../../lib/date';
import { monthLabel, nextMonthUnclamped, prevMonth } from '../../lib/month';
import {
  GROUP_BUDGET_CATEGORIES, GROUP_NOTE_MAX, MEMBER_NAME_MAX, budgetsForMonth, buildFeed, capitalize, computeBudgetTogether,
  currentMembers, groupAmount, groupCategoryIcon, groupCategoryLabel, groupErrorMessage, groupTypeLabel,
  isFormer, memberName, timeAgo, whoName, type FeedItem, type GroupChoice, type GroupExpenseRow, type GroupMemberRow,
  type GroupSettlementRow,
} from '../../lib/groups';
import { checkSplit, formatPaise, parseShares, shareOf, toPaise, type Payment, type ShareEntry, type SplitRule } from '../../lib/groupSplit';
import { initialSplit, splitDraftOf, type SplitPerson, type SplitState } from '../../lib/groupSplitForm';
import {
  GroupsError, leaveGroup, queueBudgets, queueExpenseUpdate, queueSettlement, queueSettlementUpdate, removeGroupMember,
  renameMe, resetGroupCode, setBudgetTogether, setSplitCosts,
} from '../../lib/groupsApi';
import { reconcileGroupShares } from '../../lib/groupShare';
import { useGroupLive } from '../../lib/useGroupLive';
import { reportDropped } from '../../lib/useGroupExpenseAdd';
import { InviteSheet } from './InviteSheet';
import { SplitCosts } from './SplitCosts';
import { GroupExtras } from './GroupExtras';
import { SplitFields } from './SplitFields';

const errCode = (e: unknown) => (e instanceof GroupsError ? e.code : e instanceof Error ? e.message : undefined);

/**
 * One group: Budget together for a month, the live activity feed and the
 * members. Every change shows who made it, from the member ids the database
 * stamps on each row.
 */
export function GroupDetail({ choice, onBack, onLeft, onChanged }: {
  choice: GroupChoice;
  onBack: () => void;
  onLeft: () => void;
  onChanged: () => void;
}) {
  const { notify } = useOptionalToast();
  useAmountsHidden();
  const thisMonth = ymLocal(new Date());
  const [month, setMonth] = useState(thisMonth);
  const meId = choice.memberId;
  const g = useGroupLive(choice.id, month, meId, (r) => reportDropped(r, notify));
  const [sheet, setSheet] = useState<null | 'invite' | 'budget' | 'members'>(null);
  const [editing, setEditing] = useState<GroupExpenseRow | null>(null);

  const group = g.group;
  const currency = group?.currency ?? choice.currency;
  const money = (n: number) => cfmt(n, currency);
  const exact = (n: number) => fmtExact(n, currency);
  const membersById = useMemo(() => new Map(g.members.map((m) => [m.id, m])), [g.members]);
  const me = membersById.get(meId);
  const isAdmin = me?.role === 'admin';
  const people = currentMembers(g.members);
  const together = useMemo(
    () => computeBudgetTogether(g.expenses, g.budgets, g.members, month, meId),
    [g.expenses, g.budgets, g.members, month, meId],
  );
  const feed = useMemo(
    () => buildFeed(g.expenses, g.budgets, g.members, meId, g.pendingIds, 40, g.settlements),
    [g.expenses, g.budgets, g.members, meId, g.pendingIds, g.settlements],
  );
  const splitCosts = g.group?.split_costs ?? choice.splitCosts;
  // Your share in your own tracker follows what the server confirmed, not what is still queued.
  const confirmed = g.confirmedExpenses;
  const groupName = g.group?.name ?? choice.name;
  const groupCurrency = g.group?.currency ?? choice.currency;
  useEffect(() => {
    if (g.group && splitCosts) reconcileGroupShares({ id: choice.id, name: groupName, currency: groupCurrency, memberId: meId }, confirmed);
  }, [g.group, splitCosts, confirmed, choice.id, groupName, groupCurrency, meId]);

  if (g.status === 'gone') {
    return (
      <div className="card" role="status">
        <p style={{ marginTop: 0 }}>You are no longer in {choice.name}.</p>
        <button type="button" className="btn btn-sm" onClick={onLeft}>Back to groups</button>
      </div>
    );
  }

  const name = group?.name ?? choice.name;
  const emoji = group?.emoji ?? choice.emoji;
  const budgetTogether = group?.budget_together ?? choice.budgetTogether;

  const markPaid = async (payment: Payment, paise: number) => {
    try {
      await queueSettlement({
        group_id: choice.id, from_member: payment.from, to_member: payment.to,
        amount: paise / 100, settled_on: ymdLocal(new Date()),
      });
      notify('Marked as paid. Everyone’s balance is updated.', 'ok');
    } catch (e) {
      notify(groupErrorMessage(errCode(e)), 'error');
    }
  };
  const toggleSettlement = async (row: GroupSettlementRow, deleted: boolean) => {
    try {
      await queueSettlementUpdate(row, deleted);
      notify(deleted ? 'Payment removed for everyone in the group.' : 'Put back.', 'ok');
    } catch (e) {
      notify(groupErrorMessage(errCode(e)), 'error');
    }
  };
  const turnOn = async (mode: 'budget' | 'split') => {
    try {
      if (mode === 'budget') await setBudgetTogether(choice.id, true); else await setSplitCosts(choice.id, true);
      if (group) g.setGroup({ ...group, ...(mode === 'budget' ? { budget_together: true } : { split_costs: true }) });
      onChanged();
    } catch (e) { notify(groupErrorMessage(errCode(e)), 'error'); }
  };

  const toggleDeleted = async (row: GroupExpenseRow, deleted: boolean) => {
    try {
      await queueExpenseUpdate(row, { deleted_at: deleted ? new Date().toISOString() : null });
      notify(deleted ? 'Deleted for everyone in the group.' : 'Put back.', 'ok');
    } catch (e) {
      notify(groupErrorMessage(errCode(e)), 'error');
    }
  };

  return (
    <div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 10 }}>← All groups</button>

      <section className="card" style={{ marginBottom: 14 }} aria-labelledby="grp-h">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span className="fx-grp-badge" aria-hidden="true">{emoji}</span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <h2 id="grp-h" className="fx-grp-name" style={{ fontSize: 18, margin: 0 }}>{name}</h2>
            <span className="fx-grp-sub">
              {groupTypeLabel(group?.type ?? choice.type)} · {people.length} {people.length === 1 ? 'member' : 'members'}
              {' · '}<span data-testid="grp-live">{g.live ? 'Live' : g.status === 'loading' ? 'Connecting…' : 'Offline: changes wait on this phone'}</span>
            </span>
          </span>
        </div>
        <div className="fx-grp-actions">
          {(budgetTogether || splitCosts) && (
            <Link to={`/tools/expenses?group=${encodeURIComponent(choice.id)}`} className="btn btn-sm" style={{ textDecoration: 'none' }}>
              <Icon name="plus" size={15} /> Add an expense
            </Link>
          )}
          <button type="button" className={budgetTogether ? 'btn btn-ghost btn-sm' : 'btn btn-sm'} onClick={() => setSheet('invite')}>Invite</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSheet('members')}>Members</button>
        </div>
      </section>

      {g.status === 'error' && (
        <p className="fx-grp-err" role="alert">Couldn’t load the latest from the group. Showing what this phone has. <button type="button" className="btn btn-ghost btn-sm" onClick={() => void g.reload()}>Try again</button></p>
      )}

      {splitCosts && (
        <SplitCosts groupName={name} currency={currency} members={g.members} expenses={g.expenses} settlements={g.settlements}
          meId={meId} onMarkPaid={markPaid} />
      )}

      {budgetTogether && (
        <section className="card" style={{ marginBottom: 14 }} aria-labelledby="grp-budget-h">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <h2 id="grp-budget-h" style={{ fontSize: 14, fontWeight: 700, margin: 0, flex: 1 }}>Budget together</h2>
            <button type="button" className="btn btn-ghost btn-sm" aria-label="Previous month" onClick={() => setMonth(prevMonth(month))}>‹</button>
            <span style={{ fontSize: 13, fontWeight: 600, minWidth: 110, textAlign: 'center' }} aria-live="polite">{monthLabel(month)}</span>
            <button type="button" className="btn btn-ghost btn-sm" aria-label="Next month" disabled={month > thisMonth} onClick={() => setMonth(nextMonthUnclamped(month))}>›</button>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.15 }} data-testid="grp-spent">
            {money(together.spent)}
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink2)' }}>
              {together.budget > 0 ? ` of ${money(together.budget)} budget` : ' spent'}
            </span>
          </div>
          {together.carriedFrom && <p className="note" style={{ margin: '4px 0 0' }}>Budgets carried over from {monthLabel(together.carriedFrom)}.</p>}

          {together.lines.length === 0 ? (
            <p className="note">Nothing added for {monthLabel(month)} yet. Set a budget, or add the first expense.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
              {together.lines.map((line) => {
                const over = line.budget !== null && line.spent > line.budget;
                const pct = line.budget ? Math.min(100, (line.spent / line.budget) * 100) : 0;
                return (
                  <li key={line.category} className="fx-grp-row">
                    <Icon name={groupCategoryIcon(line.category)} size={16} style={{ color: 'var(--ink2)' }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="fx-grp-name">{line.label}</span>
                      {line.budget !== null && (
                        <span className="fx-grp-bar" aria-hidden="true"><span style={{ width: `${pct}%`, background: over ? 'var(--red)' : 'var(--green)' }} /></span>
                      )}
                    </span>
                    <span style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>{money(line.spent)}</span>
                      <span className="fx-grp-sub" style={over ? { color: 'var(--red)' } : undefined}>
                        {line.budget === null ? 'No budget' : over ? `${money(line.spent - line.budget)} over ${money(line.budget)}` : `of ${money(line.budget)}`}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setSheet('budget')}>Set the budget</button>

          <h3 style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 4px' }}>Who added what</h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} data-testid="grp-members-added">
            {together.members.map((m) => (
              <li key={m.memberId} className="fx-grp-row" style={{ padding: '8px 0' }}>
                <span style={{ flex: 1, minWidth: 0 }} className="fx-grp-name">{m.name}</span>
                <span className="fx-grp-sub">{m.count} {m.count === 1 ? 'expense' : 'expenses'}</span>
                <span style={{ fontSize: 14, fontWeight: 700, minWidth: 80, textAlign: 'right' }}>{money(m.added)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <GroupExtras groupId={choice.id} currency={currency} members={g.members} meId={meId} isAdmin={isAdmin} month={month}
        showChildren={(group?.type ?? choice.type) === 'family' || (group?.type ?? choice.type) === 'couple'} />

      {(!budgetTogether || !splitCosts) && (
        <section className="card" style={{ marginBottom: 14 }} aria-labelledby="grp-off-h">
          <h2 id="grp-off-h" style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>
            {!budgetTogether && !splitCosts ? 'Choose how this group works' : splitCosts ? 'Budget together is off' : 'Split costs is off'}
          </h2>
          <p className="note" style={{ marginTop: 0 }}>
            {!budgetTogether && '“Budget together” tracks the household’s spending against one shared monthly budget. '}
            {!splitCosts && '“Split costs” keeps track of who paid, everyone’s share and who owes whom. '}
            A group can use both.
          </p>
          {isAdmin ? (
            <div className="fx-grp-actions">
              {!budgetTogether && <button type="button" className="btn btn-sm" onClick={() => void turnOn('budget')}>Turn on Budget together</button>}
              {!splitCosts && <button type="button" className="btn btn-sm" onClick={() => void turnOn('split')}>Turn on Split costs</button>}
            </div>
          ) : <p className="note">The group’s admin can turn these on.</p>}
        </section>
      )}

      <section className="card" style={{ marginBottom: 14 }} aria-labelledby="grp-feed-h">
        <h2 id="grp-feed-h" style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>Activity</h2>
        {feed.length === 0 ? <p className="note">Nothing yet.</p> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-live="polite" data-testid="grp-feed">
            {feed.map((item) => (
              <FeedRow key={item.key} item={item} money={money} exact={exact} members={membersById} meId={meId}
                onDeleteSettlement={(row) => void toggleSettlement(row, true)} onUndoSettlement={(row) => void toggleSettlement(row, false)}
                onEdit={setEditing} onDelete={(row) => void toggleDeleted(row, true)} onUndo={(row) => void toggleDeleted(row, false)} />
            ))}
          </ul>
        )}
      </section>

      {sheet === 'invite' && (
        <InviteSheet group={{ name, emoji }} invite={g.invite} isAdmin={isAdmin} onClose={() => setSheet(null)}
          onReset={async () => { g.setInvite(await resetGroupCode(choice.id)); }} />
      )}
      {sheet === 'budget' && (
        <BudgetSheet month={month} currency={currency} budgets={g.budgets} spentCategories={together.lines.map((l) => l.category)}
          onClose={() => setSheet(null)}
          onSave={async (rows) => {
            try {
              await queueBudgets(choice.id, rows.map((r) => ({ group_id: choice.id, month, ...r })));
              notify(`Budget for ${monthLabel(month)} saved for everyone.`, 'ok');
              setSheet(null);
            } catch (e) { notify(groupErrorMessage(errCode(e)), 'error'); }
          }} />
      )}
      {sheet === 'members' && (
        <MembersSheet members={g.members} meId={meId} isAdmin={isAdmin} groupName={name}
          onClose={() => setSheet(null)}
          onRename={async (next) => { await renameMe(meId, next); await g.reload(); onChanged(); }}
          onRemove={async (member) => {
            const invite = await removeGroupMember(member.id);
            if (invite) g.setInvite(invite);
            await g.reload();
            onChanged();
          }}
          onLeave={async () => { await leaveGroup(choice.id); onLeft(); }} />
      )}
      {editing && (
        <ExpenseSheet row={editing} currency={currency} meId={meId} members={g.members} onClose={() => setEditing(null)}
          onSave={async (patch) => {
            try {
              await queueExpenseUpdate(editing, patch);
              notify('Saved for everyone in the group.', 'ok');
              setEditing(null);
            } catch (e) { notify(groupErrorMessage(errCode(e)), 'error'); }
          }} />
      )}
    </div>
  );
}

/** "Paid by Priya · split equally · your share ₹333.34" for a split expense; nothing for Budget together. */
function splitLine(row: GroupExpenseRow, members: ReadonlyMap<string, GroupMemberRow>, meId: string, exact: (n: number) => string): string {
  if (!row.split_rule) return '';
  const rule = row.split_rule === 'equal' ? 'split equally' : row.split_rule === 'shares' ? 'split by shares' : 'split by exact amounts';
  const mine = shareOf(row, meId);
  return `Paid by ${whoName(row.paid_by, members, meId)} · ${rule}${mine > 0 ? ` · your share ${exact(mine / 100)}` : ''} · `;
}

function FeedRow({ item, money, exact, members, meId, onEdit, onDelete, onUndo, onDeleteSettlement, onUndoSettlement }: {
  item: FeedItem;
  money: (n: number) => string;
  exact: (n: number) => string;
  members: ReadonlyMap<string, GroupMemberRow>;
  meId: string;
  onDeleteSettlement: (row: GroupSettlementRow) => void;
  onUndoSettlement: (row: GroupSettlementRow) => void;
  onEdit: (row: GroupExpenseRow) => void;
  onDelete: (row: GroupExpenseRow) => void;
  onUndo: (row: GroupExpenseRow) => void;
}) {
  const when = timeAgo(item.at);
  if (item.kind === 'member') {
    return (
      <li className="fx-grp-row">
        <Icon name="users" size={16} style={{ color: 'var(--ink2)' }} />
        <span style={{ flex: 1 }} className="fx-grp-sub">{capitalize(item.who)} {item.action} · {when}</span>
      </li>
    );
  }
  if (item.kind === 'settlement') {
    const gone = item.action === 'deleted';
    const text = `${capitalize(item.from)} paid ${item.to === 'you' ? 'you' : item.to} ${exact(item.row.amount)}`;
    return (
      <li className="fx-grp-row" data-testid="grp-feed-settlement">
        <Icon name="check" size={16} style={{ color: 'var(--ink2)' }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="fx-grp-name" style={gone ? { textDecoration: 'line-through', color: 'var(--ink2)' } : undefined}>{text}</span>
          <span className="fx-grp-sub">{gone ? `Removed by ${item.who} · ` : `Marked by ${item.who} · `}{item.pending ? 'Waiting to upload' : when}</span>
        </span>
        {gone
          ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => onUndoSettlement(item.row)}>Undo</button>
          : <button type="button" className="btn btn-ghost btn-sm" aria-label={`Remove: ${text}`} onClick={() => onDeleteSettlement(item.row)}><Icon name="trash" size={15} /></button>}
      </li>
    );
  }
  if (item.kind === 'budget') {
    return (
      <li className="fx-grp-row">
        <Icon name="budget" size={16} style={{ color: 'var(--ink2)' }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="fx-grp-name">{capitalize(item.who)} set {groupCategoryLabel(item.row.category)} to {money(item.row.amount)}</span>
          <span className="fx-grp-sub">{monthLabel(item.row.month)} budget · {item.pending ? 'Waiting to upload' : when}</span>
        </span>
      </li>
    );
  }
  const { row } = item;
  const what = `${money(row.amount)} · ${groupCategoryLabel(row.category)}`;
  return (
    <li className="fx-grp-row" data-testid="grp-feed-expense">
      <Icon name={groupCategoryIcon(row.category)} size={16} style={{ color: 'var(--ink2)' }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="fx-grp-name" style={item.action === 'deleted' ? { textDecoration: 'line-through', color: 'var(--ink2)' } : undefined}>
          {item.action === 'added' ? `${capitalize(item.who)} added ${what}` : item.action === 'deleted' ? `${capitalize(item.who)} deleted ${what}` : what}
        </span>
        <span className="fx-grp-sub">
          {item.action === 'edited' && <>Edited by {item.who} · added by {item.addedBy} · </>}
          {splitLine(row, members, meId, exact)}
          {row.note ? `${row.note} · ` : ''}
          {item.pending ? 'Waiting to upload' : when}
        </span>
      </span>
      {item.action === 'deleted' ? (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onUndo(row)}>Undo</button>
      ) : (
        <span style={{ display: 'flex', gap: 4 }}>
          <button type="button" className="btn btn-ghost btn-sm" aria-label={`Edit ${what}`} onClick={() => onEdit(row)}><Icon name="edit" size={15} /></button>
          <button type="button" className="btn btn-ghost btn-sm" aria-label={`Delete ${what}`} onClick={() => onDelete(row)}><Icon name="trash" size={15} /></button>
        </span>
      )}
    </li>
  );
}

function BudgetSheet({ month, currency, budgets, spentCategories, onSave, onClose }: {
  month: string;
  currency: string;
  budgets: Parameters<typeof budgetsForMonth>[0];
  spentCategories: string[];
  onSave: (rows: Array<{ category: string; amount: number }>) => Promise<void>;
  onClose: () => void;
}) {
  const current = useMemo(() => new Map(budgetsForMonth(budgets, month).rows.map((r) => [r.category, Number(r.amount)])), [budgets, month]);
  const categories = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ value: string; label: string }> = [];
    for (const c of [...GROUP_BUDGET_CATEGORIES, ...[...current.keys(), ...spentCategories].map((v) => ({ value: v, label: groupCategoryLabel(v) }))]) {
      if (!seen.has(c.value)) { seen.add(c.value); list.push(c); }
    }
    return list;
  }, [current, spentCategories]);
  const [draft, setDraft] = useState<Record<string, number>>(() => Object.fromEntries(current));
  const [busy, setBusy] = useState(false);
  const sym = currencySym(currency) || `${currency} `;

  const save = async () => {
    setBusy(true);
    // The whole month is written, so a month that was carrying an earlier
    // one forward gets its own budget, exactly as personal months do.
    const rows = categories
      .map((c) => ({ category: c.value, amount: Math.max(0, Math.round((draft[c.value] ?? 0) * 100) / 100) }))
      .filter((r) => r.amount > 0 || (current.get(r.category) ?? 0) > 0);
    await onSave(rows);
    setBusy(false);
  };

  return (
    <ToolSheet title={`Budget for ${monthLabel(month)}`} description="One budget for the whole group. Everyone sees it and anyone can change it." onClose={onClose}
      footer={(
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-sm" onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Save budget'}</button>
        </div>
      )}>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {categories.map((c) => (
          <li key={c.value} className="fx-grp-row" style={{ padding: '6px 0' }}>
            <label htmlFor={`grp-b-${c.value}`} style={{ flex: 1, minWidth: 0, fontSize: 14 }} className="fx-grp-name">{c.label}</label>
            <span style={{ width: 140 }}>
              <MoneyField id={`grp-b-${c.value}`} value={draft[c.value] ?? 0} sym={sym} className="fi"
                onCommit={(v) => setDraft((prev) => ({ ...prev, [c.value]: v }))} />
            </span>
          </li>
        ))}
      </ul>
    </ToolSheet>
  );
}

function ExpenseSheet({ row, currency, meId, members, onSave, onClose }: {
  row: GroupExpenseRow;
  currency: string;
  meId: string;
  members: readonly GroupMemberRow[];
  onSave: (patch: {
    amount: number; category: string; note: string | null; spent_on: string;
    paid_by?: string; split_rule?: SplitRule; shares?: ShareEntry[];
  }) => Promise<void>;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(String(row.amount));
  const [category, setCategory] = useState(row.category);
  const [date, setDate] = useState(row.spent_on);
  const [note, setNote] = useState(row.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A split expense can change who paid and how it is shared. Everyone now in the
  // group is offered, and so is anyone the row names who has since left.
  const people = useMemo<SplitPerson[]>(() => {
    if (!row.split_rule) return [];
    const named = new Set([row.paid_by, ...(parseShares(row.shares) ?? []).map((s) => s.member)]);
    return members.filter((m) => !isFormer(m) || named.has(m.id)).map((m) => ({ id: m.id, name: memberName(m) }));
  }, [row, members]);
  const [split, setSplit] = useState<SplitState>(() => initialSplit(people, meId, row));
  const [splitError, setSplitError] = useState<string | null>(null);
  const money = (paise: number) => formatPaise(paise, currency);
  const typed = evaluateFormula(amount);
  const amountPaise = typed.ok && typed.value > 0 ? toPaise(typed.value) : null;
  const options = GROUP_BUDGET_CATEGORIES.some((c) => c.value === row.category)
    ? GROUP_BUDGET_CATEGORIES
    : [{ value: row.category, label: groupCategoryLabel(row.category) }, ...GROUP_BUDGET_CATEGORIES];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = evaluateFormula(amount);
    const value = parsed.ok ? groupAmount(parsed.value) : null;
    if (value === null) { setError('Enter an amount above 0.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '2000-01-01' || date > '2100-12-31') { setError('Pick a date.'); return; }
    let splitPatch: { paid_by: string; split_rule: SplitRule; shares: ShareEntry[] } | null = null;
    if (row.split_rule) {
      const checked = checkSplit(splitDraftOf(split), toPaise(value), money);
      if (!checked.ok) { setSplitError(checked.reason); return; }
      splitPatch = { paid_by: split.paidBy, split_rule: checked.rule, shares: checked.shares };
    }
    setBusy(true);
    await onSave({ amount: value, category, note: note.trim().slice(0, GROUP_NOTE_MAX) || null, spent_on: date, ...(splitPatch ?? {}) });
    setBusy(false);
  };

  return (
    <ToolSheet title="Edit group expense" description="Everyone in the group sees the change, and that you made it." onClose={onClose}
      footer={(
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button type="submit" form="grp-exp" className="btn btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
        </div>
      )}>
      <form id="grp-exp" onSubmit={submit} noValidate>
        <div className="fg" style={{ marginBottom: 10 }}>
          <label className="fl" htmlFor="grp-exp-amt">Amount ({currency})</label>
          <AmountInput id="grp-exp-amt" sym={currencySym(currency) || `${currency} `} value={amount} onChange={setAmount} />
        </div>
        <div className="fg" style={{ marginBottom: 10 }}>
          <label className="fl" htmlFor="grp-exp-cat">Category</label>
          <select id="grp-exp-cat" className="fs" value={category} onChange={(e) => setCategory(e.target.value)}>
            {options.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className="fg" style={{ marginBottom: 10 }}>
          <label className="fl" htmlFor="grp-exp-date">Date</label>
          <input id="grp-exp-date" className="fi" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="fg" style={{ marginBottom: 10 }}>
          <label className="fl" htmlFor="grp-exp-note">Description</label>
          <input id="grp-exp-note" className="fi" type="text" maxLength={GROUP_NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {row.split_rule && (
          <SplitFields people={people} meId={meId} state={split} error={splitError} amountPaise={amountPaise} money={money}
            sym={currencySym(currency) || `${currency} `}
            onChange={(next) => { setSplitError(null); setSplit(next); }} />
        )}
        {error && <p className="fx-grp-err" role="alert">{error}</p>}
      </form>
    </ToolSheet>
  );
}

function MembersSheet({ members, meId, isAdmin, groupName, onRename, onRemove, onLeave, onClose }: {
  members: readonly GroupMemberRow[];
  meId: string;
  isAdmin: boolean;
  groupName: string;
  onRename: (name: string) => Promise<void>;
  onRemove: (member: GroupMemberRow) => Promise<void>;
  onLeave: () => Promise<void>;
  onClose: () => void;
}) {
  const me = members.find((m) => m.id === meId);
  const [name, setName] = useState(me?.display_name ?? '');
  const [confirm, setConfirm] = useState<null | 'leave' | GroupMemberRow>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const people = currentMembers(members);
  const former = members.filter(isFormer).length;

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await task(); setConfirm(null); } catch (e) { setError(groupErrorMessage(errCode(e))); }
    setBusy(false);
  };

  return (
    <ToolSheet title={`Members of ${groupName}`} description="Members see each other’s names in the group, never their email or account." onClose={onClose}>
      <ul style={{ listStyle: 'none', margin: '0 0 12px', padding: 0 }}>
        {people.map((m) => (
          <li key={m.id} className="fx-grp-row">
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="fx-grp-name">{memberName(m)}{m.id === meId ? ' (you)' : ''}</span>
              <span className="fx-grp-sub">{m.role === 'admin' ? 'Admin' : 'Member'} · joined {new Date(m.joined_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </span>
            {isAdmin && m.id !== meId && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm(m)}>Remove</button>
            )}
          </li>
        ))}
      </ul>
      {former > 0 && <p className="note">{former} former {former === 1 ? 'member' : 'members'}. What they added stays, shown as “Former member”.</p>}

      {confirm && (
        <div className="card" style={{ margin: '10px 0' }} role="alertdialog" aria-labelledby="grp-confirm">
          <p id="grp-confirm" style={{ margin: '0 0 10px', fontSize: 14 }}>
            {confirm === 'leave'
              ? `Leave ${groupName}? What you added stays for the others, shown as “Former member”. You can rejoin with a new code.`
              : `Remove ${memberName(confirm)}? What they added stays. The room code changes, so the old one stops working.`}
          </p>
          <div className="fx-grp-actions">
            <button type="button" className="btn btn-sm" disabled={busy}
              onClick={() => void run(() => (confirm === 'leave' ? onLeave() : onRemove(confirm)))}>
              {confirm === 'leave' ? 'Leave group' : 'Remove'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm(null)}>Cancel</button>
          </div>
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) void run(() => onRename(name.trim())); }} style={{ marginBottom: 12 }}>
        <label className="fl" htmlFor="grp-rename">Your name in the group</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input id="grp-rename" className="fi" type="text" maxLength={MEMBER_NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="btn btn-ghost btn-sm" disabled={busy || !name.trim() || name.trim() === me?.display_name}>Save</button>
        </div>
      </form>
      {error && <p className="fx-grp-err" role="alert">{error}</p>}
      <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => setConfirm('leave')}>Leave group</button>
    </ToolSheet>
  );
}
