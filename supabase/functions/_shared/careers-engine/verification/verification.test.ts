import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Job } from '../types.ts';
import {
  aggregatorPostingId,
  applyLivenessVerdicts,
  checkPostingLiveness,
  checkPostingsLiveness,
  classifyLiveness,
  computeListingKey,
  detectReposts,
  findCrossListings,
  findDuplicateCandidates,
  fingerprintText,
  hammingDistance,
  ingestJobs,
  InMemoryPostingStore,
  isAggregatorUrl,
  isListingKey,
  normalizeUrl,
  pastClosingDate,
  planApiCheck,
  postingKey,
  roleFuzzyMatch,
  similarity,
  titleIdentityKey,
} from './index.ts';

const JD = (extra = '') =>
  `Financial Crime Analyst. You will review customer files, perform KYC and customer due diligence, screen names against sanctions lists, document findings clearly and escalate suspicious matters to the AML/CTF compliance officer. You will work with the onboarding team to keep turnaround times short while meeting every regulatory obligation under the AML/CTF Act and AUSTRAC guidance. The team values accuracy, curiosity and clear written communication. ${extra}`;

describe('urls and keys', () => {
  it('strips tracking parameters, fragments and trailing slashes', () => {
    expect(normalizeUrl('https://careers.example.com/jobs/123/?utm_source=x&gh_src=y#apply')).toBe(normalizeUrl('https://careers.example.com/jobs/123'));
  });
  it('treats SEEK URLs for one job as the same posting', () => {
    expect(postingKey('https://www.seek.com.au/job/12345678?type=standard&ref=search-saved')).toBe(postingKey('https://seek.com.au/job/12345678'));
    expect(isAggregatorUrl('https://www.seek.com.au/job/12345678')).toBe(true);
    expect(isAggregatorUrl('https://careers.westpac.com.au/job/1')).toBe(false);
  });
  it('reads aggregator posting ids', () => {
    expect(aggregatorPostingId('https://www.seek.com.au/job/12345678')).toEqual({ domain: 'seek.com.au', id: '12345678' });
    expect(aggregatorPostingId('https://www.linkedin.com/jobs/view/analyst-at-x-3912345678')?.id).toBe('3912345678');
  });
  it('listing key is byte-compatible with career-ops', () => {
    const key = computeListingKey({ ats_provider: 'greenhouse', board_slug: 'acme', posting_id: '123' });
    const expected = `listing_v1_${createHash('sha256').update(JSON.stringify(['listing-fingerprint', 1, 'greenhouse', 'acme', '123']), 'utf8').digest('hex')}`;
    expect(key).toBe(expected);
    expect(isListingKey(key)).toBe(true);
    expect(computeListingKey({ ats_provider: 'greenhouse', board_slug: 'acme' })).toBeNull();
    expect(computeListingKey({ ats_provider: 'Green House', board_slug: 'a', posting_id: '1' })).toBeNull();
  });
});

describe('fingerprints and cross-listings', () => {
  it('is stable across case, whitespace and markup', () => {
    const a = fingerprintText(JD());
    const b = fingerprintText(`<p>${JD().toUpperCase().replace(/ /g, '  ')}</p>`);
    expect(similarity(a, b)).toBe(1);
  });
  it('separates different roles', () => {
    const other = 'Barista. Pour coffee, steam milk, keep the counter clean and greet every customer with a smile. Opening shifts start at five in the morning and finish at two. Weekend work is required and training is provided on the job. You will also help with stocktake, ordering and closing the register at the end of each shift without fail.';
    expect(similarity(fingerprintText(JD()), fingerprintText(other))).toBeLessThan(0.8);
    expect(hammingDistance('00', '0')).toBeNull();
  });
  it('flags the same text under a different company, not the same company', () => {
    const fp = fingerprintText(JD());
    const history = [{ company: 'Example Bank', url: 'https://bank.example/job/1', fingerprint: fp, dateStr: '2026-10-10' }];
    const today = new Date('2026-10-24T00:00:00Z');
    expect(findCrossListings([{ company: 'Hays Recruitment', url: 'https://hays.example/1', fingerprint: fp }], history, { today })).toHaveLength(1);
    expect(findCrossListings([{ company: 'Example Bank Pty Ltd', url: 'https://bank.example/job/2', fingerprint: fp }], history, { today })).toHaveLength(0);
    expect(findCrossListings([{ company: 'Hays', url: 'https://hays.example/1', fingerprint: fp }], [{ ...history[0]!, dateStr: '2026-01-01' }], { today })).toHaveLength(0);
  });
});

