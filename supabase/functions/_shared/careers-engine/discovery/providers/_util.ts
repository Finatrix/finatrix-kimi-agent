import type { FetchContext } from '../../types.ts';

export function positiveInt(value: unknown, fallback: number, cap: number): number {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? Math.min(n, cap) : fallback;
}

export function toEpochMs(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  if (value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** True when the caller asked for a probe: a small page ceiling and no enrichment. */
export function probeCap(ctx: FetchContext): number | null {
  return typeof ctx.maxPages === 'number' && Number.isSafeInteger(ctx.maxPages) && ctx.maxPages > 0
    ? ctx.maxPages
    : null;
}

export function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export type Json = Record<string, unknown>;

export function obj(value: unknown): Json {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

export function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
