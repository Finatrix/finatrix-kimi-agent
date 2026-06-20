"use strict";

/* ── Button loading state ── */
function btnLoading(el, text) {
  if (typeof el === 'string') el = document.querySelector(el);
  if (!el) return;
  el._origText = el.textContent;
  el.textContent = text || 'Calculating…';
  el.classList.add('btn-loading');
  el.disabled = true;
}
function btnDone(el) {
  if (typeof el === 'string') el = document.querySelector(el);
  if (!el) return;
  el.textContent = el._origText || el.textContent;
  el.classList.remove('btn-loading');
  el.disabled = false;
}

/* ── Animated number count-up ── */
function countUp(el, target, opts = {}) {
  const { prefix = '', suffix = '', duration = 900, decimals = 0, delay = 0 } = opts;
  if (!el) return;
  const start = performance.now() + delay;
  const fmt = n => {
    const fixed = n.toFixed(decimals);
    if (n >= 1e7) return prefix + '₹' + (n/1e7).toFixed(2) + ' Cr';
    if (n >= 1e5) return prefix + '₹' + (n/1e5).toFixed(1) + ' L';
    if (n >= 1000) return prefix + '₹' + Math.round(n).toLocaleString('en-IN');
    return prefix + (decimals ? fixed : Math.round(n)) + suffix;
  };
  const tick = (now) => {
    if (now < start) { requestAnimationFrame(tick); return; }
    const p = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 4); // ease-out-quart
    el.textContent = fmt(target * ease);
    el.classList.add('num-anim');
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ── Scroll to page section top ── */
function scrollToPageTop() {
  const wrap = document.querySelector('.wrap');
  if (wrap) wrap.scrollIntoView({ behavior: 'instant', block: 'start' });
  window.scrollTo({ top: 0, behavior: 'instant' });
  // Also scroll the main window to nav height
  const nav = document.querySelector('.nav-wrap');
  const brandH = document.querySelector('.brand-band') ? document.querySelector('.brand-band').offsetHeight : 0;
  const navH = nav ? nav.offsetHeight : 0;
  window.scrollTo({ top: 0, behavior: 'instant' });
}

/* ── Submit with haptic-like feedback ── */
function animSubmit(btnEl, fn) {
  if (typeof btnEl === 'string') btnEl = document.querySelector(btnEl);
  // Quick scale press
  if (btnEl) {
    btnEl.style.transform = 'scale(0.96)';
    setTimeout(() => { if(btnEl) btnEl.style.transform = ''; }, 120);
  }
  setTimeout(fn, 80);
}

/* ═══════════ CORE ═══════════ */
function num(id){ const v = Number(document.getElementById(id).value); return isFinite(v) ? Math.max(0, v) : 0; }
function esc(s){ return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function fmt(n){
  n = Math.round(Number(n) || 0);
  const neg = n < 0 ? "−" : ""; n = Math.abs(n);
  if (n >= 1e7) return neg + "₹" + (n/1e7).toFixed(2).replace(/\.00$/,"") + " Cr";
  if (n >= 1e5) return neg + "₹" + (n/1e5).toFixed(2).replace(/\.00$/,"") + " L";
  if (n >= 1000) return neg + "₹" + n.toLocaleString("en-IN");
  return neg + "₹" + n;
}
const ROUTES = ["home","budget","expenses","investmatch","parksmart","peercompare","goals","lifemap"];
let _routeActive = false;
function route(){
  let r = (location.hash || "#/").replace("#/","").split("?")[0];
  if (!ROUTES.includes(r)) r = "home";
  if(_routeActive) return;

  // Find currently visible page
  const current = document.querySelector(".page.show");
  const next = document.getElementById("page-" + r);
  if(!next || next === current){
    // Same page — just ensure visible
    if(next) next.classList.add("show");
    document.querySelectorAll("#mainNav a").forEach(a => a.classList.toggle("on", a.dataset.route === r));
    window.scrollTo({top:0});
    return;
  }

  _routeActive = true;
  // Update nav immediately
  document.querySelectorAll("#mainNav a").forEach(a => a.classList.toggle("on", a.dataset.route === r));

  // Scroll nav tab into view
  const activeNav = document.querySelector("#mainNav a.on");
  if(activeNav) activeNav.scrollIntoView({inline:"nearest", behavior:"smooth"});

  // Phase 1: slide out current
  if(current){
    current.classList.add("leaving");
    setTimeout(() => {
      current.classList.remove("show","leaving");
    }, 200);
  }

  // Phase 2: show next after brief pause
  setTimeout(() => {
    next.classList.add("show");
    window.scrollTo({top:0, behavior:"instant"});
    // Re-observe any reveal elements on this page
    next.querySelectorAll(".reveal:not(.visible)").forEach(el => {
      if(typeof revealObserver !== "undefined") revealObserver.observe(el);
    });
    setTimeout(() => { _routeActive = false; }, 50);
  }, current ? 160 : 0);
}
window.addEventListener("hashchange", route);

/* Safe storage (works hosted; degrades to memory if blocked) */
const store = window.__fxStore;

/* ═══════════ BUDGET BUILDER ═══════════ */
const BB_NEEDS = [
  {k:"rent",ic:"home",l:"Rent / housing"},{k:"groceries",ic:"grocery",l:"Groceries"},
  {k:"transport",ic:"transport",l:"Transport / fuel"},{k:"utilities",ic:"bills",l:"Utilities"},
  {k:"insurance",ic:"shield",l:"Insurance premiums"},{k:"emi",ic:"emi",l:"Loan EMIs"},
  {k:"phone",ic:"subs",l:"Phone / internet"},{k:"medical",ic:"health",l:"Medical / health"}
];
const BB_WANTS = [
  {k:"dining",ic:"dining",l:"Dining out / delivery"},{k:"shopping",ic:"shopping",l:"Shopping / clothing"},
  {k:"ott",ic:"fun",l:"Movies / OTT / gaming"},{k:"subs",ic:"subs",l:"Subscriptions"},
  {k:"travel",ic:"travel",l:"Travel / vacations"},{k:"care",ic:"care",l:"Personal care"},
  {k:"gifts",ic:"charity",l:"Gifts / social"}
];
const BB_SAVE = [
  {k:"sip",ic:"invest-cat",l:"SIP / mutual funds"},{k:"efund",ic:"shield",l:"Emergency fund"},
  {k:"fd",ic:"lock",l:"Fixed deposits"},{k:"ppf",ic:"bank",l:"PPF / NPS / EPF"},
  {k:"stocks",ic:"trending",l:"Stocks / equity"},{k:"gold",ic:"dollar",l:"Gold / SGBs"}
];
const bbVals = {};
[...BB_NEEDS, ...BB_WANTS, ...BB_SAVE].forEach(c => bbVals[c.k] = 0);

function bbRenderItems(elId, cfg){
  document.getElementById(elId).innerHTML = cfg.map(c => `
    <div class="row-line">
      <div style="font-size:18px;width:28px;text-align:center"><svg width="18" height="18" style="color:${c.c}"><use href="#ic-${c.ic}"/></svg></div>
      <div style="flex:1;font-size:14px">${c.l}</div>
      <input class="fi-sm" type="number" min="0" value="${bbVals[c.k] || ""}" placeholder="0" inputmode="numeric"
        oninput="bbVals['${c.k}']=Math.max(0,Number(this.value)||0); bbUpdate()">
    </div>`).join("");
}

function bbCat(name, total, limit, color){
  const pct = limit > 0 ? Math.min(total/limit*100, 100) : 0;
  const over = total > limit && limit > 0;
  const fill = document.getElementById("bb-"+name+"-fill");
  fill.style.width = pct + "%";
  fill.style.background = over ? "var(--red)" : color;
  document.getElementById("bb-"+name+"-used").textContent = fmt(total) + " used";
  document.getElementById("bb-"+name+"-limit").textContent = "limit " + fmt(limit);
  const st = document.getElementById("bb-"+name+"-status");
  if (total === 0){ st.textContent = "Not filled"; st.className = "pill pill-mute"; }
  else if (over){ st.textContent = "Over by " + fmt(total - limit); st.className = "pill pill-bad"; }
  else { st.textContent = "Within limit"; st.className = "pill pill-ok"; }
}

function bbUpdate(){
  const income = num("bb-income");
  const nPct = Math.min(100, Math.max(0, num("bb-pct-needs") || 50));
  const wPct = Math.min(100, Math.max(0, num("bb-pct-wants") || 30));
  const sPct = Math.min(100, Math.max(0, num("bb-pct-save") || 20));
  const warn = document.getElementById("bb-split-warn");
  if(warn) warn.style.display = (nPct + wPct + sPct !== 100) ? "block" : "none";
  const nL = income * nPct/100, wL = income * wPct/100, sL = income * sPct/100;
  const sum = cfg => cfg.reduce((s,c) => s + (bbVals[c.k]||0), 0);
  const nT = sum(BB_NEEDS), wT = sum(BB_WANTS), sT = sum(BB_SAVE);
  const spent = nT + wT + sT, free = income - spent;

  const nPctV = income>0 ? Math.round(nL/income*100) : nPct;
  const wPctV = income>0 ? Math.round(wL/income*100) : wPct;
  const sPctV = income>0 ? Math.round(sL/income*100) : sPct;
  document.getElementById("bb-segbar").innerHTML =
    `<div class="seg" style="width:${nPctV}%;background:var(--blue)"></div>
     <div class="seg" style="width:${wPctV}%;background:var(--gold)"></div>
     <div class="seg" style="width:${sPctV}%;background:var(--green)"></div>`;
  const nl = document.getElementById("bb-needs-label"); if(nl) nl.textContent = `Needs · ${nPct}%`;
  const wl = document.getElementById("bb-wants-label"); if(wl) wl.textContent = `Wants · ${wPct}%`;
  const sl = document.getElementById("bb-save-label");  if(sl) sl.textContent = `Savings & investments · ${sPct}%`;
  document.getElementById("bb-seglabels").innerHTML =
    `<span>Needs <b>${fmt(nL)}</b></span><span>Wants <b>${fmt(wL)}</b></span><span>Save <b>${fmt(sL)}</b></span>`;

  bbCat("needs", nT, nL, "var(--blue)");
  bbCat("wants", wT, wL, "var(--gold)");
  bbCat("save",  sT, sL, "var(--green)");

  const pos = free >= 0;
  const savePct = income > 0 ? Math.round(sT/income*100) : 0;
  const bbSumEl = document.getElementById("bb-summary");
  const wasEmpty = !bbSumEl.innerHTML.trim();
  bbSumEl.innerHTML = `
    <div class="card result-hero-anim" style="background:${pos ? "rgba(29,125,70,.05)" : "rgba(215,0,21,.04)"}">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:15px;font-weight:600">${pos ? "Unallocated" : "Over budget by"}</div>
        <div style="font-size:26px;font-weight:700;letter-spacing:-.02em;color:${pos ? "var(--green)" : "var(--red)"}">${fmt(Math.abs(free))}</div>
      </div>
      <div class="note" style="margin-top:6px">Allocated ${fmt(spent)} of ${fmt(income)} (${income>0?Math.round(spent/income*100):0}%) · Actual savings rate: <b style="color:var(--ink)">${savePct}%</b></div>
    </div>`;

  const tips = [];
  if (income > 0){
    if (nT > nL) tips.push(["warn","Needs above 50%","Rent, EMIs or transport may be squeezing you. Aim to bring fixed costs under half your income."]);
    if (wT > wL) tips.push(["warn","Wants above 30%","Dining, subscriptions and shopping are over the line. Trimming 10% here funds your future."]);
    if (sT > 0 && sT < sL*.5) tips.push(["info","Savings under 10%","You're saving less than half the 20% target. Even a ₹2,000 SIP automates the habit."]);
    if (sT >= sL) tips.push(["ok","Savings target hit","You're at or above 20%. Consider a yearly 10% SIP step-up to compound faster."]);
    if ((bbVals.emi||0) > income*.3) tips.push(["warn","EMI danger zone","EMIs alone exceed 30% of income. Prioritise clearing high-interest loans before new investments."]);
    if ((bbVals.sip||0) > 0 && (bbVals.efund||0) === 0) tips.push(["info","No emergency fund","You invest but have no buffer. Build 3–6 months of expenses in a liquid fund first."]);
    if (spent === 0) tips.push(["info","Start above","Fill in your expenses to see your live budget breakdown."]);
  }
  document.getElementById("bb-insights").innerHTML = tips.length ? `
    <div class="card">
      <div style="font-size:14px;font-weight:700;margin-bottom:12px">Insights</div>
      ${tips.map(t => `<div class="tip tip-${t[0]}"><b>${t[1]}</b>${t[2]}</div>`).join("")}
    </div>` : "";
}

/* ═══════════ EXPENSE TRACKER ═══════════ */
const ET_CATS = {
  food:      {ic:"food",      l:"Dining",         c:"#c2410c"},
  grocery:   {ic:"grocery",   l:"Groceries",      c:"#1d7d46"},
  transport: {ic:"transport", l:"Transport",      c:"#0071e3"},
  rent:      {ic:"rent",      l:"Rent",           c:"#d70015"},
  bills:     {ic:"bills",     l:"Bills",          c:"#b08a36"},
  health:    {ic:"health",    l:"Health",         c:"#0c8079"},
  education: {ic:"education", l:"Education",      c:"#3a5fc8"},
  shopping:  {ic:"shopping",  l:"Shopping",       c:"#b3387a"},
  subs:      {ic:"subs",      l:"Subscriptions",  c:"#8856d8"},
  travel:    {ic:"travel",    l:"Travel",         c:"#2563eb"},
  fuel:      {ic:"fuel",      l:"Fuel",           c:"#92400e"},
  emi:       {ic:"emi",       l:"EMI / Loans",    c:"#be185d"},
  invest_et: {ic:"invest-cat",l:"Investments",    c:"#047857"},
  fun:       {ic:"fun",       l:"Entertainment",  c:"#6e3bd4"},
  care:      {ic:"care",      l:"Self-care",      c:"#d4527e"},
  pet:       {ic:"pet",       l:"Pets",           c:"#7c3aed"},
  charity:   {ic:"charity",   l:"Donations",      c:"#0891b2"},
  other:     {ic:"other",     l:"Other",          c:"#86868b"}
};
let etSel = "food";
let etItems = [];
try { etItems = JSON.parse(store.get("fx_expenses","[]")) || []; if(!Array.isArray(etItems)) etItems = []; } catch(e){ etItems = []; }
let etBudget = Math.max(0, Number(store.get("fx_budget","0")) || 0);

function etSave(){ store.set("fx_expenses", JSON.stringify(etItems)); store.set("fx_budget", String(etBudget)); }
function etToday(){ return new Date().toISOString().slice(0,10); }
function etMonth(){ return new Date().toISOString().slice(0,7); }

function etRenderCats(){
  document.getElementById("et-cats").innerHTML = Object.entries(ET_CATS).map(([k,v]) => `
    <div onclick="etPick('${k}')" style="padding:11px 4px;border-radius:12px;border:1.5px solid ${etSel===k?'var(--ink)':'var(--hair2)'};background:${etSel===k?'#fafafa':'#fff'};text-align:center;cursor:pointer;transition:all .15s">
      <span style="display:flex;justify-content:center;align-items:center;height:24px;margin-bottom:2px"><svg width="20" height="20" style="color:${v.c}"><use href="#ic-${v.ic}"/></svg></span>
      <span style="font-size:10px;color:var(--ink2);font-weight:600;margin-top:3px;display:block">${v.l}</span>
    </div>`).join("");
}
function etPick(k){ etSel = k; etRenderCats(); }

function etAdd(){
  const amount = num("et-amount");
  if (!amount) return;
  const date = document.getElementById("et-date").value || etToday();
  const note = document.getElementById("et-note").value.trim();
  etItems.unshift({ id: Date.now(), amount, category: ET_CATS[etSel] ? etSel : "other", date, note });
  etSave();
  document.getElementById("et-amount").value = "";
  document.getElementById("et-note").value = "";
  // Flash feedback on add button
  const addBtn = document.querySelector('#page-expenses .btn');
  if(addBtn){
    addBtn.textContent = "Added ✓";
    addBtn.style.background = "var(--green)";
    setTimeout(() => { addBtn.textContent = "Add expense"; addBtn.style.background = ""; }, 1200);
  }
  etRender();
}
function etDel(id){ etItems = etItems.filter(e => e.id !== id); etSave(); etRender(); }

function etTab(t){
  document.getElementById("et-breakdown").classList.toggle("hidden", t !== "bd");
  document.getElementById("et-history").classList.toggle("hidden", t !== "hi");
  const on = "flex:1;padding:9px;text-align:center;border-radius:980px;font-size:13px;font-weight:600;cursor:pointer;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.08)";
  const off = "flex:1;padding:9px;text-align:center;border-radius:980px;font-size:13px;font-weight:600;cursor:pointer;color:#6e6e73";
  document.getElementById("et-tab-bd").style.cssText = t === "bd" ? on : off;
  document.getElementById("et-tab-hi").style.cssText = t === "hi" ? on : off;
}

function etSetBudget(){
  const v = prompt("Set your monthly spending budget (₹). Enter 0 to remove.", etBudget || "");
  if (v === null) return;
  etBudget = Math.max(0, Number(v) || 0);
  etSave(); etRender();
}

function etRender(){
  const tToday = etItems.filter(e => e.date === etToday()).reduce((s,e) => s+e.amount, 0);
  const tMonth = etItems.filter(e => (e.date||"").slice(0,7) === etMonth()).reduce((s,e) => s+e.amount, 0);
  const days = new Date().getDate();
  const avgDay = days > 0 ? tMonth/days : 0;

  document.getElementById("et-stats").innerHTML = `
    <div class="stat-cell"><div class="v" style="color:var(--orange)">${fmt(tToday)}</div><div class="l">Today</div></div>
    <div class="stat-cell"><div class="v">${fmt(tMonth)}</div><div class="l">This month</div></div>
    <div class="stat-cell"><div class="v" style="color:var(--ink2)">${fmt(avgDay)}</div><div class="l">Daily average</div></div>`;

  const be = document.getElementById("et-budget-edit");
  const bc = document.getElementById("et-budget-content");
  be.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="etSetBudget()">${etBudget>0?"Edit":"Set budget"}</button>`;
  if (etBudget > 0){
    const used = Math.min(tMonth/etBudget*100, 100);
    const over = tMonth > etBudget;
    const daysLeft = new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).getDate() - days;
    const left = etBudget - tMonth;
    bc.innerHTML = `
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--ink2);margin-bottom:5px">
        <span>${fmt(tMonth)} spent</span><span>of ${fmt(etBudget)}</span></div>
      <div class="bar"><div class="bar-fill" style="width:${used}%;background:${over?"var(--red)":used>80?"var(--gold)":"var(--green)"}"></div></div>
      <div class="note" style="margin-top:7px">${over
        ? "Over budget by <b style='color:var(--red)'>" + fmt(tMonth-etBudget) + "</b>"
        : fmt(left) + " left · " + (daysLeft>0 ? "that's <b>" + fmt(left/Math.max(daysLeft,1)) + "/day</b> for " + daysLeft + " more days" : "last day of the month")}</div>`;
  } else {
    bc.innerHTML = `<div class="note">No budget set. Set one to get a live daily allowance.</div>`;
  }

  const monthItems = etItems.filter(e => (e.date||"").slice(0,7) === etMonth());
  const byCat = {};
  monthItems.forEach(e => byCat[e.category] = (byCat[e.category]||0) + e.amount);
  const sorted = Object.entries(byCat).sort((a,b) => b[1]-a[1]);
  const max = sorted.length ? sorted[0][1] : 0;

  document.getElementById("et-breakdown").innerHTML = sorted.length ? `
    <div class="card">
      <div style="font-size:14px;font-weight:700;margin-bottom:10px">This month by category</div>
      ${sorted.map(([k,v]) => { const c = ET_CATS[k] || ET_CATS.other; const cic = c.ic || 'other'; return `
        <div style="display:flex;align-items:center;gap:12px;padding:9px 0">
          <div style="font-size:18px;width:26px;text-align:center">${c.i}</div>
          <div style="flex:1">
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
              <span style="font-weight:600">${c.l}</span><span style="color:var(--ink2)">${tMonth>0?Math.round(v/tMonth*100):0}%</span></div>
            <div class="bar" style="height:6px"><div class="bar-fill" style="width:${max>0?v/max*100:0}%;background:${c.c}"></div></div>
          </div>
          <div style="font-size:13px;font-weight:700;min-width:70px;text-align:right">${fmt(v)}</div>
        </div>`; }).join("")}
    </div>` : `<div class="card" style="text-align:center;color:var(--ink3);font-size:14px;padding:40px 20px">No expenses logged this month yet.<br>Add your first one above.</div>`;

  document.getElementById("et-history").innerHTML = etItems.length ? `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-size:14px;font-weight:700">All expenses (${etItems.length})</div>
        <button class="btn btn-ghost btn-sm" onclick="etExport()">Export CSV</button>
      </div>
      ${etItems.slice(0,200).map(e => { const c = ET_CATS[e.category] || ET_CATS.other; return `
        <div class="row-line">
          <div style="width:40px;height:40px;border-radius:11px;background:${c.c}18;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${c.i}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.note) || c.l}</div>
            <div style="font-size:11px;color:var(--ink3)">${esc(e.date)} · ${c.l}</div>
          </div>
          <div style="font-size:15px;font-weight:700">${fmt(e.amount)}</div>
          <button onclick="etDel(${e.id})" aria-label="Delete" style="background:none;border:none;color:var(--ink3);cursor:pointer;font-size:17px;padding:4px 7px;border-radius:8px">✕</button>
        </div>`; }).join("")}
    </div>` : `<div class="card" style="text-align:center;color:var(--ink3);font-size:14px;padding:40px 20px">Nothing here yet.</div>`;
}

function etExport(){
  const rows = [["date","category","amount","note"]].concat(etItems.map(e => [e.date, e.category, e.amount, (e.note||"").replace(/"/g,'""')]));
  const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], {type:"text/csv"}));
  a.download = "finatrix-expenses.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

"use strict";
/* ═══════════ INVESTMATCH ═══════════ */
const IM_Q = [
  { k:"age", t:"How old are you?", type:"num", ph:"e.g. 25", min:18, max:75 },
  { k:"income", t:"Monthly income (₹)", type:"num", ph:"e.g. 50000", min:1 },
  { k:"monthly", t:"How much can you invest monthly? (₹)", type:"num", ph:"e.g. 10000", min:100 },
  { k:"risk", t:"What's your risk appetite?", type:"opt", opts:[
    {v:"conservative", l:"Conservative", d:"Safety first, steady returns"},
    {v:"moderate", l:"Moderate", d:"Balanced growth with some risk"},
    {v:"aggressive", l:"Aggressive", d:"Maximum growth, higher volatility"}]},
  { k:"horizon", t:"Investment time horizon?", type:"opt", opts:[
    {v:"1-3", l:"1–3 years", d:"Short-term goals"},
    {v:"3-5", l:"3–5 years", d:"Medium-term goals"},
    {v:"5-10", l:"5–10 years", d:"Long-term wealth building"},
    {v:"10+", l:"10+ years", d:"Retirement / major milestones"}]},
  { k:"goal", t:"Primary investment goal?", type:"opt", opts:[
    {v:"wealth", l:"Wealth building", d:"Grow my money over time"},
    {v:"retirement", l:"Retirement", d:"Build a retirement corpus"},
    {v:"house", l:"Buy a house", d:"Save for a down payment"},
    {v:"tax", l:"Tax saving", d:"Reduce taxable income"},
    {v:"emergency", l:"Emergency fund", d:"Build a safety net"}]}
];
let imStep = 0;
const imAns = { age:25, income:50000, monthly:10000, risk:"moderate", horizon:"5-10", goal:"wealth" };

const IM_ALLOC = {
  conservative: [
    {n:"Large-cap index fund", p:25, c:"#0071e3"},{n:"Debt / bond funds", p:30, c:"#1d7d46"},
    {n:"PPF", p:15, c:"#0c8079"},{n:"Fixed deposits", p:15, c:"#b08a36"},
    {n:"Gold (SGBs / ETF)", p:10, c:"#c2410c"},{n:"Liquid fund", p:5, c:"#6e3bd4"}],
  moderate: [
    {n:"Large-cap funds", p:20, c:"#0071e3"},{n:"Mid-cap funds", p:18, c:"#1d7d46"},
    {n:"Nifty 50 index fund", p:15, c:"#0c8079"},{n:"ELSS (tax saver)", p:15, c:"#b08a36"},
    {n:"Debt / bond funds", p:15, c:"#6e3bd4"},{n:"Gold (SGBs)", p:10, c:"#c2410c"},
    {n:"International fund", p:7, c:"#b3387a"}],
  aggressive: [
    {n:"Small-cap funds", p:25, c:"#c2410c"},{n:"Mid-cap funds", p:22, c:"#1d7d46"},
    {n:"Large-cap funds", p:13, c:"#0071e3"},{n:"International / US equity", p:15, c:"#6e3bd4"},
    {n:"ELSS (tax saver)", p:10, c:"#b08a36"},{n:"Sectoral / thematic", p:10, c:"#b3387a"},
    {n:"High-risk / crypto", p:5, c:"#0c8079"}]
};
const IM_RATE = { conservative:.09, moderate:.12, aggressive:.14 };
const IM_HY = { "1-3":2, "3-5":4, "5-10":7, "10+":15 };
const IM_RL = { conservative:"Conservative", moderate:"Moderate", aggressive:"Aggressive" };

function imSteps(){
  document.getElementById("im-steps").innerHTML = IM_Q.map((_,i) => `<div class="sd ${i<=imStep?'on':''}"></div>`).join("");
}
function imRender(){
  const q = IM_Q[imStep];
  const imCard = document.getElementById("im-qcard");
  if(imCard){
    imCard.style.cssText = "opacity:0;transform:translateY(16px);transition:opacity 320ms var(--ease-out,ease),transform 320ms var(--ease-out,ease)";
    requestAnimationFrame(() => requestAnimationFrame(() => { imCard.style.opacity="1"; imCard.style.transform="none"; }));
  }
  let h = `<div style="font-size:12px;font-weight:600;color:var(--ink3);margin-bottom:8px">Question ${imStep+1} of ${IM_Q.length}</div>
           <div style="font-size:19px;font-weight:700;letter-spacing:-.01em;margin-bottom:18px">${q.t}</div>`;
  if (q.type === "num"){
    h += `<input class="fi" type="number" id="im-input" value="${imAns[q.k]}" placeholder="${q.ph}" min="${q.min||0}" ${q.max?`max="${q.max}"`:""} inputmode="numeric">`;
  } else {
    h += q.opts.map(o => `
      <div class="opt-card ${imAns[q.k]===o.v?'sel':''}" onclick="imPick('${q.k}','${o.v}')">
        <div class="ol">${o.l}</div><div class="od">${o.d}</div>
      </div>`).join("");
  }
  document.getElementById("im-qcard").innerHTML = h;
  let b = "";
  if (imStep > 0) b += `<button class="btn btn-ghost" style="flex:1" onclick="imPrev()">Back</button>`;
  b += imStep < IM_Q.length-1
    ? `<button class="btn" style="flex:2" onclick="imNext()">Next</button>`
    : `<button class="btn" style="flex:2" id="im-build-btn" onclick="imBuildAnim()">Build my portfolio</button>`;
  document.getElementById("im-btns").innerHTML = b;
}
function imSaveNum(){
  const q = IM_Q[imStep];
  if (q.type === "num"){
    const el = document.getElementById("im-input");
    let v = Number(el.value) || 0;
    if (q.min != null) v = Math.max(q.min, v);
    if (q.max != null) v = Math.min(q.max, v);
    imAns[q.k] = v;
  }
}
function imPick(k, v){
  imAns[k] = v; imRender();
  setTimeout(() => { if (imStep < IM_Q.length-1) imNext(); }, 250);
}
function imNext(){ imSaveNum(); if (imStep < IM_Q.length-1){ imStep++; imSteps(); imRender(); window.scrollTo({top:0}); } }
function imPrev(){ imSaveNum(); if (imStep > 0){ imStep--; imSteps(); imRender(); } }

function imBuild(){
  imSaveNum();
  if (imAns.monthly < 100){ alert("Please enter a monthly investment of at least ₹100."); return; }

  // Horizon-aware risk control: short horizons cap equity exposure.
  let effRisk = imAns.risk;
  let riskNote = "";
  if (imAns.horizon === "1-3" && effRisk !== "conservative"){
    effRisk = "conservative";
    riskNote = "Your horizon is under 3 years, so we dialled the allocation to conservative — equity needs 5+ years to ride out volatility.";
  } else if (imAns.horizon === "3-5" && effRisk === "aggressive"){
    effRisk = "moderate";
    riskNote = "With a 3–5 year horizon, we softened aggressive to moderate. Small-caps can stay underwater for years.";
  }

  const alloc = IM_ALLOC[effRisk];
  const rate = IM_RATE[effRisk];
  const years = IM_HY[imAns.horizon];
  const r = rate/12, n = years*12;
  const fv = imAns.monthly * ((Math.pow(1+r, n) - 1) / r) * (1+r);
  const invested = imAns.monthly * n;
  const gains = fv - invested;
  const realFv = fv / Math.pow(1.06, years); // today's purchasing power at 6% inflation

  const ins = [];
  if (riskNote) ins.push(riskNote);
  if (imAns.age < 28 && effRisk === "conservative" && imAns.horizon !== "1-3")
    ins.push("You're young — time is your biggest edge. Consider gradually raising equity exposure as you get comfortable.");
  if (imAns.income > 0 && imAns.monthly < imAns.income*.15)
    ins.push(`You're investing ${Math.round(imAns.monthly/imAns.income*100)}% of income. Pushing toward 20% meaningfully accelerates wealth.`);
  if (imAns.goal === "tax")
    ins.push("For tax saving: ELSS covers ₹1.5L under 80C (old regime), plus NPS adds ₹50K under 80CCD(1B). Under the new regime most deductions don't apply — check which regime you file.");
  if (imAns.goal === "emergency")
    ins.push("For an emergency fund, skip equity entirely — keep it in liquid funds or sweep-in FDs you can access within a day.");
  if (gains > invested)
    ins.push(`Your projected gains (${fmt(gains)}) exceed what you put in (${fmt(invested)}) — that's compounding doing the heavy lifting over ${years} years.`);

  document.getElementById("im-quiz").classList.add("hidden");
  const rs = document.getElementById("im-result");
  rs.classList.remove("hidden");
  window.scrollTo({top:0, behavior:"instant"});
  rs.innerHTML = `
    <div class="result-hero-anim" style="text-align:center;margin:8px 0 22px">
      <div style="font-size:13px;color:var(--ink2)">Your ${IM_RL[effRisk]} portfolio could grow to</div>
      <div class="big-num" style="color:var(--green)">${fmt(fv)}</div>
      <div class="note">in ${years} years at ~${Math.round(rate*100)}% p.a. · worth ${fmt(realFv)} in today's money</div>
    </div>

    <div class="card">
      <div class="grid3" style="text-align:center">
        <div><div style="font-size:19px;font-weight:700;color:var(--blue)">${fmt(invested)}</div><div class="note">You invest</div></div>
        <div><div style="font-size:19px;font-weight:700;color:var(--green)">${fmt(gains)}</div><div class="note">You gain</div></div>
        <div><div style="font-size:19px;font-weight:700;color:var(--gold)">${invested>0?Math.round(gains/invested*100):0}%</div><div class="note">Total growth</div></div>
      </div>
    </div>

    <div class="card">
      <div style="font-size:14px;font-weight:700;margin-bottom:12px">Recommended allocation</div>
      <div class="seg-bar">${alloc.map(a => `<div class="seg" style="width:${a.p}%;background:${a.c}"></div>`).join("")}</div>
      ${alloc.map(a => `
        <div class="row-line">
          <div style="width:10px;height:10px;border-radius:50%;background:${a.c};flex-shrink:0"></div>
          <div style="flex:1;font-size:14px">${a.n}</div>
          <div style="font-size:14px;font-weight:700;color:${a.c}">${a.p}%</div>
          <div style="font-size:12px;color:var(--ink2);min-width:80px;text-align:right">${fmt(imAns.monthly*a.p/100)}/mo</div>
        </div>`).join("")}
    </div>

    ${ins.length ? `<div class="card"><div style="font-size:14px;font-weight:700;margin-bottom:12px">Smart insights</div>
      ${ins.map(i => `<div class="tip tip-info">${i}</div>`).join("")}</div>` : ""}

    <div class="card" style="background:var(--gold-bg)">
      <div style="font-size:13px;font-weight:700;margin-bottom:8px">Summary</div>
      <div class="note" style="line-height:2">
        Monthly SIP: <b style="color:var(--ink)">${fmt(imAns.monthly)}</b> ·
        Risk: <b style="color:var(--ink)">${IM_RL[effRisk]}</b> ·
        Horizon: <b style="color:var(--ink)">${years} years</b> ·
        Expected CAGR: <b style="color:var(--ink)">~${Math.round(rate*100)}%</b>
      </div>
    </div>
    <button class="btn" onclick="imReset()">Recalculate</button>`;
  window.scrollTo({top:0});
}
function imReset(){
  imStep = 0;
  document.getElementById("im-quiz").classList.remove("hidden");
  document.getElementById("im-result").classList.add("hidden");
  imSteps(); imRender();
}

/* ═══════════ PARKSMART ═══════════ */
const PS_OPTS = [
  { n:"Savings account", rate:3.5, tax:"slab80tta", liquid:true, risk:"None", ic:"bank", d:"Instant access. First ₹10K interest tax-free under 80TTA (old regime). Small Finance Banks offer 6–7%.", minM:0 },
  { n:"Liquid mutual fund", rate:7.0, tax:"slab", liquid:true, risk:"Very low", ic:"invest-cat", d:"Redeems next business day. Category avg 30-day annualised ~7%. Ideal 1 week – 3 months.", minM:0 },
  { n:"Overnight fund", rate:6.2, tax:"slab", liquid:true, risk:"Negligible", ic:"clock", d:"1-day maturity paper. Safest MF category. Slightly below liquid funds but zero duration risk.", minM:0 },
  { n:"Bank FD (1 yr)", rate:7.0, tax:"slab", liquid:false, risk:"None*", ic:"lock", d:"SBI/HDFC: 6.5–7%. Small Finance Banks: 7.5–8%. DICGC insured to ₹5L. ~1% premature exit penalty.", minM:1 },
  { n:"Arbitrage fund", rate:7.1, tax:"equity", liquid:true, risk:"Low", ic:"refresh", d:"Exploits cash-futures spread. Equity tax: 20% STCG, 12.5% LTCG above ₹1.25L. Best for 20–30% slab holders after 3+ months.", minM:3 },
  { n:"91-day T-Bill", rate:6.5, tax:"slab", liquid:false, risk:"None", ic:"bills", d:"Government of India backed. Zero credit risk. Buy via RBI Retail Direct or a debt MF.", minM:3 },
  { n:"Money market fund", rate:6.8, tax:"slab", liquid:true, risk:"Very low", ic:"dollar", d:"CDs, CPs, T-bills up to 1-year. Lower volatility than liquid, slightly higher yield.", minM:1 },
  { n:"Ultra short duration", rate:7.0, tax:"slab", liquid:true, risk:"Low", ic:"zap", d:"3–6 month Macaulay duration. Minor NAV moves. Good for 3–9 month horizon.", minM:3 },
  { n:"Short duration fund", rate:7.4, tax:"slab", liquid:true, risk:"Low–med", ic:"trending", d:"1–3 year bond portfolio. Higher yield but sensitive to rate changes. Best for 6+ months.", minM:6 },
  { n:"Sweep-in FD", rate:6.6, tax:"slab", liquid:true, risk:"None*", ic:"layers", d:"Bank auto-parks idle balance into FD; breaks in exact units when you spend. Zero effort, FD returns.", minM:0 }
];
const PS_M = { "0-1":.5, "1-3":2, "3-6":4.5, "6-12":9, "12+":15 };
const PS_DL = { "0-1":"under 1 month", "1-3":"1–3 months", "3-6":"3–6 months", "6-12":"6–12 months", "12+":"over 1 year" };

function psQuick(){
  const amts = [[25000,"₹25K"],[100000,"₹1L"],[500000,"₹5L"],[1000000,"₹10L"],[2500000,"₹25L"]];
  document.getElementById("ps-quick").innerHTML = amts.map(a =>
    `<button class="btn btn-ghost btn-sm" onclick="document.getElementById('ps-amount').value=${a[0]}">${a[1]}</button>`).join("");
}

function psTax(opt, gross, months, slabPct, amt){
  if (opt.tax === "equity"){
    if (months >= 12){
      const exempt = 125000 * (months/12);          // LTCG exemption pro-rated to holding period
      const taxable = Math.max(0, gross - exempt);
      return gross - taxable * 0.125;               // LTCG 12.5%
    }
    return gross * (1 - 0.20);                      // STCG 20%
  }
  if (opt.tax === "slab80tta"){
    const exempt = 10000 * (months/12);             // 80TTA pro-rated (old regime)
    const taxable = Math.max(0, gross - exempt);
    return gross - taxable * slabPct;
  }
  return gross * (1 - slabPct);                     // taxed at slab
}

function psCalc(){
  const amt = num("ps-amount");
  if (amt < 1000){ alert("Please enter at least ₹1,000."); return; }
  const dur = document.getElementById("ps-duration").value;
  const slab = Number(document.getElementById("ps-slab").value)/100;
  const months = PS_M[dur];

  const ranked = PS_OPTS
    .filter(o => months >= o.minM && (dur !== "0-1" || o.liquid))
    .map(o => {
      const gross = amt * (o.rate/100) * (months/12);
      const net = Math.max(0, psTax(o, gross, months, slab, amt));
      const effRate = amt > 0 && months > 0 ? (net/amt) * (12/months) * 100 : 0;
      return { ...o, gross, net, effRate };
    })
    .sort((a,b) => b.net - a.net);

  const best = ranked[0];
  const maxNet = best.net || 1;

  // Smart split: best liquid option for buffer + best overall for the rest
  const bestLiquid = ranked.find(o => o.liquid);
  let split = "";
  if (amt >= 100000 && bestLiquid && bestLiquid.n !== best.n && !best.liquid){
    const buf = Math.round(amt*.3), core = amt - buf;
    split = `<div class="card" style="background:rgba(12,128,121,.05)">
      <div style="font-size:13px;font-weight:700;color:var(--teal);margin-bottom:8px">Smart split idea</div>
      <div class="note" style="line-height:1.8">${best.n} locks your money. Consider <b style="color:var(--ink)">${fmt(core)}</b> in ${best.n} for max returns + <b style="color:var(--ink)">${fmt(buf)}</b> in ${bestLiquid.n} so 30% stays one tap away.</div>
    </div>`;
  }

  document.getElementById("ps-input").classList.add("hidden");
  const rs = document.getElementById("ps-result");
  rs.classList.remove("hidden");
  window.scrollTo({top:0, behavior:"instant"});
  rs.innerHTML = `
    <div class="card result-hero-anim" style="background:linear-gradient(135deg,rgba(12,128,121,.06),#fff)">
      <span class="pill" style="background:rgba(12,128,121,.12);color:var(--teal)">Best Match</span>
      <div style="font-size:23px;font-weight:700;letter-spacing:-.015em;margin-top:10px">${best.ic?'<svg width="18" height="18" style="display:inline;vertical-align:middle;margin-right:6px"><use href="#ic-'+best.ic+'"/></svg>':''} ${best.n}</div>
      <div class="note" style="margin-top:4px">${best.d}</div>
      <div class="grid3" style="text-align:center;margin-top:18px">
        <div><div style="font-size:19px;font-weight:700;color:var(--green)">${fmt(best.net)}</div><div class="note">Post-tax earnings</div></div>
        <div><div style="font-size:19px;font-weight:700;color:var(--teal)">${best.effRate.toFixed(2)}%</div><div class="note">Effective rate</div></div>
        <div><div style="font-size:19px;font-weight:700;color:var(--gold)">${best.risk}</div><div class="note">Risk</div></div>
      </div>
    </div>
    ${split}
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin:18px 4px 12px">
      <div style="font-size:15px;font-weight:700">All options, ranked</div>
      <div class="note">${fmt(amt)} for ${PS_DL[dur]}</div>
    </div>
    ${ranked.map((o,i) => `
      <div class="card result-card-anim" style="padding:18px 20px;${i===0?'border:1.5px solid rgba(12,128,121,.35);box-shadow:var(--shadow)':''}">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="width:26px;height:26px;border-radius:8px;background:${i===0?'var(--teal)':'var(--bg)'};color:${i===0?'#fff':'var(--ink2)'};display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">${i+1}</span>
          <span style="display:inline-flex;align-items:center;justify-content:center;width:24px"><svg width="18" height="18" style="color:var(--teal)"><use href="#ic-${o.ic||'other'}"/></svg></span>
          <span style="flex:1;font-size:14px;font-weight:600">${o.n}</span>
          <span style="font-size:16px;font-weight:700;color:var(--green)">${fmt(o.net)}</span>
        </div>
        <div class="note" style="margin:7px 0 7px 36px">${o.d}</div>
        <div style="display:flex;gap:14px;font-size:11px;color:var(--ink3);margin-left:36px;flex-wrap:wrap">
          <span>Gross ${o.rate}%</span><span>Post-tax ${o.effRate.toFixed(2)}%</span>
          <span class="pill ${o.liquid?'pill-ok':'pill-bad'}" style="font-size:10px">${o.liquid ? 'Liquid' : 'Locked'}</span>
          <span>Risk: ${o.risk}</span>
        </div>
        <div class="bar" style="height:6px;margin:9px 0 0 36px"><div class="bar-fill" style="width:${(o.net/maxNet*100).toFixed(0)}%;background:${i===0?'var(--teal)':'var(--hair)'}"></div></div>
      </div>`).join("")}
    <div class="card" style="background:var(--gold-bg)">
      <div style="font-size:13px;font-weight:700;margin-bottom:8px">Keep in mind</div>
      <div class="note">Returns are indicative category averages as of mid-2026 — actual fund and FD rates vary, so compare before committing. Arbitrage funds enjoy equity taxation (20% STCG, 12.5% LTCG beyond the exemption) which beats slab tax for higher earners. Debt funds bought after April 2023 are taxed at your slab with no indexation. Banks deduct TDS on FD interest above ₹50,000 a year. And whatever you choose, keep 3–6 months of expenses in something liquid.</div>
    </div>
    <button class="btn" onclick="psReset()">Try a different amount</button>`;
  window.scrollTo({top:0});
}
function psReset(){
  document.getElementById("ps-input").classList.remove("hidden");
  document.getElementById("ps-result").classList.add("hidden");
}

"use strict";
/* ═══════════ PEERCOMPARE ═══════════ */
/* City index: tier sets the base benchmark; col adjusts income & expenses for local cost of living */
const PC_CITIES = {
  mumbai:     { l:"Mumbai", tier:"metro", col:1.15 },
  delhi:      { l:"Delhi NCR", tier:"metro", col:1.10 },
  bengaluru:  { l:"Bengaluru", tier:"metro", col:1.12 },
  hyderabad:  { l:"Hyderabad", tier:"metro", col:1.02 },
  chennai:    { l:"Chennai", tier:"metro", col:1.00 },
  kolkata:    { l:"Kolkata", tier:"metro", col:0.90 },
  pune:       { l:"Pune", tier:"metro", col:0.98 },
  ahmedabad:  { l:"Ahmedabad", tier:"tier2", col:1.02 },
  jaipur:     { l:"Jaipur", tier:"tier2", col:0.98 },
  kochi:      { l:"Kochi", tier:"tier2", col:1.00 },
  chandigarh: { l:"Chandigarh", tier:"tier2", col:1.05 },
  lucknow:    { l:"Lucknow", tier:"tier2", col:0.95 },
  indore:     { l:"Indore", tier:"tier2", col:0.95 },
  coimbatore: { l:"Coimbatore", tier:"tier2", col:0.97 },
  tier2other: { l:"Other Tier-2 city", tier:"tier2", col:1.00 },
  tier3:      { l:"Tier-3 / small town", tier:"tier3", col:1.00 }
};
const PC_BENCH = {
  "18-22": { income:{metro:22000,tier2:13000,tier3:9000},  savings:35000,   invest:12000,   rate:8,  expenses:{metro:16000,tier2:11000,tier3:7500},  nw:35000 },
  "23-25": { income:{metro:42000,tier2:26000,tier3:19000}, savings:110000,  invest:45000,   rate:14, expenses:{metro:30000,tier2:19000,tier3:13000}, nw:130000 },
  "26-28": { income:{metro:63000,tier2:40000,tier3:26000}, savings:260000,  invest:160000,  rate:18, expenses:{metro:40000,tier2:26000,tier3:19000}, nw:380000 },
  "29-32": { income:{metro:88000,tier2:54000,tier3:36000}, savings:470000,  invest:380000,  rate:20, expenses:{metro:52000,tier2:36000,tier3:26000}, nw:750000 },
  "33-37": { income:{metro:115000,tier2:73000,tier3:50000},savings:730000,  invest:650000,  rate:23, expenses:{metro:68000,tier2:47000,tier3:33000}, nw:1300000 },
  "38-45": { income:{metro:155000,tier2:98000,tier3:67000},savings:1050000, invest:1100000, rate:25, expenses:{metro:88000,tier2:62000,tier3:44000}, nw:2200000 },
  "46+":   { income:{metro:185000,tier2:115000,tier3:82000},savings:1600000,invest:2100000, rate:28, expenses:{metro:105000,tier2:73000,tier3:52000}, nw:3700000 }
};

function pcInitCities(){
  document.getElementById("pc-city").innerHTML = Object.entries(PC_CITIES)
    .map(([k,v]) => `<option value="${k}">${v.l}</option>`).join("");
}
function pcBracket(age){
  if (age<=22) return "18-22"; if (age<=25) return "23-25"; if (age<=28) return "26-28";
  if (age<=32) return "29-32"; if (age<=37) return "33-37"; if (age<=45) return "38-45";
  return "46+";
}
/* Smooth percentile: logistic curve on the you/avg ratio — 50th at parity, no hard cliffs */
function pcPct(ratio){
  if (!isFinite(ratio) || ratio <= 0) return 1;
  return Math.min(99, Math.max(1, Math.round(100 / (1 + Math.pow(ratio, -2.2)))));
}

function pcCompare(){
  const age = Math.min(70, Math.max(18, num("pc-age")));
  const cityKey = document.getElementById("pc-city").value;
  const city = PC_CITIES[cityKey] || PC_CITIES.tier2other;
  const income = num("pc-income"), savings = num("pc-savings"), invest = num("pc-invest");
  const debt = num("pc-debt"), rate = Math.min(100, num("pc-rate")), expenses = num("pc-expenses");

  const b = PC_BENCH[pcBracket(age)];
  const avgIncome = Math.round(b.income[city.tier] * city.col);
  const avgExpenses = Math.round(b.expenses[city.tier] * city.col);
  const nw = savings + invest - debt;
  const eMonths = expenses > 0 ? Math.round(savings/expenses*10)/10 : (savings > 0 ? 99 : 0);
  const dti = income > 0 ? Math.round(debt/(income*12)*100) : 0;

  const metrics = [
    { k:"income", l:"Monthly income", i:"💰", yours:income, avg:avgIncome, money:true },
    { k:"savings", l:"Total savings", i:"🏦", yours:savings, avg:b.savings, money:true },
    { k:"invest", l:"Investments", ic:"sip", yours:invest, avg:b.invest, money:true },
    { k:"rate", l:"Savings rate", i:"📊", yours:rate, avg:b.rate, suf:"%" },
    { k:"nw", l:"Net worth", i:"👑", yours:nw, avg:b.nw, money:true },
    { k:"expenses", l:"Monthly expenses", i:"💸", yours:expenses, avg:avgExpenses, money:true, invert:true }
  ].map(m => {
    let ratio = m.avg > 0 ? m.yours/m.avg : (m.yours > 0 ? 2 : 1);
    if (m.invert) ratio = m.yours > 0 ? m.avg/m.yours : 2;
    const pct = pcPct(ratio);
    const status = pct >= 60 ? "ahead" : pct >= 40 ? "ontrack" : "behind";
    return { ...m, pct, status };
  });

  const score = Math.round(metrics.reduce((s,m) => s+m.pct, 0)/metrics.length);
  const sc = score >= 65 ? "var(--green)" : score >= 40 ? "var(--gold)" : "var(--red)";
  const scHex = score >= 65 ? "#1d7d46" : score >= 40 ? "#b08a36" : "#d70015";
  const msg = score >= 75 ? "Outstanding — you're way ahead" : score >= 60 ? "Great job — ahead of most peers"
    : score >= 45 ? "Doing okay, with room to grow" : score >= 30 ? "Time to level up" : "Let's build the plan from here";

  const sEmoji = { ahead:'<span style="color:var(--green);font-weight:700">↑</span>', ontrack:'<span style="color:var(--gold);font-weight:700">→</span>', behind:'<span style="color:var(--red);font-weight:700">↓</span>' };
  const sLabel = { ahead:"Ahead", ontrack:"On track", behind:"Behind" };

  const tips = [];
  const get = k => metrics.find(m => m.k === k);
  if (get("income").status === "ahead") tips.push(["ok","Income strength",`You earn more than the typical ${city.l} peer your age. Channel the surplus into a higher savings rate — that's where the gap compounds.`]);
  if (get("income").status === "behind") tips.push(["warn","Income gap",`You're below the ${city.l} average for your age. Upskilling, a negotiated raise or a side income moves this fastest.`]);
  if (get("savings").status === "behind") tips.push(["warn","Savings below peers",`Aim toward ${fmt(b.savings)} — start with an emergency fund, then automate the rest.`]);
  if (get("invest").status === "behind") tips.push(["warn","Investments lagging","Even a ₹2,000/month SIP started today beats a ₹10,000 SIP started in five years."]);
  if (get("invest").status === "ahead") tips.push(["ok","Strong investing game","You're ahead of peers on investments. Make sure you're diversified across asset classes, not concentrated in one bet."]);
  if (expenses > 0 && eMonths < 3) tips.push(["warn","Thin emergency buffer",`Your savings cover ${eMonths} months of expenses. Build toward 6 months (${fmt(expenses*6)}).`]);
  if (expenses > 0 && eMonths >= 6 && eMonths < 99) tips.push(["ok","Solid emergency fund",`${eMonths} months of cover — you're well prepared for surprises.`]);
  if (dti > 40) tips.push(["warn","Heavy debt load",`Debt is ${dti}% of your annual income. Clear high-interest loans before adding investments.`]);

  document.getElementById("pc-input").classList.add("hidden");
  const rs = document.getElementById("pc-result");
  rs.classList.remove("hidden");
  window.scrollTo({top:0, behavior:"instant"});

  const C = 2*Math.PI*56, off = C - (score/100)*C;
  rs.innerHTML = `
    <div class="card result-hero-anim" style="text-align:center;padding:34px 24px">
      <div style="position:relative;width:140px;height:140px;margin:0 auto 14px">
        <svg width="140" height="140" style="transform:rotate(-90deg)">
          <circle cx="70" cy="70" r="56" fill="none" stroke="var(--hair2)" stroke-width="9"/>
          <circle cx="70" cy="70" r="56" fill="none" stroke="${scHex}" stroke-width="9" stroke-linecap="round"
            stroke-dasharray="${C}" stroke-dashoffset="${off}" style="transition:stroke-dashoffset 1s ease"/>
        </svg>
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
          <div style="font-size:42px;font-weight:700;letter-spacing:-.03em;line-height:1;color:${sc}">${score}</div>
          <div style="font-size:13px;color:var(--ink3)">percentile</div>
        </div>
      </div>
      <div style="font-size:17px;font-weight:700;color:${sc}">${msg}</div>
      <div class="note" style="margin-top:4px">Among ${pcBracket(age)}-year-olds in ${city.l}</div>
    </div>

    <div style="font-size:15px;font-weight:700;margin:20px 4px 12px">Metric by metric</div>
    ${metrics.map(m => {
      const bc = m.status === "ahead" ? "#1d7d46" : m.status === "ontrack" ? "#b08a36" : "#d70015";
      const dy = m.money ? fmt(m.yours) : m.yours + (m.suf||"");
      const da = m.money ? fmt(m.avg) : m.avg + (m.suf||"");
      return `
      <div class="card" style="padding:18px 20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:9px">
          <div style="font-size:14px;font-weight:600">${m.i} ${m.l}</div>
          <div style="font-size:16px">${sEmoji[m.status]}</div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:8px">
          <span>You: <b>${dy}</b></span><span style="color:var(--ink2)">${city.l} avg: ${da}</span>
        </div>
        <div class="bar"><div class="bar-fill" style="width:${m.pct}%;background:${bc}"></div>
          <div style="position:absolute;top:-2px;left:50%;width:2px;height:12px;background:var(--ink3);border-radius:2px"></div></div>
        <div class="note" style="text-align:right;margin-top:5px">${m.pct}th percentile · ${sLabel[m.status]}</div>
      </div>`; }).join("")}

    <div class="card">
      <div style="font-size:14px;font-weight:700;margin-bottom:14px">Additional stats</div>
      <div class="grid2" style="text-align:center">
        <div style="padding:14px;background:var(--bg);border-radius:14px">
          <div style="font-size:21px;font-weight:700;color:${eMonths>=6?'var(--green)':eMonths>=3?'var(--gold)':'var(--red)'}">${eMonths>=99?'∞':eMonths}</div>
          <div class="note">Emergency months</div></div>
        <div style="padding:14px;background:var(--bg);border-radius:14px">
          <div style="font-size:21px;font-weight:700;color:${dti<20?'var(--green)':dti<40?'var(--gold)':'var(--red)'}">${dti}%</div>
          <div class="note">Debt-to-income</div></div>
        <div style="padding:14px;background:var(--bg);border-radius:14px">
          <div style="font-size:21px;font-weight:700;color:var(--purple)">${fmt(nw)}</div>
          <div class="note">Net worth</div></div>
        <div style="padding:14px;background:var(--bg);border-radius:14px">
          <div style="font-size:21px;font-weight:700;color:var(--blue)">${(savings+invest)>0?Math.round(invest/(savings+invest)*100):0}%</div>
          <div class="note">Invested ratio</div></div>
      </div>
    </div>

    ${tips.length ? `<div class="card"><div style="font-size:14px;font-weight:700;margin-bottom:12px">Personalised tips</div>
      ${tips.map(t => `<div class="tip tip-${t[0]}"><b>${t[1]}</b>${t[2]}</div>`).join("")}</div>` : ""}
    <button class="btn" onclick="pcReset()">Compare again</button>`;
  window.scrollTo({top:0});
}
function pcReset(){
  document.getElementById("pc-input").classList.remove("hidden");
  document.getElementById("pc-result").classList.add("hidden");
  window.scrollTo({top:0,behavior:"instant"});
}

/* ═══════════ REVERSE GOAL PLANNER ═══════════ */
const GP_PRESETS = [
  ["Dream house","ic-home",5000000,10],["New car","ic-car",1000000,3],["Europe trip","ic-compass",500000,2],
  ["Wedding fund","ic-award",2000000,5],["₹1 Crore club","ic-dollar",10000000,15],["Retirement","ic-sun",30000000,25]
];
const GP_PATHS = [
  { n:"Aggressive path", d:"Small + mid-cap heavy · higher volatility, higher reward", rate:.14, c:"#c2410c", inst:"Small-cap MF, mid-cap MF, international equity, sectoral funds" },
  { n:"Moderate path", d:"Large-cap + balanced · steady growth, managed risk", rate:.12, c:"#b08a36", inst:"Large-cap MF, Nifty 50 index, ELSS, balanced advantage fund" },
  { n:"Conservative path", d:"Debt + FD heavy · capital preservation first", rate:.08, c:"#0c8079", inst:"PPF, FDs, debt MF, short-duration funds, gold SGBs" }
];

function gpInitPresets(){
  document.getElementById("gp-presets").innerHTML = GP_PRESETS.map(p => `
    <div onclick="gpPreset('${p[0]}',${p[2]},${p[3]})" style="padding:13px 6px;border-radius:13px;border:1.5px solid var(--hair2);background:#fff;text-align:center;cursor:pointer;transition:all .15s" onmouseover="this.style.borderColor='var(--ink3)'" onmouseout="this.style.borderColor='var(--hair2)'">
      <span style="display:flex;justify-content:center;align-items:center;height:26px;margin-bottom:4px;color:var(--ink2)"><svg width="22" height="22"><use href="#${p[1]}"/></svg></span>
      <span style="font-size:10.5px;color:var(--ink2);font-weight:600;display:block">${p[0]}</span>
    </div>`).join("");
}
function gpPreset(name, amt, yrs){
  document.getElementById("gp-name").value = name;
  document.getElementById("gp-target").value = amt;
  document.getElementById("gp-years").value = yrs;
}
/* SIP needed (annuity-due) */
function gpSip(target, r, n){
  if (target <= 0) return 0;
  return (target * r) / ((Math.pow(1+r, n) - 1) * (1+r));
}
/* Starting SIP with 10% annual step-up — solved by simulation + binary search */
function gpStepUp(target, annualRate, years){
  if (target <= 0) return 0;
  const sim = start => {
    let bal = 0, sip = start;
    const mr = annualRate/12;
    for (let m = 0; m < years*12; m++){
      if (m > 0 && m % 12 === 0) sip *= 1.10;
      bal = (bal + sip) * (1 + mr);
    }
    return bal;
  };
  let lo = 0, hi = target;
  for (let i = 0; i < 60; i++){
    const mid = (lo+hi)/2;
    if (sim(mid) < target) lo = mid; else hi = mid;
  }
  return hi;
}

function gpCalc(){
  const name = document.getElementById("gp-name").value.trim() || "Your goal";
  const targetToday = num("gp-target");
  const years = Math.min(40, Math.max(1, num("gp-years")));
  const existing = num("gp-existing");
  const inflate = document.getElementById("gp-inflate").checked;
  if (targetToday < 1000){ alert("Please enter a target of at least ₹1,000."); return; }

  const target = inflate ? targetToday * Math.pow(1.06, years) : targetToday;

  const results = GP_PATHS.map(p => {
    const r = p.rate/12, n = years*12;
    const existingFV = existing * Math.pow(1 + p.rate, years);   // grown at this path's rate
    const need = Math.max(0, target - existingFV);
    const monthly = Math.ceil(gpSip(need, r, n));
    const stepStart = Math.ceil(gpStepUp(need, p.rate, years));
    const invested = monthly * n;
    const totalValue = monthly * ((Math.pow(1+r, n)-1)/r) * (1+r) + existingFV;
    const gains = Math.max(0, totalValue - invested - existing);

    const checkpoints = [1,2,3,5,7,10,15,20,25,30,35,40].filter(y => y <= years);
    const milestones = checkpoints.map(y => {
      const nm = y*12;
      const val = monthly * ((Math.pow(1+r, nm)-1)/r) * (1+r) + existing * Math.pow(1+p.rate, y);
      return { y, val, pct: Math.min(100, target > 0 ? val/target*100 : 0) };
    });
    return { ...p, monthly, stepStart, invested, totalValue, gains, milestones, existingFV,
             investPct: totalValue > 0 ? Math.round(invested/totalValue*100) : 0 };
  });

  document.getElementById("gp-input").classList.add("hidden");
  const rs = document.getElementById("gp-result");
  rs.classList.remove("hidden");
  window.scrollTo({top:0, behavior:"instant"});
  rs.innerHTML = `
    <div class="result-hero-anim" style="text-align:center;margin:8px 0 24px">
      <div style="font-size:38px;margin-bottom:6px">🎯</div>
      <div style="font-size:24px;font-weight:700;letter-spacing:-.015em">${esc(name)}</div>
      <div style="font-size:15px;color:var(--ink2);margin-top:4px">${fmt(target)} in ${years} years${inflate ? ` <span class="pill pill-mute" style="margin-left:4px">inflation-adjusted from ${fmt(targetToday)}</span>` : ""}</div>
      ${existing > 0 ? `<div class="note" style="margin-top:6px;color:var(--green)">Head start: ${fmt(existing)} already saved</div>` : ""}
    </div>

    ${results.map(p => `
      <div class="card result-card-anim" style="border-left:4px solid ${p.c}">
        <div style="font-size:17px;font-weight:700;color:${p.c}">${p.n}</div>
        <div class="note" style="margin:3px 0 14px">${p.d} · ~${Math.round(p.rate*100)}% CAGR</div>
        <div style="display:flex;justify-content:space-between;align-items:flex-end;padding:14px 0;border-top:1px solid var(--hair2)">
          <div>
            <div class="note">Monthly SIP needed</div>
            <div style="font-size:30px;font-weight:700;letter-spacing:-.02em;color:${p.c}">${fmt(p.monthly)}</div>
          </div>
          <div style="text-align:right">
            <div class="note">Or with 10% yearly step-up</div>
            <div style="font-size:18px;font-weight:700">${fmt(p.stepStart)} <span class="note" style="font-weight:400">to start</span></div>
          </div>
        </div>
        <table class="cmp">
          <tr><td style="color:var(--ink2)">You invest</td><td style="text-align:right;font-weight:600">${fmt(p.invested)}</td>
              <td style="color:var(--ink2);padding-left:16px">You reach</td><td style="text-align:right;font-weight:600;color:var(--green)">${fmt(p.totalValue)}</td></tr>
          <tr><td style="color:var(--ink2)">Market gains</td><td style="text-align:right;font-weight:600;color:var(--green)">${fmt(p.gains)}</td>
              <td style="color:var(--ink2);padding-left:16px">Daily feel</td><td style="text-align:right;font-weight:600">${fmt(Math.round(p.monthly/30))}/day</td></tr>
        </table>
        <div style="margin-top:12px">
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--ink2);margin-bottom:4px">
            <span>Your money ${p.investPct}%</span><span>Market gains ${100-p.investPct}%</span></div>
          <div class="bar"><div class="bar-fill" style="width:${p.investPct}%;background:${p.c}"></div></div>
        </div>
        <div class="note" style="margin-top:12px"><b style="color:var(--ink)">Suggested instruments:</b> ${p.inst}</div>
        ${p.milestones.length > 3 ? `
          <details style="margin-top:14px">
            <summary style="font-size:13px;font-weight:600;cursor:pointer;color:${p.c}">Journey milestones</summary>
            <div style="margin-top:12px;padding-left:14px;border-left:2px solid var(--hair2)">
            ${p.milestones.map(m => `
              <div style="margin-bottom:11px">
                <div style="font-size:11px;color:var(--ink3);font-weight:600">Year ${m.y}</div>
                <div style="font-size:14px;font-weight:600;color:${m.pct>=100?'var(--green)':'var(--ink)'}">${fmt(m.val)} <span class="note">(${Math.round(m.pct)}% of goal)</span></div>
              </div>`).join("")}
            </div>
          </details>` : ""}
      </div>`).join("")}

    <div class="card" style="background:var(--gold-bg)">
      <div style="font-size:13px;font-weight:700;margin-bottom:8px">Pro tips</div>
      <div class="note">Unsure which path? Start moderate — you can raise risk later. The 10% step-up option matches your SIP to salary growth and cuts the starting amount dramatically. Inflation adjustment matters: ${fmt(targetToday)} today ≈ ${fmt(targetToday*Math.pow(1.06,years))} in ${years} years at 6%. Review the plan once a year and rebalance.</div>
    </div>
    <button class="btn" onclick="gpReset()">Plan another goal</button>`;
  window.scrollTo({top:0});
}
function gpReset(){
  document.getElementById("gp-input").classList.remove("hidden");
  document.getElementById("gp-result").classList.add("hidden");
}

