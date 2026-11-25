import { describe, expect, it } from 'vitest';
import { createRegistry } from '../_shared/careers-engine/discovery/index.ts';
import type { FetchContext, Job, Provider } from '../_shared/careers-engine/types.ts';
import { isAuthorized, runScanBatch, toEmployerEntry, type SourceRow } from './run.ts';
import { SupabasePostingStore, type Db, type DbResult, type Query } from './store.ts';

// ── an in-memory stand-in for the slice of PostgREST the store and runner use ─────────────────────────
type Row = Record<string, unknown>;

class FakeDb implements Db {
  readonly tables = new Map<string, Row[]>();
  /** Every request made, by table, so tests can pin how many round trips a scan costs. */
  readonly requests: string[] = [];
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
    this.requests.push(table);
    return new FakeQuery(this, table);
  }
}

class FakeQuery implements Query {
  private op: 'select' | 'insert' | 'upsert' | 'update' = 'select';
  private payload: unknown;
  private ignoreDuplicates = false;
  private onConflict?: string;
  private returning = false;
  private filters: Array<(r: Row) => boolean> = [];
  private sort?: { column: string; ascending: boolean; nullsFirst: boolean };
  private window?: [number, number];
  private max?: number;

  constructor(private readonly db: FakeDb, private readonly table: string) {}

  select(): Query { if (this.op !== 'select') this.returning = true; return this; }
  insert(rows: unknown): Query { this.op = 'insert'; this.payload = rows; return this; }
  upsert(rows: unknown, options?: { onConflict?: string; ignoreDuplicates?: boolean }): Query {
    this.op = 'upsert'; this.payload = rows; this.ignoreDuplicates = Boolean(options?.ignoreDuplicates); this.onConflict = options?.onConflict; return this;
  }
  in(c: string, vs: readonly unknown[]): Query { this.filters.push((r) => vs.includes(r[c])); return this; }
  is(c: string, v: null): Query { this.filters.push((r) => (r[c] ?? null) === v); return this; }
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
        const target = this.op === 'upsert' && this.onConflict ? rows.find((r) => r[this.onConflict!] === input[this.onConflict!]) : undefined;
        if (target) {
          if (this.ignoreDuplicates) continue;
          Object.assign(target, input);
          out.push({ ...target });
          continue;
        }
        const clash = (this.db.unique[this.table] ?? []).find((col) => input[col] != null && rows.some((r) => r[col] === input[col]));
        if (clash) return { data: null, error: { message: `duplicate ${clash}`, code: '23505' } };
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
  it("reads `marketOnly: true` (what the employer verifier writes) as the employer's own markets", () => {
    const asked: SourceRow = { ...base, options: { workday: { marketOnly: true } } };
    expect(toEmployerEntry({ ...asked, markets: ['us', 'gb'] })?.entry.workday).toEqual({ marketOnly: ['us', 'gb'] });
    expect(toEmployerEntry(asked)?.entry.workday).toEqual({ marketOnly: 'au' });
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
    const summary = await runScanBatch({ db, ctx, registry: createRegistry({ extra: [boardProvider({ jobs })] }), now: () => day1, maxPostingsPerEmployer: 3 });
    expect(summary.employers[0]).toMatchObject({ status: 'truncated', inMarket: 5, added: 3, expired: 0 });
    expect(db.rows('scan_run_employers')[0]).toMatchObject({ status: 'truncated', truncation_reason: 'cap' });
  });

  it('adds a large board over several runs, each carrying on where the last stopped', async () => {
    const db = new FakeDb();
    seed(db);
    const jobs = Array.from({ length: 7 }, (_, i) => job(i, 'Sydney NSW'));
    const registry = createRegistry({ extra: [boardProvider({ jobs })] });
    const run = (day: string) => runScanBatch({ db, ctx, registry, now: () => new Date(`${day}T03:00:00Z`), newPostingBudget: 3 });

    expect((await run('2026-10-20')).employers[0]).toMatchObject({ status: 'truncated', inMarket: 7, added: 3, expired: 0 });
    expect(db.rows('scan_run_employers')[0]).toMatchObject({ truncation_reason: 'budget', truncation_transient: true });
    expect((await run('2026-10-21')).employers[0]).toMatchObject({ status: 'truncated', added: 3, expired: 0 });
    expect((await run('2026-10-22')).employers[0]).toMatchObject({ status: 'ok', added: 1, expired: 0 });
    expect(db.rows('career_postings').map((p) => p.title).sort()).toEqual(jobs.map((j) => j.title).sort());
    expect(db.rows('career_postings').every((p) => p.status === 'active' && p.last_seen === '2026-10-22')).toBe(true);
  });

