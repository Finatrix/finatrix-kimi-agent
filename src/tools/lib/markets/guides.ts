import { TOOL_GUIDES, type ToolGuide } from '../../../shared/toolGuides';
import { TOOL_FAQ } from '../../../shared/toolFaq';
import type { ToolId } from '../../../shared/routes';
import type { MarketPack } from './types';

/** Shared by both disclosure surfaces; legacy model scores are never statistical ranks. */
export function guideForMarket(tool: ToolId, market?: MarketPack | null): ToolGuide {
  const base = TOOL_GUIDES[tool];
  if (tool === 'peercompare' && market?.peer.mode !== 'published-context') return {
    ...base,
    purpose: 'Put your entered figures beside illustrative age-band and location benchmarks, with the actual amounts and model assumptions visible.',
    steps: ['Enter your age, location and financial figures in the benchmark currency.', 'Read your actual figures alongside each model reference.', 'Use the cash-flow and balance-sheet figures to understand your own commitments. A reference difference is not a target.', 'Explore another location to see how the model reference changes while your entered figures stay fixed.'],
    method: [
      'Age selects an age band in the benchmark grid. Location selects its cost tier and the multiplier applied to income and expense references.',
      'For positive figures and references, the model uses the entered amount divided by its reference; expenses use the inverse ratio. A fixed logistic curve maps the ratio to a whole-number score between 1 and 99. A ratio of 1 maps to 50.',
      'Zero or non-positive ratios use bounded model fallbacks. These are scoring conventions, not observed frequencies.',
      'The overall score is the rounded mean of the six model scores. It is an illustrative benchmark score, not a measured population percentile or a financial-health grade.',
      'Net worth uses entered savings plus investments minus debt. Months of cover use savings divided by expenses. The debt ratio uses total outstanding debt divided by annual income, not monthly repayments.',
    ],
    worked: { title: 'What a model score of 50 means', rows: [{ label: 'Entered monthly income', value: '5,000 in the benchmark currency' }, { label: 'Illustrative income reference', value: '5,000 in the same currency' }, { label: 'Ratio', value: '1' }, { label: 'Income model score', value: '50/100' }], conclusion: 'The two positive amounts match. This does not mean that half of people earn more or less; no population distribution is used to make that claim.' },
    mistakes: ['Treating a model score as a statistical rank or a grade.', 'Mixing currencies, personal and household totals, or different reporting periods.', 'Treating model references as amounts you should aim to reach.', 'Interpreting total debt divided by annual income as monthly repayment affordability.'],
    limits: ['The reference grid and scoring curve are illustrative model assumptions, not an observed population distribution.', 'No share of people above or below your figures is measured.', 'No automatic currency conversion is applied.', 'The model cannot assess your needs, dependants, health or the completeness of the figures you entered.'],
  };
  if (!market || market.id === 'IN') return base;
  const guide: ToolGuide = {
    ...base,
    worked: { ...base.worked, title: `${base.worked.title} (illustration using INR, not ${market.currency} inputs)` },
    steps: base.steps.map((s) => s.replaceAll('SIP', 'monthly contribution').replace('your CTC', 'gross pay')),
    method: base.method.map((s) => s.replaceAll('SIP', 'monthly contribution')),
  };
  if (tool === 'parksmart') return {
    ...guide,
    purpose: 'Compare modeled earnings and access conditions for cash options using the displayed rate basis.',
    steps: ['Enter an amount and duration.', market.park.inputMode === 'net-rates' ? 'Enter an annual rate after taxes and fees for each option and specify access.' : 'Select your marginal rate and inspect each option’s tax treatment.', 'Read earnings alongside access conditions and the deposit-protection disclosure.'],
    method: ['Earnings use amount × annual rate × the duration in years. Duration categories use the representative month counts shown by the model.', market.park.taxNote, 'Eligible options are ordered by modeled earnings. The order is not a suitability recommendation.'],
    worked: { title: 'A simple earnings illustration', rows: [{ label: 'Amount', value: '1,000 currency units' }, { label: 'Annual net rate', value: '3% (illustrative)' }, { label: 'Duration', value: '6–12 months, modeled as 9 months' }, { label: 'Earnings', value: '1,000 × 0.03 × 9 / 12 = 22.50' }], conclusion: 'The entered net rate already includes any tax and fees. Actual account terms may use a different accrual or compounding convention.' },
    mistakes: ['Comparing rates with different tax, fee or annualisation bases.', 'Ignoring withdrawal conditions or a currency difference.', 'Treating a displayed protection cap as confirmation that an account qualifies.'],
    limits: [market.park.keepInMind, 'FinatriX does not compute your tax liability or verify a provider quote.'],
  };
  if (tool === 'peercompare' && market.peer.mode === 'published-context') return {
    ...guide,
    purpose: 'Read official dated summary statistics and put a matching figure beside a published median.',
    steps: ['Choose a reference.', 'Read its population, definition, currency and period.', 'Optionally enter a matching figure and confirm the basis.'],
    method: ['The published median is reproduced with its source and observation period.', 'Your matching input is shown beside the median, with a simple above, below or equal description.', 'No percentile, city multiplier or financial-health score is inferred.'],
    worked: { title: 'Why the definition matters', rows: [{ label: 'Reference', value: 'Household income before tax' }, { label: 'Your available figure', value: 'One person’s take-home pay' }], conclusion: 'These figures are incompatible. Read the reference for context and leave the comparison blank until you have a matching figure.' },
    mistakes: ['Comparing a current amount with a historical amount without matching the price basis.', 'Treating household income as personal salary.', 'Reading a median as a recommended target.'],
    limits: ['Only the published summaries shown here are available. Detailed distributions remain unavailable.', 'No automatic currency conversion or inflation adjustment is applied.', 'These figures do not describe your personal needs or financial health.'],
  };
  if (tool === 'goals' && market.planningNote) return { ...guide, method: [guide.method[0], 'Three explicitly illustrative return scenarios are compared: 2%, 4% and 6%. These are not local yield forecasts.', ...guide.method.slice(2)] };
  return guide;
}

