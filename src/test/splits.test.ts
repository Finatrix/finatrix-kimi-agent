import { beforeEach, describe, expect, it } from 'vitest';
import { SYNC_KEYS } from '../tools/cloudSync';
import { loadExpenses, saveExpenses, type ExpenseItem } from '../tools/lib/expense';
import { loadTombstones } from '../tools/lib/expenseTombstones';
import { checkSplit, formatPaise, whatsappLink } from '../tools/lib/groupSplit';
import { mergeCloudBlob } from '../tools/lib/syncMerge';
import {
  ME, SPLIT_ENTRIES_KEY, SPLIT_PEOPLE_KEY, balancesWithPeople, checkBillPeople, loadSplitEntries, myShareOf,
  normalizeEntry, normalizePerson, peopleIn, personReminderText, saveSplitEntries,
  type BillEntry, type MoneyEntry, type SplitEntry,
} from '../tools/lib/splits';
import { SPLIT_TAG, planSplitCopy, splitCopyId, syncSplitCopy } from '../tools/lib/splitsShare';

/**
 * Splits with people not on FinatriX (step 2.5). The split itself is 2.4's
 * maths; these tests pin the pairwise balances, the paisa rule, what reaches
 * the Expense Tracker, and the sync merge. The worked example is the one in
 * docs/SPLITS.md and the PR.
 */

const T = '2026-11-20T10:00:00.000Z';
const bill = (id: string, amount: number, paidBy: string, members: string[], extra: Partial<BillEntry> = {}): BillEntry => ({
  id, kind: 'bill', amount, date: '2026-11-20', note: 'Dinner', category: 'eating_out', paidBy, rule: 'equal',
  shares: members.map((member) => ({ member, value: 1 })), createdAt: T, updatedAt: T, ...extra,
});
const money = (id: string, kind: MoneyEntry['kind'], personId: string, amount: number, extra: Partial<MoneyEntry> = {}): MoneyEntry => ({
  id, kind, personId, amount, date: '2026-11-20', note: '', createdAt: T, updatedAt: T, ...extra,
});
const A = 'p_asha', B = 'p_ben', C = 'p_chetan';
const resolveCategory = (v: string) => v;

beforeEach(() => { localStorage.clear(); });

describe('balancesWithPeople: the worked example', () => {
  const entries: SplitEntry[] = [
    bill('s1', 2400, ME, [ME, A, B, C]), // you paid; ₹600 each
    bill('s2', 300, A, [ME, A], { note: 'Cab' }), // Asha paid; you owe ₹150
    money('s3', 'lent', B, 1000),
  ];

  it('nets each person with you only', () => {
    const b = balancesWithPeople(entries);
    expect(b.get(A)).toBe(45000); // 600 − 150
    expect(b.get(B)).toBe(160000); // 600 + 1,000 lent
    expect(b.get(C)).toBe(60000);
    expect(b.has(ME)).toBe(false);
  });

  it('a full settlement clears a person, a part payment leaves the rest', () => {
    expect(balancesWithPeople([...entries, money('s4', 'settled_in', A, 450)]).get(A)).toBe(0);
    expect(balancesWithPeople([...entries, money('s4', 'settled_in', A, 200)]).get(A)).toBe(25000);
  });

  it('only your share of a bill is spending; lending is not', () => {
    expect(myShareOf(entries[0] as BillEntry)).toBe(60000);
    expect(myShareOf(entries[1] as BillEntry)).toBe(15000);
  });
});