  it('defers the next employer once the run has added its new-posting budget', async () => {
    const db = new FakeDb();
    seed(db);
    seed(db, { id: 'src-2', name: 'Later', careers_url: 'https://jobs.example.com/later', last_scanned_at: '2026-01-01T00:00:00Z' });
    const jobs = Array.from({ length: 4 }, (_, i) => job(i, 'Sydney NSW'));
    const summary = await runScanBatch({ db, ctx, registry: createRegistry({ extra: [boardProvider({ jobs })] }), now: () => day1, newPostingBudget: 4 });
    expect(summary.employers.map((e) => [e.name, e.added])).toEqual([['Acme', 4]]);
    expect(summary.deferred).toBe(1);
  });

  describe('a board too big for one run', () => {
    // Reads `size` postings a call and says where to carry on, as a resumable Workday board does.
    function pagedProvider(board: { jobs: Job[]; partialAt?: number }, size: number, seen: Array<FetchContext['resume']>): Provider {
      return {
        id: 'fakeboard',
        detect: () => null,
        fetch: async (_entry, c) => {
          seen.push(c.resume);
          const from = typeof c.resume?.cursor === 'number' ? c.resume.cursor : 0;
          return {
            jobs: board.jobs.slice(from, from + size),
            ...(from + size < board.jobs.length ? { cursor: from + size } : {}),
            ...(board.partialAt === from ? { truncation: { reason: 'fetch-error' as const, transient: true } } : {}),
          };
        },
      };
    }
    const setup = (board: { jobs: Job[]; partialAt?: number }, newPostingBudget?: number) => {
      const db = new FakeDb();
      seed(db);
      const seen: Array<FetchContext['resume']> = [];
      const registry = createRegistry({ extra: [pagedProvider(board, 2, seen)] });
      const run = (day: string) => runScanBatch({ db, ctx, registry, now: () => new Date(`${day}T03:00:00Z`), ...(newPostingBudget ? { newPostingBudget } : {}) });
      return { db, seen, run, source: () => db.rows('career_sources')[0]! };
    };
    const statuses = (db: FakeDb) => db.rows('career_postings').map((p) => [p.title, p.status]);

    it('reads it as one pass over several runs, and expires only what the whole pass did not see', async () => {
      const board = { jobs: Array.from({ length: 5 }, (_, i) => job(i, 'Sydney NSW')) };
      const { db, seen, run, source } = setup(board);

      expect((await run('2026-10-20')).employers[0]).toMatchObject({ status: 'truncated', added: 2, expired: 0 });
      expect(source().scan_pass).toEqual({ started_on: '2026-10-20', cursor: 2, lossy: false });
      expect(db.rows('scan_run_employers')[0]).toMatchObject({ status: 'truncated', truncation_reason: 'paused', truncation_transient: true });
      await run('2026-10-21');
      expect(source().scan_pass).toEqual({ started_on: '2026-10-20', cursor: 4, lossy: false });
      expect((await run('2026-10-22')).employers[0]).toMatchObject({ status: 'ok', added: 1, expired: 0 });
      expect(source().scan_pass).toBeNull();
      expect(seen.map((r) => r?.cursor)).toEqual([null, 2, 4]);
      expect(seen[0]?.maxJobs).toBe(800);

      // The board drops posting 1. The next pass expires it once it has read the whole board, and nothing else:
      // postings 0 and 2 were seen on the pass's first day, not its last.
      board.jobs = board.jobs.filter((_, i) => i !== 1);
      expect((await run('2026-10-23')).employers[0]).toMatchObject({ status: 'truncated', expired: 0 });
      expect((await run('2026-10-24')).employers[0]).toMatchObject({ status: 'ok', expired: 1 });
      expect(statuses(db)).toEqual([0, 1, 2, 3, 4].map((i) => [`Risk Analyst ${i}`, i === 1 ? 'expired' : 'active']));
    });

    it('expires nothing after a pass in which any run saw less than its part', async () => {
      const board: { jobs: Job[]; partialAt?: number } = { jobs: Array.from({ length: 4 }, (_, i) => job(i, 'Sydney NSW')) };
      const { db, run, source } = setup(board);
      await run('2026-10-20');
      await run('2026-10-21');

      board.jobs = board.jobs.slice(1);
      board.partialAt = 0;
      await run('2026-10-22');
      expect(source().scan_pass).toMatchObject({ started_on: '2026-10-22', lossy: true });
      expect((await run('2026-10-23')).employers[0]).toMatchObject({ status: 'ok', expired: 0 });
      expect(source().scan_pass).toBeNull();
      expect(statuses(db).every(([, status]) => status === 'active')).toBe(true);
    });

    it('reads the same part again while postings in it wait for the new-posting budget', async () => {
      const { db, seen, run, source } = setup({ jobs: Array.from({ length: 3 }, (_, i) => job(i, 'Sydney NSW')) }, 1);
      expect((await run('2026-10-20')).employers[0]).toMatchObject({ status: 'truncated', added: 1 });
      expect(source().scan_pass).toBeUndefined();
      await run('2026-10-21');
      await run('2026-10-22');
      expect(seen.map((r) => r?.cursor)).toEqual([null, null, 2]);
      expect(db.rows('career_postings')).toHaveLength(3);
      expect(source().scan_pass).toBeNull();
    });
  });

