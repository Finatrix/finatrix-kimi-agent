/**
 * The long-form half of every company page.
 *
 * Split out of `src/shared/companies.ts` for the same reason as the
 * comparison copy beside it, and the same reason the article bodies are split
 * out of the content registry: the index is EAGER, reached from `seo.ts` and
 * `routes.ts`, and twelve full company profiles on the landing critical path
 * is prose no visitor to the homepage will ever see.
 *
 * Imported only by `src/pages/marketing/Companies.tsx`, which App.tsx loads
 * with `lazy()`, so this lands in that route's chunk without any dynamic-import
 * machinery.
 *
 * WHAT IS DELIBERATELY ABSENT — headcounts, salary bands, application
 * deadlines, office lists — and why, is documented in full on the index module
 * this was split from. `comparisonsCompanies.test.ts` enforces those rules
 * against the data below.
 */

export interface CompanyCopy {
  /** The businesses it runs. What each division actually does, not a brand list. */
  businessAreas: readonly string[];
  /** What its graduate hiring looks like in shape, never in dates. */
  graduatePrograms: readonly string[];
  /** The stages a candidate typically moves through, in order. */
  hiringProcess: readonly string[];
  /** Where a career inside it tends to go over the first several years. */
  careerPaths: readonly string[];
  /** What to prepare specifically for this kind of employer. */
  interviewPrep: readonly string[];
}

/**
 * The caveat every company page renders, verbatim.
 *
 * Held here rather than in the component so there is exactly one wording of it,
 * and so a test can assert the pages carry it. A structured page about an
 * employer reads as authoritative whether or not it claims to be, and the
 * honest response is to say plainly what it is not.
 */
export const COMPANY_CAVEAT =
  'This page describes how the firm is organised and what shape its hiring takes. It deliberately carries no application deadlines, salary figures, headcounts or office lists — those change, and a stale one could cost you a cycle. FinatriX has no relationship with any employer described here and no access to their internal hiring data. Check the firm’s own careers site for anything current.';

