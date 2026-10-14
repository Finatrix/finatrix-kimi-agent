/**
 * The one-line notifications for the morning and the middle of the day, and
 * the rule that picks today's.
 *
 * Written for FinatriX rather than collected. A famous line attached to a name
 * is a claim about who said it, and the popular ones are misattributed so often
 * that quoting them is a way of being wrong confidently. These carry no name.
 *
 * What they may and may not do, because they reach a lock screen:
 *  - one sentence or two short ones, under 90 characters;
 *  - no figures and no currency, the same rule as every other reminder;
 *  - no promise about returns and no instruction to buy anything. They nudge a
 *    habit (look, plan, wait, start); they never say what to invest in;
 *  - no shame. Someone who has not started is being invited to, not told off.
 * `src/test/dailyLines.test.ts` holds the mechanical half of that.
 */

/** Morning: a thought to start the day on, in the voice of a saying. */
export const MORNING_LINES: readonly string[] = [
  'Start small today. Compounding only rewards those who begin.',
  'Your future self is counting on one good money decision today.',
  'Wealth is built in ordinary mornings like this one.',
  'Discipline is a promise to your future self, kept daily.',
  'Spend on what you value and let the rest go.',
  'A small amount saved today outruns a big plan made someday.',
  'Don’t wait to feel ready with money. Begin, then adjust.',
  'Money follows attention. Give it five minutes today.',
  'The best time to start saving was earlier. The next best is now.',
  'Be patient with growth and strict with spending.',
  'Your income is a tool. Decide what it builds before it’s spent.',
  'Progress with money looks boring. That’s how you know it’s working.',
  'Today’s small yes to saving is tomorrow’s big yes to freedom.',
  'Financial freedom is the gap between what you earn and what you spend.',
  'Make today’s spending a decision, not a reflex.',
  'Owe a little less, own a little more. Begin today.',
  'Consistency beats intensity. Save a little, again and again.',
  'Being good with money is a habit before it’s a number.',
  'You don’t need a windfall. You need a routine.',
  'Every good financial year is made of mornings like this.',
  'Know where your money goes and it starts going where you want.',
  'Build the cushion now so luck isn’t your only plan.',
  'Small leaks sink big ships. Find one today.',
  'Choose the future you want over the thing you want right now.',
  'A goal with a date is a plan. Without one, it’s a wish.',
  'Your habits will pay you back. Choose ones that compound.',
  'Courage with money is simply looking at the numbers. Look today.',
  'Pay yourself first, then enjoy the rest without guilt.',
  'Calm money comes from small buffers built early.',
  'Skills are the investment that pays at every income.',
  'Slow and steady saving isn’t slow when it never stops.',
  'What you track, you can improve. Track one thing today.',
  'Net worth grows quietly, like a tree. Keep watering it.',
  'Every purchase costs the hours you worked to earn it.',
  'Don’t compare your chapter one to someone’s chapter twenty.',
  'Make a money plan simple enough to follow on a busy day.',
  'A debt cleared is a raise you give yourself.',
  'Be one decision wiser with money than you were yesterday.',
  'Enough is a number worth knowing. Find yours.',
  'Plans change. The habit of planning is what stays.',
  'Let your money work, so one day you can choose your work.',
  'Say no to one unplanned spend and yes to one goal.',
  'Fear of money shrinks when you look straight at it.',
  'Be the person your savings account is proud of.',
  'A calm decision made early is your best financial tool.',
  'Build the life you want, one tracked day at a time.',
  'Markets take years. Your habits take today.',
  'Ambition plus a budget goes a long way.',
  'Give each goal a monthly home and it will move in.',
  'Today’s discipline buys tomorrow’s options.',
  'If it matters, schedule it. That includes saving.',
  'Spend less than you earn and let time do the heavy lifting.',
  'Wealth begins with a decision, not an amount.',
  'Be generous with effort and careful with impulse.',
  'An emergency fund turns a crisis into an inconvenience.',
  'Your goals are listening to your daily choices.',
  'A good day with money is a day without surprises.',
  'Learn one new thing about money today. Knowledge compounds too.',
  'Begin with the income you have, not the one you’re waiting for.',
  'Wealth isn’t one big day. It’s many steady ones.',
];