  it("gives each board a deadline inside the run's time budget", async () => {
    const db = new FakeDb();
    seed(db);
    const deadlines: Array<number | undefined> = [];
    const provider: Provider = { id: 'fakeboard', detect: () => null, fetch: async (_entry, c) => (deadlines.push(c.deadline), { jobs: [] }) };
    const before = Date.now();
    await runScanBatch({ db, ctx, registry: createRegistry({ extra: [provider] }), now: () => day1, budgetMs: 30_000 });
    expect(deadlines[0]).toBeGreaterThanOrEqual(before);
    expect(deadlines[0]).toBeLessThanOrEqual(Date.now() + 30_000);
  });

  it('ingests a 300-posting board in a bounded number of round trips', async () => {
    const db = new FakeDb();
    seed(db);
    const jobs = Array.from({ length: 300 }, (_, i) => job(i, i % 2 ? 'Sydney NSW' : 'Auckland', { listingIdentity: { ats_provider: 'fakeboard', board_slug: 'acme', posting_id: String(i) } }));
    const registry = createRegistry({ extra: [boardProvider({ jobs })] });
    await runScanBatch({ db, ctx, registry, now: () => day1, newPostingBudget: 300 });
    const first = db.requests.filter((t) => t === 'career_postings' || t === 'posting_events').length;
    expect(db.rows('career_postings')).toHaveLength(300);
    expect(db.rows('posting_events')).toHaveLength(300);
    // Was ~4 per posting (≈1,200). Now: chunked lookups, a few bulk writes, history.
    expect(first).toBeLessThan(25);

    // A second complete scan of the same board updates in bulk and expires nothing it saw.
    db.requests.length = 0;
    const again = await runScanBatch({ db, ctx, registry, now: () => day2 });
    expect(again.employers[0]).toMatchObject({ status: 'ok', added: 0, expired: 0 });
    expect(db.rows('career_postings').every((p) => p.last_seen === '2026-10-21' && p.status === 'active')).toBe(true);
    expect(db.requests.filter((t) => t === 'career_postings' || t === 'posting_events').length).toBeLessThan(25);
  });