describe('reposts', () => {
  const row = (url: string, dateStr: string, title = 'Risk Analyst', company = 'Example Bank') => ({ url, date: new Date(`${dateStr}T00:00:00Z`), dateStr, title, company });
  it('clusters a re-listing under a new URL within the window', () => {
    const c = detectReposts([row('https://x/1', '2026-08-01'), row('https://x/2', '2026-09-01')]);
    expect(c).toHaveLength(1);
    expect(c[0]!.repostCount).toBe(2);
    expect(c[0]!.daysSpan).toBe(31);
  });
  it('ignores same-day variants and anything outside the window', () => {
    expect(detectReposts([row('https://x/1', '2026-08-01'), row('https://x/2', '2026-08-01')])).toHaveLength(0);
    expect(detectReposts([row('https://x/1', '2026-01-01'), row('https://x/2', '2026-09-01')])).toHaveLength(0);
  });
  it('matches titles regardless of word order, and skips aggregators', () => {
    expect(titleIdentityKey('Risk Analyst, Credit')).toBe(titleIdentityKey('Credit Risk Analyst'));
    const rows = [row('https://x/1', '2026-08-01', 'Credit Risk Analyst'), row('https://x/2', '2026-09-01', 'Risk Analyst, Credit')];
    expect(detectReposts(rows)).toHaveLength(1);
    expect(detectReposts(rows, 90, 1, new Set(['example bank']))).toHaveLength(0);
  });
});

describe('duplicates and role matching', () => {
  const mine = [
    { id: '1', company: 'Westpac', title: 'Graduate Financial Crime Analyst', url: 'https://careers.westpac.com.au/job/9?utm_source=a', status: 'rejected' },
    { id: '2', company: 'Westpac Banking Corporation', title: 'Compliance Analyst' },
  ];
  it('finds the same URL at tier 1 and warns on a rejected application', () => {
    const [hit] = findDuplicateCandidates(mine, { company: 'Westpac', title: 'Anything', url: 'https://careers.westpac.com.au/job/9' });
    expect(hit?.tier).toBe(1);
    expect(hit?.reason).toBe('url');
    expect(hit?.warning).toBe(true);
  });
  it('finds the same title at tier 2', () => {
    const hits = findDuplicateCandidates(mine, { company: 'Westpac', title: 'Financial Crime Analyst Graduate' });
    expect(hits.find((h) => h.row.id === '1')?.reason).toBe('same-title');
  });
  it('knows AU specialty titles', () => {
    expect(roleFuzzyMatch('AML/CTF Analyst', 'AML CTF Analyst')).toBe(true);
    expect(roleFuzzyMatch('KYC Analyst', 'Fraud Analyst')).toBe(false);
    expect(roleFuzzyMatch('Graduate Risk Analyst', 'Senior Risk Analyst')).toBe(false);
  });
});

