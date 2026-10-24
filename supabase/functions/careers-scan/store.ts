/**
 * PostingStore on Supabase (PostgREST, service role), shaped for the edge CPU limit.
 *
 * Ingest asks the store about one posting at a time. Answering each question with its own request cost about
 * four round trips per posting, and a 700-request employer exhausted the function's CPU allowance (HTTP 546).
 * So the store works as a unit of work per employer:
 *  - `prefetch` looks up every key of the board in a few chunked `in` queries before ingest starts;
 *  - inserts, updates and events are queued, and `flush` writes them in bulk;
 *  - same-company history and cross-listing fingerprints are cached for the whole run.
 * Callers must `flush` before reading state back from the database (see run.ts).
 */
import { randomUUID } from 'node:crypto';
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
  in(column: string, values: readonly unknown[]): Query;
  is(column: string, value: null): Query;
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
const WRITE_CHUNK = 200;
const EVENT_CHUNK = 500;
/** Keys per `in` lookup, bounded by URL length as well as count (posting keys are URL-like). */
const LOOKUP_MAX_KEYS = 60;
const LOOKUP_MAX_CHARS = 3_000;
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

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Chunks of keys whose joined length stays under the URL budget. */
function keyChunks(keys: readonly string[]): string[][] {
  const out: string[][] = [];
  let current: string[] = [];
  let chars = 0;
  for (const key of keys) {
    if (current.length > 0 && (current.length >= LOOKUP_MAX_KEYS || chars + key.length > LOOKUP_MAX_CHARS)) {
      out.push(current);
      current = [];
      chars = 0;
    }
    current.push(key);
    chars += key.length + 1;
  }
  if (current.length) out.push(current);
  return out;
}

/** PostgREST bulk writes want one column set per request, so rows are grouped by their keys. */
function byShape(rows: readonly Row[]): Row[][] {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const shape = Object.keys(row).sort().join(',');
    if (!groups.has(shape)) groups.set(shape, []);
    groups.get(shape)!.push(row);
  }
  return [...groups.values()];
}

interface Caches {
  /** `${companyKey}\0${sinceISO}` → postings. */
  company: Map<string, PostingRecord[]>;
  /** sinceISO → postings with a fingerprint. */
  fingerprints: Map<string, PostingRecord[]>;
}

export class SupabasePostingStore implements PostingStore {
  /** Full base rows of every posting this store has read or queued, by id. */
  private readonly rows = new Map<string, Row>();
  private readonly byPostingKey = new Map<string, string>();
  private readonly byListingKey = new Map<string, string>();
  private readonly lookedUpPostingKeys = new Set<string>();
  private readonly lookedUpListingKeys = new Set<string>();
  private readonly pendingInserts = new Map<string, Row>();
  private readonly pendingUpdates = new Map<string, Row>();
  private pendingEvents: Row[] = [];

  /** `sourceId` stamps every inserted or refreshed posting with the employer it came from. */
  constructor(
    private readonly db: Db,
    private readonly sourceId: string | null = null,
    private readonly caches: Caches = { company: new Map(), fingerprints: new Map() },
  ) {}

  /** A fresh unit of work for one employer that shares this store's run-wide caches. */
  forSource(sourceId: string): SupabasePostingStore {
    return new SupabasePostingStore(this.db, sourceId, this.caches);
  }

  private know(row: Row): PostingRecord {
    const record = toRecord(row);
    this.rows.set(record.id, { ...(this.rows.get(record.id) ?? {}), ...row });
    this.byPostingKey.set(record.postingKey, record.id);
    if (record.listingKey) this.byListingKey.set(record.listingKey, record.id);
    return record;
  }

  private recordOf(id: string): PostingRecord {
    return toRecord(this.rows.get(id)!);
  }

  private async selectAll(what: string, build: () => Query): Promise<Row[]> {
    const out: Row[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await build().range(from, from + PAGE - 1);
      if (error) fail(what, error);
      const rows = (data as Row[] | null) ?? [];
      out.push(...rows);
      if (rows.length < PAGE) return out;
    }
  }