/* ═══════════ INIT ═══════════ */
window.__fxInit = function(){

  // Scroll reveal
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => { if(e.isIntersecting){ e.target.classList.add('visible'); revealObserver.unobserve(e.target); } });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

  // Animate numbers on home
  function animateNumber(el, target, prefix, suffix, duration) {
    const start = performance.now();
    const update = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + Math.round(target * ease) + suffix;
      if(p < 1) requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  }
  route();
  bbRenderItems("bb-needs-items", BB_NEEDS);
  bbRenderItems("bb-wants-items", BB_WANTS);
  bbRenderItems("bb-save-items", BB_SAVE);
  document.getElementById("bb-income").addEventListener("input", bbUpdate);
  bbUpdate();
  document.getElementById("et-date").value = etToday();
  etRenderCats(); etRender();
  imSteps(); imRender();
  psQuick();
  pcInitCities();
  gpInitPresets();
  lmInitGoals();
};

"use strict";
/* ═══════════ LIFEMAP ═══════════ */
const LM_GOALS = [
  {k:"home",ic:"home",l:"Own a home"},{k:"retire",ic:"sun",l:"Early retire"},
  {k:"car",ic:"car",l:"Buy a car"},{k:"abroad",ic:"compass",l:"Study abroad"},
  {k:"startup",ic:"trending",l:"Start a biz"},{k:"travel",ic:"map",l:"Travel world"},
  {k:"wedding",ic:"award",l:"Dream wedding"},{k:"debtfree",ic:"lock",l:"Debt-free"},
  {k:"passive",ic:"dollar",l:"Passive income"},{k:"parents",ic:"users",l:"Support family"},
  {k:"luxury",ic:"award",l:"Luxury life"},{k:"education",ic:"education",l:"Higher studies"}
];
const LM_CAREER_BOOST = {
  tech:1.40,finance:1.32,health:1.20,creative:0.92,govt:1.00,startup:1.60,
  engineering:1.22,education:0.86,law:1.30,consulting:1.45,sales:1.16,
  design:1.06,science:1.10,hospitality:0.86,agriculture:0.82,retail:0.96,
  defence:1.06,sports:1.00,freelance:1.12,other:1.00
};
const LM_MILESTONES = [
  {age:22,l:"Graduate",ic:"briefcase"},{age:25,l:"First raise",ic:"trending"},
  {age:30,l:"Peak growth",ic:"sip"},{age:35,l:"Mid-career",ic:"award"},
  {age:45,l:"Wealth prime",ic:"dollar"},{age:55,l:"Pre-retire",ic:"sun"},
  {age:60,l:"Retire",ic:"sun"}
];
const LM_CATS = [
  {id:"invest",i:"💰",n:"Invest"},{id:"safe",ic:"shield",n:"Stay Safe"},
  {id:"buys",ic:"home",n:"Big Buys"},{id:"earn",ic:"sip",n:"Earn More"},
  {id:"traps",i:"⚠️",n:"Avoid Traps"}
];
const LM_HEALTH_CATS = [
  {k:"savings",l:"Savings rate",c:"#1d7d46"},{k:"investment",l:"Investing",c:"#0071e3"},
  {k:"debt",l:"Debt control",c:"#b08a36"},{k:"protection",l:"Protection",c:"#0c8079"},
  {k:"growth",l:"Income growth",c:"#6e3bd4"}
];

