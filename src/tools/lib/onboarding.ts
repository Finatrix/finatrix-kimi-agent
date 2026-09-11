import { getJSON, setJSON, store } from './storage';
import { emptyMonthData, type BudgetStore } from './budget';
import { currentMonth } from './month';
import { saveMarket, type MarketId } from './markets';

export interface SetupInputs { code: string; market: MarketId; income: number; savings: number; goalName: string; goalTarget: number; goalYears: number }

/** First-run seeding only. Revisiting setup must never replace a saved financial plan. */
export function seedOnboarding(input: SetupInputs): string[] {
  const notes: string[] = [];
  store.set('fx_currency', input.code);
  saveMarket(input.market);
  const budgets = getJSON<BudgetStore>('fx_bb_data', {});
  const month = currentMonth();
  if (budgets[month]) notes.push('Your existing monthly budget was kept.');
  else if (Number.isFinite(input.income) && input.income > 0 && input.income <= 1e12) {
    const saved = Number.isFinite(input.savings) && input.savings >= 0 && input.savings <= input.income ? input.savings : 0;
    setJSON('fx_bb_data', { ...budgets, [month]: { ...emptyMonthData(), income: String(Math.round(input.income)), vals: saved > 0 ? { emergency: Math.round(saved) } : {} } });
    notes.push('Your income and planned emergency savings are ready in Budget.');
  }
  if (store.raw('fx_goals')) notes.push('Your existing goal was kept.');
  else if (input.goalName.trim() && Number.isFinite(input.goalTarget) && input.goalTarget >= 1000 && input.goalTarget <= 1e12 && Number.isInteger(input.goalYears) && input.goalYears >= 1 && input.goalYears <= 40) {
    setJSON('fx_goals', { 'gp-name': input.goalName.trim().slice(0, 40), 'gp-target': String(Math.round(input.goalTarget)), 'gp-years': String(input.goalYears), 'gp-existing': '0', 'gp-inflate': true });
    notes.push('Your goal is ready to explore in Goal Planner.');
  }
  store.set('fx_onboarding_done', '1');
  return notes;
}
