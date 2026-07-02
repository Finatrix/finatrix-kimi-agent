import { useCallback, useEffect, useRef, useState } from 'react';
import { useCurrency } from '../CurrencyContext';
import { getJSON, setJSON } from '../lib/storage';
import { currentMonth, monthLabel } from '../lib/month';
import { MonthNav } from '../ui/MonthNav';
import { PageHead, ToolFoot } from '../ui/common';
import { Icon } from '../ui/Icon';
import { ExportMenu } from '../ui/ExportMenu';
import { exportBudgetCsv, exportBudgetXlsx, exportBudgetPdf, type BudgetExport } from '../lib/exporters';
import {
  BB_NEEDS, BB_WANTS, BB_SAVE, BB_ALL,
  computeBudget, type BudgetVals, type BudgetStore, type BudgetCat, type CatResult, type CatKey,
} from '../lib/budget';

const CAT_COLOR: Record<CatKey, string> = { needs: 'var(--blue)', wants: 'var(--gold)', save: 'var(--green)' };

export default function BudgetPage() {
  const { cfmt, sym, code } = useCurrency();
  const allRef = useRef<BudgetStore>(getJSON<BudgetStore>('fx_bb_data', {}));
  const [month, setMonth] = useState(currentMonth());
  const [income, setIncome] = useState('50000');
  const [needsPct, setNeedsPct] = useState('50');
  const [wantsPct, setWantsPct] = useState('30');
  const [savePct, setSavePct] = useState('20');
  const [vals, setVals] = useState<BudgetVals>({});
  const [, forceMonths] = useState(0);
  const loaded = useRef(false);

  const loadMonth = useCallback((m: string) => {
    const d = allRef.current[m];
    const next: BudgetVals = {};
    BB_ALL.forEach((c) => { next[c.k] = 0; });
    if (d?.vals) Object.keys(d.vals).forEach((k) => { if (k in next) next[k] = Number(d.vals[k]) || 0; });
    setVals(next);
    setIncome(d && d.income !== '' && d.income != null ? d.income : '50000');
    setNeedsPct(d && d.n !== '' && d.n != null ? d.n : '50');
    setWantsPct(d && d.w !== '' && d.w != null ? d.w : '30');
    setSavePct(d && d.s !== '' && d.s != null ? d.s : '20');
  }, []);

  // Initial load: seed current month from saved data (or defaults).
  useEffect(() => {
    loadMonth(currentMonth());
    loaded.current = true;
    forceMonths((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-persist current month after every change (mirrors bbUpdate → bbSave).
  useEffect(() => {
    if (!loaded.current) return;
    allRef.current[month] = { vals: { ...vals }, income, n: needsPct, w: wantsPct, s: savePct };
    setJSON('fx_bb_data', allRef.current);
  }, [income, needsPct, wantsPct, savePct, vals, month]);

  const switchMonth = (target: string) => {
    // current month is already synced into allRef by the persist effect
    setMonth(target);
    loadMonth(target);
    forceMonths((n) => n + 1);
  };

  const r = computeBudget({ incomeRaw: income, needsRaw: needsPct, wantsRaw: wantsPct, saveRaw: savePct, vals });

  // Month chips: every month with data + the current month.
  const cur = currentMonth();
  const monthSet = new Set(Object.keys(allRef.current));
  monthSet.add(cur);
  const months = [...monthSet].sort();

  const setVal = (k: string, raw: string) =>
    setVals((v) => ({ ...v, [k]: Math.max(0, Number(raw) || 0) }));

  const buildExport = (): BudgetExport => ({
    monthLabel: monthLabel(month),
    currency: code,
    income: r.income,
    needs: { pct: r.nPct, limit: r.nL, actual: r.nT },
    wants: { pct: r.wPct, limit: r.wL, actual: r.wT },
    save: { pct: r.sPct, limit: r.sL, actual: r.sT },
    rows: [
      ...BB_NEEDS.map((c) => ({ group: 'Needs', label: c.l, amount: vals[c.k] || 0 })),
      ...BB_WANTS.map((c) => ({ group: 'Wants', label: c.l, amount: vals[c.k] || 0 })),
      ...BB_SAVE.map((c) => ({ group: 'Savings', label: c.l, amount: vals[c.k] || 0 })),
    ],
    spent: r.spent, free: r.free, pos: r.pos, savePct: r.savePct, allocatedPct: r.allocatedPct,
    tips: r.tips.map((t) => `${t[1]}: ${t[2]}`),
  });

  return (
    <div className="fx-page">
      <PageHead
        chip="Budget Builder"
        chipColor="var(--blue)"
        chipBg="rgba(0,113,227,.1)"
        icon="budget"
        title="The 50/30/20 rule, made effortless."
      >
        Enter your take-home income, then fill in what you actually spend. We'll show you exactly
        where you stand against the classic Needs / Wants / Savings split.
      </PageHead>

      <div style={{ marginBottom: 14 }}>
        <MonthNav
          activeMonth={month}
          months={months}
          onSwitch={switchMonth}
          pastNote="Viewing past month — read only view"
          pastColor="var(--gold)"
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <ExportMenu
          label="Export budget"
          onCsv={() => exportBudgetCsv(buildExport())}
          onXlsx={() => exportBudgetXlsx(buildExport())}
          onPdf={() => exportBudgetPdf(buildExport())}
        />
      </div>

      <div className="card">
        <div className="fg" style={{ marginBottom: 0 }}>
          <label className="fl" htmlFor="bb-income">
            Monthly take-home income ({sym})
          </label>
          <input
            className="fi"
            type="number" step="any"
            id="bb-income"
            value={income}
            min={0}
            inputMode="decimal"
            onChange={(e) => setIncome(e.target.value)}
          />
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Your budget split</div>
          <div style={{ fontSize: 11, color: 'var(--ink3)', background: 'var(--bg)', padding: '4px 10px', borderRadius: 980 }}>
            Recommended: 50 / 30 / 20
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
          <PctInput label="Needs %" color="var(--blue)" value={needsPct} onChange={setNeedsPct} id="bb-pct-needs" />
          <PctInput label="Wants %" color="var(--gold)" value={wantsPct} onChange={setWantsPct} id="bb-pct-wants" />
          <PctInput label="Save %" color="var(--green)" value={savePct} onChange={setSavePct} id="bb-pct-save" />
        </div>
        {r.splitWarn && (
          <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 8 }}>Percentages must add up to 100%</div>
        )}
        <div className="seg-bar">
          <div className="seg" style={{ width: `${r.nPctV}%`, background: 'var(--blue)' }} />
          <div className="seg" style={{ width: `${r.wPctV}%`, background: 'var(--gold)' }} />
          <div className="seg" style={{ width: `${r.sPctV}%`, background: 'var(--green)' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink2)' }}>
          <span>Needs <b>{cfmt(r.nL)}</b></span>
          <span>Wants <b>{cfmt(r.wL)}</b></span>
          <span>Save <b>{cfmt(r.sL)}</b></span>
        </div>
      </div>

      <CategoryCard catKey="needs" label={`Needs · ${r.nPct}%`} color={CAT_COLOR.needs} items={BB_NEEDS} res={r.cats.needs} vals={vals} setVal={setVal} cfmt={cfmt} />
      <CategoryCard catKey="wants" label={`Wants · ${r.wPct}%`} color={CAT_COLOR.wants} items={BB_WANTS} res={r.cats.wants} vals={vals} setVal={setVal} cfmt={cfmt} />
      <CategoryCard catKey="save" label={`Savings & investments · ${r.sPct}%`} color={CAT_COLOR.save} items={BB_SAVE} res={r.cats.save} vals={vals} setVal={setVal} cfmt={cfmt} />

      <div
        className="card result-hero-anim"
        style={{ background: r.pos ? 'rgba(29,125,70,.05)' : 'rgba(215,0,21,.04)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{r.pos ? 'Unallocated' : 'Over budget by'}</div>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.02em', color: r.pos ? 'var(--green)' : 'var(--red)' }}>
            {cfmt(Math.abs(r.free))}
          </div>
        </div>
        <div className="note" style={{ marginTop: 6 }}>
          Allocated {cfmt(r.spent)} of {cfmt(r.income)} ({r.allocatedPct}%) · Actual savings rate:{' '}
          <b style={{ color: 'var(--ink)' }}>{r.savePct}%</b>
        </div>
      </div>

      {r.tips.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Insights</div>
          {r.tips.map((t, i) => (
            <div className={`tip tip-${t[0]}`} key={i}>
              <b>{t[1]}</b>
              {t[2]}
            </div>
          ))}
        </div>
      )}

      <ToolFoot>
        Built with care by <b>FinatriX</b> · Educational tool, not financial advice
      </ToolFoot>
    </div>
  );
}

function PctInput({ label, color, value, onChange, id }: {
  label: string; color: string; value: string; onChange: (v: string) => void; id: string;
}) {
  return (
    <div>
      <label className="fl" htmlFor={id} style={{ color }}>{label}</label>
      <input
        className="fi"
        type="number" step="any"
        id={id}
        value={value}
        min={0}
        max={100}
        inputMode="numeric"
        onChange={(e) => onChange(e.target.value)}
        style={{ textAlign: 'center', fontSize: 18, fontWeight: 700, padding: 10 }}
      />
    </div>
  );
}

function CategoryCard({ catKey, label, color, items, res, vals, setVal, cfmt }: {
  catKey: CatKey; label: string; color: string; items: BudgetCat[]; res: CatResult;
  vals: BudgetVals; setVal: (k: string, v: string) => void; cfmt: (n: number) => string;
}) {
  const pill =
    res.state === 'empty'
      ? { cls: 'pill pill-mute', text: 'Not filled' }
      : res.state === 'over'
        ? { cls: 'pill pill-bad', text: `Over by ${cfmt(res.overBy)}` }
        : { cls: 'pill pill-ok', text: 'Within limit' };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color }}>{label}</div>
        <span className={pill.cls}>{pill.text}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink2)', marginBottom: 5 }}>
        <span>{cfmt(res.total)} used</span>
        <span>limit {cfmt(res.limit)}</span>
      </div>
      <div className="bar">
        <div className="bar-fill" style={{ width: `${res.fillPct}%`, background: res.over ? 'var(--red)' : color }} />
      </div>
      <div className="hr" />
      <div>
        {items.map((c) => (
          <div className="row-line" key={c.k} data-cat={catKey}>
            <div style={{ fontSize: 18, width: 28, textAlign: 'center' }}>
              <Icon name={c.ic} size={18} />
            </div>
            <div style={{ flex: 1, fontSize: 14 }}>{c.l}</div>
            <input
              className="fi-sm"
              type="number" step="any"
              min={0}
              inputMode="decimal"
              placeholder="0"
              value={vals[c.k] ? String(vals[c.k]) : ''}
              onChange={(e) => setVal(c.k, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