describe('balancesWithPeople: each kind of entry', () => {
  it('a bill someone else paid only puts you in their debt, never the others', () => {
    const b = balancesWithPeople([bill('s1', 900, A, [ME, A, B])]);
    expect(b.get(A)).toBe(-30000);
    expect(b.get(B) ?? 0).toBe(0); // Ben owes Asha, not you: not tracked
  });

  it('borrowed and paid back', () => {
    expect(balancesWithPeople([money('s1', 'borrowed', A, 500)]).get(A)).toBe(-50000);
    expect(balancesWithPeople([money('s1', 'borrowed', A, 500), money('s2', 'settled_out', A, 500)]).get(A)).toBe(0);
  });

  it('a bill you paid without being in it: they owe you all of it, and none of it is your spending', () => {
    const b1 = bill('s1', 1000, ME, [A, B]);
    expect(balancesWithPeople([b1]).get(A)).toBe(50000);
    expect(myShareOf(b1)).toBe(0);
  });

  it('deleted entries do not count', () => {
    expect(balancesWithPeople([bill('s1', 300, ME, [ME, A], { deletedAt: T })]).get(A) ?? 0).toBe(0);
  });

  it('by shares and exact amounts follow 2.4', () => {
    const shares = bill('s1', 1000, ME, [], { rule: 'shares', shares: [{ member: ME, value: 1 }, { member: A, value: 3 }] });
    expect(balancesWithPeople([shares]).get(A)).toBe(75000);
    const exact = bill('s2', 1000, A, [], { rule: 'exact', shares: [{ member: ME, value: 123.45 }, { member: A, value: 876.55 }] });
    expect(balancesWithPeople([exact]).get(A)).toBe(-12345);
  });
});

describe('the paisa rule', () => {
  it('₹100 between you and two friends: the spare paisa is yours', () => {
    const b1 = bill('s1', 100, ME, [ME, A, B]);
    expect(myShareOf(b1)).toBe(3334);
    const b = balancesWithPeople([b1]);
    expect(b.get(A)).toBe(3333);
    expect(b.get(B)).toBe(3333);
  });

  it('the form preview is the same maths (2.4 checkSplit)', () => {
    const check = checkSplit({ rule: 'equal', members: [A, ME, B], values: {} }, 10000, (p) => formatPaise(p, 'INR'));
    expect(check.ok && check.preview.get(ME)).toBe(3334);
  });
});

describe('checkBillPeople', () => {
  it('needs someone else, at most 20 people, and you when someone else paid', () => {
    expect(checkBillPeople(ME, [ME])).toMatch(/at least one person/);
    expect(checkBillPeople(A, [A, B])).toMatch(/not in this split/);
    expect(checkBillPeople(ME, [ME, ...Array.from({ length: 20 }, (_, i) => `p_${i}`)])).toMatch(/up to 20/);
    expect(checkBillPeople(A, [ME, A])).toBeNull();
    expect(checkBillPeople(ME, [A])).toBeNull();
  });
});

describe('storage', () => {
  it('drops records another device wrote badly instead of breaking', () => {
    saveSplitEntries([bill('s1', 100, ME, [ME, A]), { id: 'x', kind: 'bill', amount: -5 } as unknown as SplitEntry, money('s2', 'lent', A, 10)]);
    expect(loadSplitEntries().map((e) => e.id)).toEqual(['s1', 's2']);
    expect(normalizeEntry({ ...money('s3', 'lent', A, 10), kind: 'gift' })).toBeNull();
    expect(normalizeEntry({ ...money('s3', 'lent', A, 10), date: '20/11/2026' })).toBeNull();
    expect(normalizePerson({ id: 'p_1', name: '   ', createdAt: T, updatedAt: T })).toBeNull();
    expect(normalizePerson({ id: 'p_1', name: 'Asha', createdAt: T, updatedAt: T })?.name).toBe('Asha');
  });

  it('peopleIn lists everyone but you', () => {
    expect(peopleIn(bill('s1', 100, A, [ME, B]))).toEqual([A, B]);
    expect(peopleIn(money('s2', 'lent', C, 1))).toEqual([C]);
  });
});

