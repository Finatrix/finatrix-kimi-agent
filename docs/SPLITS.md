# Splits with people not on FinatriX

Build step 2.5 (NEW_FEATURES item 9). Code: `src/tools/lib/splits.ts` (records, balances), `src/tools/lib/splitsShare.ts` (your share in the Expense Tracker), `src/tools/pages/SplitsPage.tsx` (`/tools/splits`). Tests: `src/test/splits.test.ts`, `e2e/splits.spec.ts`.

Your list of people and what passed between you live in your own synced data (`fx_split_people`, `fx_split_entries`, merged by id like trips). They are never shared with the people on the list, and FinatriX never contacts them. Friends who use FinatriX go through Groups (docs/GROUPS.md).

## The maths

No existing formula changes. The split itself is 2.4's code, called as it is: `checkSplit` → `splitExpense` → `weightedSplit` in `src/tools/lib/groupSplit.ts` (whole paise, largest remainder, the shares always add up to the bill). The only new maths is **who owes whom**, and it is deliberately smaller than a group's.

### 1. Splitting a bill (reused from 2.4, unchanged)

People in a bill are `me` (you) and each person's id (`p_<uuid>`). The leftover paise go to the largest remainders, and an exact tie goes to the smaller id. `me` sorts before every `p_…` id, so **on a tie the extra paisa is yours**: you never ask a friend for a paisa you created.

> ₹100 split equally between you, Asha and Ben: 10,000 paise ÷ 3 = 3,333 each, 1 paisa left, all remainders equal → **you ₹33.34, Asha ₹33.33, Ben ₹33.33** (adds up to ₹100.00).

By shares and by exact amounts work exactly as in a group (`checkSplit` gives the same messages, e.g. "₹40.00 left to assign").

### 2. Who owes whom (new: pairwise, with you only)

Every entry is between **you and one other person**. The people on this list may not know each other and are not in a group, so FinatriX never says "Asha pays Ben", and there is no "fewest payments" step (2.4's `suggestPayments` is not used here on purpose).

| Entry | What it records |
| --- | --- |
| A bill **you** paid | each other person in it owes you their share |
| A bill **Asha** paid (you must be in it) | you owe Asha your share; the others' shares are between them and Asha, so not tracked |
| You **lent** Asha ₹A | Asha owes you ₹A |
| You **borrowed** ₹A from Asha | you owe Asha ₹A |
| **Mark as settled**: Asha paid you ₹A | what Asha owes you falls by ₹A |
| **Mark as settled**: you paid Asha ₹A | what you owe Asha falls by ₹A |

How it is computed: each entry is turned into two-party rows (`paid_by`, an `exact` share for the one person who owes) and run through 2.4's `computeBalances` unchanged. Your balance with Asha is `−balances.get(Asha)`: positive means Asha owes you, negative means you owe Asha. All in paise, so it is exact.

**Worked example**

1. Dinner ₹2,400, you paid, split equally between you, Asha, Ben and Chetan → ₹600 each. Asha, Ben and Chetan each owe you ₹600. **₹600 goes into your Expense Tracker** as your spending.
2. Cab ₹300, Asha paid, split equally between you and Asha → you owe Asha ₹150. **₹150 goes into your tracker.**
3. You lent Ben ₹1,000 → Ben owes you ₹1,000 more. **Nothing goes into your tracker** (lending is not spending).
4. Balances: **Asha owes you ₹450** (600 − 150), **Ben owes you ₹1,600**, **Chetan owes you ₹600**.
5. Asha pays you back; "Mark as settled" records ₹450 from Asha → Asha is settled up. A part payment (say ₹200) leaves ₹250.

### 3. What counts as spending

- Only **your share of a bill** is spending, whoever paid it (you used it either way; paying someone back later is not spending a second time). It is copied into your Expense Tracker as a normal expense with the id `tx_split_<entry id>`, tagged "Split", through 2.4's `applySharePlan` (same audit trail and deletion tombstones).
- Editing the bill replaces the copy; deleting the bill (after a confirm) removes the copy. Your share of 0 (you paid but weren't in it) makes no copy.
- **Money lent or borrowed, and settlements, are never spending** and never reach the tracker.
- Amounts are in your home currency (`fx_currency`).
