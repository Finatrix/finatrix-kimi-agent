// Phone insert — payday, then the bills.
//
//   ?mode=bills   30 Sep, 9:41 PM: "Salary credited". The phone sleeps; 1 Oct,
//                 8:03 AM: rent, EMI, card, groceries… one debit after another,
//                 faster and faster, burying the salary under them.
//   ?mode=day10   10 Oct, 10:48 PM: one more debit, then the low-balance alert.
//                 The balance is back to ₹1,240 — exactly where it was before payday.
//
// A generic lock screen with generic bank alerts: no real bank, no real OS UI,
// and never the FinatriX interface. Amounts add up; see BILLS below.

import { range, lerp, smooth, easeOut, easeOutBack, handheld, mulberry32 } from '../shared/motion.js';

const ICONS = {
  bank: '<path d="M4 10h16M6 10v8M10 10v8M14 10v8M18 10v8M3 20h18M12 3l9 5H3z"/>',
  home: '<path d="M4 11l8-7 8 7M6 10v10h12V10M10 20v-6h4v6"/>',
  car: '<path d="M5 16h14M6 16l1.5-5h9L18 16M5 16v3M19 16v3M8 13.5h.01M16 13.5h.01"/>',
  card: '<path d="M3 7h18v11H3zM3 11h18M7 15h4"/>',
  cart: '<path d="M3 4h3l2.5 11h10L21 8H7.5M10 20h.01M17 20h.01"/>',
  bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/>',
  wifi: '<path d="M2.5 9a14 14 0 0119 0M5.5 12.5a9.5 9.5 0 0113 0M8.5 16a5 5 0 017 0M12 19.5h.01"/>',
  phone: '<path d="M8 3h8v18H8zM11 18h2"/>',
  bag: '<path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 016 0v2"/>',
  alert: '<path d="M12 4l9 16H3zM12 10v4M12 17h.01"/>',
};
const rupees = (n) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const OPENING_BALANCE = 1240;
const SALARY = 62000;
// 1 October, in the order the debits land. Running balance is computed, never typed.
const BILLS = [
  ['Rent – October', 18000, 'home', '#5b7cfa'],
  ['Car loan EMI', 9999, 'car', '#8e6cf0'],
  ['Credit card bill', 12450, 'card', '#e0605c'],
  ['Groceries', 6850, 'cart', '#2fb37a'],
  ['Electricity', 2340, 'bolt', '#e8a93a'],
  ['Insurance premium', 3200, 'shield', '#3aa3c8'],
  ['Home internet', 799, 'wifi', '#4c8df6'],
  ['Mobile recharge', 399, 'phone', '#7a8597'],
];

const MODES = {
  bills: { duration: 6.9 },
  day10: { duration: 2.6 },
};
const MODE = new URLSearchParams(location.search).get('mode') === 'day10' ? 'day10' : 'bills';
const FPS = 30;

/** Notifications for this mode: when each lands, what it says, and the lock screen it lands on. */
function buildTimeline() {
  const salaryCard = { at: 0.45, head: 'BANK', icon: 'bank', color: '#1f9d63', kind: 'credit', amount: `+${rupees(SALARY)}`, label: 'Salary credited', body: `To A/c XX4821 · Avl bal ${rupees(OPENING_BALANCE + SALARY)}` };
  if (MODE === 'day10') {
    const before = 1660;
    return {
      screens: [{ at: 0, date: 'Saturday, 10 October', clock: '10:48' }],
      cards: [
        { at: 0.3, head: 'BANK', icon: 'bag', color: '#d9822b', kind: 'debit', amount: `−${rupees(420)}`, label: 'Food delivery', body: `From A/c XX4821 · Avl bal ${rupees(before - 420)}` },
        { at: 1.15, head: 'BANK', icon: 'alert', color: '#d64541', kind: 'alert', amount: 'Low balance', label: '', body: `Your balance is ${rupees(before - 420)}.` },
      ],
      sleep: null,
    };
  }
  const cards = [salaryCard];
  let balance = OPENING_BALANCE + SALARY;
  let at = 2.45;
  BILLS.forEach(([label, amount, icon, color], i) => {
    balance -= amount;
    cards.push({ at, head: 'BANK', icon, color, kind: 'debit', amount: `−${rupees(amount)}`, label, body: `From A/c XX4821 · Avl bal ${rupees(balance)}` });
    at += Math.max(0.27, 0.62 - i * 0.065); // the debits land faster and faster
  });
  return {
    screens: [{ at: 0, date: 'Wednesday, 30 September', clock: '9:41' }, { at: 1.95, date: 'Thursday, 1 October', clock: '8:03' }],
    cards,
    sleep: { from: 1.55, to: 2.15 },
  };
}
const TL = buildTimeline();

