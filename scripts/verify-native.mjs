#!/usr/bin/env node
/** Read-only release checks for the backend and links used by installed apps. */
import { loadEnv } from 'vite';

const env = loadEnv('production', process.cwd(), 'VITE_');
const origin = (process.env.ORIGIN || 'https://finatrix.co').replace(/\/+$/, '');
const hosts = [origin, `${new URL(origin).protocol}//www.${new URL(origin).host}`];
const backend = env.VITE_SUPABASE_URL?.replace(/\/+$/, '');
const appId = 'co.finatrix.app';
const functions = ['analytics-collect', 'careers-jobs', 'careers-ai', 'careers-email', 'careers-billing-checkout', 'account-delete', 'apple-token'];
const results = [];

async function check(name, run) {
  try {
    await run();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, reason: error instanceof Error ? error.message : String(error) });
  }
}

function requireCheck(condition, message) {
  if (!condition) throw new Error(message);
}

function request(url, options = {}) {
  return fetch(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(20_000) });
}

async function association(host, file, validate) {
  const response = await request(`${host}/.well-known/${file}`);
  requireCheck(response.status === 200, `HTTP ${response.status}; expected 200 without a redirect`);
  requireCheck(response.headers.get('content-type')?.split(';')[0] === 'application/json', 'Must serve application/json');
  requireCheck(validate(await response.json()), `Association must name ${appId} with a valid signing identity`);
}

await Promise.all(hosts.flatMap(host => [
  check(`Android app links on ${host}`, () => association(host, 'assetlinks.json', value =>
    Array.isArray(value) && value.some(entry => entry?.relation?.includes('delegate_permission/common.handle_all_urls')
      && entry.target?.namespace === 'android_app' && entry.target.package_name === appId
      && entry.target.sha256_cert_fingerprints?.some(fp => /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(fp))))),
  check(`iOS universal links on ${host}`, () => association(host, 'apple-app-site-association', value =>
    value?.applinks?.details?.some(entry => entry.appIDs?.some(id => new RegExp(`^[A-Z0-9]{10}\\.${appId.replaceAll('.', '\\.')}$`).test(id))
      && entry.components?.some(component => component['/'] === '/tools/*' && !component.exclude)))),
]));

if (!backend) {
  results.push({ name: 'Native backend access', ok: false, reason: 'VITE_SUPABASE_URL is required to verify a native release' });
} else {
  await Promise.all(['https://localhost', 'capacitor://localhost'].flatMap(appOrigin => functions.map(fn =>
    check(`${fn} accepts ${appOrigin}`, async () => {
      const requiredHeaders = fn === 'analytics-collect'
        ? ['content-type']
        : ['authorization', 'apikey', 'content-type', 'x-client-info'];
      const response = await request(`${backend}/functions/v1/${fn}`, {
        method: 'OPTIONS',
        headers: {
          Origin: appOrigin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': requiredHeaders.join(','),
        },
      });
      requireCheck(response.ok, `Preflight returned HTTP ${response.status}`);
      requireCheck(response.headers.get('access-control-allow-origin') === appOrigin, 'Deployed CORS configuration does not allow this app origin');
      const methods = (response.headers.get('access-control-allow-methods') || '').split(',').map(x => x.trim().toUpperCase());
      requireCheck(methods.includes('POST'), 'Preflight does not allow POST');
      const headers = (response.headers.get('access-control-allow-headers') || '').split(',').map(x => x.trim().toLowerCase());
      requireCheck(requiredHeaders.every(x => headers.includes(x)), 'Preflight does not allow all request headers');
      if (fn === 'analytics-collect') {
        requireCheck(response.headers.get('access-control-allow-credentials') === 'true', 'Analytics beacons require Allow-Credentials');
      }
    }),
  )));
}

for (const result of results) console.log(`${result.ok ? '✓' : '✗'} ${result.name}${result.reason ? `: ${result.reason}` : ''}`);
const failures = results.filter(result => !result.ok).length;
if (failures) {
  console.error(`\n${failures} native release check(s) failed. Deploy the shared CORS configuration and configure the Worker signing identities before releasing the affected app.`);
  process.exitCode = 1;
} else console.log('\nNative backend and association checks passed. Device sign-in and file-save flows still require native testing.');