export function faqForMarket(tool: ToolId, market?: MarketPack | null) {
  if (tool === 'peercompare' && market?.peer.mode !== 'published-context') return [
    { q: 'What does the benchmark score mean?', a: 'It summarizes six ratios against an illustrative reference grid using a fixed scoring curve. It is not a measured population percentile or a financial-health grade.' },
    { q: 'Who am I being compared with?', a: 'The displayed references are model estimates selected by age band and location. The comparison does not measure how many people have more or less than you.' },
    { q: 'Should I aim for the reference amount?', a: 'No. Your own commitments, goals and available cash determine what is appropriate. Read the entered amounts, cash-flow check and balance-sheet figures before interpreting any reference difference.' },
  ];
  if (!market || market.id === 'IN') return TOOL_FAQ[tool];
  if (tool === 'parksmart') return [
    { q: 'Are these live bank rates?', a: market.park.inputMode === 'net-rates' ? 'No. Both annual net rates are supplied by you. Include taxes and fees before entering them.' : 'No. Inspect the displayed rate basis and check current provider terms.' },
    { q: 'Does a protection limit confirm my account is covered?', a: 'No. Coverage depends on the institution, account type, currency and ownership conditions. The linked reference explains the conditions known to FinatriX.' },
  ];
  if (tool === 'peercompare' && market.peer.mode === 'published-context') return [
    { q: 'Can this tell me my percentile?', a: 'No. A published median is one summary point. It cannot locate an individual within a complete distribution.' },
    { q: 'Can I compare my current salary?', a: 'Only when the reference has the same income definition, population, currency and period. Household figures and personal salaries are different measures.' },
  ];
  return TOOL_FAQ[tool].map((f) => ({ ...f, a: f.a.replaceAll('SIP', 'monthly contribution').replaceAll('today’s rupees', 'today’s money').replace('EPF, PPF and NPS', 'retirement account balances') }));
}