let lmP = {};           // profile
let lmDec = [];         // decisions list
let lmApplied = new Set();
let lmCurrentAge = 22;
let lmCat = "invest";
let lmChart = null;
let lmSelectedGoals = new Set(["home"]);

function lmToggleSip(){ document.getElementById("lm-sip-wrap").classList.toggle("hidden", document.getElementById("lm-sip-yn").value !== "yes"); }
function lmToggleDebt(){
  const y = document.getElementById("lm-debt-yn").value === "yes";
  document.getElementById("lm-debt-total-wrap").classList.toggle("hidden",!y);
  document.getElementById("lm-debt-emi-wrap").classList.toggle("hidden",!y);
}

function lmInitGoals(){
  document.getElementById("lm-goals").innerHTML = LM_GOALS.map(g => `
    <div onclick="lmToggleGoal('${g.k}')" id="lmg-${g.k}"
      style="padding:11px 6px;border-radius:13px;border:1.5px solid ${lmSelectedGoals.has(g.k)?'var(--ink)':'var(--hair2)'};background:${lmSelectedGoals.has(g.k)?'#f5f5f7':'#fff'};text-align:center;cursor:pointer;transition:all .15s">
      <span style="display:flex;justify-content:center;height:24px;align-items:center;color:var(--ink2)"><svg width="19" height="19"><use href="#ic-${g.ic||'other'}"/></svg></span>
      <span style="font-size:10px;color:var(--ink2);font-weight:600;display:block;margin-top:3px">${g.l}</span>
    </div>`).join("");
}
function lmToggleGoal(k){
  if(lmSelectedGoals.has(k)) lmSelectedGoals.delete(k); else lmSelectedGoals.add(k);
  lmInitGoals();
}

