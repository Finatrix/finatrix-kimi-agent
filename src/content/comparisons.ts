/**
 * The long-form half of every money-tool comparison.
 *
 * Split out of `src/shared/comparisons.ts` for the same reason the article
 * bodies are split out of `src/shared/content.ts`: that module is EAGER — it
 * is read by `publicPages.ts`, which is read by `seo.ts` and `routes.ts`, so
 * every byte in it is downloaded by a visitor who lands on the homepage and
 * never opens a comparison. Measured, the six entries below were ~13 kB
 * gzipped on the landing critical path for prose the landing page cannot
 * render.
 *
 * Nothing dynamic is needed to make this lazy. This module is imported only by
 * `src/pages/marketing/Compare.tsx`, which App.tsx already loads with
 * `lazy()`, so the bundler places it in that route's chunk automatically.
 *
 * The editorial rules — no prices, category-level claims, their strengths
 * first — are stated in full on the registry it was split from, and
 * `comparisonsCompanies.test.ts` enforces them against THIS file.
 */
import { TOOL_COUNT_WORD_CAP } from '../shared/toolCount';

/** Where each product is stronger, weaker, and who it suits. */
export interface AlternativeCopy {
  /** The pricing MODEL, never a figure. */
  pricingModel: string;
  /** How the data relationship works, at category level. */
  dataModel: string;
  /** Where it is genuinely stronger. Written first, on purpose. */
  theirStrengths: readonly string[];
  /** Honest limitations of the CATEGORY, not criticisms of the execution. */
  theirLimits: readonly string[];
  /** Where the FinatriX calculators genuinely differ. Only what they deliver. */
  ourStrengths: readonly string[];
  /** Who each side actually suits. */
  bestFor: { them: string; us: string };
  /** The honest one-line answer to "which should I use?". */
  verdict: string;
}

/**
 * The FinatriX side of every comparison, stated once so no page can quietly
 * overstate it — including the limitation, which every page renders.
 */
export const OUR_SIDE = {
  name: 'FinatriX calculators',
  whatItIs:
    `${TOOL_COUNT_WORD_CAP} free, education-first calculators covering budgeting, expenses, allocation, cash placement, benchmarking, goal planning, a whole-life projection and a net worth tracker.`,
  pricingModel: 'Free, with no usage limit and no card required. An account only adds sync across devices.',
  dataModel:
    'Figures stay in your own browser until you choose to sync them. There is no bank connection, so nothing here can read your accounts.',
  /**
   * The honest limitation, stated once and reused. Every page in this set
   * renders it, because a comparison that omits it is not a comparison.
   */
  limitation:
    'No automatic bank feed, no transaction import, and no continuous tracking of live balances. Everything is entered by hand, which is slower than an app that syncs and is the trade for nothing here having access to your accounts.',
} as const;

