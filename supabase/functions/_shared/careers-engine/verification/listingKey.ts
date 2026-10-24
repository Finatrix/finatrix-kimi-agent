import { createHash } from 'node:crypto';
import type { ListingIdentity } from '../types.ts';

export const LISTING_KEY_VERSION = 1;

const CONTROL = /[\u0000-\u001f\u007f]/u;

function cleanPart(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  if (value !== value.trim() || CONTROL.test(value)) return null;
  return value;
}

/**
 * Strongest dedup key: sha256 over the provider-stable triple (ats provider, board slug, posting id).
 * Byte-compatible with career-ops' `listing_v1_<sha256>` so keys can be exchanged.
 * Returns null when the identity is incomplete or malformed: callers then fall back to URL keys.
 */
export function computeListingKey(identity: Partial<ListingIdentity> | null | undefined): string | null {
  if (!identity) return null;
  const ats = cleanPart(identity.ats_provider);
  const board = cleanPart(identity.board_slug);
  const id = cleanPart(identity.posting_id);
  if (!ats || !board || !id || !/^[a-z][a-z0-9_-]*$/.test(ats)) return null;
  const bytes = JSON.stringify(['listing-fingerprint', LISTING_KEY_VERSION, ats, board, id]);
  return `listing_v1_${createHash('sha256').update(bytes, 'utf8').digest('hex')}`;
}

export function isListingKey(value: unknown): value is string {
  return typeof value === 'string' && /^listing_v1_[0-9a-f]{64}$/.test(value);
}
