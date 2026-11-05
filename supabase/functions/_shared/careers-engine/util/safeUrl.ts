import { isIP } from 'node:net';

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa'];
const BLOCKED_HOSTS = new Set(['localhost', 'metadata.google.internal', 'instance-data']);

function ipv4ToParts(ip: string): number[] | null {
  const parts = ip.split('.').map(Number);
  return parts.length === 4 && parts.every((p) => Number.isInteger(p) && p >= 0 && p <= 255) ? parts : null;
}

/**
 * The IPv4 address inside an IPv6 literal that routes to it: mapped, compatible,
 * NAT64 or 6to4. `new URL()` rewrites `[::ffff:127.0.0.1]` to `[::ffff:7f00:1]`,
 * so the hex form is the one that reaches this check.
 */
function embeddedIpv4(host: string): string | null {
  const dotted = /^(?:::ffff:|::|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/.exec(host);
  if (dotted) return dotted[1]!;
  const hex = /^(?:::ffff:|::|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host)
    ?? /^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4})(?::|$)/.exec(host);
  if (!hex) return null;
  const hi = parseInt(hex[1]!, 16);
  const lo = parseInt(hex[2]!, 16);
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

/** True for loopback, private, link-local, CGNAT, multicast and metadata addresses. */
export function isBlockedAddress(address: string): boolean {
  const host = address.replace(/^\[|\]$/g, '').toLowerCase();
  const v4 = ipv4ToParts(embeddedIpv4(host) ?? host);
  if (v4) {
    const [a, b] = v4 as [number, number, number, number];
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && v4[2] === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  if (isIP(host) === 6) {
    return host === '::' || host === '::1' || /^f[cd]/.test(host) || /^fe[89a-f]/.test(host) || host.startsWith('ff');
  }
  return false;
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (BLOCKED_HOSTS.has(host)) return true;
  if (BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) return true;
  if (isIP(host)) return isBlockedAddress(host);
  return false;
}

/**
 * Validate an outbound URL: HTTPS only, no credentials, no internal hosts.
 * Provider modules additionally pin hostnames to their ATS domains.
 *
 * Note: this cannot defend against DNS rebinding. Provider hostnames are pinned to
 * known ATS domains, which is the primary control; run the scanner in an egress-limited
 * environment as the second.
 */
export function assertSafeHttpsUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new UnsafeUrlError(`invalid URL: ${raw}`);
  }
  if (parsed.protocol !== 'https:') throw new UnsafeUrlError(`URL must use HTTPS: ${raw}`);
  if (parsed.username || parsed.password) throw new UnsafeUrlError('URL must not contain credentials');
  if (isBlockedHostname(parsed.hostname)) throw new UnsafeUrlError(`blocked host: ${parsed.hostname}`);
  return parsed;
}

/** Throw unless the URL is HTTPS and its hostname is in `hosts` or matches `pattern`. */
export function assertHostAllowed(
  provider: string,
  raw: string,
  allowed: ReadonlySet<string> | RegExp,
): URL {
  const parsed = assertSafeHttpsUrl(raw);
  const ok = allowed instanceof RegExp ? allowed.test(parsed.hostname) : allowed.has(parsed.hostname);
  if (!ok) {
    const hint = allowed instanceof RegExp ? String(allowed) : [...allowed].join(', ');
    throw new UnsafeUrlError(`${provider}: untrusted hostname "${parsed.hostname}" (allowed: ${hint})`);
  }
  return parsed;
}

export function safeEncodeURIComponent(value: unknown): string | null {
  try {
    return encodeURIComponent(String(value));
  } catch (err) {
    if (err instanceof URIError) return null;
    throw err;
  }
}

export function coerceId(raw: unknown): string | undefined {
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined;
  const s = String(raw).trim();
  return s === '' ? undefined : s;
}
