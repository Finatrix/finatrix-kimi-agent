import { describe, expect, it } from 'vitest';
import { createRegistry } from '../_shared/careers-engine/discovery/index.ts';
import type { FetchContext, Job, Provider } from '../_shared/careers-engine/types.ts';
import { isAuthorized, runScanBatch, toEmployerEntry, type SourceRow } from './run.ts';
import { SupabasePostingStore, type Db, type DbResult, type Query } from './store.ts';

// ── an in-memory stand-in for the slice of PostgREST the store and runner use ─────────────────────────
type Row = Record<string, unknown>;

class FakeDb implements Db {
  readonly tables = new Map<string, Row[]>();
  private seq = 0;
  /** Unique columns per table, as the migration declares them. */
  readonly unique: Record<string, string[]> = { career_postings: ['posting_key', 'listing_key'], career_sources: ['careers_url'] };

  rows(table: string): Row[] {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }
  nextId(): string {
    return `00000000-0000-0000-0000-${String(++this.seq).padStart(12, '0')}`;
  }
  from(table: string): Query {
    return new FakeQuery(this, table);
  }
}

class FakeQuery implements Query {
  private op: 'select' | 'insert' | 'upsert' | 'update' = 'select';
  private payload: unknown;
  private ignoreDuplicates = false;
  private returning = false;
  private filters: Array<(r: Row) => boolean> = [];
  private sort?: { column: string; ascending: boolean; nullsFirst: boolean };
  private window?: [number, number];
  private max?: number;

  constructor(private readonly db: FakeDb, private readonly table: string) {}

  select(): Query { if (this.op !== 'select') this.returning = true; return this; }
  insert(rows: unknown): Query { this.op = 'insert'; this.payload = rows; return this; }
  upsert(rows: unknown, options?: { ignoreDuplicates?: boolean }): Query {
    this.op = 'upsert'; this.payload = rows; this.ignoreDuplicates = Boolean(options?.ignoreDuplicates); return this;
  }
  update(patch: unknown): Query { this.op = 'update'; this.payload = patch; return this; }
  eq(c: string, v: unknown): Query { this.filters.push((r) => r[c] === v); return this; }
  neq(c: string, v: unknown): Query { this.filters.push((r) => r[c] !== v); return this; }
  gte(c: string, v: unknown): Query { this.filters.push((r) => String(r[c]) >= String(v)); return this; }
  lt(c: string, v: unknown): Query { this.filters.push((r) => String(r[c]) < String(v)); return this; }
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): Query {
    this.sort = { column, ascending: options?.ascending ?? true, nullsFirst: options?.nullsFirst ?? false }; return this;
  }
  range(from: number, to: number): Query { this.window = [from, to]; return this; }
  limit(count: number): Query { this.max = count; return this; }

  then<A = DbResult, B = never>(ok?: ((v: DbResult) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(ok, bad);
  }

  private run(): DbResult {
    const rows = this.db.rows(this.table);
    if (this.op === 'insert' || this.op === 'upsert') {
      const out: Row[] = [];
      for (const input of [this.payload].flat() as Row[]) {
        const clash = (this.db.unique[this.table] ?? []).find((col) => input[col] != null && rows.some((r) => r[col] === input[col]));
        if (clash) {
          if (this.op === 'upsert' && this.ignoreDuplicates && clash === 'posting_key') continue;
          return { data: null, error: { message: `duplicate ${clash}`, code: '23505' } };
        }
        const row = { id: this.db.nextId(), ...input };
        rows.push(row);
        out.push({ ...row });
      }
      return { data: this.returning ? out : null, error: null };
    }
    let hits = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.op === 'update') {
      for (const r of hits) Object.assign(r, this.payload as Row);
      return { data: null, error: null };
    }
    if (this.sort) {
      const { column, ascending, nullsFirst } = this.sort;
      hits = [...hits].sort((a, b) => {
        const x = a[column], y = b[column];
        if (x == null || y == null) return x == null && y == null ? 0 : (x == null) === nullsFirst ? -1 : 1;
        return (String(x) < String(y) ? -1 : String(x) > String(y) ? 1 : 0) * (ascending ? 1 : -1);
      });
    }
    if (this.window) hits = hits.slice(this.window[0], this.window[1] + 1);
    if (this.max !== undefined) hits = hits.slice(0, this.max);
    return { data: hits.map((r) => ({ ...r })), error: null };
  }
}

