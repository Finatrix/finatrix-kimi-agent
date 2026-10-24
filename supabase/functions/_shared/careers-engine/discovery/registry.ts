import type { EmployerEntry, Provider } from '../types.ts';
import { workdayProvider } from './providers/workday.ts';
import { oracleCloudProvider } from './providers/oraclecloud.ts';
import { pageUpProvider } from './providers/pageup.ts';
import {
  ashbyProvider,
  greenhouseProvider,
  leverProvider,
  recruiteeProvider,
  smartRecruitersProvider,
  workableProvider,
} from './providers/atsApis.ts';

export type Resolution = { provider: Provider } | { error: string } | null;

/**
 * Routing: an explicit `entry.provider` wins; otherwise each provider's `detect()` runs in
 * alphabetical id order and the first hit wins. Opt-in providers are only reachable by
 * explicit id, and only when registered.
 */
export class ProviderRegistry {
  private readonly providers = new Map<string, Provider>();

  register(provider: Provider): this {
    if (!provider.id || typeof provider.fetch !== 'function') throw new Error('provider must have an id and fetch()');
    if (this.providers.has(provider.id)) throw new Error(`duplicate provider id "${provider.id}"`);
    this.providers.set(provider.id, provider);
    return this;
  }

  get(id: string): Provider | undefined {
    return this.providers.get(id);
  }

  list(): Provider[] {
    return [...this.providers.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  resolve(entry: EmployerEntry, opts: { skipIds?: string[] } = {}): Resolution {
    const skip = new Set(opts.skipIds ?? []);
    if (entry.provider && !skip.has(entry.provider)) {
      const p = this.providers.get(entry.provider);
      return p ? { provider: p } : { error: `unknown or disabled provider: ${entry.provider}` };
    }
    for (const p of this.list()) {
      if (skip.has(p.id) || p.optIn) continue;
      let hit: { url: string } | null = null;
      try {
        hit = p.detect(entry);
      } catch {
        continue; // a throwing detect() must not take the whole scan down
      }
      if (hit) return { provider: p };
    }
    return null;
  }
}

export interface RegistryOptions {
  extra?: Provider[];
}

export function createRegistry(options: RegistryOptions = {}): ProviderRegistry {
  const registry = new ProviderRegistry();
  for (const p of [
    workdayProvider,
    oracleCloudProvider,
    pageUpProvider,
    smartRecruitersProvider,
    greenhouseProvider,
    leverProvider,
    ashbyProvider,
    workableProvider,
    recruiteeProvider,
  ]) {
    registry.register(p);
  }
  for (const p of options.extra ?? []) registry.register(p);
  return registry;
}
