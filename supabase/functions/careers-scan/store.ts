/**
 * PostingStore on Supabase (PostgREST, service role). Mirrors the engine's original PgPostingStore query for
 * query, so ingest behaves the same as it did on node-postgres.
 *
 * Two lookups run once per new posting inside ingest (same-company history and cross-listing fingerprints), so
 * both are cached for the life of the store and kept current as rows are inserted. A store lives for one scan run.
 */
import type {
  PostingDetails,
  PostingEvent,
  PostingRecord,
  PostingStore,
} from '../_shared/careers-engine/verification/ingest.ts';

export interface DbError {
  message: string;
  code?: string;
}

export interface DbResult<T = unknown> {
  data: T | null;
  error: DbError | null;
}

/** The slice of the supabase-js query builder this store uses. */
export interface Query extends PromiseLike<DbResult> {
  select(columns: string): Query;
  insert(rows: unknown): Query;
  upsert(rows: unknown, options?: { onConflict?: string; ignoreDuplicates?: boolean }): Query;
  update(patch: unknown): Query;
  eq(column: string, value: unknown): Query;
  neq(column: string, value: unknown): Query;
  gte(column: string, value: unknown): Query;
  lt(column: string, value: unknown): Query;
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): Query;
  range(from: number, to: number): Query;
  limit(count: number): Query;
}

export interface Db {
  from(table: string): Query;
}

const COLUMNS =
  'id, listing_key, posting_key, company_key, company, title, location, url, requisition_id, fingerprint, source, first_seen, last_seen, status, repost_of, aggregator, posted_at';

const PAGE = 1000;
const UNIQUE_VIOLATION = '23505';

type Row = Record<string, unknown>;

function toRecord(row: Row): PostingRecord {
  return {
    id: String(row.id),
    listingKey: (row.listing_key as string | null) ?? null,
    postingKey: String(row.posting_key),
    companyKey: String(row.company_key),
    company: String(row.company),
    title: String(row.title),
    location: String(row.location ?? ''),
    url: String(row.url),
    requisitionId: (row.requisition_id as string | null) ?? null,
    fingerprint: String(row.fingerprint ?? ''),
    source: (row.source as string | null) ?? null,
    firstSeen: String(row.first_seen),
    lastSeen: String(row.last_seen),
    status: row.status as PostingRecord['status'],
    repostOf: (row.repost_of as string | null) ?? null,
    aggregator: Boolean(row.aggregator),
    postedAt: row.posted_at == null ? null : String(row.posted_at),
  };
}

function detailColumns(details: PostingDetails | null | undefined): Row {
  if (!details) return {};
  return {
    countries: details.countries,
    region: details.region,
    city: details.city,
    workplace_type: details.workplaceType,
    employment_type: details.employmentType,
    salary_min: details.salaryMin,
    salary_max: details.salaryMax,
    salary_currency: details.salaryCurrency,
    salary_period: details.salaryPeriod,
    salary_contribution: details.salaryContribution,
    work_rights: details.workRights,
    summary: details.summary,
  };
}

/** Column for each updatable field. Anything else in a patch is ignored. */
const UPDATABLE: Record<string, string> = {
  listingKey: 'listing_key',
  title: 'title',
  location: 'location',
  url: 'url',
  requisitionId: 'requisition_id',
  fingerprint: 'fingerprint',
  source: 'source',
  lastSeen: 'last_seen',
  status: 'status',
  repostOf: 'repost_of',
  aggregator: 'aggregator',
  postedAt: 'posted_at',
};

function fail(what: string, error: DbError): never {
  throw new Error(`${what}: ${error.message}`);
}

interface Caches {
  /** `${companyKey}\0${sinceISO}` → postings. */
  company: Map<string, PostingRecord[]>;
  /** sinceISO → postings with a fingerprint. */
  fingerprints: Map<string, PostingRecord[]>;
}

export class SupabasePostingStore implements PostingStore {
  /** `sourceId` stamps every inserted or refreshed posting with the employer it came from. */
  constructor(
    private readonly db: Db,
    private readonly sourceId: string | null = null,
    private readonly caches: Caches = { company: new Map(), fingerprints: new Map() },
  ) {}

  /** A store for one employer that shares this store's caches. */
  forSource(sourceId: string): SupabasePostingStore {
    return new SupabasePostingStore(this.db, sourceId, this.caches);
  }

  private async selectAll(what: string, build: () => Query): Promise<PostingRecord[]> {
    const out: PostingRecord[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await build().range(from, from + PAGE - 1);
      if (error) fail(what, error);
      const rows = (data as Row[] | null) ?? [];
      out.push(...rows.map(toRecord));
      if (rows.length < PAGE) return out;
    }
  }