  it('never reads every recent fingerprint: the scanner turns cross-listing off', async () => {
    const db = new FakeDb();
    seed(db);
    for (let i = 0; i < 50; i++) db.rows('career_postings').push({ id: `old${i}`, posting_key: `old${i}`, fingerprint: 'f', first_seen: '2026-10-19', last_seen: '2026-10-19', status: 'active', company_key: 'other', company: 'Other', title: 'T', url: 'https://x', location: '' });
    const before = db.requests.length;
    await runScanBatch({ db, ctx, registry: createRegistry({ extra: [boardProvider({ jobs: [job(1, 'Sydney NSW')] })] }), now: () => day1 });
    expect(db.requests.length - before).toBeLessThan(15);
  });

  it('stops starting employers once the run has fetched its job budget', async () => {
    const db = new FakeDb();
    seed(db);
    seed(db, { id: 'src-2', name: 'Later', careers_url: 'https://jobs.example.com/later', last_scanned_at: '2026-01-01T00:00:00Z' });
    const jobs = Array.from({ length: 30 }, (_, i) => job(i, 'Sydney NSW'));
    const summary = await runScanBatch({ db, ctx, registry: createRegistry({ extra: [boardProvider({ jobs })] }), now: () => day1, jobBudget: 20 });
    expect(summary.employers.map((e) => e.name)).toEqual(['Acme']);
    expect(summary.deferred).toBe(1);
  });

  it('closes a run the edge runtime stopped, and leaves a running one alone', async () => {
    const db = new FakeDb();
    seed(db);
    db.rows('scan_runs').push({ id: 'dead', started_at: '2026-10-20T02:00:00.000Z', finished_at: null });
    db.rows('scan_runs').push({ id: 'live', started_at: '2026-10-20T02:58:00.000Z', finished_at: null });
    await runScanBatch({ db, ctx, registry: createRegistry({ extra: [boardProvider({ jobs: [] })] }), now: () => day1 });
    const runs = Object.fromEntries(db.rows('scan_runs').map((r) => [r.id, r]));
    expect(runs.dead).toMatchObject({ notes: 'did not finish: stopped by the edge runtime' });
    expect(runs.dead!.finished_at).toBeTruthy();
    expect(runs.live!.finished_at).toBeNull();
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

  it('queues writes until flush, and drops what another scan inserted first', async () => {
    const db = new FakeDb();
    const store = new SupabasePostingStore(db);
    const first = await store.insert(record);
    expect((await store.insert({ ...record, title: 'Changed' })).id).toBe(first.id);
    await store.recordEvent({ postingId: first.id, type: 'added', at: '2026-10-20' });
    expect(db.rows('career_postings')).toHaveLength(0);
    await store.flush();
    expect(db.rows('career_postings').map((r) => r.id)).toEqual([first.id]);

    // A second scan that never looked the key up queues the same posting under a new id.
    const racer = new SupabasePostingStore(db);
    const duplicate = await racer.insert(record);
    await racer.recordEvent({ postingId: duplicate.id, type: 'added', at: '2026-10-20' });
    await racer.flush();
    expect(db.rows('career_postings')).toHaveLength(1);
    expect(db.rows('posting_events').map((e) => e.posting_id)).toEqual([first.id]);
  });

  it('updates known postings with full rows in one bulk upsert', async () => {
    const db = new FakeDb();
    db.rows('career_postings').push({ id: 'a', ...toRow(record) }, { id: 'b', ...toRow({ ...record, postingKey: 'p2', listingKey: null }) });
    const store = new SupabasePostingStore(db, 'src-1');
    await store.prefetch([{ listingKey: record.listingKey, postingKey: record.postingKey }, { listingKey: null, postingKey: 'p2' }]);
    await store.update('a', { lastSeen: '2026-10-21', status: 'active' });
    await store.update('b', { lastSeen: '2026-10-21', status: 'active' });
    db.requests.length = 0;
    await store.flush();
    expect(db.requests).toEqual(['career_postings']);
    expect(db.rows('career_postings').map((r) => [r.id, r.last_seen, r.source_id, r.company])).toEqual([
      ['a', '2026-10-21', 'src-1', 'Acme'],
      ['b', '2026-10-21', 'src-1', 'Acme'],
    ]);
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