function lmN(id){ const v = Number(document.getElementById(id).value); return isFinite(v)?Math.max(0,v):0; }
function lmFmt(n){
  const neg = n<0?"−":""; n=Math.abs(Math.round(n));
  if(n>=1e7) return neg+"₹"+(n/1e7).toFixed(1).replace(/\.0$/,"")+" Cr";
  if(n>=1e5) return neg+"₹"+(n/1e5).toFixed(1).replace(/\.0$/,"")+" L";
  if(n>=1000) return neg+"₹"+n.toLocaleString("en-IN");
  return neg+"₹"+n;
}
function lmFmtSh(n){
  if(Math.abs(n)>=1e7) return "₹"+(n/1e7).toFixed(1)+"Cr";
  if(Math.abs(n)>=1e5) return "₹"+Math.round(n/1e5)+"L";
  if(Math.abs(n)>=1000) return "₹"+Math.round(n/1000)+"K";
  return "₹"+Math.round(n);
}

function lmStart(){
  const age = Math.min(45, Math.max(16, lmN("lm-age") || 22));
  const income = Math.max(1, lmN("lm-income") || 30000);
  const expenses = lmN("lm-expenses") || 20000;
  const savings = lmN("lm-savings");
  let emergency = lmN("lm-emergency");
  emergency = Math.min(emergency, savings);
  const invest = lmN("lm-invest");
  const sipYn = document.getElementById("lm-sip-yn").value === "yes";
  const sip = sipYn ? (lmN("lm-sip") || 0) : 0;
  const debtYn = document.getElementById("lm-debt-yn").value === "yes";
  const debtTotal = debtYn ? lmN("lm-debt-total") : 0;
  const debtEmi = debtYn ? lmN("lm-debt-emi") : 0;
  const career = document.getElementById("lm-career").value;
  const name = document.getElementById("lm-name").value.trim() || "Friend";

  lmP = { name, age, income, expenses, savings, emergency, invest, sip, debtTotal, debtEmi, career, goals:[...lmSelectedGoals] };
  lmCurrentAge = age;
  lmApplied = new Set();

  document.getElementById("lm-setup").classList.add("hidden");
  document.getElementById("lm-app").classList.remove("hidden");

  document.getElementById("lm-greeting").textContent = "Welcome, " + name.split(" ")[0];
  document.getElementById("lm-subheading").textContent = "Your financial simulation — age " + age + " to 60";

  // Slider
  const sl = document.getElementById("lm-slider");
  sl.min = age; sl.value = age; sl.max = 60;
  document.getElementById("lm-age-badge").textContent = "Age " + age;

  // Timeline labels
  const stops = [age, Math.round(age + (60-age)*0.25), Math.round(age+(60-age)*0.5), Math.round(age+(60-age)*0.75), 60];
  document.getElementById("lm-tl-labels").innerHTML = stops.map(s=>`<span>${s}</span>`).join("");

  lmBuildMilestones();
  lmBuildDecisions();
  lmCat = "invest";
  lmBuildCatTabs();
  lmRenderDecisions();
  lmBuildHealthBars();
  lmBuildKpi();
  lmUpdateAll();
  lmInitChart();
}