export const COMPANY_COPY: Record<string, CompanyCopy> = {
  'anz': {
    businessAreas: [
      'Retail and everyday banking — accounts, cards, home lending and the digital channels around them.',
      'Commercial and business banking — lending, transaction accounts and relationship coverage for small and mid-sized firms.',
      'Institutional banking — corporate lending, transaction banking, markets and trade finance, with a genuinely regional rather than purely domestic footprint.',
      'Technology and operations — platform engineering, data, payments processing and the servicing functions behind every product above.',
      'Risk, compliance and financial crime — the second-line functions that oversee all of it.',
    ],
    graduatePrograms: [
      'Structured graduate streams by function rather than one general intake, so the choice of stream is the choice of career direction.',
      'Rotations within a stream are common, which is the cheapest way to see more than one part of a bank before specialising.',
      'Separate technology and data streams that do not require a finance background.',
      'Internship programmes that feed the graduate intake, which makes the penultimate-year internship the higher-value application for students.',
    ],
    hiringProcess: [
      'Online application with written questions, scored against the firm’s own capability framework.',
      'Online assessments — numerical, logical and situational judgement.',
      'A recorded video interview with a small number of behavioural questions.',
      'An assessment centre combining a group exercise, a case or presentation, and a competency interview.',
      'A final conversation with the hiring team for the specific stream.',
    ],
    careerPaths: [
      'Analyst to senior analyst inside the stream, typically over the first two to three years.',
      'Manager roles that shift the work from producing analysis to coordinating it — the transition most people find hardest.',
      'Lateral moves between divisions, which are actively supported and are far easier internally than as an external hire.',
      'Specialist tracks in risk, quantitative and technology functions where progression does not require managing a team.',
    ],
    interviewPrep: [
      'Know which division and stream you are applying to and be able to say why that one — this is the question most weakly answered.',
      'Prepare against the published capability framework rather than against general interview advice.',
      'Have a view on what a bank actually earns money from, at the level of the division you are joining.',
      'Practise the group exercise format; it is where assessment centres most often separate candidates.',
    ],
  },
  'commonwealth-bank': {
    businessAreas: [
      'Retail banking — the largest part of the group, covering everyday accounts, home lending and cards.',
      'Business banking — lending and transaction services for small and mid-sized enterprises.',
      'Institutional banking and markets — corporate clients, transaction banking and markets products.',
      'Technology — an unusually large function relative to peers, covering engineering, data, cloud and the digital banking platform.',
      'Risk, compliance and financial crime, operating across all of the above.',
    ],
    graduatePrograms: [
      'Multiple graduate streams including technology, data, risk, and business and retail banking.',
      'Technology and engineering streams are a substantial share of the intake and recruit from computing and quantitative backgrounds.',
      'Rotational structures within streams, giving exposure to more than one team before placement.',
      'Internships that convert, which makes them the more competitive and more valuable application.',
    ],
    hiringProcess: [
      'Online application with capability-based written questions.',
      'Online assessments covering reasoning and situational judgement.',
      'A recorded video interview — a few behavioural questions, answered to a camera with no interviewer reacting.',
      'A virtual or in-person assessment centre with group and individual exercises.',
      'A final interview with the team, often technical for engineering and data streams.',
    ],
    careerPaths: [
      'Progression within a functional stream, with the first promotion typically inside three years.',
      'Movement between retail, business and institutional banking, which is more common early than late.',
      'Technology careers that run to senior engineering and architecture without leaving the bank.',
      'Risk and financial crime paths that transfer readily to other institutions and to regulators.',
    ],
    interviewPrep: [
      'For technology streams, expect genuine technical assessment — the stream is not a general graduate role with a technology label.',
      'Be able to discuss what makes a retail bank different from an investment bank in how it earns and where its risks sit.',
      'Prepare customer-centred examples; the framework at a retail-weighted bank tends to weight them heavily.',
      'Know the difference between the three lines of defence and which one your stream sits in.',
    ],
  },
  'westpac': {
    businessAreas: [
      'Consumer banking — deposits, cards, personal and home lending across the group’s brands.',
      'Business banking — lending and transaction services for small and medium enterprises.',
      'Institutional banking — corporate and institutional clients, markets and transaction banking.',
      'Technology and operations, including a substantial ongoing programme of platform simplification.',
      'Risk, compliance and financial crime functions across the group.',
    ],
    graduatePrograms: [
      'Graduate streams organised by function, including banking, technology, risk and corporate services.',
      'Rotations within a stream, with placement at the end rather than at the start.',
      'Internship programmes in the penultimate year that feed the graduate pipeline.',
      'Named streams for data and analytics, which recruit from quantitative rather than finance backgrounds.',
    ],
    hiringProcess: [
      'Online application, including written responses scored against a capability framework.',
      'Online reasoning and situational judgement assessments.',
      'A recorded video interview — a few behavioural questions, answered to a camera with no interviewer reacting.',
      'An assessment centre with group work, an individual exercise and a behavioural interview.',
      'A stream-specific final interview.',
    ],
    careerPaths: [
      'Analyst through to manager within a division over roughly the first five to seven years.',
      'Cross-divisional moves, which are most feasible in the first three years while skills are still general.',
      'Risk and compliance paths that broaden across disciplines rather than deepening in one.',
      'Transformation and change roles, which are numerous at any bank running a large simplification programme.',
    ],
    interviewPrep: [
      'Prepare examples against the published capabilities rather than general competencies.',
      'Understand what a transformation programme is and why banks run them — it is the context for a large share of the work.',
      'Be specific about the division: consumer, business and institutional banking are genuinely different jobs.',
      'Expect situational judgement questions about conduct and customer outcomes, and treat them seriously.',
    ],
  },
  'nab': {
    businessAreas: [
      'Business and private banking — the division the group is best known for, covering SME and commercial lending.',
      'Personal banking — everyday accounts, home lending and cards.',
      'Corporate and institutional banking — larger clients, markets, and specialised finance including infrastructure.',
      'Technology and enterprise operations, including a significant cloud and data programme.',
      'Risk, compliance and financial crime across the group.',
    ],
    graduatePrograms: [
      'Graduate streams by function, with business banking a notably large one relative to peers.',
      'Technology and data streams recruiting from engineering and quantitative backgrounds.',
      'Rotational placements within a stream before a permanent team assignment.',
      'Internships in the penultimate year that feed the graduate intake.',
    ],
    hiringProcess: [
      'Online application with written capability questions.',
      'Online assessments covering reasoning and situational judgement.',
      'A recorded video interview — a few behavioural questions, answered to a camera with no interviewer reacting.',
      'An assessment centre with a group exercise, a case or presentation, and a competency interview.',
      'A final interview with the stream’s hiring team.',
    ],
    careerPaths: [
      'Relationship banking careers, where progression is measured in portfolio size and client complexity.',
      'Credit and risk paths, which are a common move from front-line business banking and vice versa.',
      'Technology and data careers with their own senior individual-contributor track.',
      'Movement into corporate and institutional banking, typically after establishing a record in the business division.',
    ],
    interviewPrep: [
      'For business banking, be able to talk about what makes a small business a good or bad credit risk in plain terms.',
      'Prepare a view on why you want relationship work rather than analytical work, if that is the stream you have chosen.',
      'Know the basics of how a bank makes money on a lending relationship beyond the interest margin.',
      'Practise structured behavioural answers against the firm’s published capabilities.',
    ],
  },
  'macquarie': {
    businessAreas: [
      'Asset management — managing capital across public and private markets on behalf of institutional clients.',
      'Banking and financial services — the retail and business banking arm, smaller relative to the group than at a conventional bank.',
      'Commodities and global markets — trading, financing and risk management across commodities, credit and rates.',
      'Infrastructure and real assets, including a long-established position in infrastructure investment.',
      'Corporate functions — risk, finance, technology and operations supporting all of the above.',
    ],
    graduatePrograms: [
      'Graduate programmes organised by business group, so the application is to a specific business rather than to the firm generally.',
      'Technology, risk and finance streams that recruit separately from the front-office businesses.',
      'Structured intern programmes that are a significant route into the graduate intake.',
      'A reputation for early responsibility, which is genuine and is worth being prepared for rather than surprised by.',
    ],
    hiringProcess: [
      'Online application to a specific business group.',
      'Online assessments including numerical and logical reasoning.',
      'A video or first-round interview, frequently with technical content depending on the business.',
      'Later rounds with the business itself, often several interviews in one day.',
      'Business-specific technical or case assessment for markets and investing roles.',
    ],
    careerPaths: [
      'Progression within a business group, where the ladder is analyst, associate, vice president and above.',
      'Movement between business groups, which happens but is less routine than at a universal bank.',
      'Corporate function careers in risk, finance and technology that span the whole group.',
      'Exits into asset management, infrastructure investment and corporate development roles.',
    ],
    interviewPrep: [
      'Research the specific business group properly — a generic application to "Macquarie" is the most common weakness.',
      'Expect technical questions appropriate to that business, not a single firm-wide technical standard.',
      'Be able to explain what an infrastructure asset is and why it suits long-horizon capital, if applying to those areas.',
      'Prepare for early-responsibility questions: what would you do when the answer is not obvious and nobody is available.',
    ],
  },
  'goldman-sachs': {
    businessAreas: [
      'Global banking and markets — advisory on transactions, capital raising, and sales and trading across asset classes.',
      'Asset and wealth management — managing capital for institutions and individuals.',
      'Platform solutions and transaction banking.',
      'Engineering — one of the largest divisions by headcount, covering software, data and quantitative development.',
      'Risk, controllers, operations and internal audit, which together account for a large share of graduate hiring.',
    ],
    graduatePrograms: [
      'A structured analyst programme with applications to a named division, on a fixed annual calendar that opens well ahead of the start date.',
      'A summer internship that is the primary feeder into the analyst programme, making the penultimate year the decisive one.',
      'Engineering hires in volume and does not require a finance background.',
      'Distinct programmes for risk, controllers and operations, which are frequently overlooked by applicants focused on front-office roles.',
    ],
    hiringProcess: [
      'Online application to a specific division and location.',
      'Online assessments and, commonly, a recorded video interview early in the process.',
      'Divisional interviews, often several in a single round.',
      'Technical assessment appropriate to the division — coding for engineering, markets and valuation reasoning elsewhere.',
      'Final rounds with senior members of the division.',
    ],
    careerPaths: [
      'Analyst, associate, vice president and above, with the analyst-to-associate step usually inside three years.',
      'Movement between divisions, most feasible early and generally toward less front-office-constrained functions.',
      'Exits into asset management, private markets, corporate development and technology firms.',
      'Long careers within engineering and risk that do not depend on moving toward revenue-generating roles.',
    ],
    interviewPrep: [
      'Apply to the division you actually want, and be able to explain the difference between it and the two adjacent ones.',
      'For engineering, prepare as you would for any strong software interview; the finance content is secondary.',
      'For markets and banking roles, be able to reason out loud about valuation and about why a price moved.',
      'Expect behavioural questions about working under pressure, and have specific, owned examples rather than general statements.',
    ],
  },
  'jp-morgan': {
    businessAreas: [
      'Commercial and investment banking — advisory, capital markets, payments, securities services and markets.',
      'Asset and wealth management across institutional and private client segments.',
      'Consumer and community banking, which is largely a US-market business.',
      'Technology — an exceptionally large function covering engineering, cloud, data and cybersecurity.',
      'Risk, compliance, finance, operations and internal audit, which hire in volume across locations.',
    ],
    graduatePrograms: [
      'Analyst programmes by line of business and by function, applied to individually rather than through one general intake.',
      'Software engineering programmes that are among the largest technology graduate intakes in the sector.',
      'Summer internships as the principal feeder, with the application cycle opening a long way ahead.',
      'Distinct programmes for risk, finance, operations and audit, which are less contested than front-office streams.',
    ],
    hiringProcess: [
      'Online application to a specific programme, business and location.',
      'Online assessments, frequently including a game-based or situational component.',
      'A recorded video interview — a few behavioural questions, answered to a camera with no interviewer reacting.',
      'Assessment centre or superday with several interviews in one sitting.',
      'Technical assessment where the role calls for it, particularly in technology and quantitative functions.',
    ],
    careerPaths: [
      'Analyst to associate to vice president, with the pace set by the business rather than by a firm-wide clock.',
      'Internal mobility across a very wide set of businesses, which is a genuine advantage of scale.',
      'Technology careers with senior individual-contributor routes that do not require moving into management.',
      'Exits into asset management, fintech, corporate finance and consulting.',
    ],
    interviewPrep: [
      'Be precise about which line of business you are applying to — the firm is several distinct businesses and the interviews reflect that.',
      'For technology roles, prepare for a genuine engineering interview rather than a finance one.',
      'Prepare a clear answer on why this firm rather than its two closest peers; it is asked and it is scored.',
      'Have examples ready for the standard competency set, structured and owned in the first person.',
    ],
  },
  'morgan-stanley': {
    businessAreas: [
      'Institutional securities — advisory, capital markets, and sales and trading.',
      'Wealth management — a larger share of the firm than at most peers, serving individual clients at scale.',
      'Investment management — managing capital across public and private strategies.',
      'Technology, which supports all three and hires substantially in its own right.',
      'Risk, finance, operations and compliance functions across the firm.',
    ],
    graduatePrograms: [
      'Analyst programmes by division, with applications made to a named division and location.',
      'A summer analyst programme that is the main route into the full-time intake.',
      'Technology analyst programmes recruiting from engineering and quantitative backgrounds.',
      'Operations, finance and risk programmes that are a legitimate and less contested entry route.',
    ],
    hiringProcess: [
      'Online application to a specific division.',
      'Online assessments and a recorded video interview at the early stage.',
      'Divisional interview rounds, frequently several on one day.',
      'Technical content appropriate to the division.',
      'Final interviews with senior divisional staff.',
    ],
    careerPaths: [
      'Analyst through associate to vice president within a division.',
      'Movement between institutional securities and investment management, which happens but requires deliberate positioning.',
      'Wealth management careers, which follow a different shape built around client relationships rather than transactions.',
      'Exits into asset management, private markets and corporate roles.',
    ],
    interviewPrep: [
      'Understand how wealth management differs from institutional work — it is a larger part of this firm than of its peers.',
      'Be able to walk through a valuation at a level appropriate to the division you have applied to.',
      'Prepare for behavioural questions scored against a framework, with specific examples.',
      'Have a reasoned answer for why this firm specifically, grounded in its business mix rather than its reputation.',
    ],
  },
  'deloitte': {
    businessAreas: [
      'Audit and assurance — the statutory core, and the largest graduate intake at most member firms.',
      'Consulting — strategy, technology, operations and human capital work for client organisations.',
      'Risk advisory — controls, cyber, regulatory and internal audit services.',
      'Financial advisory — transactions, valuations, restructuring and forensic work.',
      'Tax and legal services — compliance, advisory and the specialist areas around them.',
    ],
    graduatePrograms: [
      'Very large graduate intakes relative to banks, across all service lines.',
      'Applications made to a specific service line, which determines the first several years of work.',
      'Professional qualification support is standard in audit and tax and is a substantial part of the package.',
      'Vacation and internship schemes that feed the graduate intake.',
    ],
    hiringProcess: [
      'Online application to a service line and office.',
      'Online assessments — numerical, logical and situational judgement.',
      'A recorded or digital interview.',
      'An assessment centre with a group exercise, a case study and a competency interview.',
      'A partner or director interview as the final stage.',
    ],
    careerPaths: [
      'Analyst or associate through senior, manager, senior manager and director, on a defined and reasonably predictable timeline.',
      'Qualification-driven progression in audit and tax, where the exams set part of the pace.',
      'Movement between service lines, which is possible and easiest before manager level.',
      'Exits into industry finance, internal audit, risk functions and corporate strategy — a very well-trodden route.',
    ],
    interviewPrep: [
      'Know which service line you applied to and what its work actually involves day to day.',
      'Prepare for a case study; it appears in some form at almost every assessment centre here.',
      'Have a genuine answer on why professional services rather than industry, and why this firm.',
      'Expect commercial-awareness questions — be able to discuss something happening in a client sector.',
    ],
  },
  'pwc': {
    businessAreas: [
      'Assurance — external audit and a broad set of related assurance services.',
      'Tax and legal services, including compliance, advisory and transfer pricing.',
      'Advisory and consulting — strategy, deals, technology and operational transformation.',
      'Risk services, including internal audit, controls and cyber.',
      'Technology and data functions supporting delivery across every service line above.',
    ],
    graduatePrograms: [
      'Large annual graduate intakes across assurance, tax, and advisory.',
      'Applications to a specific line of service and location.',
      'Professional qualification support as a standard part of assurance and tax roles.',
      'Internship and insight programmes that are a major feeder into graduate offers.',
    ],
    hiringProcess: [
      'Online application to a line of service.',
      'Online assessments covering reasoning and behavioural fit.',
      'A digital or recorded interview.',
      'An assessment centre with written, group and individual exercises.',
      'A final interview, frequently with a partner.',
    ],
    careerPaths: [
      'Associate through senior associate, manager and above on a published progression framework.',
      'Qualification milestones that gate part of the early progression in assurance and tax.',
      'Secondments, including international ones, which are a genuine feature rather than a recruitment line.',
      'Exits into industry finance, risk, and consulting roles at client organisations.',
    ],
    interviewPrep: [
      'Prepare against the firm’s published behavioural framework — it is used consistently across stages.',
      'Be ready for a written exercise; not every candidate expects one and it is scored.',
      'Have a clear answer on line of service, including why not the adjacent one.',
      'Bring one current commercial topic you can discuss with more than a headline’s depth.',
    ],
  },
  'ey': {
    businessAreas: [
      'Assurance — audit, financial accounting advisory and forensic services.',
      'Consulting — technology, business and risk transformation.',
      'Strategy and transactions — corporate finance, valuations, diligence and restructuring.',
      'Tax — compliance, advisory, and people advisory services.',
      'Technology-led delivery functions supporting all service lines.',
    ],
    graduatePrograms: [
      'Substantial graduate intakes across all service lines, with applications to a named one.',
      'Professional qualification support in assurance and tax as standard.',
      'Internship and student programmes that feed graduate hiring.',
      'Technology and data streams that recruit outside the traditional accounting pipeline.',
    ],
    hiringProcess: [
      'Online application to a service line and office.',
      'Online assessments including reasoning and situational judgement.',
      'A recorded or digital interview.',
      'An assessment centre with group and individual exercises.',
      'A final partner or director interview.',
    ],
    careerPaths: [
      'Staff or associate through senior, manager and above, on a defined framework.',
      'Exam-linked progression in assurance and tax during the first few years.',
      'Movement between service lines, most straightforward before manager grade.',
      'Exits into industry finance, internal audit, corporate development and consulting.',
    ],
    interviewPrep: [
      'Be specific about the service line and able to describe its work rather than its name.',
      'Prepare for a case or group exercise — both are common at this stage.',
      'Have a commercial-awareness topic ready, ideally connected to the sector you would serve.',
      'Structure behavioural answers explicitly; the frameworks here reward it.',
    ],
  },
  'kpmg': {
    businessAreas: [
      'Audit — statutory audit and related assurance work, and the largest graduate intake at most member firms.',
      'Tax — compliance and advisory across corporate, indirect and personal tax.',
      'Advisory — deal advisory, management consulting, and risk consulting.',
      'Risk and regulatory services, particularly significant for financial-services clients.',
      'Technology and data functions supporting delivery across service lines.',
    ],
    graduatePrograms: [
      'Large annual graduate intakes, with applications made to a specific service line.',
      'Professional qualification support as a standard component of audit and tax roles.',
      'Vacation schemes and internships as a substantial feeder into graduate offers.',
      'Separate technology and data streams for non-accounting backgrounds.',
    ],
    hiringProcess: [
      'Online application to a service line and location.',
      'Online assessments, commonly including a situational or game-based component.',
      'A digital interview, recorded rather than live, with a fixed time limit per answer.',
      'An assessment centre with a case study, group exercise and interview.',
      'A final interview with a senior member of the service line.',
    ],
    careerPaths: [
      'Associate through senior associate, manager and above on a published progression path.',
      'Qualification milestones during the first years in audit and tax.',
      'Specialisation by client sector, which becomes a genuine career asset by manager level.',
      'Exits into industry finance, internal audit, regulatory roles and consulting.',
    ],
    interviewPrep: [
      'Know the service line and the sector group you would likely sit in, and why.',
      'Prepare for a case study that asks for a recommendation rather than an analysis.',
      'Be able to explain what an audit is actually for, in plain terms, if applying to that line.',
      'Have structured behavioural examples ready against the firm’s stated behaviours.',
    ],
  },
};

/** The copy for one company, or null for an unknown slug. */
export function companyCopyFor(slug: string | undefined): CompanyCopy | null {
  if (!slug) return null;
  return COMPANY_COPY[slug] ?? null;
}