describe('classifyLiveness', () => {
  const now = new Date('2026-10-24T00:00:00Z');
  const body = (s: string) => `${s} ${'Role description and responsibilities. '.repeat(10)}`;
  it('maps HTTP status', () => {
    expect(classifyLiveness({ status: 404 }).result).toBe('expired');
    expect(classifyLiveness({ status: 410 }).result).toBe('expired');
    expect(classifyLiveness({ status: 403 }).result).toBe('uncertain');
    expect(classifyLiveness({ status: 429 }).code).toBe('access_blocked');
    expect(classifyLiveness({ status: 502 }).code).toBe('server_error');
  });
  it('detects Australian expired wording', () => {
    for (const phrase of ['This job is no longer advertised', 'This vacancy is now closed', 'The closing date has passed', 'Job no longer available']) {
      expect(classifyLiveness({ status: 200, bodyText: body(phrase), applyControls: ['Apply now'] }).result).toBe('expired');
    }
  });
  it('does not call marketing copy about the future "expired"', () => {
    expect(classifyLiveness({ status: 200, bodyText: body('We will keep your CV on file until the job is no longer available.'), applyControls: ['Apply now'] }).result).toBe('active');
  });
  it('treats a visible apply control as active', () => {
    expect(classifyLiveness({ status: 200, bodyText: body('Financial Crime Analyst'), applyControls: ['Apply now'] })).toMatchObject({ result: 'active', code: 'apply_control_visible' });
  });
  it('is uncertain behind a bot challenge and when sent off the posting', () => {
    expect(classifyLiveness({ status: 200, bodyText: 'Just a moment... Checking your browser before accessing' }).result).toBe('uncertain');
    expect(classifyLiveness({ status: 200, requestedUrl: 'https://c.example/jobs/774411', finalUrl: 'https://c.example/careers', bodyText: body('Search jobs') }).code).toBe('redirected_off_posting');
  });
  it('reads an empty page as insufficient content', () => {
    expect(classifyLiveness({ status: 200, bodyText: 'Home | Jobs | Contact' }).code).toBe('insufficient_content');
  });
  it('uses Australian closing dates, only when every date is past', () => {
    expect(pastClosingDate('Closing date: 15/09/2026', now)).toBe('2026-09-15');
    expect(pastClosingDate('Closing date: 15 September 2026. Applications close 15 November 2026', now)).toBeNull();
    expect(pastClosingDate('Applications close 24 October 2026', now)).toBeNull();
    expect(classifyLiveness({ status: 200, bodyText: body('Closing date: 15 September 2026'), applyControls: ['Apply'], now })).toMatchObject({ result: 'expired', code: 'deadline_passed' });
  });
});

describe('planApiCheck and checkPostingLiveness', () => {
  it('plans API checks for known ATS URLs', () => {
    expect(planApiCheck('https://boards.greenhouse.io/acme/jobs/12345')?.ats).toBe('greenhouse');
    expect(planApiCheck('https://jobs.lever.co/acme/abcd-1234')?.ats).toBe('lever');
    expect(planApiCheck('https://example.com/careers/1')).toBeNull();
    expect(planApiCheck('http://boards.greenhouse.io/acme/jobs/1')).toBeNull();
    expect(planApiCheck('https://boards.greenhouse.io/../jobs/1')).toBeNull();
  });

  const resp = (status: number, body: string, headers: Record<string, string> = {}) => new Response(body, { status, headers: { 'content-type': 'text/html', ...headers } });

  it('Greenhouse 404 is authoritative: expired via api', async () => {
    const fetchImpl = (async () => resp(404, '{}')) as typeof fetch;
    const r = await checkPostingLiveness('https://boards.greenhouse.io/acme/jobs/12345', { fetchImpl });
    expect(r).toMatchObject({ result: 'expired', via: 'api' });
  });

  it('an unrendered career page is uncertain, never expired', async () => {
    const fetchImpl = (async () => resp(200, '<html><body><div id="root"></div></body></html>')) as typeof fetch;
    const r = await checkPostingLiveness('https://careers.example.com/job/99', { fetchImpl, skipApi: true });
    expect(r.result).toBe('uncertain');
    expect(r.code).toBe('unrendered');
  });

  it('a rendered page with an apply button is active via an injected renderer', async () => {
    const fetchImpl = (async () => resp(200, '<html></html>')) as typeof fetch;
    const renderer = async () => ({ status: 200, finalUrl: 'https://careers.example.com/job/99', bodyText: `Financial Crime Analyst ${'duties '.repeat(60)}`, applyControls: ['Apply now'] });
    const r = await checkPostingLiveness('https://careers.example.com/job/99', { fetchImpl, renderer });
    expect(r).toMatchObject({ result: 'active', via: 'renderer' });
  });

  it('never throws on network failure', async () => {
    const fetchImpl = (async () => { throw new Error('ECONNRESET'); }) as typeof fetch;
    const r = await checkPostingLiveness('https://careers.example.com/job/99', { fetchImpl, skipApi: true });
    expect(r).toMatchObject({ result: 'uncertain', code: 'unreachable' });
  });

  it('refuses to follow a redirect to a private address', async () => {
    const fetchImpl = (async () => resp(302, '', { location: 'https://127.0.0.1/admin' })) as typeof fetch;
    const r = await checkPostingLiveness('https://careers.example.com/job/99', { fetchImpl, skipApi: true });
    expect(r.result).toBe('uncertain');
  });

  it('batch check keeps results by id', async () => {
    const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => (String(input).includes('gone') ? resp(404, '') : resp(200, '<html></html>'))) as typeof fetch;
    const out = await checkPostingsLiveness(
      [{ id: 'a', url: 'https://careers.example.com/gone/1' }, { id: 'b', url: 'https://careers.example.com/open/2' }],
      { fetchImpl, skipApi: true, perHostDelayMs: 0, sleep: async () => {} },
    );
    expect(out.get('a')?.result).toBe('expired');
    expect(out.get('b')?.result).toBe('uncertain');
  });
});

