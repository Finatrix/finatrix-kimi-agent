/**
 * Posting ingest: turns scanned jobs into shared posting records and says, for each one, whether it
 * is new, already seen, reactivated, a repost of an earlier ad, or a same-day variant — and whether
 * the same text is being advertised under another company (agency / board cross-listing).
 *
 * Storage is behind `PostingStore` so the same logic runs on Supabase (see
 * supabase/migrations/20261024000100_careers_engine.sql and careers-scan/store.ts) and in memory.
 */
import type { Job } from '../types.ts';
import { addDays, daysBetween, parseISODate, toISODate } from '../util/text.ts';
import { CROSSLIST_THRESHOLD, CROSSLIST_WINDOW_DAYS, companyIdentity, findCrossListings, fingerprintText } from './fingerprint.ts';
import { computeListingKey } from './listingKey.ts';
import { DEFAULT_WINDOW_DAYS, MIN_REPOST_SPAN_DAYS, titleIdentityKey } from './reposts.ts';
import { isAggregatorUrl, normalizeUrl, postingKey } from './urlKey.ts';

export type PostingStatus = 'active' | 'expired' | 'uncertain';

export interface PostingRecord {
  id: string;
  listingKey: string | null;
  postingKey: string;
  /** Normalised company identity (indexable). */
  companyKey: string;
  company: string;
  title: string;
  location: string;
  url: string;
  requisitionId: string | null;
  fingerprint: string;
  source: string | null;
  firstSeen: string;
  lastSeen: string;
  status: PostingStatus;
  repostOf: string | null;
  aggregator: boolean;
  postedAt: string | null;
  /** What the market layer read from the posting; refreshed on every sighting. */
  details?: PostingDetails | null;
}

/** Facts read from a posting by the market layer. Unknown is null or empty, never a guess. */
export interface PostingDetails {
  /** ISO codes of the markets the posting sits in ("AU", "GB"). */
  countries: string[];
  region: string | null;
  city: string | null;
  workplaceType: 'remote' | 'hybrid' | 'onsite' | null;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  /** "super:excluded", "kiwisaver:included", … or null where the market quotes no contribution. */
  salaryContribution: string | null;
  workRights: { requirement: string; all: string[]; clearance?: string } | null;
  /** Plain-text opening of the description, for search and matching. */
  summary: string;
}

export type PostingEventType = 'added' | 'seen' | 'reactivated' | 'expired' | 'repost' | 'variant';

export interface PostingEvent {
  postingId: string;
  type: PostingEventType;
  at: string;
  detail?: string;
}

export interface PostingStore {
  findByKeys(keys: { listingKey: string | null; postingKey: string }): Promise<PostingRecord | null>;
  /** Postings of one company first seen on/after `sinceISO`. */
  recentForCompany(companyKey: string, sinceISO: string): Promise<PostingRecord[]>;
  /** Postings with a fingerprint first seen on/after `sinceISO`. */
  recentFingerprints(sinceISO: string): Promise<PostingRecord[]>;
  insert(record: Omit<PostingRecord, 'id'>): Promise<PostingRecord>;
  update(id: string, patch: Partial<Omit<PostingRecord, 'id'>>): Promise<void>;
  recordEvent(event: PostingEvent): Promise<void>;
}

export class InMemoryPostingStore implements PostingStore {
  readonly records = new Map<string, PostingRecord>();
  readonly events: PostingEvent[] = [];
  private seq = 0;

  async findByKeys({ listingKey, postingKey: pk }: { listingKey: string | null; postingKey: string }) {
    for (const r of this.records.values()) {
      if ((listingKey && r.listingKey === listingKey) || r.postingKey === pk) return { ...r };
    }
    return null;
  }
  async recentForCompany(companyKey: string, sinceISO: string) {
    return [...this.records.values()].filter((r) => r.companyKey === companyKey && r.firstSeen >= sinceISO).map((r) => ({ ...r }));
  }
  async recentFingerprints(sinceISO: string) {
    return [...this.records.values()].filter((r) => r.fingerprint && r.firstSeen >= sinceISO).map((r) => ({ ...r }));
  }
  async insert(record: Omit<PostingRecord, 'id'>) {
    const created = { ...record, id: `mem_${++this.seq}` };
    this.records.set(created.id, created);
    return { ...created };
  }
  async update(id: string, patch: Partial<Omit<PostingRecord, 'id'>>) {
    const r = this.records.get(id);
    if (r) Object.assign(r, patch);
  }
  async recordEvent(event: PostingEvent) {
    this.events.push(event);
  }
}

export type Disposition = 'new' | 'seen' | 'reactivated' | 'repost' | 'variant';

export interface IngestResult {
  job: Job;
  record: PostingRecord;
  disposition: Disposition;
  /** The earlier posting this one re-lists (repost / variant). */
  repostOf?: string;
  /** Same text, different company, within the cross-listing window. */
  crossListings: Array<{ id: string; company: string; url: string; score: number }>;
}

export interface IngestOptions {
  today?: Date;
  windowDays?: number;
  minSpanDays?: number;
  crossListThreshold?: number;
  /** Provider-specific dedup key (e.g. Workday requisition token). */
  dedupKeyFor?: (job: Job) => string | null;
  /** Extra aggregator domains beyond the built-in list. */
  aggregatorDomains?: string[];
  /** Market-layer reading of a job, stored with its posting (see PostingDetails). */
  describe?: (job: Job) => PostingDetails | null;
}