function lmBack(){
  document.getElementById("lm-setup").classList.remove("hidden");
  document.getElementById("lm-app").classList.add("hidden");
  if(lmChart){ lmChart.destroy(); lmChart = null; }
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  window.scrollTo(0, 0);
}

/* ── DECISIONS ENGINE ── */
function lmBuildDecisions(){
  const p = lmP;
  const surplus = p.income - p.expenses;
  const moCov = p.emergency / Math.max(1, p.expenses);
  const needsBuffer = moCov < 3;
  const hasDebt = p.debtTotal > 0;
  const incH = p.income >= 70000;
  const incM = p.income >= 35000 && p.income < 70000;
  const young = p.age <= 25;

  const list = [];
  /* ── INVEST ── */
  if(p.sip === 0){
    const sug = Math.max(1000, Math.round(surplus * 0.30 / 500)*500);
    list.push({id:"start_sip",cat:"invest",ic:"sip",c:"rgba(0,113,227,.09)",
      t:`Start SIP of ${lmFmtSh(sug)}/mo`,
      s:"~30% of surplus into a Nifty 50 index fund — tap ✏️ to set amount",
      smart: sug*12*9, bad:0, custom:true, ck:"start", ca:sug, minAge:p.age,
      imp:`+${lmFmtSh(sug*12*15)} by 45`});
  } else {
    const top = Math.max(1000, Math.round(p.sip * 0.5 / 500)*500);
    list.push({id:"boost_sip",cat:"invest",ic:"trending",c:"rgba(0,113,227,.09)",
      t:`Step up SIP by ${lmFmtSh(top)}/mo`,
      s:`Currently investing ${lmFmtSh(p.sip)}/mo — tap ✏️ to customise`,
      smart: top*12*8, bad:0, custom:true, ck:"stepup", ca:top, minAge:p.age,
      imp:`+${lmFmtSh(top*12*12)} by 45`});
    list.push({id:"stepup_10",cat:"invest",ic:"arrow-up",c:"rgba(12,128,121,.09)",
      t:"Increase SIP 10% every year",
      s:"Match SIP growth to salary increments",
      smart: p.sip*12*7, bad:0, custom:false, minAge:p.age,
      imp:`+${lmFmtSh(p.sip*12*22)} extra`});
  }
  list.push({id:"diversify",cat:"invest",ic:"layers",c:"rgba(0,113,227,.09)",
    t:"Diversify: equity + debt + gold",
    s:"Spread risk rather than concentrating in one bet",
    smart: (p.invest||0)*0.35 + p.income*12, bad:0, custom:false, minAge:p.age,
    imp:"Smoother long-term growth"});
  list.push({id:"nps",cat:"invest",ic:"sun",c:"rgba(12,128,121,.09)",
    t:"Start NPS / PPF for retirement",
    s:"Tax-saving + locked long-term compounding under EEE",
    smart: p.income*12*5, bad:0, custom:false, minAge:p.age,
    imp:`+${lmFmtSh(p.income*12*8)} by 60`});
  list.push({id:"elss",cat:"invest",ic:"bills",c:"rgba(176,138,54,.1)",
    t:"Maximise ELSS to save ₹46,800 tax/yr",
    s:"₹1.5L/year in ELSS covers 80C — equity returns + tax free",
    smart: p.income*12*1.5, bad:0, custom:false, minAge:p.age,
    imp:`+${lmFmtSh(p.income * 3)} in tax savings`});

  /* ── SAFE ── */
  if(needsBuffer){
    const gap = Math.max(0, p.expenses*6 - p.emergency);
    list.push({id:"build_buffer",cat:"safe",ic:"shield",c:"rgba(29,125,70,.09)",
      t:`Build emergency fund (gap: ${lmFmtSh(gap)})`,
      s:`Only ${moCov.toFixed(1)} months covered — target 6 months = ${lmFmtSh(p.expenses*6)}`,
      smart: gap*0.85, bad:0, custom:false, minAge:p.age,
      imp:"+Safety & score"});
  }
  list.push({id:"insurance",cat:"safe",ic:"health",c:"rgba(29,125,70,.09)",
    t:"Get health + term life insurance",
    s:"One hospital bill without cover can wipe years of savings",
    smart: p.savings*0.55, bad:-p.expenses*24, custom:false, minAge:p.age,
    imp:`Shields ${lmFmtSh(p.savings*3)}`});
  if(hasDebt){
    list.push({id:"paydebt",cat:"safe",ic:"check",c:"rgba(29,125,70,.09)",
      t:`Prepay debt (${lmFmtSh(p.debtTotal)} outstanding)`,
      s:"Pay more than the EMI — interest saved is a guaranteed return",
      smart: p.debtTotal*0.42, bad:0, custom:false, minAge:p.age,
      imp:`+${lmFmtSh(p.debtTotal*0.42)} saved`});
  }
  list.push({id:"ccwise",cat:"safe",ic:"emi",c:"rgba(29,125,70,.09)",
    t:"Use credit card wisely (pay in full)",
    s:"Never revolve balance. Earn rewards, build credit score.",
    smart: p.expenses*3, bad:0, custom:false, minAge:p.age,
    imp:"+Credit score & rewards"});
  list.push({id:"nominees",cat:"safe",ic:"bills",c:"rgba(29,125,70,.09)",
    t:"Add nominees & write a basic will",
    s:"Ensures your wealth reaches your family smoothly",
    smart: p.savings*0.1, bad:0, custom:false, minAge:p.age,
    imp:"Peace of mind"});

  /* ── BIG BUYS ── */
  const homeLoan = incH ? 70e5 : incM ? 40e5 : 25e5;
  if(incH || incM){
    list.push({id:"buy_home",cat:"buys",ic:"home",c:"rgba(12,128,121,.09)",
      t:`Buy a home (loan ~${lmFmtSh(homeLoan)})`,
      s:"Builds equity vs renting — good if you plan to stay 7+ years",
      smart: homeLoan*0.65, bad:-homeLoan*0.28, custom:false, minAge:Math.max(p.age,27),
      imp:`+${lmFmtSh(homeLoan*0.65)} equity by 45`});
  }
  const carLoan = incH ? 14e5 : 8e5;
  list.push({id:"buy_car_loan",cat:"buys",ic:"car",c:"rgba(215,0,21,.07)",
    t:`Buy car on loan (~${lmFmtSh(carLoan)})`,
    s:surplus < 15000 ? "⚠️ EMI will strain your tight budget" : "Depreciating asset — consider whether you need it",
    smart:0, bad:-carLoan*1.38, custom:false, minAge:p.age,
    imp:`−${lmFmtSh(carLoan*1.38)} net`});
  list.push({id:"buy_car_cash",cat:"buys",ic:"car",c:"rgba(29,125,70,.09)",
    t:"Buy a used car outright in cash",
    s:"Skip the EMI & heavy depreciation — smart if you save first",
    smart: carLoan*0.42, bad:0, custom:false, minAge:p.age,
    imp:`Saves ${lmFmtSh(carLoan*0.55)}`});
  list.push({id:"big_wedding",cat:"buys",ic:"award",c:"rgba(215,0,21,.07)",
    t:"Finance a big-fat wedding",
    s:"Borrowing for one day can delay goals by 3–5 years",
    smart:0, bad:-p.income*18, custom:false, minAge:p.age,
    imp:`−${lmFmtSh(p.income*18)}`});

  /* ── EARN ── */
  const cCost = incH ? 150000 : incM ? 75000 : 40000;
  const hikePct = young ? 40 : 28;
  list.push({id:"upskill",cat:"earn",ic:"briefcase",c:"rgba(176,138,54,.1)",
    t:`Upskill — ${lmFmtSh(cCost)} course, ~${hikePct}% raise`,
    s:`Certification / PG in your field can fast-track income by ${hikePct}%`,
    smart: p.income*12*(hikePct/100)*5, bad:0, custom:false, minAge:p.age,
    imp:`+${lmFmtSh(p.income*12*(hikePct/100)*10)} lifetime`});
  const hustle = surplus < 10000 ? 12000 : 22000;
  list.push({id:"sidehustle",cat:"earn",ic:"zap",c:"rgba(110,59,212,.09)",
    t:`Side hustle (~${lmFmtSh(hustle)}/mo extra)`,
    s: surplus < 10000 ? "Your surplus is thin — any extra income is high-leverage" : "Turbocharge your investing runway",
    smart: hustle*12*6, bad:0, custom:false, minAge:p.age,
    imp:`+${lmFmtSh(hustle*12*10)} over 10 yrs`});
  list.push({id:"switchjob",cat:"earn",ic:"refresh",c:"rgba(176,138,54,.1)",
    t:"Switch jobs for a 30% raise",
    s:"Strategic switches consistently outpace annual increments",
    smart: p.income*12*0.30*5, bad:0, custom:false, minAge:p.age,
    imp:`+${lmFmtSh(p.income*12*0.30*8)}`});
  list.push({id:"negotiate",cat:"earn",ic:"users",c:"rgba(176,138,54,.1)",
    t:"Negotiate salary every year",
    s:"Most people never ask — those who do earn meaningfully more",
    smart: p.income*12*2.2, bad:0, custom:false, minAge:p.age,
    imp:`+${lmFmtSh(p.income*12*0.5)}`});
  list.push({id:"passive",cat:"earn",ic:"layers",c:"rgba(12,128,121,.09)",
    t:"Build a passive income stream",
    s:"Rental yield, dividends, or monetised content — income while you sleep",
    smart: p.income*12*3, bad:0, custom:false, minAge:p.age,
    imp:`+${lmFmtSh(p.income*6)}/yr eventually`});

  /* ── TRAPS ── */
  list.push({id:"ccdebt",cat:"traps",ic:"emi",c:"rgba(215,0,21,.07)",
    t:"Revolve credit card balance",
    s:"Paying only minimum due at 36%–42% annual interest — pure wealth destruction",
    smart:0, bad:-p.expenses*12, custom:false, minAge:p.age,
    imp:`−${lmFmtSh(p.expenses*12)}`});
  list.push({id:"lifestyle_creep",cat:"traps",ic:"shopping",c:"rgba(215,0,21,.07)",
    t:"Upgrade lifestyle with every raise",
    s:"Spending rises as fast as income — savings stay flat forever",
    smart:0, bad:-p.income*12*0.85, custom:false, minAge:p.age,
    imp:`−${lmFmtSh(p.income*12*0.85)}`});
  list.push({id:"fno",cat:"traps",ic:"warn",c:"rgba(215,0,21,.07)",
    t:"Trade F&O / meme coins",
    s:"90%+ of retail F&O traders lose money — SEBI data 2024",
    smart:0, bad:-(p.savings*0.65), custom:false, minAge:p.age,
    imp:`−${lmFmtSh(p.savings*0.65)}`});
  list.push({id:"bnpl",cat:"traps",ic:"subs",c:"rgba(215,0,21,.07)",
    t:"Buy gadgets on BNPL / EMI every year",
    s:"Latest phone every upgrade cycle — hidden interest + lifestyle trap",
    smart:0, bad:-p.expenses*5, custom:false, minAge:p.age,
    imp:`−${lmFmtSh(p.expenses*5)}`});
  list.push({id:"notrack",cat:"traps",ic:"warn",c:"rgba(215,0,21,.07)",
    t:"Never track spending",
    s:"Untracked money leaks 15–20% of income — invisible losses compound",
    smart:0, bad:-p.income*12*0.55, custom:false, minAge:p.age,
    imp:`−${lmFmtSh(p.income*12*0.55)}`});
  list.push({id:"lend_friends",cat:"traps",ic:"users",c:"rgba(215,0,21,.07)",
    t:"Lend large sums to friends informally",
    s:"Often never returned — both money and friendship lost",
    smart:0, bad:-p.savings*0.28, custom:false, minAge:p.age,
    imp:`−${lmFmtSh(p.savings*0.28)}`});
  list.push({id:"noinsure",cat:"traps",ic:"health",c:"rgba(215,0,21,.07)",
    t:"Skip health insurance to save premium",
    s:"A single hospitalisation without cover erases years of savings",
    smart:0, bad:-p.expenses*36, custom:false, minAge:p.age,
    imp:`−${lmFmtSh(p.expenses*36)}`});

  lmDec = list;
}