  /** Look up every key a board's postings could match, in a handful of queries. Unmatched keys are remembered as new. */
  async prefetch(keys: ReadonlyArray<{ listingKey: string | null; postingKey: string }>): Promise<void> {
    const postingKeys = [...new Set(keys.map((k) => k.postingKey))].filter((k) => !this.lookedUpPostingKeys.has(k));
    const listingKeys = [...new Set(keys.map((k) => k.listingKey).filter((k): k is string => Boolean(k)))].filter(
      (k) => !this.lookedUpListingKeys.has(k),
    );
    for (const chunk of keyChunks(listingKeys)) {
      const { data, error } = await this.db.from('career_postings').select(COLUMNS).in('listing_key', chunk);
      if (error) fail('prefetch by listing key', error);
      for (const row of (data as Row[] | null) ?? []) this.know(row);
      for (const key of chunk) this.lookedUpListingKeys.add(key);
    }
    for (const chunk of keyChunks(postingKeys)) {
      const { data, error } = await this.db.from('career_postings').select(COLUMNS).in('posting_key', chunk);
      if (error) fail('prefetch by posting key', error);
      for (const row of (data as Row[] | null) ?? []) this.know(row);
      for (const key of chunk) this.lookedUpPostingKeys.add(key);
    }
  }

  /** True when a posting with these keys is stored (as far as prefetch has seen) or queued. */
  has({ listingKey, postingKey }: { listingKey: string | null; postingKey: string }): boolean {
    return (listingKey !== null && this.byListingKey.has(listingKey)) || this.byPostingKey.has(postingKey);
  }

  async findByKeys({ listingKey, postingKey }: { listingKey: string | null; postingKey: string }): Promise<PostingRecord | null> {
    // Listing identity is the stronger key, so it is tried first (as the original `order by` did).
    const known = (listingKey ? this.byListingKey.get(listingKey) : undefined) ?? this.byPostingKey.get(postingKey);
    if (known) return this.recordOf(known);
    const listingSettled = !listingKey || this.lookedUpListingKeys.has(listingKey);
    if (listingSettled && this.lookedUpPostingKeys.has(postingKey)) return null;

    if (listingKey) {
      const { data, error } = await this.db.from('career_postings').select(COLUMNS).eq('listing_key', listingKey).limit(1);
      if (error) fail('find by listing key', error);
      const row = (data as Row[] | null)?.[0];
      if (row) return this.know(row);
      this.lookedUpListingKeys.add(listingKey);
    }
    const { data, error } = await this.db.from('career_postings').select(COLUMNS).eq('posting_key', postingKey).limit(1);
    if (error) fail('find by posting key', error);
    this.lookedUpPostingKeys.add(postingKey);
    const row = (data as Row[] | null)?.[0];
    return row ? this.know(row) : null;
  }

  async recentForCompany(companyKey: string, sinceISO: string): Promise<PostingRecord[]> {
    const key = `${companyKey}\u0000${sinceISO}`;
    let rows = this.caches.company.get(key);
    if (!rows) {
      rows = (
        await this.selectAll('recent for company', () =>
          this.db.from('career_postings').select(COLUMNS).eq('company_key', companyKey).gte('first_seen', sinceISO).order('first_seen'),
        )
      ).map(toRecord);
      rows.push(...this.queuedInserts().filter((r) => r.companyKey === companyKey && r.firstSeen >= sinceISO));
      this.caches.company.set(key, rows);
    }
    return rows.map((r) => ({ ...r }));
  }

  async recentFingerprints(sinceISO: string): Promise<PostingRecord[]> {
    let rows = this.caches.fingerprints.get(sinceISO);
    if (!rows) {
      rows = (
        await this.selectAll('recent fingerprints', () =>
          this.db.from('career_postings').select(COLUMNS).neq('fingerprint', '').gte('first_seen', sinceISO).order('first_seen'),
        )
      ).map(toRecord);
      rows.push(...this.queuedInserts().filter((r) => r.fingerprint && r.firstSeen >= sinceISO));
      this.caches.fingerprints.set(sinceISO, rows);
    }
    return rows.map((r) => ({ ...r }));
  }

