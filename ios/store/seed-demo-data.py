# Seed FICTIONAL demo data into the FinatriX iOS Simulator app's WebKit localStorage,
# for App Store screenshots (docs/APP_STORE_SUBMISSION.md §10). No real person's
# data: every figure, note and account name here is invented.
#
#   xcrun simctl terminate booted co.finatrix.app
#   DB=$(find "$(xcrun simctl get_app_container booted co.finatrix.app data)/Library/WebKit" -name localstorage.sqlite3 | head -1)
#   python3 ios/store/seed-demo-data.py "$DB" dark      # or: light
#   xcrun simctl launch booted co.finatrix.app
#
# WebKit keeps each localStorage value as a UTF-16LE blob in ItemTable, which is
# why values are encoded below. Re-run after any change to the stored formats.
import json, sqlite3, sys, random
db = sys.argv[1]
theme = sys.argv[2] if len(sys.argv) > 2 else 'dark'
random.seed(7)
cur, p1, p2 = '2026-10', '2026-09', '2026-08'
budget_vals = {'rent': 28000, 'groceries': 9000, 'utilities': 3800, 'transport': 4200, 'insurance': 3000, 'phone': 700, 'internet': 999,
               'eating_out': 6000, 'going_out': 3500, 'shopping': 5000, 'subscriptions': 1200, 'entertainment': 2500, 'personal_care': 1800,
               'emergency': 10000, 'stocks': 15000, 'gold': 3000, 'home_deposit': 8000}
bb = {m: {'income': '120000', 'n': '50', 'w': '30', 's': '20', 'vals': budget_vals} for m in (p2, p1, cur)}
plan = [  # (day, category, amount, note, method)
  (1, 'rent', 28000, 'Rent October', 'Bank transfer'), (2, 'groceries', 2340, 'Weekly groceries', 'UPI'), (2, 'transport', 420, 'Metro card top-up', 'UPI'),
  (3, 'eating_out', 340, 'Lunch', 'UPI'), (4, 'utilities', 1860, 'Electricity bill', 'Card'), (5, 'subscriptions', 649, 'Music + video', 'Card'),
  (6, 'groceries', 1980, 'Vegetables and fruit', 'UPI'), (7, 'going_out', 1200, 'Movie night', 'Card'), (8, 'shopping', 2499, 'Running shoes', 'Card'),
  (9, 'eating_out', 860, 'Dinner with friends', 'UPI'), (10, 'internet', 999, 'Broadband', 'Card'), (11, 'phone', 699, 'Mobile plan', 'UPI'),
  (12, 'transport', 1350, 'Fuel', 'Card'), (13, 'personal_care', 650, 'Haircut', 'UPI'), (14, 'groceries', 2650, 'Monthly staples', 'UPI'),
  (15, 'insurance', 3000, 'Health insurance', 'Bank transfer'), (16, 'eating_out', 520, 'Coffee and snacks', 'UPI'), (17, 'entertainment', 799, 'Concert ticket', 'Card'),
  (18, 'utilities', 940, 'Water and gas', 'UPI'), (19, 'shopping', 1450, 'Home supplies', 'UPI'), (20, 'groceries', 1720, 'Weekly groceries', 'UPI'),
  (21, 'emergency', 10000, 'Emergency fund', 'Bank transfer'), (22, 'stocks', 15000, 'Index fund SIP', 'Bank transfer'), (23, 'eating_out', 410, 'Lunch', 'UPI'),
]
exp = []
for i, (d, c, a, n, pm) in enumerate(plan):
    exp.append({'id': f'demo-{cur}-{i}', 'date': f'{cur}-{d:02d}', 'category': c, 'amount': a, 'note': n, 'paymentMethod': pm})
for m, scale in ((p1, 1.0), (p2, 0.96)):
    for i, (d, c, a, n, pm) in enumerate(plan):
        exp.append({'id': f'demo-{m}-{i}', 'date': f'{m}-{d:02d}', 'category': c, 'amount': round(a * scale * random.uniform(0.85, 1.12)), 'note': n, 'paymentMethod': pm})
nw = [
  {'id': 'cash', 'name': 'Salary account', 'kind': 'asset', 'category': 'cash', 'balances': {p2: 118000, p1: 131000, cur: 146000}},
  {'id': 'fd', 'name': 'Fixed deposit', 'kind': 'asset', 'category': 'cash', 'balances': {p2: 200000, p1: 200000, cur: 200000}},
  {'id': 'mf', 'name': 'Index funds', 'kind': 'asset', 'category': 'equity', 'balances': {p2: 540000, p1: 566000, cur: 589000}},
  {'id': 'ppf', 'name': 'PPF', 'kind': 'asset', 'category': 'retirement', 'balances': {p2: 310000, p1: 310000, cur: 322000}},
  {'id': 'card', 'name': 'Credit card', 'kind': 'liability', 'category': 'credit_card', 'balances': {p2: 22000, p1: 18500, cur: 14200}},
  {'id': 'car', 'name': 'Car loan', 'kind': 'liability', 'category': 'vehicle_loan', 'balances': {p2: 410000, p1: 398000, cur: 386000}},
]
goals = {'gp-name': 'Home down payment', 'gp-target': '2000000', 'gp-years': '6', 'gp-existing': '250000', 'gp-inflate': True}
items = {
  'fx_theme': theme, 'fx_currency': 'INR', 'fx_market': 'IN', 'fx_onboarding_done': '1', 'fx_login_prompt_seen': '1',
  'fx_bb_data': json.dumps(bb), 'fx_expenses': json.dumps(exp), 'fx_networth': json.dumps(nw), 'fx_goals': json.dumps(goals),
}
con = sqlite3.connect(db)
for k, v in items.items():
    con.execute('INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)', (k, v.encode('utf-16-le')))
con.commit(); con.execute('PRAGMA wal_checkpoint(TRUNCATE)'); con.close()
print('seeded', len(items), 'keys,', len(exp), 'expenses')