function lmBuildCatTabs(){
  document.getElementById("lm-cat-tabs").innerHTML = LM_CATS.map(c => {
    const cnt = lmDec.filter(d => d.cat === c.id).length;
    if(!cnt) return "";
    const on = lmCat === c.id;
    return `<div onclick="lmSelCat('${c.id}')" style="display:flex;align-items:center;gap:5px;padding:7px 13px;border-radius:980px;border:1px solid ${on?'var(--ink)':'var(--hair2)'};background:${on?'var(--ink)':'#fff'};color:${on?'#fff':'var(--ink2)'};font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all .2s">${c.i} ${c.n} <span style="opacity:.7;font-size:10px">${cnt}</span></div>`;
  }).join("");
}
function lmSelCat(id){ lmCat = id; lmBuildCatTabs(); lmRenderDecisions(); }

function lmRenderDecisions(){
  const shown = lmDec.filter(d => d.cat === lmCat);
  document.getElementById("lm-decisions").innerHTML = shown.map(d => {
    const on = lmApplied.has(d.id);
    const good = d.smart > 0;
    return `
    <div onclick="lmTogDec('${d.id}')" id="lmd-${d.id}" style="display:flex;align-items:center;gap:13px;padding:14px 16px;border-radius:14px;border:1.5px solid ${on?(good?'rgba(29,125,70,.3)':'rgba(215,0,21,.25)'):'var(--hair2)'};background:${on?(good?'rgba(29,125,70,.04)':'rgba(215,0,21,.03)'):'#fff'};margin-bottom:8px;cursor:pointer;transition:all .2s">
      <div style="width:40px;height:40px;border-radius:12px;background:${d.c};display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--ink)"><svg width="18" height="18"><use href="#ic-${d.ic||'other'}"/></svg></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:600">${d.t}</div>
        <div style="font-size:12px;color:var(--ink2);margin-top:2px;line-height:1.4">${d.s}</div>
      </div>
      ${d.custom ? `<div style="font-size:11px;color:var(--blue);flex-shrink:0">✏️</div>` : ""}
      <div style="font-size:13px;font-weight:700;color:${good?'var(--green)':'var(--red)'};flex-shrink:0">${d.imp}</div>
      ${on ? `<div style="width:22px;height:22px;border-radius:50%;background:${good?'rgba(29,125,70,.12)':'rgba(215,0,21,.1)'};display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0">${good?'✓':'!'}</div>` : ""}
    </div>`;
  }).join("");
}