export const ALTERNATIVE_COPY: Record<string, AlternativeCopy> = {
  'ynab': {
    pricingModel:
      'Paid subscription, billed monthly or annually, after a trial period.',
    dataModel:
      'An account is required and your budget is held in the vendor\'s service. Where supported, bank connections import transactions automatically; elsewhere transactions are imported from files or entered manually.',
    theirStrengths: [
      'A complete, opinionated method rather than a calculator — it tells you what to do with every rupee, not just how the numbers divide.',
      'Ongoing tracking across months, with balances that carry forward and categories that hold a running amount.',
      'Genuinely good educational material and an active community around the method.',
      'Transaction import where bank connections are supported, which removes the manual-entry cost entirely.',
    ],
    theirLimits: [
      'It is a subscription, so the cost recurs whether or not you use it in a given month.',
      'The method takes real setup effort and is more than most people need if their savings rate is already where they want it.',
      'Built around a Western banking context; features that depend on bank connections vary considerably by country.',
    ],
    ourStrengths: [
      'Free, with no trial to remember to cancel and no account needed to get an answer.',
      'The 50/30/20 comparison, allocation, goal solving and a whole-life projection are separate tools rather than one method.',
      'Every formula and assumed rate is published on the page, so any figure can be checked by hand.',
      'Written for Indian tax treatment, Indian city costs and Indian instrument categories.',
    ],
    bestFor: {
      them:
        'Someone who wants a full budgeting system with ongoing tracking and is willing to pay for it and learn the method.',
      us:
        'Someone who wants to answer a specific question — is my split reasonable, what instalment reaches this goal, where should this cash sit — without adopting a system.',
    },
    verdict:
      'YNAB is a method you commit to. FinatriX is a set of calculators you consult. If you want a budget you maintain every week, YNAB does more; if you want the arithmetic checked and the assumptions shown, this is free and takes ten minutes.',
  },
  'monarch-money': {
    pricingModel:
      'Paid subscription, billed monthly or annually, typically after a trial.',
    dataModel:
      'An account is required. Its core value is aggregating your real accounts into one dashboard, which means connecting them and holding that data in the vendor\'s service.',
    theirStrengths: [
      'One live picture of every account, which no manual tool can reproduce and which is the whole reason to use a product like this.',
      'Net worth tracked automatically over time rather than recalculated by hand each quarter.',
      'Shared household access, so two people can work from the same picture — a genuine gap in most single-user tools.',
      'Ongoing categorisation and trend reporting without re-entering anything.',
    ],
    theirLimits: [
      'Account aggregation coverage varies by country and by institution, and it is the feature everything else depends on.',
      'A recurring subscription for a dashboard is a poor trade if you look at it twice a year.',
      'Aggregation requires granting a third party read access to your financial accounts, which is a real decision rather than a formality.',
    ],
    ourStrengths: [
      'No account connection at all, so there is nothing to grant access to and nothing to breach.',
      'Free, so an occasional user pays nothing for the months they do not open it.',
      'Educational rather than observational — the tools explain the arithmetic instead of reporting what already happened.',
      'A forty-year life projection and a post-tax cash-placement comparison, neither of which a tracking dashboard does.',
    ],
    bestFor: {
      them:
        'A household that wants continuous, automatic visibility across many accounts and will use it weekly.',
      us:
        'Someone deciding something — an allocation, a goal instalment, where to park cash — rather than monitoring something.',
    },
    verdict:
      'Monarch answers "where do I stand right now". FinatriX answers "what should this number be". They are complementary, and the honest reason to skip an aggregator is not wanting to connect your accounts to one.',
  },
  'copilot-money': {
    pricingModel:
      'Paid subscription, billed monthly or annually, typically after a trial.',
    dataModel:
      'An account is required and accounts are connected for automatic transaction import. Availability of those connections depends on region and institution.',
    theirStrengths: [
      'Exceptional interface design — the daily review flow is genuinely pleasant, which is the main reason tracking habits survive.',
      'Automatic categorisation that improves with correction, removing most of the manual work from expense tracking.',
      'Deep integration with Apple platforms, including the parts of the experience that live outside the app.',
      'Continuous tracking, so the record exists whether or not you remembered to log anything.',
    ],
    theirLimits: [
      'Platform-bound: the experience assumes an Apple device, which excludes a large share of users outright.',
      'Regional availability of account connections is the binding constraint, and without them the value proposition changes substantially.',
      'A subscription for spending review is a recurring cost against a benefit that is largest in the first few months.',
    ],
    ourStrengths: [
      'Works in any browser on any device, with no platform requirement.',
      'Free, and usable without signing in at all.',
      'Covers decisions a spending tracker does not touch: allocation by horizon, post-tax cash placement, goal solving, life projection.',
      'Manual entry has one underrated benefit — typing an amount makes you notice it, which an automatic import does not.',
    ],
    bestFor: {
      them:
        'An Apple user who wants effortless, automatic tracking and will review it regularly.',
      us:
        'Anyone who wants the underlying arithmetic, on any device, without a subscription or a connected account.',
    },
    verdict:
      'Copilot is the better daily tracker if you are in its ecosystem and its region. FinatriX is the better place to work out what the numbers should be, and it costs nothing to use both.',
  },
  'pocketsmith': {
    pricingModel:
      'Tiered, with a limited free tier and paid tiers that add forecasting depth and account connections.',
    dataModel:
      'An account is required. Depending on the tier, transactions arrive via bank feeds or by file import, and the forecast is built from your recurring items.',
    theirStrengths: [
      'Forward-looking cash-flow forecasting on a calendar is genuinely distinctive — most tools describe the past rather than the next six months.',
      'A free tier exists, so it can be evaluated properly without a card.',
      'Strong file-import support, which matters in regions where automatic bank feeds are patchy.',
      'Scenario planning against real recurring transactions rather than against estimates.',
    ],
    theirLimits: [
      'Forecast quality depends entirely on how completely your recurring items are set up, which is real ongoing work.',
      'The interface is dense — it is a capable tool rather than a simple one.',
      'The features that make it distinctive sit on the paid tiers.',
    ],
    ourStrengths: [
      'No setup at all: a useful answer in a couple of minutes rather than after configuring recurring items.',
      'Free at every level, with nothing gated.',
      'A whole-life projection across decades rather than a cash-flow horizon of months.',
      'Post-tax comparison of where short-term cash should sit, which a forecasting tool does not attempt.',
    ],
    bestFor: {
      them:
        'Someone with irregular income or complex recurring commitments who needs to see the next six months of balances.',
      us:
        'Someone who wants the structural answer — the split, the instalment, the allocation — without maintaining a forecast.',
    },
    verdict:
      'PocketSmith is the strongest tool here for near-term cash-flow visibility, and that is a genuinely different problem from the one the calculators solve. If your question is "will I be short in March", use it; if it is "what should I be saving", start here.',
  },
  'excel': {
    pricingModel:
      'A licence or a Microsoft 365 subscription, depending on how it is obtained.',
    dataModel:
      'Whatever you choose. A local file touches no service at all; a cloud-saved one is held in the vendor\'s storage. This is the only option on this list where the answer is entirely yours.',
    theirStrengths: [
      'Unlimited flexibility — anything on this site can be built in it, and then adapted to a situation no product anticipated.',
      'Complete data control: a local file involves no third party, no account and no transmission.',
      'Nothing is deprecated. A workbook built today opens in a decade, which is not true of any subscription product.',
      'Skills transfer directly to professional work, which no consumer finance app can claim.',
    ],
    theirLimits: [
      'You have to build it, and — much harder — maintain it and be sure it is correct.',
      'Spreadsheet errors are common, silent and easy to propagate; a formula referencing the wrong cell produces a confident wrong answer.',
      'No structure or method comes with it. A blank sheet is the least helpful starting point for someone who does not already know what to build.',
    ],
    ourStrengths: [
      'The formulas are already written, tested and parity-pinned, so there is no cell reference to get wrong.',
      'Each tool encodes the method as well as the arithmetic — it asks the right inputs rather than waiting for you to know them.',
      'Tax treatment, city cost multipliers and instrument categories are built in and maintained.',
      'Every result can be exported to a spreadsheet, so this is a starting point rather than a replacement.',
    ],
    bestFor: {
      them:
        'Anyone with a situation no product models, or who wants total control and is confident in their own formulas.',
      us:
        'Anyone who wants a checked answer now, and who would rather not debug a spreadsheet to get it.',
    },
    verdict:
      'Excel is more powerful and entirely unopinionated; these tools are narrower and already correct. The practical answer for most people is both — get the figure here, then export it and build around it.',
  },
  'google-sheets': {
    pricingModel:
      'Free with a Google account; paid only as part of a Workspace subscription.',
    dataModel:
      'Files are held in Google Drive. There is no local-only option in the way there is with a desktop spreadsheet, so the data relationship is with Google.',
    theirStrengths: [
      'Free, with no licence to buy, and available on any device with a browser.',
      'Real-time collaboration, which makes it the obvious choice for a household budget two people both edit.',
      'A very large ecosystem of ready-made personal finance templates, so you need not start from a blank sheet.',
      'Scriptable, so anything repetitive can be automated by someone willing to write a little code.',
    ],
    theirLimits: [
      'Your data sits in Google Drive, which is a considered decision for a file containing your complete financial position.',
      'Templates vary enormously in quality and almost none of them show their assumptions, so a borrowed sheet is a black box you did not write.',
      'The same silent-error problem as any spreadsheet: a wrong formula produces a confident answer with no warning.',
    ],
    ourStrengths: [
      'Nothing is stored anywhere until you choose to sync it, and there is no cloud account by default.',
      'The assumed rates and formulas are printed on the page rather than buried in a cell nobody reads.',
      'Purpose-built for specific questions instead of a general grid you have to shape yourself.',
      'Calibrated for India — tax treatment, city cost tiers and instrument categories — which a generic template is not.',
    ],
    bestFor: {
      them:
        'A shared household budget two people maintain together, or anyone comfortable adapting a template.',
      us:
        'A specific question answered correctly, without evaluating whether a stranger\'s template does the arithmetic properly.',
    },
    verdict:
      'Sheets wins on collaboration and costs nothing. These calculators win on being already correct and on keeping your figures out of a cloud account. Using this for the numbers and Sheets for the shared record is a reasonable arrangement.',
  },
};

/** The copy for one alternative, or null for an unknown slug. */
export function alternativeCopyFor(slug: string | undefined): AlternativeCopy | null {
  if (!slug) return null;
  return ALTERNATIVE_COPY[slug] ?? null;
}