// ── a provider whose board is whatever the test says it is ────────────────────────────────────────────
function boardProvider(board: { jobs: Job[]; truncated?: boolean }): Provider {
  return {
    id: 'fakeboard',
    detect: () => null,
    fetch: async () => ({ jobs: board.jobs, ...(board.truncated ? { truncation: { reason: 'cap' as const, transient: false } } : {}) }),
  };
}

const ctx: FetchContext = {
  fetchJson: async () => { throw new Error('no network in tests'); },
  fetchText: async () => { throw new Error('no network in tests'); },
  sleep: async () => {},
  log: { info() {}, warn() {} },
};

const job = (n: number, location: string, extra: Partial<Job> = {}): Job => ({
  title: `Risk Analyst ${n}`,
  url: `https://jobs.example.com/acme/${n}`,
  company: 'Acme',
  location,
  ...extra,
  description: `<p>Join our risk team. ${extra.description ?? ''}</p>`,
});

function seed(db: FakeDb, source: Partial<SourceRow> = {}) {
  db.rows('career_sources').push({
    id: 'src-1', name: 'Acme', provider: 'fakeboard', careers_url: 'https://jobs.example.com/acme', api_url: null,
    markets: ['au', 'nz'], options: {}, enabled: true, last_scanned_at: null, ...source,
  });
}

describe('careers-scan auth', () => {
  const secret = 's'.repeat(40);
  it('accepts only the exact configured secret, and never a short one', () => {
    expect(isAuthorized(secret, secret)).toBe(true);
    expect(isAuthorized(`${secret}x`, secret)).toBe(false);
    expect(isAuthorized('s'.repeat(39) + 't', secret)).toBe(false);
    expect(isAuthorized(null, secret)).toBe(false);
    expect(isAuthorized('short', 'short')).toBe(false);
    expect(isAuthorized('', undefined)).toBe(false);
  });
});

describe('toEmployerEntry', () => {
  const base: SourceRow = { id: 'x', name: 'Bank', provider: null, careers_url: 'https://bank.wd3.myworkdayjobs.com/en-US/Careers', api_url: null, markets: ['au'], options: null };
  it('slices a single-market Workday board to its market', () => {
    expect(toEmployerEntry(base)?.entry.workday).toEqual({ marketOnly: 'au' });
    expect(toEmployerEntry({ ...base, markets: ['au', 'nz'] })?.entry.workday).toEqual({});
    expect(toEmployerEntry({ ...base, options: { workday: { marketOnly: 'mars' } } })?.entry.workday).toEqual({ marketOnly: 'au' });
  });
  it('keeps only known provider options and rejects unsupported markets', () => {
    const mapped = toEmployerEntry({ ...base, careers_url: 'https://jobs.ashbyhq.com/acme', options: { ashby: { board: 'acme' }, provider: 'evil', careers_url: 'https://evil' } });
    expect(mapped?.entry).toEqual({ name: 'Bank', careers_url: 'https://jobs.ashbyhq.com/acme', registryId: 'x', ashby: { board: 'acme' } });
    expect(toEmployerEntry({ ...base, markets: ['sg'] })).toBeNull();
  });
});