export interface IngestOutput {
  results: IngestResult[];
  skipped: Array<{ job: Job; reason: 'invalid-url' | 'missing-title' | 'missing-company' }>;
}

export async function ingestJobs(store: PostingStore, jobs: Job[], options: IngestOptions = {}): Promise<IngestOutput> {
  const today = options.today ?? new Date();
  const todayISO = toISODate(today);
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
  const minSpan = options.minSpanDays ?? MIN_REPOST_SPAN_DAYS;
  const repostSince = toISODate(addDays(today, -windowDays));
  const crossSince = toISODate(addDays(today, -CROSSLIST_WINDOW_DAYS));
  const out: IngestOutput = { results: [], skipped: [] };

  for (const job of jobs) {
    const url = normalizeUrl(job.url);
    if (!url) {
      out.skipped.push({ job, reason: 'invalid-url' });
      continue;
    }
    if (!job.title?.trim()) {
      out.skipped.push({ job, reason: 'missing-title' });
      continue;
    }
    if (!job.company?.trim()) {
      out.skipped.push({ job, reason: 'missing-company' });
      continue;
    }

    const listingKey = computeListingKey(job.listingIdentity);
    const pKey = options.dedupKeyFor?.(job) ?? postingKey(job.url);
    const existing = await store.findByKeys({ listingKey, postingKey: pKey });

    if (existing) {
      const reactivated = existing.status === 'expired';
      const details = options.describe?.(job);
      await store.update(existing.id, {
        lastSeen: todayISO,
        status: 'active',
        title: job.title,
        location: job.location || existing.location,
        url,
        ...(details !== undefined ? { details } : {}),
      });
      await store.recordEvent({ postingId: existing.id, type: reactivated ? 'reactivated' : 'seen', at: todayISO });
      out.results.push({ job, record: { ...existing, lastSeen: todayISO, status: 'active' }, disposition: reactivated ? 'reactivated' : 'seen', crossListings: [] });
      continue;
    }

    const companyKey = companyIdentity(job.company);
    const aggregator = isAggregatorUrl(job.url, options.aggregatorDomains ?? []);
    const fingerprint = fingerprintText(job.description);

    let disposition: Disposition = 'new';
    let repostOf: string | undefined;
    if (!aggregator) {
      const sameCompany = await store.recentForCompany(companyKey, repostSince);
      const titleKey = titleIdentityKey(job.title);
      const earlier = sameCompany
        .filter((r) => r.postingKey !== pKey && titleIdentityKey(r.title) === titleKey)
        .sort((a, b) => a.firstSeen.localeCompare(b.firstSeen))[0];
      if (earlier) {
        const from = parseISODate(earlier.firstSeen);
        const span = from ? daysBetween(from, today) : 0;
        disposition = span >= minSpan ? 'repost' : 'variant';
        repostOf = earlier.id;
      }
    }

    const record = await store.insert({
      listingKey,
      postingKey: pKey,
      companyKey,
      company: job.company.trim(),
      title: job.title.trim(),
      location: job.location ?? '',
      url,
      requisitionId: job.requisitionId ?? null,
      fingerprint,
      source: job.source ?? null,
      firstSeen: todayISO,
      lastSeen: todayISO,
      status: 'active',
      repostOf: repostOf ?? null,
      aggregator,
      postedAt: job.postedAt ? new Date(job.postedAt).toISOString() : null,
      details: options.describe?.(job) ?? null,
    });
    await store.recordEvent({ postingId: record.id, type: disposition === 'new' ? 'added' : disposition, at: todayISO, ...(repostOf ? { detail: repostOf } : {}) });

    let crossListings: IngestResult['crossListings'] = [];
    if (fingerprint) {
      const history = (await store.recentFingerprints(crossSince))
        .filter((r) => r.id !== record.id)
        .map((r) => ({ id: r.id, company: r.company, url: r.url, fingerprint: r.fingerprint, dateStr: r.firstSeen }));
      crossListings = findCrossListings(
        [{ company: record.company, url: record.url, fingerprint }],
        history,
        { threshold: options.crossListThreshold ?? CROSSLIST_THRESHOLD, windowDays: CROSSLIST_WINDOW_DAYS, today },
      ).map((m) => ({ id: m.row.id, company: m.row.company, url: m.row.url, score: m.score }));
    }
    out.results.push({ job, record, disposition, ...(repostOf ? { repostOf } : {}), crossListings });
  }
  return out;
}

/** Mark postings expired from liveness verdicts. Only a definite `expired` changes status. */
export async function applyLivenessVerdicts(
  store: PostingStore,
  verdicts: Array<{ id: string; result: 'active' | 'expired' | 'uncertain'; reason?: string }>,
  today = new Date(),
): Promise<{ expired: number; active: number; uncertain: number }> {
  const at = toISODate(today);
  const tally = { expired: 0, active: 0, uncertain: 0 };
  for (const v of verdicts) {
    tally[v.result]++;
    if (v.result === 'expired') {
      await store.update(v.id, { status: 'expired' });
      await store.recordEvent({ postingId: v.id, type: 'expired', at, ...(v.reason ? { detail: v.reason } : {}) });
    } else if (v.result === 'active') {
      await store.update(v.id, { status: 'active', lastSeen: at });
    }
  }
  return tally;
}
