// Adapts an existing NormalizedJob-producing search function to the JobProvider
// interface, so the four incumbent providers (adzuna/jsearch/jooble/remotive)
// keep working exactly as before under the unified ProviderManager. Injecting
// the search function keeps this class free of Deno/network specifics and fully
// testable; the composition root supplies the real legacy search.

import type {
  FinatriXJob, JobProvider, ProviderCompany, ProviderPing, SearchInput,
} from './types.ts';
import { normalize, fromNormalized } from './ProviderNormalizer.ts';

/** The legacy providers' record shape (a subset of NormalizedJob). */
export interface LegacyNormalized {
  external_id?: string; title?: string; company?: string; description?: string;
  salary_min?: number | null; salary_max?: number | null; currency?: string;
  location?: string; country?: string; work_mode?: string; employment_type?: string;
  apply_url?: string; posted_at?: string | null; closes_at?: string | null;
  industry?: string; via?: string;
}

export interface LegacyProviderSpec {
  id: string;
  priority: number;
  secrets: string[];
  costPerSearchMicroUsd: number;
  supports?(input: SearchInput): boolean;
  /** True when the incumbent's secrets are present (else 'not-configured'). */
  isConfigured?(): boolean;
  /** Existing search: SearchInput → legacy NormalizedJob records. */
  search(input: SearchInput): Promise<LegacyNormalized[]>;
}

export class LegacyProvider implements JobProvider {
  readonly id: string;
  readonly priority: number;
  readonly secrets: string[];
  readonly costPerSearchMicroUsd: number;

  constructor(private readonly spec: LegacyProviderSpec) {
    this.id = spec.id;
    this.priority = spec.priority;
    this.secrets = spec.secrets;
    this.costPerSearchMicroUsd = spec.costPerSearchMicroUsd;
  }

  supports(input: SearchInput): boolean {
    return this.spec.supports ? this.spec.supports(input) : true;
  }

  isConfigured(): boolean {
    return this.spec.isConfigured ? this.spec.isConfigured() : true;
  }

  async searchJobs(input: SearchInput): Promise<FinatriXJob[]> {
    const rows = await this.spec.search(input);
    const out: FinatriXJob[] = [];
    for (const r of rows) {
      const job = normalize(this.id, this.priority, fromNormalized(r));
      if (job) out.push(job);
    }
    return out;
  }

  getJob(): Promise<FinatriXJob | null> { return Promise.resolve(null); }
  getCompany(): Promise<ProviderCompany | null> { return Promise.resolve(null); }

  /**
   * A real probe. This used to return `ok: true` unconditionally, so the admin
   * "test provider" action reported all four incumbents healthy without ever
   * contacting them — a green light that meant nothing. We cannot inspect the
   * injected search function, so we exercise it: an unconfigured provider is
   * honestly down, and anything that throws is honestly down.
   */
  async health(): Promise<ProviderPing> {
    const started = Date.now();
    if (!this.isConfigured()) return { ok: false, ms: 0, quotaRemaining: null };
    try {
      await this.spec.search({
        query: 'engineer', terms: ['engineer'], location: '', country: 'in',
        remoteOnly: false, workMode: '', employmentType: '', salaryMin: null, salaryMax: null, page: 0,
      });
      return { ok: true, ms: Date.now() - started, quotaRemaining: null };
    } catch {
      return { ok: false, ms: Date.now() - started, quotaRemaining: null };
    }
  }
}
