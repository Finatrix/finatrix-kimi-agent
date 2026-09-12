import type { FinanceSnapshot } from './context';
import type { AiAnswer, AiHighlight } from './validate';

export const BRIEFING_QUESTION = 'What needs my attention?';
export const FORECAST_QUESTION = 'Explain my month-end forecast';
export const COMPARISON_QUESTION = 'Compare this month to last month';

export interface FinancialInsight {
  kind: 'attention' | 'estimate' | 'progress' | 'missing';
  title: string;
  detail: string;
  next: string;
}

/** Rules interpret existing engine results; no model authors a financial amount. */
export function financialInsights(s: FinanceSnapshot): FinancialInsight[] {
  const insights: FinancialInsight[] = [];
  const amount = (n: number) => formatAmount(n, s.currency);
  const rows = s.monthlyHistory.find((m) => m.month === s.month)?.txCount ?? 0;
  if (!rows) insights.push({
    kind: 'missing', title: 'Complete your records',
    detail: `No transactions are recorded for ${s.monthName}. Zero recorded spending does not establish zero actual spending.`,
    next: 'Add or import this month’s transactions before making spending decisions.',
  });
  if (s.income === null) insights.push({
    kind: 'missing', title: 'Add your income',
    detail: 'Without recorded income, cash flow and affordability cannot be assessed.',
    next: 'Enter your income in Budget Builder.',
  });
  if (s.spendableBudget <= 0) insights.push({
    kind: 'missing', title: 'Set a spending plan',
    detail: 'No budget for needs and wants is recorded. A savings allocation is separate from a spending limit.',
    next: 'Set category budgets in Budget Builder.',
  });
  if (s.spendableBudget > 0 && s.spentOnNeedsAndWants > s.spendableBudget) insights.push({
    kind: 'attention', title: 'Recorded spending exceeds the plan',
    detail: `${amount(s.spentOnNeedsAndWants)} in needs and wants against ${amount(s.spendableBudget)} budgeted. Savings transfers are excluded.`,
    next: 'Review the largest spending categories and upcoming bills.',
  });
  if (rows && s.netCashFlow !== null && s.netCashFlow < 0) insights.push({
    kind: 'attention', title: 'Recorded outflows exceed income',
    detail: `Net cash flow is ${amount(s.netCashFlow)} after spending and money set aside. This is not your bank balance.`,
    next: 'Check payment timing and available cash; a savings transfer alone is not overspending.',
  });
  if (s.isCurrentMonth && s.projectedMonthEnd !== null && s.spendableBudget > 0
      && s.spentOnNeedsAndWants <= s.spendableBudget) {
    if (s.projectedMonthEnd > s.spendableBudget) insights.push({
      kind: 'estimate', title: 'The forecast exceeds your spending plan',
      detail: `Estimated month-end spending is ${amount(s.projectedMonthEnd)} against ${amount(s.spendableBudget)} budgeted. ${rangeText(s)}`,
      next: 'Check remaining bills and flexible spending before making new commitments.',
    });
    else if (s.projectedMonthEndRange && s.projectedMonthEndRange.high > s.spendableBudget) insights.push({
      kind: 'estimate', title: 'Allow room for forecast uncertainty',
      detail: `The central estimate is within budget, but the historical error range reaches ${amount(s.projectedMonthEndRange.high)}. This is not a guaranteed upper limit.`,
      next: 'Keep a buffer rather than treating the central estimate as a spending allowance.',
    });
  }
  const fund = s.beyondThisMonth?.emergencyFund;
  if (fund && fund.gap > 0) insights.push({
    kind: 'attention', title: 'Your emergency-fund target is not yet met',
    detail: `${amount(fund.saved)} saved against your chosen ${amount(fund.target)} target; the remaining gap is ${amount(fund.gap)}.`,
    next: 'Review this gap alongside your savings goal before allocating extra cash.',
  });
  const goal = s.beyondThisMonth?.goal;
  if (goal?.monthlyByReturnPath.length) insights.push({
    kind: 'estimate', title: 'Your goal depends on the return assumption',
    detail: goal.monthlyByReturnPath.map((p) => `${p.path}: ${amount(p.monthly)} monthly at an assumed ${p.assumedAnnualReturnPct}% annual return`).join('; ') + '. Returns are not guaranteed.',
    next: 'Compare all paths in Goal Planner; check whether contributions overlap your existing savings plan.',
  });
  if (s.setAsideThisMonth > 0) insights.push({
    kind: 'progress', title: 'Money set aside is separate from spending',
    detail: `${amount(s.setAsideThisMonth)} was moved into savings, investments or transfers.`,
    next: 'Check that these movements are allocated to the goals you intended.',
  });
  // Actual shortfalls lead; missing inputs precede estimates so uncertainty is visible.
  const rank = { attention: 0, missing: 1, estimate: 2, progress: 3 };
  return insights.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

/** Deliberately narrow routing: compound, ambiguous and follow-up questions go to AI. */
export function localFinancialAnswer(question: string, s: FinanceSnapshot, focused = false): AiAnswer | null {
  if (focused) return null;
  const q = question.trim().replace(/[?.!]$/, '').toLowerCase();
  const base: AiAnswer = {
    mode: 'data', headline: '', answer: '', highlights: [], chart: null,
    followUps: [BRIEFING_QUESTION, FORECAST_QUESTION, COMPARISON_QUESTION].filter((p) => p.toLowerCase().replace(/[?]$/, '') !== q),
  };
  if ([BRIEFING_QUESTION.toLowerCase().replace('?', ''), 'summarise my month', 'summarize my month'].includes(q)) {
    const insights = financialInsights(s);
    const priorities = insights.slice(0, 4);
    return {
      ...base,
      headline: `${s.monthName}: ${priorities[0]?.title.toLowerCase() ?? 'your recorded financial picture'}.`,
      answer: priorities.length
        ? priorities.map((i) => `## ${i.title}\n${i.detail}\n\n**Next:** ${i.next}`).join('\n\n')
        : 'No priority was identified from the available records. Check that your transactions and plans are complete.',
      highlights: summaryHighlights(s),
    };
  }
  if (q === FORECAST_QUESTION.toLowerCase()) {
    if (!s.isCurrentMonth) return {
      ...base, answer: 'Month-end forecasting is available for the current month. Historical totals are recorded results, not forecasts.',
    };
    if (s.projectedMonthEnd === null) return {
      ...base, answer: 'There is not enough recorded spending or usable history to estimate this month’s total. No entries does not mean no future spending. Add your transactions and expected bills first.',
    };
    return {
      ...base,
      headline: `Estimated ${s.monthName} spending: ${formatAmount(s.projectedMonthEnd, s.currency)}.`,
      highlights: [{ label: 'Estimated month-end spending', value: s.projectedMonthEnd, unit: 'currency', tone: 'neutral', source: 'data.projectedMonthEnd' }],
      answer: [
        `- ${rangeText(s)}`,
        s.forecastUsesMonthsOfHistory > 0
          ? `- The engine blends your current pace with ${s.forecastUsesMonthsOfHistory} past months; savings transfers are excluded.`
          : '- There is too little history to blend a typical month into the pace. Early-month estimates can change substantially.',
        '- Missing transactions, changed habits and unexpected bills can move the outcome outside the range.',
        '- **Next:** check that your latest transactions and expected bills are recorded.',
      ].join('\n'),
    };
  }
  if (q === COMPARISON_QUESTION.toLowerCase()) {
    const c = s.comparablePeriod;
    if (!c || !c.current.txCount || !c.previous.txCount) return {
      ...base, answer: 'Both comparison periods need recorded transactions. Add the missing records before drawing a spending trend.',
    };
    const window = c.basis === 'same-days' ? `Days 1–${c.throughDay} of each month` : 'Two complete calendar months';
    return {
      ...base,
      headline: `${window}, with savings shown separately.`,
      answer: `| Recorded | ${c.current.month} | ${c.previous.month} |\n| --- | --- | --- |\n| Needs and wants | ${formatAmount(c.current.spending, s.currency)} | ${formatAmount(c.previous.spending, s.currency)} |\n| Money set aside | ${formatAmount(c.current.setAside, s.currency)} | ${formatAmount(c.previous.setAside, s.currency)} |\n\n${c.spendingChangePct === null ? 'No percentage change is available because the earlier spending baseline is zero.' : `Recorded spending change: ${c.spendingChangePct > 0 ? '+' : ''}${c.spendingChangePct}%.`}\n\n${c.caveat}`,
      chart: {
        title: `Spending · ${window.toLowerCase()}`, type: 'bar', unit: 'currency',
        points: [
          { label: c.previous.month, value: c.previous.spending, source: 'data.comparablePeriod.previous.spending' },
          { label: c.current.month, value: c.current.spending, source: 'data.comparablePeriod.current.spending' },
        ],
      },
    };
  }
  return null;
}

function summaryHighlights(s: FinanceSnapshot): AiHighlight[] {
  return [
    { label: 'Recorded spending', value: s.spentOnNeedsAndWants, unit: 'currency', tone: 'neutral', source: 'data.spentOnNeedsAndWants' },
    { label: 'Money set aside', value: s.setAsideThisMonth, unit: 'currency', tone: 'neutral', source: 'data.setAsideThisMonth' },
    ...(s.netCashFlow === null ? [] : [{ label: 'Net cash flow', value: s.netCashFlow, unit: 'currency', tone: s.netCashFlow < 0 ? 'warn' : 'neutral', source: 'data.netCashFlow' }]),
  ] as AiHighlight[];
}

function rangeText(s: FinanceSnapshot): string {
  const r = s.projectedMonthEndRange;
  return r
    ? `Historical error range: ${formatAmount(r.low, s.currency)}–${formatAmount(r.high, s.currency)}, based on ${r.monthsTested} replayed months. It is not a guaranteed limit or a probability interval.`
    : 'There is not enough replay history to quote an error range.';
}

/** Retain cents and use an explicit currency code; do not round evidence into a new amount. */
function formatAmount(n: number, currency: string): string {
  return `${currency} ${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}