  async findByKeys({ listingKey, postingKey }: { listingKey: string | null; postingKey: string }): Promise<PostingRecord | null> {
    // Listing identity is the stronger key, so it is tried first (as the original `order by` did).
    if (listingKey) {
      const { data, error } = await this.db.from('career_postings').select(COLUMNS).eq('listing_key', listingKey).limit(1);
      if (error) fail('find by listing key', error);
      const row = (data as Row[] | null)?.[0];
      if (row) return toRecord(row);
    }
    const { data, error } = await this.db.from('career_postings').select(COLUMNS).eq('posting_key', postingKey).limit(1);
    if (error) fail('find by posting key', error);
    const row = (data as Row[] | null)?.[0];
    return row ? toRecord(row) : null;
  }

  async recentForCompany(companyKey: string, sinceISO: string): Promise<PostingRecord[]> {
    const key = `${companyKey}\u0000${sinceISO}`;
    let rows = this.caches.company.get(key);
    if (!rows) {
      rows = await this.selectAll('recent for company', () =>
        this.db.from('career_postings').select(COLUMNS).eq('company_key', companyKey).gte('first_seen', sinceISO).order('first_seen'),
      );
      this.caches.company.set(key, rows);
    }
    return rows.map((r) => ({ ...r }));
  }

  async recentFingerprints(sinceISO: string): Promise<PostingRecord[]> {
    let rows = this.caches.fingerprints.get(sinceISO);
    if (!rows) {
      rows = await this.selectAll('recent fingerprints', () =>
        this.db.from('career_postings').select(COLUMNS).neq('fingerprint', '').gte('first_seen', sinceISO).order('first_seen'),
      );
      this.caches.fingerprints.set(sinceISO, rows);
    }
    return rows.map((r) => ({ ...r }));
  }

  async insert(record: Omit<PostingRecord, 'id'>): Promise<PostingRecord> {
    const row = {
      listing_key: record.listingKey,
      posting_key: record.postingKey,
      company_key: record.companyKey,
      company: record.company,
      title: record.title,
      location: record.location,
      url: record.url,
      requisition_id: record.requisitionId,
      fingerprint: record.fingerprint,
      source: record.source,
      first_seen: record.firstSeen,
      last_seen: record.lastSeen,
      status: record.status,
      repost_of: record.repostOf,
      aggregator: record.aggregator,
      posted_at: record.postedAt,
      source_id: this.sourceId,
      ...detailColumns(record.details),
    };
    const { data, error } = await this.db
      .from('career_postings')
      .upsert(row, { onConflict: 'posting_key', ignoreDuplicates: true })
      .select(COLUMNS);
    if (error && error.code !== UNIQUE_VIOLATION) fail('insert posting', error);
    const inserted = (data as Row[] | null)?.[0];
    if (inserted) {
      const created = toRecord(inserted);
      this.remember(created);
      return created;
    }
    // Another scan inserted the same posting first: return that row instead of failing the run.
    const existing = await this.findByKeys({ listingKey: record.listingKey, postingKey: record.postingKey });
    if (existing) return existing;
    throw new Error(`career_postings insert conflicted but no row found for ${record.postingKey}`);
  }

  private remember(record: PostingRecord): void {
    for (const [key, rows] of this.caches.company) {
      const [companyKey, since] = key.split('\u0000');
      if (companyKey === record.companyKey && record.firstSeen >= since!) rows.push(record);
    }
    if (!record.fingerprint) return;
    for (const [since, rows] of this.caches.fingerprints) if (record.firstSeen >= since) rows.push(record);
  }

  async update(id: string, patch: Partial<Omit<PostingRecord, 'id'>>): Promise<void> {
    const columns: Row = {};
    for (const [field, column] of Object.entries(UPDATABLE)) {
      if (field in patch) columns[column] = (patch as Row)[field];
    }
    if ('details' in patch) Object.assign(columns, detailColumns(patch.details));
    if (this.sourceId && 'lastSeen' in patch) columns.source_id = this.sourceId;
    if (Object.keys(columns).length === 0) return;
    const { error } = await this.db.from('career_postings').update(columns).eq('id', id);
    if (error) fail('update posting', error);
  }

  async recordEvent(event: PostingEvent): Promise<void> {
    const { error } = await this.db
      .from('posting_events')
      .insert({ posting_id: event.postingId, type: event.type, at: event.at, detail: event.detail ?? null });
    if (error) fail('record posting event', error);
  }

  /** Active postings of this store's employer that the latest complete scan did not see. */
  async unseenSince(todayISO: string): Promise<string[]> {
    if (!this.sourceId) return [];
    const rows = await this.selectAll('unseen postings', () =>
      this.db
        .from('career_postings')
        .select(COLUMNS)
        .eq('source_id', this.sourceId)
        .eq('status', 'active')
        .lt('last_seen', todayISO)
        .order('last_seen'),
    );
    return rows.map((r) => r.id);
  }
}