describe('runScanBatch', () => {
  const day1 = new Date('2026-10-20T03:00:00Z');
  const day2 = new Date('2026-10-21T03:00:00Z');

  it('stores in-market postings with what the market layer read, and drops the rest', async () => {
    const db = new FakeDb();
    seed(db);
    const board = {
      jobs: [
        job(1, 'Sydney NSW', { salaryText: '$120,000 - $140,000 + super', description: 'Australian citizens only. Hybrid.' }),
        job(2, 'Auckland', { description: 'NZ citizens or residents.' }),
        job(3, 'London, UK'),
        job(4, 'Remote'),
      ],
    };
    const summary = await runScanBatch({ db, ctx, registry: createRegistry({ extra: [boardProvider(board)] }), now: () => day1 });

    expect(summary.employers).toEqual([{ name: 'Acme', status: 'ok', fetched: 4, inMarket: 2, added: 2, expired: 0 }]);
    const postings = db.rows('career_postings');
    expect(postings.map((p) => [p.title, p.countries])).toEqual([['Risk Analyst 1', ['AU']], ['Risk Analyst 2', ['NZ']]]);
    expect(postings[0]).toMatchObject({
      source_id: 'src-1', region: 'NSW', city: 'Sydney', salary_min: 120000, salary_max: 140000, salary_currency: 'AUD',
      salary_period: 'year', salary_contribution: 'super:excluded', work_rights: { requirement: 'citizen_only', all: ['citizen_only'] },
    });
    expect(String(postings[0]!.summary)).toMatch(/^Join our risk team/);
    expect(db.rows('posting_events').map((e) => e.type)).toEqual(['added', 'added']);
    expect(db.rows('scan_runs')[0]).toMatchObject({ employers: 1, jobs_kept: 2 });
    expect(db.rows('scan_run_employers')[0]).toMatchObject({ status: 'ok', fetched: 4, in_market: 2, provider: 'fakeboard' });
    expect(db.rows('career_sources')[0]).toMatchObject({ last_status: 'ok', last_scanned_at: day1.toISOString() });
  });

  it('expires a posting a complete scan no longer lists, but never after a partial scan', async () => {
    const db = new FakeDb();
    seed(db);
    const board: { jobs: Job[]; truncated?: boolean } = { jobs: [job(1, 'Sydney NSW'), job(2, 'Melbourne VIC')] };
    const registry = createRegistry({ extra: [boardProvider(board)] });
    await runScanBatch({ db, ctx, registry, now: () => day1 });

    board.jobs = [job(1, 'Sydney NSW')];
    board.truncated = true;
    const partial = await runScanBatch({ db, ctx, registry, now: () => day2 });
    expect(partial.employers[0]).toMatchObject({ status: 'truncated', expired: 0 });
    expect(db.rows('career_postings').map((p) => p.status)).toEqual(['active', 'active']);

    board.truncated = false;
    const complete = await runScanBatch({ db, ctx, registry, now: () => new Date('2026-10-22T03:00:00Z') });
    expect(complete.employers[0]).toMatchObject({ status: 'ok', expired: 1 });
    expect(db.rows('career_postings').map((p) => [p.title, p.status])).toEqual([['Risk Analyst 1', 'active'], ['Risk Analyst 2', 'expired']]);
    expect(db.rows('posting_events').filter((e) => e.type === 'expired')).toHaveLength(1);
  });

  it('records a broken board as an error and carries on with the next employer', async () => {
    const db = new FakeDb();
    seed(db);
    seed(db, { id: 'src-2', name: 'Other', provider: 'missing', careers_url: 'https://jobs.example.com/other', last_scanned_at: '2026-01-01T00:00:00Z' });
    const summary = await runScanBatch({ db, ctx, registry: createRegistry({ extra: [boardProvider({ jobs: [job(1, 'Perth WA')] })] }), now: () => day1 });
    expect(summary.employers.map((e) => [e.name, e.status])).toEqual([['Acme', 'ok'], ['Other', 'error']]);
    expect(summary.employers[1]!.error).toMatch(/unknown or disabled provider/);
    expect(db.rows('career_sources').map((s) => s.last_status)).toEqual(['ok', 'error']);
  });

  it('carries on when a history write fails, and claims each employer before scanning it', async () => {
    const db = new FakeDb();
    seed(db);
    seed(db, { id: 'src-2', name: 'Other', careers_url: 'https://jobs.example.com/other', last_scanned_at: '2026-01-01T00:00:00Z' });
    const from = db.from.bind(db);
    db.from = (table: string) => (table === 'scan_run_employers' ? { ...from(table), insert: () => Promise.resolve({ data: null, error: { message: 'boom' } }) as unknown as Query } as Query : from(table));
    const claims: string[] = [];
    const provider: Provider = {
      id: 'fakeboard',
      detect: () => null,
      fetch: async () => {
        claims.push(db.rows('career_sources').map((s) => s.last_status).join(','));
        return { jobs: [] };
      },
    };
    const summary = await runScanBatch({ db, ctx, registry: createRegistry({ extra: [provider] }), now: () => day1 });
    expect(summary.employers.map((e) => e.status)).toEqual(['ok', 'ok']);
    expect(claims).toEqual(['running,', 'ok,running']);
  });

  it('caps a runaway board and then expires nothing', async () => {
    const db = new FakeDb();
    seed(db);
    const jobs = Array.from({ length: 5 }, (_, i) => job(i, 'Sydney NSW'));
    const summary = await runScanBatch({ db, ctx, registry: createRegistry({ extra: [boardProvider({ jobs })] }), now: () => day1, maxJobsPerEmployer: 3 });
    expect(summary.employers[0]).toMatchObject({ status: 'truncated', inMarket: 3, expired: 0 });
  });

  it('defers employers once the time budget is spent', async () => {
    const db = new FakeDb();
    seed(db);
    seed(db, { id: 'src-2', name: 'Later', careers_url: 'https://jobs.example.com/later', last_scanned_at: '2026-01-01T00:00:00Z' });
    const ticks = [0, 5]; // start, first employer inside the budget, then every later check is past it
    const summary = await runScanBatch({
      db, ctx, registry: createRegistry({ extra: [boardProvider({ jobs: [] })] }), now: () => day1, budgetMs: 10, clock: () => ticks.shift() ?? 50,
    });
    expect(summary.employers.map((e) => e.name)).toEqual(['Acme']);
    expect(summary.deferred).toBe(1);
    expect(db.rows('career_sources')[1]!.last_scanned_at).toBe('2026-01-01T00:00:00Z');
  });
});