function lmTogDec(id){
  const d = lmDec.find(x => x.id === id);
  if(!d) return;
  if(d.custom && !lmApplied.has(id)){ lmOpenDialog(d); return; }
  if(lmApplied.has(id)) lmApplied.delete(id); else lmApplied.add(id);
  lmRenderDecisions();
  lmUpdateAll();
}

function lmOpenDialog(d){
  const ex = document.getElementById("lm-dialog");
  if(ex) ex.remove();
  const isStart = d.ck === "start";
  const div = document.createElement("div");
  div.id = "lm-dialog";
  div.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:100;padding:20px";
  div.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:28px;max-width:360px;width:100%;box-shadow:0 24px 60px rgba(0,0,0,.18)">
      <div style="font-size:17px;font-weight:700;margin-bottom:6px">${isStart?"Set your monthly SIP":"Step up your SIP"}</div>
      <div style="font-size:13px;color:var(--ink2);margin-bottom:18px;line-height:1.55">${isStart?"How much do you want to invest every month?":"You invest "+lmFmtSh(lmP.sip)+"/mo. How much extra do you want to add monthly?"}</div>
      <input id="lm-d-amt" class="fi" type="number" min="500" step="500" value="${d.ca}" inputmode="numeric" style="margin-bottom:16px">
      <div style="display:flex;gap:10px">
        <button onclick="document.getElementById('lm-dialog').remove()" style="flex:1;padding:13px;border-radius:980px;border:1px solid var(--hair);background:transparent;font-size:14px;font-weight:600;cursor:pointer">Cancel</button>
        <button onclick="lmConfirmDialog('${d.id}')" style="flex:2;padding:13px;border-radius:980px;border:none;background:var(--ink);color:#fff;font-size:14px;font-weight:600;cursor:pointer">Confirm</button>
      </div>
    </div>`;
  div.addEventListener("click", e => { if(e.target === div) div.remove(); });
  document.body.appendChild(div);
  setTimeout(() => { const i = document.getElementById("lm-d-amt"); if(i){ i.focus(); i.select(); } }, 50);
}

document.addEventListener("keydown", e => {
  const dlg = document.getElementById("lm-dialog");
  if(!dlg) return;
  if(e.key === "Escape") dlg.remove();
  if(e.key === "Enter" && document.activeElement === document.getElementById("lm-d-amt")){
    const btn = dlg.querySelector("button:last-child");
    if(btn) btn.click();
  }
});

function lmConfirmDialog(id){
  const amt = Math.max(500, lmN("lm-d-amt") || 1000);
  const d = lmDec.find(x => x.id === id);
  if(d){
    d.ca = amt;
    if(d.ck === "start"){
      d.t = `Start SIP of ${lmFmtSh(amt)}/mo`;
      d.imp = `+${lmFmtSh(amt*12*15)} by 45`;
      d.smart = amt*12*9;
    } else {
      d.t = `Step up SIP by ${lmFmtSh(amt)}/mo`;
      d.imp = `+${lmFmtSh(amt*12*12)} by 45`;
      d.smart = amt*12*8;
    }
    lmApplied.add(id);
  }
  document.getElementById("lm-dialog").remove();
  lmBuildCatTabs();
  lmRenderDecisions();
  lmUpdateAll();
}

/* ── MILESTONES ── */
function lmBuildMilestones(){
  const p = lmP;
  const relevant = LM_MILESTONES.filter(m => m.age >= p.age - 1 && m.age <= 60);
  document.getElementById("lm-milestones").innerHTML = `
    <div style="position:absolute;top:8px;left:0;right:0;height:1px;background:var(--hair2)"></div>
    ${relevant.map(m => `
    <div style="display:flex;flex-direction:column;align-items:center;gap:4px;position:relative">
      <div id="lmmd-${m.age}" style="width:16px;height:16px;border-radius:50%;border:2px solid var(--hair2);background:#fff;transition:all .3s;cursor:default;z-index:1;box-sizing:border-box" title="${m.l}"></div>
      <div style="font-size:10px;color:var(--ink3)">${m.age}</div>
      <div style="font-size:10px;color:var(--ink3);text-align:center;max-width:56px">${m.l}</div>
    </div>`).join("")}`;
}
function lmUpdateMilestones(age){
  LM_MILESTONES.forEach(m => {
    const d = document.getElementById("lmmd-"+m.age);
    if(d){ if(age >= m.age){ d.style.background="var(--ink)"; d.style.borderColor="var(--ink)"; } else { d.style.background="#fff"; d.style.borderColor="var(--hair2)"; } }
  });
}

/* ── SIMULATION ENGINE ── */
function lmCalcWealth(age, smart){
  const p = lmP;
  const years = age - p.age;
  if(years < 0) return p.savings + p.invest - p.debtTotal;
  const netStart = p.savings + p.invest - p.debtTotal;
  const surplus = p.income - p.expenses;
  const gr = smart ? 0.115 : 0.038;   // realistic: diversified equity ~11.5%, impulsive parks in savings
  const annualSurplus = surplus * 12;
  const annualSip = p.sip * 12;
  const cb = LM_CAREER_BOOST[p.career] || 1.0;

  // Existing pot compounds
  let base = netStart * Math.pow(1 + gr, years);
  // Annual surplus: smart allocates 68%, impulsive only 18%
  if(annualSurplus > 0){
    base += annualSurplus * (Math.pow(1+gr, years) - 1) / gr * (smart ? 0.68 : 0.18);
  }
  // Existing SIP
  if(annualSip > 0){
    base += annualSip * (Math.pow(1+gr, years) - 1) / gr;
  }
  // Decision impacts — scale by years/lifespan
  let bonus = 0;
  const lifespan = Math.max(1, 60 - p.age);
  lmDec.forEach(d => {
    if(lmApplied.has(d.id) && age >= d.minAge){
      const frac = Math.min(1, years / lifespan);
      bonus += (smart ? d.smart : d.bad) * frac;
    }
  });
  // Trap decisions reduce smart path too (you can't be smart AND gamble)
  const badDecisions = ["ccdebt","lifestyle_creep","fno","bnpl","notrack","lend_friends","noinsure","buy_car_loan","big_wedding"];
  let smartPenalty = 0;
  if(smart){
    badDecisions.forEach(id => {
      if(lmApplied.has(id)){
        const d = lmDec.find(x => x.id === id);
        if(d) smartPenalty += d.bad * Math.min(1, years/lifespan) * 0.5;
      }
    });
  }
  return Math.max(0, (base * (smart ? cb : 1.0)) + bonus + (smart ? smartPenalty : 0));
}

function lmCalcScore(){
  const p = lmP;
  const surplus = p.income - p.expenses;
  const savR = surplus / Math.max(1, p.income);
  const moCov = p.emergency / Math.max(1, p.expenses);
  const emiR = p.debtEmi / Math.max(1, p.income);

  // Emergency fund auto-scores
  let efPts = moCov >= 6 ? 18 : moCov >= 3 ? 13 : moCov >= 1 ? 6 : 0;
  // Invest auto-scores
  let invPts = (p.sip > 0 ? 22 : p.invest > 0 ? 12 : 0)
    + (lmApplied.has("start_sip") ? 22 : 0)
    + (lmApplied.has("boost_sip") ? 10 : 0)
    + (lmApplied.has("stepup_10") ? 6 : 0)
    + (lmApplied.has("diversify") ? 5 : 0)
    + (lmApplied.has("nps") ? 5 : 0)
    + (lmApplied.has("elss") ? 5 : 0);
  // Protection
  let protPts = (lmApplied.has("insurance") ? 12 : 0)
    + (lmApplied.has("build_buffer") ? 10 : 0)
    + (lmApplied.has("nominees") ? 4 : 0);
  // Income growth
  let earnPts = (lmApplied.has("upskill") ? 8 : 0)
    + (lmApplied.has("sidehustle") ? 8 : 0)
    + (lmApplied.has("switchjob") ? 5 : 0)
    + (lmApplied.has("negotiate") ? 5 : 0)
    + (lmApplied.has("passive") ? 5 : 0);
  // Debt
  let debtPts = emiR >= 0.40 ? -15 : emiR >= 0.25 ? -8 : emiR > 0 ? -3 : 0;
  if(lmApplied.has("paydebt")) debtPts = Math.round(debtPts / 2);
  if(lmApplied.has("ccwise")) debtPts += 6;
  // Bad decisions
  let badPts = (lmApplied.has("ccdebt") ? -20 : 0)
    + (lmApplied.has("lifestyle_creep") ? -14 : 0)
    + (lmApplied.has("fno") ? -16 : 0)
    + (lmApplied.has("bnpl") ? -8 : 0)
    + (lmApplied.has("notrack") ? -9 : 0)
    + (lmApplied.has("lend_friends") ? -6 : 0)
    + (lmApplied.has("noinsure") ? -11 : 0)
    + (lmApplied.has("buy_car_loan") ? -5 : 0)
    + (lmApplied.has("big_wedding") ? -8 : 0);

  const raw = Math.round((savR * 28) + Math.min(30, invPts) + efPts + protPts + earnPts + debtPts + badPts + 5);
  return Math.min(100, Math.max(0, raw));
}

function lmCalcHealth(){
  const p = lmP;
  const surplus = p.income - p.expenses;
  const savR = Math.min(1, surplus / Math.max(1, p.income));
  const moCov = p.emergency / Math.max(1, p.expenses);
  const emiR = p.debtEmi / Math.max(1, p.income);

  let savings = Math.round(savR * 200);
  savings = Math.min(100, Math.max(0, savings));

  let investment = p.sip > 0 ? 72 : p.invest > 0 ? 48 : 10;
  if(lmApplied.has("start_sip")) investment = 78;
  if(lmApplied.has("boost_sip") || lmApplied.has("stepup_10")) investment = Math.min(100, investment+14);
  if(lmApplied.has("diversify")) investment = Math.min(100, investment+8);
  if(lmApplied.has("nps") || lmApplied.has("elss")) investment = Math.min(100, investment+6);
  if(lmApplied.has("fno")) investment = Math.max(5, investment-28);

  let debt = emiR >= 0.40 ? 38 : emiR >= 0.25 ? 60 : emiR > 0 ? 78 : 92;
  if(lmApplied.has("paydebt")) debt = Math.min(100, debt+14);
  if(lmApplied.has("ccwise")) debt = Math.min(100, debt+7);
  if(lmApplied.has("ccdebt")) debt = Math.min(debt, 8);
  if(lmApplied.has("buy_car_loan")) debt = Math.min(debt, 55);
  if(lmApplied.has("bnpl")) debt = Math.max(0, debt-18);
  if(lmApplied.has("lifestyle_creep")) debt = Math.max(0, debt-18);
  if(lmApplied.has("notrack")) debt = Math.max(0, debt-14);
  debt = Math.min(100, Math.max(0, debt));

  let protection = moCov >= 6 ? 78 : moCov >= 3 ? 58 : moCov >= 1 ? 32 : 12;
  if(lmApplied.has("build_buffer")) protection = Math.max(protection, 68);
  if(lmApplied.has("insurance")) protection = Math.min(100, protection+20);
  if(lmApplied.has("nominees")) protection = Math.min(100, protection+7);
  if(lmApplied.has("noinsure")) protection = Math.max(5, protection-28);
  if(lmApplied.has("lend_friends")) protection = Math.max(5, protection-10);

  let growth = 35;
  if(lmApplied.has("upskill")) growth = 88;
  else if(lmApplied.has("switchjob")) growth = 75;
  else if(lmApplied.has("sidehustle")) growth = 68;
  else if(lmApplied.has("negotiate")) growth = 58;
  else if(lmApplied.has("passive")) growth = 52;

  return { savings, investment, debt, protection, growth };
}

/* ── RENDER ── */
function lmBuildKpi(){
  document.getElementById("lm-kpi").innerHTML = `
    <div class="stat-cell"><div class="v" id="lm-kpi-nw">₹0</div><div class="l">Net worth</div></div>
    <div class="stat-cell"><div class="v" id="lm-kpi-sav">₹0</div><div class="l">Monthly surplus</div></div>
    <div class="stat-cell"><div class="v" id="lm-kpi-score" style="color:var(--purple)">0</div><div class="l">Financial score</div></div>
    <div class="stat-cell"><div class="v" id="lm-kpi-dec">0</div><div class="l">Decisions activated</div></div>`;
}

function lmBuildHealthBars(){
  document.getElementById("lm-health-bars").innerHTML = LM_HEALTH_CATS.map(c => `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:9px">
      <div style="font-size:12px;color:var(--ink2);width:86px;flex-shrink:0">${c.l}</div>
      <div style="flex:1;height:6px;background:var(--bg);border-radius:6px;overflow:hidden"><div id="lmhb-${c.k}" style="height:100%;border-radius:6px;background:${c.c};transition:width .6s ease;width:0%"></div></div>
      <div style="font-size:11px;font-weight:600;width:28px;text-align:right" id="lmhbv-${c.k}">0</div>
    </div>`).join("");
}

function lmUpdateAll(){
  const age = lmCurrentAge;
  const sNW = lmCalcWealth(age, true);
  const iNW = lmCalcWealth(age, false);
  const score = lmCalcScore();
  const surplus = lmP.income - lmP.expenses;

  // KPIs
  const nwEl = document.getElementById("lm-kpi-nw");
  if(nwEl){ nwEl.textContent = lmFmt(sNW); nwEl.style.color = sNW >= 0 ? "var(--green)" : "var(--red)"; }
  const savEl = document.getElementById("lm-kpi-sav");
  if(savEl){ savEl.textContent = lmFmt(surplus); savEl.style.color = surplus >= 0 ? "var(--ink)" : "var(--red)"; }
  const scEl = document.getElementById("lm-kpi-score");
  if(scEl) scEl.textContent = score;
  const decEl = document.getElementById("lm-kpi-dec");
  if(decEl) decEl.textContent = lmApplied.size + "/" + lmDec.length;

  // Score ring
  const ring = document.getElementById("lm-score-ring");
  const snum = document.getElementById("lm-score-num");
  const stit = document.getElementById("lm-score-title");
  if(ring) ring.style.strokeDashoffset = 251.2 - (score/100)*251.2;
  if(snum) snum.textContent = score;
  const titles = ["Just starting","Building base","On track","Strong foundation","Wealth builder","Financial pro"];
  if(stit) stit.textContent = titles[Math.floor(score/20)] || "Financial pro";

  // Health bars
  const hb = lmCalcHealth();
  LM_HEALTH_CATS.forEach(c => {
    const f = document.getElementById("lmhb-"+c.k);
    const v = document.getElementById("lmhbv-"+c.k);
    const val = hb[c.k] || 0;
    if(f) f.style.width = val + "%";
    if(v) v.textContent = val;
  });

  // Age badge
  const ab = document.getElementById("lm-age-badge");
  if(ab) ab.textContent = "Age " + age;

  // Milestones
  lmUpdateMilestones(age);

  // Compare
  const compareAt = Math.max(40, age);
  const s40 = lmCalcWealth(compareAt, true);
  const i40 = lmCalcWealth(compareAt, false);
  const diff = Math.abs(s40 - i40);
  const caEl = document.getElementById("lm-compare-age");
  const cdEl = document.getElementById("lm-compare-diff");
  if(caEl) caEl.textContent = compareAt;
  if(cdEl) cdEl.textContent = lmFmt(diff);
  const sDebt = lmApplied.has("paydebt") ? 0 : Math.round((lmP.debtTotal||0) * 0.15);
  const iDebt = Math.round((lmP.debtTotal||0) * 0.85 + i40 * 0.22);
  ["lm-c-s-nw","lm-c-s-inv","lm-c-s-debt","lm-c-i-nw","lm-c-i-inv","lm-c-i-debt"].forEach(id => {
    const el = document.getElementById(id);
    if(!el) return;
    if(id === "lm-c-s-nw") el.textContent = lmFmt(s40);
    if(id === "lm-c-s-inv") el.textContent = lmFmt(s40 * 0.62);
    if(id === "lm-c-s-debt") el.textContent = lmFmt(sDebt);
    if(id === "lm-c-i-nw") el.textContent = lmFmt(i40);
    if(id === "lm-c-i-inv") el.textContent = lmFmt(i40 * 0.18);
    if(id === "lm-c-i-debt") el.textContent = lmFmt(iDebt);
  });

  // Chart
  lmUpdateChart();
}

/* ── CHART ── */
function lmInitChart(){
  const ctx = document.getElementById("lm-chart");
  if(!ctx) return;
  if(lmChart){ lmChart.destroy(); }
  const ages = Array.from({length: 60 - lmP.age + 1}, (_,i) => lmP.age + i);
  lmChart = new Chart(ctx, {
    type:"line",
    data:{
      labels: ages,
      datasets:[
        { label:"Smart", data: ages.map(a => lmCalcWealth(a,true)),
          borderColor:"#1d1d1f", backgroundColor:"rgba(29,29,31,.06)", fill:true,
          tension:.4, borderWidth:2, pointRadius:0 },
        { label:"Impulsive", data: ages.map(a => lmCalcWealth(a,false)),
          borderColor:"#d70015", backgroundColor:"rgba(215,0,21,.04)", fill:true,
          tension:.4, borderWidth:2, pointRadius:0 }
      ]
    },
    options:{
      responsive:true, animation:{duration:450},
      plugins:{
        legend:{display:false},
        tooltip:{
          backgroundColor:"#fff", borderColor:"#d2d2d7", borderWidth:1,
          titleColor:"#1d1d1f", bodyColor:"#6e6e73",
          callbacks:{ label: c => " " + lmFmt(c.raw) }
        }
      },
      scales:{
        x:{ ticks:{color:"#86868b", font:{size:10}, maxTicksLimit:8}, grid:{color:"rgba(0,0,0,.04)"} },
        y:{ ticks:{color:"#86868b", font:{size:10}, callback: v => lmFmt(v)}, grid:{color:"rgba(0,0,0,.04)"} }
      }
    }
  });
}

function lmUpdateChart(){
  if(!lmChart) return;
  const ages = Array.from({length: 60 - lmP.age + 1}, (_,i) => lmP.age + i);
  lmChart.data.datasets[0].data = ages.map(a => lmCalcWealth(a, true));
  lmChart.data.datasets[1].data = ages.map(a => lmCalcWealth(a, false));
  lmChart.update();
}

function lmSlide(el){
  lmCurrentAge = parseInt(el.value);
  lmUpdateAll();
}

/* ── HOME CARD ADD ── */
// Hook existing home tool-card click to navigate (tool-cards use href directly)

/* ── Animated submit wrappers ── */
function pcSubmitAnim(){
  const btn = document.getElementById("pc-submit-btn");
  btnLoading(btn, "Analysing your data…");
  setTimeout(() => { btnDone(btn); pcCompare(); }, 600);
}
function psSubmitAnim(){
  const btn = document.getElementById("ps-submit-btn");
  btnLoading(btn, "Comparing options…");
  setTimeout(() => { btnDone(btn); psCalc(); }, 500);
}
function gpSubmitAnim(){
  const btn = document.getElementById("gp-submit-btn");
  btnLoading(btn, "Plotting your path…");
  setTimeout(() => { btnDone(btn); gpCalc(); }, 550);
}
function imBuildAnim(){
  const btn = document.getElementById("im-build-btn");
  if(btn){ btnLoading(btn, "Building portfolio…"); }
  setTimeout(() => { if(btn) btnDone(btn); imBuild(); }, 500);
}
function lmSubmitAnim(){
  const btn = document.getElementById("lm-submit-btn");
  btnLoading(btn, "Simulating your life…");
  setTimeout(() => { btnDone(btn); lmStart(); }, 700);
}

/* ===== FinatriX cloud-sync patch (added by integration) ===== */
window.fxSnapshotInputs = function(){
  var root = document.getElementById('fx-tools-root'); if(!root) return;
  var o = {};
  root.querySelectorAll('input[id], select[id], textarea[id]').forEach(function(el){
    if(el.type==='checkbox'||el.type==='radio') o[el.id] = el.checked ? '1':'';
    else o[el.id] = el.value;
  });
  try { store.set('fx_inputs', JSON.stringify(o)); } catch(e){}
};
window.fxRestoreInputs = function(){
  var o = {}; try { o = JSON.parse(store.get('fx_inputs','{}')) || {}; } catch(e){}
  Object.keys(o).forEach(function(id){
    var el = document.getElementById(id); if(!el) return;
    if(el.type==='checkbox'||el.type==='radio') el.checked = !!o[id];
    else el.value = o[id];
  });
};
// Persist Budget Builder item amounts (bbVals) which have no element ids
window.fxSaveBudget = function(){
  try {
    store.set('fx_budgetbuilder', JSON.stringify({
      vals: bbVals,
      income: (document.getElementById('bb-income')||{}).value || '',
      n: (document.getElementById('bb-pct-needs')||{}).value || '',
      w: (document.getElementById('bb-pct-wants')||{}).value || '',
      s: (document.getElementById('bb-pct-save')||{}).value || ''
    }));
  } catch(e){}
};
window.fxRestoreBudget = function(){
  try {
    var d = JSON.parse(store.get('fx_budgetbuilder','null'));
    if(!d) return;
    if(d.vals) Object.keys(d.vals).forEach(function(k){ bbVals[k] = d.vals[k]; });
    var set = function(id,v){ var el=document.getElementById(id); if(el && v!=='') el.value=v; };
    set('bb-income', d.income); set('bb-pct-needs', d.n);
    set('bb-pct-wants', d.w); set('bb-pct-save', d.s);
  } catch(e){}
};
// Wrap bbUpdate to auto-save after every change
(function(){
  if (typeof bbUpdate === 'function') {
    var _orig = bbUpdate;
    bbUpdate = function(){ var r = _orig.apply(this, arguments); window.fxSaveBudget(); return r; };
    window.bbUpdate = bbUpdate;
  }
})();
// Refresh in-memory runtime data from the (freshly hydrated) store. Called when
// the signed-in account changes so cloud data replaces the previous session's.
window.fxReloadData = function(){
  try { etItems = JSON.parse(store.get('fx_expenses','[]')) || []; if(!Array.isArray(etItems)) etItems = []; } catch(e){ etItems = []; }
  etBudget = Math.max(0, Number(store.get('fx_budget','0')) || 0);
};
// Full (re)initialisation entry used by React on every mount
window.fxMountTools = function(){
  if (typeof window.__fxInit === 'function') {
    window.fxReloadData();             // pull latest expenses/budget from store
    window.fxRestoreBudget();          // restore budget vals before items render
    window.__fxInit();                  // original init (renders everything, routes)
    window.fxRestoreInputs();           // restore calculator form fields
    if (typeof bbRenderItems === 'function') {
      try {
        bbRenderItems('bb-needs-items', BB_NEEDS);
        bbRenderItems('bb-wants-items', BB_WANTS);
        bbRenderItems('bb-save-items', BB_SAVE);
        bbUpdate();
      } catch(e){}
    }
    var root = document.getElementById('fx-tools-root');
    if (root && !root.__fxBound) {
      root.__fxBound = true;
      root.addEventListener('input', window.fxSnapshotInputs);
      root.addEventListener('change', window.fxSnapshotInputs);
    }
  }
};
