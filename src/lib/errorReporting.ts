/**
 * Lightweight, privacy-first error/exception reporting.
 *
 * Reports only the error *type* (constructor name) and the current route
 * template — never the message or stack trace, which can contain PII or tokens.
 * This gives an actionable error-rate-by-type-and-route signal for operations
 * without collecting anything sensitive. A future self-hosted error backend with
 * server-side scrubbing could capture richer detail; that is a deliberate,
 * documented boundary (see docs/OBSERVABILITY.md).
 *
 * Errors are throttled per session so an error loop can't flood the pipeline.
 */
import { track, analyticsEnabled } from './analytics';
import { routeTemplate } from '../shared/routes';

let installed = false;
let sent = 0;
const MAX_PER_SESSION = 20;

type Source = 'boundary' | 'window' | 'promise';

function currentRoute(): string {
  try {
    return routeTemplate(location.pathname);
  } catch {
    return '/*';
  }
}

function errorName(err: unknown): string {
  if (err instanceof Error && err.name) return err.name;
  if (typeof err === 'string') return 'Error';
  return 'Error';
}

/** Report an error by TYPE and ROUTE only. Safe to call anywhere. */
export function reportError(kind: string, from: Source): void {
  if (!analyticsEnabled() || sent >= MAX_PER_SESSION) return;
  sent += 1;
  track('app_error', { kind: kind.slice(0, 64), where: currentRoute(), bucket: from });
}

/** Install global handlers once. No-op when analytics is disabled. */
export function initErrorReporting(): void {
  if (installed || typeof window === 'undefined' || !analyticsEnabled()) return;
  installed = true;
  window.addEventListener('error', (e) => reportError(errorName(e.error), 'window'));
  window.addEventListener('unhandledrejection', (e) =>
    reportError(errorName((e as PromiseRejectionEvent).reason), 'promise'),
  );
}