describe('SupabasePostingStore', () => {
  const record = {
    listingKey: 'listing_v1_abc', postingKey: 'jobs.example.com/acme/1', companyKey: 'acme', company: 'Acme', title: 'Analyst',
    location: 'Sydney NSW', url: 'https://jobs.example.com/acme/1', requisitionId: null, fingerprint: 'f1', source: 'greenhouse',
    firstSeen: '2026-10-20', lastSeen: '2026-10-20', status: 'active' as const, repostOf: null, aggregator: false, postedAt: null,
  };

  it('prefers the listing key, then the posting key', async () => {
    const db = new FakeDb();
    db.rows('career_postings').push({ id: 'a', ...toRow(record), listing_key: null, posting_key: 'other' });
    db.rows('career_postings').push({ id: 'b', ...toRow(record), posting_key: 'p2' });
    const store = new SupabasePostingStore(db);
    expect((await store.findByKeys({ listingKey: 'listing_v1_abc', postingKey: 'other' }))?.id).toBe('b');
    expect((await store.findByKeys({ listingKey: null, postingKey: 'other' }))?.id).toBe('a');
    expect(await store.findByKeys({ listingKey: null, postingKey: 'nope' })).toBeNull();
  });

  it('returns the existing row when another scan inserted the same posting first', async () => {
    const db = new FakeDb();
    const store = new SupabasePostingStore(db);
    const first = await store.insert(record);
    const again = await store.insert({ ...record, title: 'Changed' });
    expect(again.id).toBe(first.id);
    expect(db.rows('career_postings')).toHaveLength(1);
  });

  it('reads past the 1,000-row page size and keeps its caches current', async () => {
    const db = new FakeDb();
    for (let i = 0; i < 1500; i++) db.rows('career_postings').push({ id: `r${i}`, ...toRow({ ...record, postingKey: `k${i}`, listingKey: null }) });
    const store = new SupabasePostingStore(db);
    expect(await store.recentFingerprints('2026-10-01')).toHaveLength(1500);
    await store.insert({ ...record, postingKey: 'fresh', listingKey: null });
    expect(await store.recentFingerprints('2026-10-01')).toHaveLength(1501);
    expect(await store.recentForCompany('acme', '2026-10-01')).toHaveLength(1501);
  });
});

function toRow(r: Record<string, unknown>): Row {
  return {
    listing_key: r.listingKey, posting_key: r.postingKey, company_key: r.companyKey, company: r.company, title: r.title,
    location: r.location, url: r.url, requisition_id: r.requisitionId, fingerprint: r.fingerprint, source: r.source,
    first_seen: r.firstSeen, last_seen: r.lastSeen, status: r.status, repost_of: r.repostOf, aggregator: r.aggregator, posted_at: r.postedAt,
  };
}