describe('ingestJobs', () => {
  const job = (over: Partial<Job> = {}): Job => ({ title: 'Financial Crime Analyst', company: 'Example Bank', location: 'Sydney NSW', url: 'https://careers.example.com/job/1', description: JD(), ...over });

  it('walks new -> seen -> reactivated -> repost, and records events', async () => {
    const store = new InMemoryPostingStore();
    const d1 = new Date('2026-08-01T00:00:00Z');
    const first = await ingestJobs(store, [job()], { today: d1 });
    expect(first.results[0]!.disposition).toBe('new');

    const again = await ingestJobs(store, [job()], { today: new Date('2026-08-05T00:00:00Z') });
    expect(again.results[0]!.disposition).toBe('seen');

    await applyLivenessVerdicts(store, [{ id: first.results[0]!.record.id, result: 'expired', reason: 'gone' }], new Date('2026-08-10T00:00:00Z'));
    const back = await ingestJobs(store, [job()], { today: new Date('2026-08-12T00:00:00Z') });
    expect(back.results[0]!.disposition).toBe('reactivated');

    const repost = await ingestJobs(store, [job({ url: 'https://careers.example.com/job/2' })], { today: new Date('2026-09-15T00:00:00Z') });
    expect(repost.results[0]!.disposition).toBe('repost');
    expect(repost.results[0]!.repostOf).toBe(first.results[0]!.record.id);
    expect(store.events.map((e) => e.type)).toEqual(expect.arrayContaining(['added', 'seen', 'expired', 'reactivated', 'repost']));
  });

  it('treats a same-day second URL as a variant', async () => {
    const store = new InMemoryPostingStore();
    const today = new Date('2026-08-01T00:00:00Z');
    await ingestJobs(store, [job()], { today });
    const out = await ingestJobs(store, [job({ url: 'https://careers.example.com/job/2', location: 'Melbourne VIC' })], { today });
    expect(out.results[0]!.disposition).toBe('variant');
  });

  it('reports a cross-listing when an agency copies the text', async () => {
    const store = new InMemoryPostingStore();
    const today = new Date('2026-08-01T00:00:00Z');
    await ingestJobs(store, [job()], { today });
    const out = await ingestJobs(store, [job({ company: 'Hays', url: 'https://hays.example/job/77' })], { today: new Date('2026-08-03T00:00:00Z') });
    expect(out.results[0]!.crossListings).toHaveLength(1);
    expect(out.results[0]!.crossListings[0]!.company).toBe('Example Bank');
  });

  it('skips unusable jobs with a reason', async () => {
    const store = new InMemoryPostingStore();
    const out = await ingestJobs(store, [job({ url: 'not a url' }), job({ title: ' ' }), job({ company: '' })]);
    expect(out.skipped.map((s) => s.reason)).toEqual(['invalid-url', 'missing-title', 'missing-company']);
  });

  it('uncertain verdicts never expire a posting', async () => {
    const store = new InMemoryPostingStore();
    const first = await ingestJobs(store, [job()], { today: new Date('2026-08-01T00:00:00Z') });
    const tally = await applyLivenessVerdicts(store, [{ id: first.results[0]!.record.id, result: 'uncertain' }]);
    expect(tally).toEqual({ expired: 0, active: 0, uncertain: 1 });
    expect(store.records.get(first.results[0]!.record.id)!.status).toBe('active');
  });
});