/** Midday: a nudge to go and work on your own life, spoken to one person. */
export const MIDDAY_LINES: readonly string[] = [
  'Lunch-break math: five quiet minutes with your goals beat none.',
  'Step away from the screen, then step toward one money goal.',
  'You’ve made it halfway through today. Spare a minute for your plan.',
  'Pay one bill, move some savings, or log one spend. Pick one.',
  'Your life is the project. Give your money a few minutes of it now.',
  'Skip the impulse buy at lunch. Your goal is worth more than a craving.',
  'Halfway through the day: has your money done anything for you yet?',
  'Open your budget for one minute. Future you will thank you.',
  'Do one thing this afternoon that your future self will be glad to see.',
  'Whatever the morning was, the afternoon can still move your goals.',
  'Eat well, spend wisely, note it down. Easy wins.',
  'The life you want is paid for in small, steady choices. Make one now.',
  'Check on the goal you’ve been avoiding. It’s kinder than it looks.',
  'Is there a money conversation you’ve been putting off? Start it today.',
  'Trade ten minutes of scrolling for ten minutes with your goals.',
  'Set up the automatic transfer. Let tomorrow’s you do less work.',
  'Look up one money thing you’re unsure of. Knowing beats guessing.',
  'You earned it with effort. Give it a plan this afternoon.',
  'A quick look at your spending now beats a surprise at month-end.',
  'Be kind to yourself about money, then be consistent.',
  'Treat yourself to something free today and save the difference.',
  'Do the small money task you keep postponing. Just that one.',
  'Your dreams need a number and a date. Add one today.',
  'Pause before you pay. Is this for today’s you or tomorrow’s?',
  'Check one subscription you no longer use and cancel it.',
  'What would make your money feel lighter this week? Start there.',
  'Update one number in your plan. Progress loves fresh data.',
  'Be proud of what you’ve saved so far, then add a little.',
  'Break one big goal into a tiny task and finish it before evening.',
  'Your pace is yours. Just keep moving toward the plan.',
  'Picture the goal for one minute, then take one step toward it.',
  'Let this be the afternoon you finally start.',
  'A tiny step on your finances now beats a big promise tonight.',
  'Between meetings, move a little money toward what matters to you.',
  'Don’t let a busy day be the reason you skip your future.',
  'Money is a tool for your life. What will you build with it today?',
  'Take a short walk, drink some water, and think about one money goal.',
  'Remember why you started saving. Then save a little more.',
  'Forgive an old money mistake today and move on with a better plan.',
  'Share one money win with someone you trust. Wins grow when told.',
  'Swap one “someday” for a date in your calendar.',
  'You’re not behind. You’re exactly where your next decision begins.',
  'Picture what enough looks like for you, then plan toward it.',
  'One honest look at your spending can change the whole month.',
  'The work you do today funds the life you want. Protect some of it.',
  'Be the calm one with money today. Breathe, then decide.',
  'Finish the smaller goal in front of you before chasing a bigger one.',
  'Add to your emergency cushion if you can. Peace of mind compounds.',
  'Learn from last month’s spending. No blame, just a better plan.',
  'Stretch your legs and your money goals this lunch break.',
  'Your time is your first currency. Spend a little of it on your plans.',
  'Five quiet minutes with your finances are a gift to your evening self.',
  'Set one intention for your money this afternoon, and keep it.',
  'Tell your money where to go today, before it decides for you.',
  'Small steps at midday still count as a whole day’s progress.',
  'You can’t outwork a leaky budget. Fix one leak today.',
  'Check that your goals still match the life you’re living now.',
  'Review one category you overspent in. Decide, don’t just notice.',
  'Ask someone who’s good with money one question you’ve been holding.',
  'Thank yourself for showing up, then do one more useful money thing.',
];

/** Whole days since 1970 for a local calendar date. Ignores the hour, so a clock change cannot move it. */
export function dayNumber(day: Date): number {
  return Math.round(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) / 86_400_000);
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * How far to jump through a list of this size each day. Coprime with the size,
 * so every line is used once before any comes round again, and near the golden
 * ratio, so two days that sit next to each other in time sit far apart in the
 * list rather than reading as a sequence.
 */
function strideFor(size: number): number {
  let step = Math.max(1, Math.round(size * 0.618));
  while (gcd(step, size) !== 1) step += 1;
  return step;
}

/**
 * The line for a day. A function of the date alone, so planning twice on the
 * same day gives the same line, and nothing has to be remembered about what
 * was already sent. Never the same line two days running, and no repeat at all
 * within one full pass through the list.
 */
export function lineForDay(lines: readonly string[], day: number): string {
  const size = lines.length;
  return lines[(((day * strideFor(size)) % size) + size) % size];
}
