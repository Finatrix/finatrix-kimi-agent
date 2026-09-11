/**
 * Where does this "Apply" button actually go?
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE BUG THIS EXISTS TO FIX
 * ────────────────────────────────────────────────────────────────────────────
 * Every result rendered a button labelled "Apply ↗" pointing at
 * `job.apply_url`, regardless of what that URL was. For several providers it
 * is not the job posting at all:
 *
 *   adzuna    apply_url = j.redirect_url   → adzuna.com/land/ad/… tracking bounce
 *   remotive  apply_url = j.url            → remotive.com listing, not the employer
 *   jooble    apply_url = j.link           → jooble redirect
 *
 * So the single most important action in the product — apply to this job —
 * frequently dumped the user on an aggregator's landing page and made them
 * search again. That is the difference between a job platform and a link farm,
 * and it is corrosive to trust in everything else the product says.
 *
 * Two things follow, and this module supplies the fact both need:
 *
 *  1. TELL THE TRUTH IN THE LABEL. A link to an employer's own ATS says
 *     "Apply"; a link to an aggregator says "View on Adzuna". The user decides
 *     with their eyes open instead of discovering it after the click.
 *
 *  2. PREFER THE DIRECT SOURCE. The same job is often carried by an aggregator
 *     AND published on the employer's own ATS. When both are present the
 *     employer's copy must win — see `search/dedupe.ts`. This is exactly the
 *     rule the Company Registry's search-integration contract specifies for
 *     `trust: 'verified_employer'`.
 *
 * Host lists are matched on the registrable suffix, so `asx.wd105.
 * myworkdayjobs.com` and `boards.greenhouse.io` both resolve correctly.
 */

/**
 * Applicant tracking systems and employer-hosted career platforms. A posting
 * on one of these IS the employer's own canonical listing — applying there
 * submits an application, it does not bounce anywhere.
 */
const ATS_HOSTS: readonly string[] = [
  'myworkdayjobs.com', 'myworkdaysite.com', 'wd1.myworkdaycdn.com',
  'greenhouse.io', 'lever.co', 'ashbyhq.com', 'smartrecruiters.com',
  'workable.com', 'bamboohr.com', 'jobvite.com', 'icims.com',
  'taleo.net', 'successfactors.com', 'successfactors.eu', 'oraclecloud.com',
  'recruitee.com', 'personio.de', 'teamtailor.com', 'pinpointhq.com',
  'jazz.co', 'applytojob.com', 'breezy.hr', 'workforcenow.adp.com',
  'eightfold.ai', 'phenompeople.com', 'avature.net', 'brassring.com',
  'zohorecruit.com', 'freshteam.com', 'darwinbox.com', 'keka.com',
];

/**
 * Job boards and aggregators. A link here is a listing or a tracking redirect,
 * never the employer's own application form.
 */
const AGGREGATOR_HOSTS: readonly string[] = [
  'adzuna.com', 'adzuna.in', 'adzuna.co.uk', 'adzuna.com.au',
  'jooble.org', 'remotive.com', 'remotive.io',
  'indeed.com', 'linkedin.com', 'glassdoor.com', 'monster.com',
  'ziprecruiter.com', 'naukri.com', 'shine.com', 'timesjobs.com',
  'seek.com.au', 'reed.co.uk', 'totaljobs.com', 'simplyhired.com',
  'careerjet.com', 'neuvoo.com', 'talent.com', 'jobstreet.com',
  'glassdoor.co.in', 'foundit.in', 'instahyre.com', 'cutshort.io',
];

export type ApplyKind = 'direct' | 'aggregator' | 'unknown';

export interface ApplyTarget {
  kind: ApplyKind;
  /** Registrable host, for display ("adzuna.in") and debugging. */
  host: string;
  /**
   * What the button should say. "Apply" only when the click really does lead
   * to an application form.
   */
  label: string;
  /**
   * True when this is the employer's own canonical posting. Feeds the
   * "Verified employer" badge and wins cross-provider dedupe.
   */
  direct: boolean;
}

/** Strip a leading "www." and lowercase; returns '' for an unparseable URL. */
function hostOf(url: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Does `host` equal one of `list`, or sit beneath it as a subdomain? */
function matches(host: string, list: readonly string[]): string | null {
  for (const entry of list) {
    if (host === entry || host.endsWith(`.${entry}`)) return entry;
  }
  return null;
}

/**
 * Classify an apply URL.
 *
 * `via` is the provider's display name, used only to word the aggregator
 * label when the host is unhelpful (a shortened or proxied redirect).
 */
export function classifyApplyUrl(url: string, via = ''): ApplyTarget {
  const host = hostOf(url);
  if (!host) return { kind: 'unknown', host: '', label: 'View posting', direct: false };

  if (matches(host, ATS_HOSTS)) {
    return { kind: 'direct', host, label: 'Apply', direct: true };
  }

  const aggregator = matches(host, AGGREGATOR_HOSTS);
  if (aggregator) {
    // The DESTINATION names the label, never the provider's `via`. Jooble
    // reports the board a listing originated on ("Decentrajobs.com") while the
    // link itself goes to jooble.org — naming the origin would reintroduce the
    // exact deception this module exists to remove, just with a different
    // wrong name. `via` is only a fallback for a host we cannot name.
    const name = aggregator.replace(/\.(com|org|in|io|net|co\.uk|com\.au)$/, '') || via;
    return {
      kind: 'aggregator',
      host,
      label: `View on ${name.charAt(0).toUpperCase()}${name.slice(1)}`,
      direct: false,
    };
  }

  // Anything else is most likely the employer's own careers site (a custom
  // domain, a self-hosted board). Treated as direct — it is the company's
  // page — but labelled without promising an application form we cannot see.
  return { kind: 'direct', host, label: 'Apply on company site', direct: true };
}

/**
 * True when this posting comes from the employer's own ATS or careers site.
 * The signal the registry contract calls `trust: 'verified_employer'`.
 */
export function isDirectEmployerUrl(url: string): boolean {
  return classifyApplyUrl(url).direct;
}