  /** Queued until `flush`. The id is assigned here so events can reference the posting before it is written. */
  async insert(record: Omit<PostingRecord, 'id'>): Promise<PostingRecord> {
    const existing = this.byPostingKey.get(record.postingKey) ?? (record.listingKey ? this.byListingKey.get(record.listingKey) : undefined);
    if (existing) return this.recordOf(existing);
    const row: Row = {
      id: randomUUID(),
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
    this.pendingInserts.set(String(row.id), row);
    const created = this.know(row);
    this.remember(created);
    return created;
  }

  /** Postings queued but not yet written: a cache filled from the database now must still see them. */
  private queuedInserts(): PostingRecord[] {
    return [...this.pendingInserts.values()].map(toRecord);
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

    const pending = this.pendingInserts.get(id);
    if (pending) {
      Object.assign(pending, columns);
      this.know(pending);
      return;
    }
    if (this.rows.has(id)) {
      this.pendingUpdates.set(id, { ...(this.pendingUpdates.get(id) ?? {}), ...columns });
      this.know({ ...this.rows.get(id)!, ...columns });
      return;
    }
    // A posting this store never read: write it straight away.
    const { error } = await this.db.from('career_postings').update(columns).eq('id', id);
    if (error) fail('update posting', error);
  }

  async recordEvent(event: PostingEvent): Promise<void> {
    this.pendingEvents.push({ posting_id: event.postingId, type: event.type, at: event.at, detail: event.detail ?? null });
  }

  /** Write everything queued: new postings, then changed postings, then their events. */
  async flush(): Promise<void> {
    const queued = [...this.pendingInserts.values()];
    this.pendingInserts.clear();
    const inserted = new Set<string>();
    for (const chunk of chunks(queued, WRITE_CHUNK)) {
      for (const group of byShape(chunk)) {
        const { data, error } = await this.db
          .from('career_postings')
          .upsert(group, { onConflict: 'posting_key', ignoreDuplicates: true })
          .select('id');
        if (!error) {
          for (const row of (data as Row[] | null) ?? []) inserted.add(String(row.id));
          continue;
        }
        if (error.code !== UNIQUE_VIOLATION) fail('insert postings', error);
        // A concurrent scan took a listing key in this chunk: write the rows one by one and skip the clash.
        for (const row of group) {
          const one = await this.db.from('career_postings').upsert(row, { onConflict: 'posting_key', ignoreDuplicates: true }).select('id');
          if (one.error && one.error.code !== UNIQUE_VIOLATION) fail('insert posting', one.error);
          for (const r of (one.data as Row[] | null) ?? []) inserted.add(String(r.id));
        }
      }
    }
    // Rows another scan inserted first were skipped; nothing may reference their unused ids.
    const skipped = new Set(queued.map((r) => String(r.id)).filter((id) => !inserted.has(id)));

    const updates = [...this.pendingUpdates.entries()].filter(([id]) => !skipped.has(id));
    this.pendingUpdates.clear();
    // Full rows, so the upsert's insert half satisfies every NOT NULL column; ON CONFLICT (id) updates in place.
    const full = updates.map(([id, columns]) => {
      const row = this.rows.get(id)!;
      const base: Row = {};
      for (const column of COLUMNS.split(', ')) base[column] = row[column];
      return { ...base, ...columns };
    });
    for (const chunk of chunks(full, WRITE_CHUNK)) {
      for (const group of byShape(chunk)) {
        const { error } = await this.db.from('career_postings').upsert(group, { onConflict: 'id' });
        if (error) fail('update postings', error);
      }
    }

    const events = this.pendingEvents.filter((e) => !skipped.has(String(e.posting_id)));
    this.pendingEvents = [];
    for (const chunk of chunks(events, EVENT_CHUNK)) {
      const { error } = await this.db.from('posting_events').insert(chunk);
      if (error) fail('record posting events', error);
    }
  }

  /** Active postings of this store's employer that the latest complete scan did not see. Flush first. */
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
    return rows.map((row) => this.know(row).id);
  }
}
