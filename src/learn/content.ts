/**
 * One promise per topic, cached at module scope, shared by the topic hub and
 * every article inside it.
 *
 * `use()` requires a promise that is stable across renders — creating one inline
 * would start a fresh import on every render and suspend forever. The cache also
 * means navigating from a topic hub into one of its articles, or between two
 * articles in the same topic, costs no second fetch: the chunk carries the hub
 * copy, every article's copy and every article's body together.
 */

import { loadTopicContent } from '../content';
import type { TopicContent } from '../content/types';

const CACHE = new Map<string, Promise<TopicContent | null>>();

export function topicContentPromise(topicSlug: string): Promise<TopicContent | null> {
  let promise = CACHE.get(topicSlug);
  if (!promise) {
    promise = loadTopicContent(topicSlug);
    CACHE.set(topicSlug, promise);
  }
  return promise;
}
