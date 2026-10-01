import { beforeEach, describe, expect, it } from 'vitest';
import { calendarIcs, calendarOutflows, calendarWithContributionDay, findGoalDeadlines, firstLifeMapAge, lifeMapReadiness } from '../tools/lib/planningAutomation';
import { computeGoalPlanner, GP_PATHS, type GoalInput } from '../tools/lib/goals';
import { buildDecisions, buildProfile, calcWealth } from '../tools/lib/lifemap';
import { getMonthEvents, getUpcomingEvents, type FinEvent } from '../tools/lib/calendar';

const goal: GoalInput = { name: 'Home', targetToday: 500000, existing: 10000, years: 10, inflate: true };
const form = { 'lm-age': '22', 'lm-income': '35000', 'lm-expenses': '22000', 'lm-savings': '150000', 'lm-emergency': '60000', 'lm-invest': '50000', 'lm-sip-yn': 'no', 'lm-debt-yn': 'no' };
const profile = buildProfile({ name: 'Test', age: 22, income: 35000, expenses: 22000, savings: 150000, emergency: 60000, invest: 50000, sipYn: false, sip: 0, debtYn: false, debtTotal: 0, debtEmi: 0, career: 'tech', goals: [] });
const event: FinEvent = { id: 'bill-1', date: '2028-02-01', type: 'bill', title: 'Broadband', amount: 100, detail: 'Recurring bill', icon: 'bills', accent: 'orange', href: '/tools/expenses' };

describe('planning automation preserves calculator results', () => {
  beforeEach(() => localStorage.clear());

  it('finds the earliest fitting deadline by checking every earlier year under each original path', () => {
    const limit = 3000;
    const matches = findGoalDeadlines(goal, 0.06, GP_PATHS, limit);
    expect(matches).toHaveLength(3);
    matches.forEach((match, i) => {
      expect(match.years).not.toBeNull();
      expect(match.monthly).toBe(computeGoalPlanner({ ...goal, years: match.years! }, 0.06, GP_PATHS).results[i].monthly);
      expect(match.monthly).toBeLessThanOrEqual(limit);
      for (let years = 1; years < match.years!; years++) {
        expect(computeGoalPlanner({ ...goal, years }, 0.06, GP_PATHS).results[i].monthly).toBeGreaterThan(limit);
      }
    });
  });

  it('distinguishes zero monthly funding from missing or invalid limits', () => {
    expect(findGoalDeadlines(goal, 0.06, GP_PATHS, 0).every((answer) => answer.years === null)).toBe(true);
    expect(findGoalDeadlines({ ...goal, existing: 1e7 }, 0.06, GP_PATHS, 0).every((answer) => answer.years === 1 && answer.monthly === 0)).toBe(true);
    expect(findGoalDeadlines(goal, 0.06, GP_PATHS, Number.NaN)).toEqual([]);
    expect(findGoalDeadlines(goal, 0.06, GP_PATHS, -1)).toEqual([]);
  });

  it('blocks inputs that the legacy LifeMap builder would silently replace or clamp', () => {
    expect(lifeMapReadiness(form)).toEqual([]);
    expect(lifeMapReadiness({ ...form, 'lm-income': '0' }).join(' ')).toContain('example amounts');
    expect(lifeMapReadiness({ ...form, 'lm-expenses': '' }).join(' ')).toContain('Complete');
    expect(lifeMapReadiness({ ...form, 'lm-age': '22.5' }).join(' ')).toContain('whole age');
    expect(lifeMapReadiness({ ...form, 'lm-savings': '50000' }).join(' ')).toContain('cannot exceed');
    expect(lifeMapReadiness({ ...form, 'lm-debt-yn': 'yes', 'lm-debt-total': '50000', 'lm-debt-emi': '30000' }).join(' ')).toContain('repayments');
    expect(lifeMapReadiness({ ...form, 'lm-invest': 'Infinity' }).join(' ')).toContain('1 trillion');
  });

  it('finds a target age using the exact selected LifeMap decisions', () => {
    const decisions = buildDecisions(profile, String);
    const applied = new Set(['nps', 'insurance']);
    const target = calcWealth(profile, decisions, applied, 40, true);
    expect(firstLifeMapAge(profile, decisions, applied, target)).toBe(40);
    expect(firstLifeMapAge(profile, decisions, applied, 1e12)).toBeNull();
    expect(firstLifeMapAge(profile, decisions, applied, Number.NaN)).toBeNull();
    expect(applied).toEqual(new Set(['nps', 'insurance']));
  });

  it('excludes goal maturity targets from cash outflow summaries', () => {
    expect(calendarOutflows([event, { ...event, type: 'invest', amount: 250 }, { ...event, type: 'goal', amount: 500000 }, { ...event, amount: null }])).toBe(350);
  });

  it('clamps investing days correctly for leap years and preserves bill dates', () => {
    const events = calendarWithContributionDay([event, { ...event, type: 'invest' }], 31);
    expect(events[0].date).toBe('2028-02-01');
    expect(events[1].date).toBe('2028-02-29');
    expect(calendarWithContributionDay([{ ...event, date: '2027-02-01', type: 'invest' }], 31)[0].date).toBe('2027-02-28');
    expect(event.date).toBe('2028-02-01');
  });

  it('exports safe all-day ICS events with folded unicode and escaped injected lines', () => {
    const ics = calendarIcs([{ ...event, title: 'Rent, utility;\nBEGIN:VEVENT', detail: '€'.repeat(100) }], new Date('2026-09-18T00:00:00Z'), 'AUD');
    expect(ics).toContain('DTSTART;VALUE=DATE:20280201');
    expect(ics).toContain('SUMMARY:Rent\\, utility\\;\\nBEGIN:VEVENT');
    expect(ics.match(/^BEGIN:VEVENT$/gm)).toHaveLength(1);
    expect(ics).toContain('DTSTAMP:20260918T000000Z');
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain('Amount: AUD 100');
    expect(unfolded).toContain('https://finatrix.co/tools/expenses');
    expect(ics.split('\r\n').every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
  });

  it('keeps anchored goals stable and does not invent dates for legacy goals', () => {
    const saved = { 'gp-target': '100000', 'gp-years': '2', 'gp-existing': '0', 'gp-name': 'Course', 'gp-inflate': false };
    localStorage.setItem('fx_goals', JSON.stringify(saved));
    expect(getMonthEvents('2030-02').filter((item) => item.type === 'goal')).toEqual([]);
    localStorage.setItem('fx_goals', JSON.stringify({ ...saved, 'gp-planned-on': '2028-02-29' }));
    expect(getMonthEvents('2030-02').find((item) => item.type === 'goal')?.date).toBe('2030-02-28');
    expect(getMonthEvents('2030-03').filter((item) => item.type === 'goal')).toEqual([]);
  });

  it('honours saved investing days across all months in longer upcoming windows', () => {
    localStorage.setItem('fx_investmatch', JSON.stringify({ calendarDay: 31, a: { age: 30, income: 80000, monthly: 10000, risk: 'moderate', horizon: '5-10', goal: 'wealth' } }));
    const upcoming = getUpcomingEvents(new Date(2028, 0, 1), 90).filter((item) => item.type === 'invest');
    expect(upcoming.map((item) => item.date)).toEqual(['2028-01-31', '2028-02-29', '2028-03-31']);
    expect(getMonthEvents('2028-13')).toEqual([]);
    expect(getUpcomingEvents(new Date('invalid'))).toEqual([]);
  });
});