// ─── DOM ─────────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);
const stack = $('stack');
const cards = TL.cards.map((c) => {
  const el = document.createElement('div');
  el.className = `card${c.kind === 'alert' ? ' alert' : ''}`;
  el.innerHTML = `<div class="icon" style="background:${c.color}"><svg viewBox="0 0 24 24">${ICONS[c.icon]}</svg></div>
    <div class="head"><span>${c.head}</span><span>now</span></div>
    <div class="title"><span class="amt ${c.kind}">${c.amount}</span>${c.label ? ` · ${c.label}` : ''}</div>
    <div class="body">${c.body}</div>`;
  stack.appendChild(el);
  return { ...c, el };
});

// Streetlight and lamp bokeh, out of focus behind the phone.
const rand = mulberry32(5);
const orbs = Array.from({ length: 26 }, () => {
  const o = document.createElement('div');
  o.className = 'orb';
  const warm = rand() < 0.65;
  const size = 40 + rand() * 170;
  o.style.width = o.style.height = `${size}px`;
  o.style.background = warm ? `rgba(255,${150 + rand() * 50 | 0},70,${0.12 + rand() * 0.22})` : `rgba(120,160,255,${0.08 + rand() * 0.14})`;
  $('bokeh').appendChild(o);
  return { o, x: rand() * 2080, y: rand() * 1240, depth: 0.4 + rand() * 0.8 };
});

// ─── Frame ───────────────────────────────────────────────────────────────────

const CARD_STEP = 156;
function renderAt(t) {
  const screen = [...TL.screens].reverse().find((s) => t >= s.at);
  $('date').textContent = screen.date;
  $('clock').textContent = screen.clock;
  const sleep = TL.sleep ? Math.max(smooth(range(t, TL.sleep.from, TL.sleep.from + 0.18)) - smooth(range(t, TL.sleep.to - 0.2, TL.sleep.to)), 0) : 0;
  $('sleep').style.opacity = sleep.toFixed(3);

  // Newest on top; every arrival pushes the older cards down one slot.
  let haptic = 0;
  cards.forEach((c, i) => {
    const arrive = range(t, c.at, c.at + 0.34);
    const newer = cards.slice(i + 1).reduce((n, d) => n + easeOutBack(range(t, d.at, d.at + 0.34), 1.2), 0);
    const y = newer * CARD_STEP + lerp(-60, 0, easeOutBack(arrive, 1.4));
    const depthFade = Math.max(0.35, 1 - Math.max(0, newer - 2.2) * 0.25);
    c.el.style.transform = `translateY(${y.toFixed(1)}px) scale(${lerp(0.94, 1, easeOut(arrive)).toFixed(4)})`;
    c.el.style.opacity = (smooth(range(arrive, 0, 0.45)) * depthFade).toFixed(3);
    const since = t - c.at;
    if (since > 0 && since < 0.2) haptic += Math.exp(-since * 30) * Math.sin(since * 260);
  });

  const hh = handheld(t, 900); // in pixels
  const rollDeg = handheld(t, 2).roll * (180 / Math.PI);
  const push = easeOut(range(t, 0, MODES[MODE].duration));
  const rig = $('rig');
  rig.style.transform = `perspective(2300px) translate(${(hh.x + haptic * 3).toFixed(2)}px, ${(110 + hh.y - 30 * push).toFixed(2)}px)
    rotateX(${(7 + hh.y * 0.01).toFixed(3)}deg) rotateY(${(-11 + hh.x * 0.012 + 3 * push).toFixed(3)}deg) rotateZ(${(-2 + rollDeg).toFixed(3)}deg)
    scale(${lerp(0.98, 1.06, push).toFixed(4)})`;
  $('glare').style.transform = `translateX(${(-60 + 120 * push + hh.x * 0.5).toFixed(1)}px)`;
  orbs.forEach(({ o, x, y, depth }) => {
    o.style.transform = `translate(${(x - hh.x * depth * 1.5 - 40 * push * depth).toFixed(1)}px, ${(y - hh.y * depth * 1.5).toFixed(1)}px)`;
  });
}

await document.fonts.ready;
window.__scene = { renderAt, duration: MODES[MODE].duration, fps: FPS, cues: { cards: TL.cards.map((c) => c.at), sleep: TL.sleep } };
renderAt(0);
window.__ready = true;
