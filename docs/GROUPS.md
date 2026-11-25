# Groups: the server side

What build step 2.2 put on the server for groups ([NEW_FEATURES.md](NEW_FEATURES.md) item 12), for the screens in steps 2.3–2.5 to build on. The source of truth is `supabase/migrations/20261124000100_groups.sql`.

## Who can do what

Row Level Security lets only a group's **current** members read or write its rows. Signed-out visitors can do nothing at all.

| Table | Holds | Members can | Admins can also |
| --- | --- | --- | --- |
| `groups` | name, emoji, type, currency, `budget_together`, `split_costs` | read | change name, emoji and the two modes; delete the group |
| `group_members` | role, `display_name`, `joined_at`, `left_at` (and `user_id`, which members can't read) | read everyone except `user_id`; change their own `display_name` | remove someone (function below) |
| `group_invites` | the room code and `expires_at` | read, to share it | reset it (function below) |
| `group_expenses` | amount, category, note, `spent_on`, `paid_by`, `split_rule`, `shares`, `deleted_at` | add, edit, soft-delete, undelete | — |
| `group_settlements` | `from_member`, `to_member`, amount, `settled_on`, note, `deleted_at` | add, edit, soft-delete | — |
| `group_budgets` | Budget together: amount per `month` (`YYYY-MM`) and category | add, edit (upsert), delete | — |
| `group_age_confirmations` | when the person confirmed they're 18 or over | read their own | — |

- Members never see each other's **account id**. `group_members.user_id` isn't readable or filterable, and Realtime leaves it out, so people in two groups can't be linked. Find your own row with `my_group_memberships()` (below).
- A group's **currency never changes**, and rows never move between groups.
- `created_by` and `updated_by` are **member ids**, stamped by the database from the session, so "Edited by Priya" can't be forged. The app never sends them.
- Expenses and settlements are **never hard-deleted**. Set `deleted_at` to delete, so the feed can say who deleted what, and clear it to undo.
- Ids can be made on the phone (`id` in the insert), so the offline queue can resend an insert with `upsert(…, { onConflict: 'id', ignoreDuplicates: true })` without making duplicates.
- Budgets save with `upsert(…, { onConflict: 'group_id,month,category' })`. Per-month rows, like personal categories: carry the latest earlier month forward in the app.

## Former members

Leaving, being removed and deleting the account all end the same way. The member row's `user_id` and `display_name` become null and `left_at` is set. The row stays, so past expenses still have a payer. **Show a member row with `left_at` set as "Former member".**

- When the last admin goes, the longest-standing member becomes admin.
- When the last member goes, the group and everything in it is deleted.
- Someone who left can rejoin with a valid code, as a new member row.
- Removing someone also resets the room code, so the code they knew stops working. `remove_group_member` returns the new one for the admin to share.

## Functions the app calls

Call these with `supabase.rpc(name, args)`. On failure, `error.message` is the code in the last column.

| Function | Arguments | Returns | Fails with |
| --- | --- | --- | --- |
| `my_group_memberships` | none | `[{ group_id, member_id, role }]`, your own row in each current group: "you" | — |
| `create_group` | `p_name`, `p_emoji`, `p_type` (`family`, `couple`, `home`, `trip`, `friends`), `p_display_name`, `p_currency` (default `INR`), `p_confirm_adult` | `{ group_id, code, expires_at }` | `adult_confirmation_required`, `too_many_groups` |
| `reset_group_code` | `p_group_id` | `{ code, expires_at }` | `not_group_admin` |
| `leave_group` | `p_group_id` | nothing | `not_group_member` |
| `remove_group_member` | `p_member_id` | `{ code, expires_at }`, the new room code (null if they had already gone) | `not_group_admin`, `use_leave_group` |

The type sets the starting mode: `family` and `couple` start in Budget together; `home`, `trip` and `friends` start in Split costs. `p_confirm_adult` is needed only the first time a person creates or joins a group.

## Joining: the `group-join` edge function

`POST {SUPABASE_URL}/functions/v1/group-join`, with the person's session. From the apps, call it through `supabase.functions.invoke('group-join', { body })`.

```json
{ "code": "FX-7K2P9Q", "action": "preview" | "join", "displayName": "Riya", "confirmAdult": true }
```

`displayName` and `confirmAdult` are only read on `join`. Without a `displayName`, the name on the account is used.

Every lookup answers **200** with a `status`:

| `status` | Meaning | `group` |
| --- | --- | --- |
| `ok` | a preview of a valid code: show "Join Sharma Family? 3 members" | name, emoji, type, members |
| `joined` | in | the above plus `id` |
| `already_member` | was already in | the above plus `id` |
| `adult_confirmation_required` | ask for the 18+ confirmation, then send `join` again with `confirmAdult: true` | name, emoji, type, members |
| `group_full` | 20 members already | name, emoji, type, members |
| `too_many_groups` | this person is in 50 groups already | name, emoji, type, members |
| `not_found` | no such code | — |
| `expired` | older than 7 days: ask the admin for a new one | — |

Other answers: **400** `invalid_code` (it can't be a code) or `invalid_name`, **401** not signed in, **429** too many codes tried, **503** joining is unavailable, and **500**.

**Limits:** 20 lookups an hour per person and 60 per IP. A preview and a join each count, and so does a wrong code.

## Room codes

Six characters of Crockford base32 (no I, L, O or U), stored bare (`7K2P9Q`) and shown as `FX-7K2P9Q`. They last 7 days, and a reset replaces the code at once.

`normalizeGroupCode` in `supabase/functions/group-join/code.ts` reads any typed form: lower case, spaces, dashes, the `FX-` prefix, and O for 0 or I and L for 1. The app needs the same rule to read pasted codes and links. Mirror it in `src/` with a parity test, as `src/shared/routes` and `_shared/origins.ts` already do.

## Shares (Split costs)

`split_rule` and `shares` are both set, or both null for an expense that's only in Budget together. `shares` is a list of 1 to 20 entries:

```json
[{ "member": "<group_members.id>", "value": 2 }]
```

| `split_rule` | `value` |
| --- | --- |
| `equal` | ignored: everyone listed pays an equal part |
| `shares` | a weight, more than 0 (for example 2 and 1) |
| `exact` | that person's part, to the paisa; the parts must add up to `amount` |

The database checks the shape, that everyone is in the group (former members included, so old expenses stay editable) and the exact sum. Turning shares into balances, the rounding of leftover paise and the fewest payments are step 2.4's maths, below.

## Split costs: the maths (step 2.4)

All in `src/tools/lib/groupSplit.ts`, in whole **paise** (integers), so sums are exact and every phone computes the same figures. The AI never sets a number.

1. **Who takes part, in what order.** The people in `shares`, sorted by member id (plain string compare). Every tie-break below uses this order, so it doesn't depend on the order the array was stored in or on which members a phone has loaded.
2. **One expense into shares** (the largest-remainder method). Each person gets a weight: `equal` is 1 each, `shares` is `round(value × 100)` (weights to two decimals). With `W` the total weight and `A` the amount in paise: `base = floor(A × w / W)`; the paise left over (fewer than the people) go one each to the people with the largest `A × w mod W`, ties to the smaller member id. The shares add up to `A` exactly and nobody is more than one paisa from the exact figure. 100.00 among three is 33.34, 33.33, 33.33 (the extra paisa to the lowest member id). The multiplication uses BigInt, since `A × w` can pass 2^53.
3. **`exact`** uses each part as written. The database already makes them add up; if they ever don't, the expense is split equally and the app says it was repaired, so balances always net to zero.
4. **Balances.** `balance = paid − owed + settled by you − settled to you`, over expenses and settlements that aren't deleted. Positive: the group owes you. Balances always add up to 0. Budget-together rows (no `split_rule`) are never counted. A former member keeps their balance.
5. **Fewest payments.** Finding the true minimum is NP-hard, so it is greedy and deterministic: pair a debtor and a creditor for exactly the same amount first; then the biggest debtor pays the biggest creditor `min(debt, credit)` until nobody is left (ties to the smaller member id). At most (people with a balance − 1) payments.
6. **Settle up.** "Mark as paid" writes a `group_settlements` row (amount editable, `settled_on` today in the phone's own calendar). Suggestions are recomputed from the balances, never stored. A reminder is a `https://wa.me/?text=` link the user sends themselves; no money moves through FinatriX.

### Your share in your tracker

`src/tools/lib/groupShare.ts`. For an expense with a `split_rule`, your share (and only your share) is copied into your own Expense Tracker as a normal expense, tagged with the group's name.

- One copy per group expense, id `tx_grp_<group expense id>`: the same on every device you use, so a repeated Realtime event, a reconnect or a second phone can't make a second one.
- The copy follows the group expense when its `updated_at` changes (`groupShare.v` remembers the version). Editing the copy yourself sticks until the group expense changes again.
- A deleted group expense removes the copy through the ledger's own rules (audit entry and a tombstone dated when the group expense was deleted, so cloud sync honours it); undoing the delete brings it back. Delete the copy yourself and it stays deleted until the group expense changes.
- Budget-together expenses are never copied. Leaving the group stops updates and the copies stay.
- **A group in another currency** (step 3.9: trip groups, members in other countries): your share is priced into your tracker's currency with travel mode's formula and no card fee, `roundAmount(share × rate)`. The rate is your trip's fixed rate when a trip of yours in that currency covers the expense's day (the copy is then that trip's spending), else travel mode's live rate (`tripRateFor` over `effectiveRates`). The copy keeps the rate it was first made with when the group expense changes. With no rate there is no copy, and the group says so; it is never guessed. Balances and settle-up stay in the group's currency, with a display-only "about ₹…" for your balance.
- Kept current by `catchUpGroupShares` (`groupShareSync.ts`) on opening the tracker, coming back online or into view, and after you add an expense; and by the open Groups screen as Realtime brings changes. Its cursor is `fx_group_share_cursor`, per device and account (in `ACCOUNT_LOCAL_KEYS`).

## Goals and children (step 3.9)

Migration `20261125000200_group_goals_children.sql`, proved by `supabase/probes/group_goals_children_probe.sql` (run by the same PGlite harness). Client: `src/tools/lib/groupGoals.ts` (maths), `groupGoalsApi.ts` (calls), `src/tools/ui/groups/GroupExtras.tsx`.

| Table | Holds | Members can | Also |
| --- | --- | --- | --- |
| `group_goals` | name, emoji, `target`, optional `target_date`, `deleted_at` | read, add, edit, soft-delete | at most 20 live goals per group (`too_many_goals`) |
| `group_goal_contributions` | `goal_id`, `member_id` (who put it aside), amount, `added_on`, note, `deleted_at` | read, add, edit, soft-delete | a record only: no money moves |
| `group_dependents` | a child's first name, `guardian_confirmed` | read; add (with the confirmation) | only the parent who added them (`created_by`) or an admin can rename or delete; at most 10 per group (`too_many_children`) |
| `group_expenses.for_dependent` | "for Aarav" | set or clear | cleared when the child is deleted; the expense stays |

- **Goal maths**, in whole paise: saved = sum of live contributions; left = max(target − saved, 0); progress = floor(saved × 100 ÷ target), shown capped at 100.
- **Children** have no account, age or photo (DPDP Act: verifiable parental consent). The parent confirms on every name, and the name is **hard-deleted** when removed, when the parent leaves or deletes their account (`group_members_after_leave_dependents`), or with the group. Children never hold a share or a balance. The app shows them in Family and Couple groups.
- All three tables use the same session stamps and Realtime rules as the others.

## New since you last looked (step 3.9)

Until push is set up, the Groups list shows "3 new" on a group when other members added or changed expenses or payments after this phone last opened it (`fx_group_seen`, per device and account). Push delivery for group activity needs FCM and APNs keys and is owed (see PR 45).

## Live updates

`group_members`, `group_expenses`, `group_settlements` and `group_budgets` are in the `supabase_realtime` publication. Realtime applies the SELECT policies to inserts and updates, so each person only hears about their own groups.

Deletes are different: Realtime can't check a policy against a row that's gone, so **every subscriber of a table receives every delete, with the row's primary key**. That's why every published table is keyed by a random `id`, and why expenses and settlements are soft-deleted (an update, which is checked). Never publish a table whose key carries meaning, and ignore delete events for ids you don't have.

## Limits

20 current members per group, 50 current groups per person, names up to 60 characters (groups) and 40 (members), notes up to 200, amounts above 0 with 2 decimals, and dates between 2000 and 2100.

## Testing and deploying

- **Locally, no Docker:** `deno run --node-modules-dir=none --no-lock -A supabase/functions/_e2e/groups.ts` builds a Supabase-shaped Postgres in PGlite. It runs the migration twice, then the policy probe, then the real `group-join` function against it.
- **Deploying, in this order:**
  1. With the owner's yes, run `supabase db push --dry-run </dev/null`. It must name only `20261124000100_groups.sql`. Then run `supabase db push --yes </dev/null`.
  2. Run `supabase/probes/groups_rls_probe.sql` on production through the Management API with `read_only: false`. Every check in the `RESULT` must be `"ok": true`, and it rolls itself back.
  3. Merge. Until the tables exist, `verify:deploy` stops the Deploy workflow on purpose (`REQUIRED_RELATIONS` lists them).
