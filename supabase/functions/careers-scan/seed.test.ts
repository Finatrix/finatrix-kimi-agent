import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs script without type declarations
import { PROVIDER_IDS, SEED_JSON, SEED_MIGRATION, seedSql } from '../../../scripts/careers/seed-sql.mjs';
import { createRegistry } from '../_shared/careers-engine/discovery/index.ts';
import { toEmployerEntry } from './run.ts';

interface SeedEntry {
  name: string;
  provider: string;
  careers_url: string;
  markets: string[];
  options?: Record<string, unknown>;
  verified_at: string;
}

const entries = JSON.parse(readFileSync(SEED_JSON, 'utf8')) as SeedEntry[];
const registry = createRegistry();

describe('employer seed', () => {
  it('the migration is exactly what the generator makes from the JSON', () => {
    expect(readFileSync(SEED_MIGRATION, 'utf8')).toBe(seedSql(entries));
  });

  it('lists each employer once', () => {
    const urls = entries.map((e) => e.careers_url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it.each(entries.map((e) => [e.name, e] as const))('%s routes to an engine connector that can read its URL', (_name, e) => {
    const provider = (PROVIDER_IDS as Record<string, string>)[e.provider] ?? e.provider;
    const mapped = toEmployerEntry({
      id: 'seed', name: e.name, provider, careers_url: e.careers_url, api_url: null, markets: e.markets, options: e.options ?? {},
    });
    expect(mapped).not.toBeNull();
    expect(mapped!.markets).toEqual(e.markets);
    const resolved = registry.resolve(mapped!.entry);
    expect(resolved && 'provider' in resolved ? resolved.provider.id : resolved).toBe(provider);
    expect(registry.get(provider)!.detect(mapped!.entry)).not.toBeNull();
  });
});