describe('your share in the Expense Tracker', () => {
  it('copies only your share, marked Split', () => {
    const p = planSplitCopy(bill('s1', 2400, ME, [ME, A, B, C]), [], resolveCategory, new Date(T));
    expect(p.remove).toEqual([]);
    expect(p.upsert).toHaveLength(1);
    expect(p.upsert[0]).toMatchObject({ id: splitCopyId('s1'), amount: 600, date: '2026-11-20', category: 'eating_out', note: 'Dinner', tags: [SPLIT_TAG] });
  });

  it('a bill you are not in makes no copy, and removes an old one', () => {
    expect(planSplitCopy(bill('s1', 100, ME, [A]), [], resolveCategory).upsert).toEqual([]);
    const old = { id: splitCopyId('s1'), amount: 50, category: 'eating_out', date: '2026-11-20' } as ExpenseItem;
    expect(planSplitCopy(bill('s1', 100, ME, [A]), [old], resolveCategory).remove.map((r) => r.id)).toEqual([splitCopyId('s1')]);
  });

  it('saving, editing and deleting a bill keeps exactly one copy in step, and a deletion that sync keeps', () => {
    saveExpenses([{ id: 'tx_other', amount: 99, category: 'groceries', date: '2026-11-19' }]);
    const b1 = bill('s1', 300, ME, [ME, A]);
    expect(syncSplitCopy(b1)).toBe(true);
    expect(loadExpenses().find((e) => e.id === splitCopyId('s1'))?.amount).toBe(150);

    syncSplitCopy({ ...b1, amount: 500, updatedAt: '2026-11-21T00:00:00.000Z' });
    const copies = loadExpenses().filter((e) => e.id === splitCopyId('s1'));
    expect(copies).toHaveLength(1);
    expect(copies[0].amount).toBe(250);

    syncSplitCopy({ ...b1, deletedAt: '2026-11-22T00:00:00.000Z' });
    expect(loadExpenses().map((e) => e.id)).toEqual(['tx_other']);
    expect(loadTombstones()[splitCopyId('s1')]).toBeGreaterThan(0);
  });
});

describe('sync', () => {
  it('both keys are synced', () => {
    expect(SYNC_KEYS).toContain(SPLIT_PEOPLE_KEY);
    expect(SYNC_KEYS).toContain(SPLIT_ENTRIES_KEY);
  });

  it('merges by id, the later edit wins, and a deletion travels', () => {
    const here = [bill('s1', 100, ME, [ME, A]), money('s2', 'lent', A, 50, { updatedAt: '2026-11-21T00:00:00.000Z', deletedAt: '2026-11-21T00:00:00.000Z' })];
    const cloud = [money('s2', 'lent', A, 50), money('s3', 'borrowed', B, 20)];
    const { merged, aheadKeys } = mergeCloudBlob([SPLIT_ENTRIES_KEY], { [SPLIT_ENTRIES_KEY]: JSON.stringify(here) }, { [SPLIT_ENTRIES_KEY]: JSON.stringify(cloud) });
    const rows = JSON.parse(merged[SPLIT_ENTRIES_KEY]) as SplitEntry[];
    expect(rows.map((r) => r.id).sort()).toEqual(['s1', 's2', 's3']);
    expect(rows.find((r) => r.id === 's2')?.deletedAt).toBeTruthy();
    expect(aheadKeys).toEqual([SPLIT_ENTRIES_KEY]);
  });
});

describe('reminder', () => {
  it('is a WhatsApp link the user sends, with a first name, the exact amount and what it was for', () => {
    const text = personReminderText({ toName: 'Asha Rao', amount: formatPaise(60000, 'INR'), forWhat: 'Saturday’s dinner' });
    expect(text).toBe('Hi Asha, a quick reminder: you owe me ₹600.00 for Saturday’s dinner. Thank you!');
    expect(whatsappLink(text)).toMatch(/^https:\/\/wa\.me\/\?text=Hi%20Asha/);
    expect(personReminderText({ toName: 'Ben', amount: '₹5.00' })).toBe('Hi Ben, a quick reminder: you owe me ₹5.00. Thank you!');
  });
});
