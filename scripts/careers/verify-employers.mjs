#!/usr/bin/env node
/**
 * Live check for the careers-engine starter employer list.
 *
 *   node scripts/careers/verify-employers.mjs [seed.json] [--only=<name>] [--market=<us|gb|in|au|nz>]
 *                                            [--provider=<name>] [--out=<path> [--min-jobs=<n>]]
 *
 * For every entry it calls the provider's public job-board endpoint (HTTPS only, one request per second,
 * honest User-Agent) and prints the HTTP status, the board's own company name where the API reports one,
 * the total number of open jobs and the number located in each of the entry's markets. An entry fails when
 * the board cannot be read or any of its markets has no jobs. Exit code 1 when anything failed.
 *
 * Location matching is deliberately simple: country names and ISO codes first, then states and regions,
 * then major cities. Jobs whose location names no country, region or listed city (for example a bare campus
 * name) are not counted, so in-market numbers are lower bounds.
 *
 * --out writes the readable entries to <path>, stamped with today's date and their in-market counts. Markets
 * with fewer than --min-jobs (default 1) in-market jobs are dropped from an entry first, and entries left with
 * no market are skipped, so a candidate list can be turned into a seed in one run.
 * Workday entries whose markets hold under 75% of the board get `options.workday.marketOnly: true` unless
 * the entry already sets it.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const USER_AGENT = 'FinatriX-EmployerVerifier/1.0 (+https://finatrix.co; careers seed check, 1 req/s)';
const MIN_GAP_MS = 1000;
const TIMEOUT_MS = 30_000;
const MARKETS = ['us', 'gb', 'in', 'au', 'nz'];
const MARKET_ONLY_SHARE = 0.75;

// ── Location matching ────────────────────────────────────────────────────────

const ISO2 = { US: 'us', GB: 'gb', UK: 'gb', IN: 'in', AU: 'au', NZ: 'nz' };

const COUNTRY = {
  us: [/united states/i, /\b(?:US|USA|U\.S\.A?\.?)\b/],
  gb: [/united kingdom|great britain|\bengland\b|\bscotland\b|\bwales\b|northern ireland/i, /\b(?:UK|U\.K\.|GB|GBR)\b/],
  in: [/\bindia\b/i, /\bIND\b/],
  au: [/\baustralia\b/i, /\bAUS?\b/],
  nz: [/new zealand|aotearoa/i, /\bNZ\b/],
};

// A named country outside the five markets: stops city/region guessing ("London, Ontario", "Victoria, BC").
const ELSEWHERE = /\b(?:canada|ontario|british columbia|quebec|alberta|ireland|germany|france|spain|portugal|italy|netherlands|belgium|switzerland|austria|poland|sweden|denmark|norway|finland|singapore|malaysia|philippines|indonesia|japan|korea|china|hong kong|taiwan|vietnam|thailand|brazil|mexico|argentina|colombia|chile|israel|uae|united arab emirates|saudi|south africa|nigeria|kenya|egypt|turkey|romania|czech|hungary|greece|estonia|lithuania|latvia|serbia|ukraine|pakistan|bangladesh|sri lanka)\b|,\s*(?:ON|BC|QC|AB)\b/i;

const US_STATE_NAMES = 'Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|District of Columbia';
// IN (India's ISO code) and WA (Western Australia) are left out: they only count as US states when nothing else matched.
const US_STATE_CODES = 'AL|AK|AZ|AR|CA|CO|CT|DE|FL|HI|ID|IL|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WV|WI|WY|DC';

const REGION = {
  us: [new RegExp(`\\b(?:${US_STATE_NAMES})\\b`, 'i'), new RegExp(`(?:,|\\s-)\\s*(?:${US_STATE_CODES})\\b(?!\\.)`)],
  gb: [/greater london|greater manchester/i],
  in: [/\b(?:karnataka|maharashtra|telangana|tamil nadu|haryana|uttar pradesh|west bengal|kerala|gujarat|rajasthan|andhra pradesh|odisha|punjab|delhi ncr)\b/i],
  au: [/\b(?:new south wales|victoria|queensland|tasmania|western australia|south australia|northern territory|australian capital territory)\b/i, /\b(?:NSW|VIC|QLD|TAS|ACT)\b/],
  nz: [/\b(?:auckland|wellington|waikato|otago|bay of plenty|manawat[uū]|hawke'?s bay|southland|taranaki|northland)\b/i],
};

const WEAK_US_CODE = { us: [/,\s*(?:IN|WA)\b/], gb: [], in: [], au: [], nz: [] };

const CITY = {
  us: [/\b(?:new york|nyc|san francisco|seattle|austin|boston|chicago|los angeles|denver|atlanta|dallas|houston|miami|philadelphia|san diego|san jose|palo alto|mountain view|menlo park|sunnyvale|santa clara|redwood city|bay area|pittsburgh|salt lake city|phoenix|minneapolis|detroit|nashville|raleigh|charlotte|brooklyn|oakland|irvine)\b/i],
  gb: [/\b(?:london|manchester|edinburgh|glasgow|birmingham|bristol|leeds|belfast|cardiff|liverpool|sheffield|nottingham|newcastle upon tyne|brighton|milton keynes|oxford|cambridge|reading|aberdeen)\b/i],
  in: [/\b(?:bengaluru|bangalore|mumbai|new delhi|delhi|gurugram|gurgaon|noida|hyderabad|chennai|pune|kolkata|ahmedabad|jaipur|kochi|chandigarh|coimbatore|indore|thiruvananthapuram|trivandrum|mysuru|mysore|vadodara|nagpur|bhubaneswar)\b/i],
  au: [/\b(?:sydney|melbourne|brisbane|perth|adelaide|canberra|hobart|darwin|gold coast|geelong|parramatta|wollongong|townsville|cairns|macquarie park)\b/i],
  nz: [/\b(?:christchurch|dunedin|tauranga|palmerston north|queenstown|napier|hamilton,? (?:nz|new zealand))\b/i],
};

const hits = (table, s) => MARKETS.filter((m) => table[m].some((re) => re.test(s)));

/** Markets one location string points at, most specific evidence first. */
export function marketsOfText(text) {
  const out = new Set();
  for (const part of String(text ?? '').split(/[;|•\n]| \/ | or /)) {
    const s = part.trim();
    if (!s) continue;
    let found = hits(COUNTRY, s);
    if (found.length === 0 && !ELSEWHERE.test(s)) {
      for (const table of [REGION, CITY, WEAK_US_CODE]) {
        found = hits(table, s);
        if (found.length > 0) break;
      }
    }
    for (const m of found) out.add(m);
  }
  return out;
}

function marketsOfJob({ texts = [], codes = [] }) {
  const out = new Set();
  for (const code of codes) {
    const m = ISO2[String(code ?? '').trim().toUpperCase()];
    if (m) out.add(m);
  }
  for (const t of texts) for (const m of marketsOfText(t)) out.add(m);
  return out;
}

function countJobs(jobs) {
  const counts = Object.fromEntries(MARKETS.map((m) => [m, 0]));
  for (const job of jobs) for (const m of marketsOfJob(job)) counts[m]++;
  return counts;
}

/** Facet values ({label, count}) → per-market sums; used to pick the facet that places the most postings. */
function countFacet(values) {
  const counts = Object.fromEntries(MARKETS.map((m) => [m, 0]));
  for (const { label, count } of values) {
    const found = marketsOfText(label);
    if (found.size === 1) counts[[...found][0]] += count;
  }
  return counts;
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

let lastRequestAt = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status} from ${url}`);
    this.status = status;
  }
}

async function request(url, init = {}) {
  if (!String(url).startsWith('https://')) throw new Error(`refusing non-HTTPS URL ${url}`);
  const wait = lastRequestAt + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
  const res = await fetch(url, {
    ...init,
    redirect: 'follow',
    headers: { 'user-agent': USER_AGENT, accept: 'application/json', ...init.headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.url.startsWith('https://')) throw new Error(`redirected off HTTPS to ${res.url}`);
  if (!res.ok) throw new HttpError(res.status, url);
  return res;
}

const getJson = async (url, init) => {
  const res = await request(url, init);
  return { status: res.status, json: await res.json() };
};

// ── Providers ────────────────────────────────────────────────────────────────
// Each returns { status, name?, total, counts, basis } where counts holds in-market jobs per market.

const segments = (u) => new URL(u).pathname.split('/').filter(Boolean);
const WORK_MODEL_ONLY = /^(?:hybrid|in[-\s]?office|on[-\s]?site|distributed|remote|flexible)$/i;

async function greenhouse(entry) {
  const u = new URL(entry.careers_url);
  const slug = u.searchParams.get('for') || segments(entry.careers_url)[0];
  const base = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}`;
  const board = await getJson(base);
  const { status, json } = await getJson(`${base}/jobs`);
  const jobs = (json.jobs ?? []).map((j) => ({ id: j.id, texts: [j.location?.name ?? ''] }));
  // Boards that label jobs only "Remote"/"Hybrid" keep the real place on the office record.
  if (jobs.some((j) => !j.texts[0] || WORK_MODEL_ONLY.test(j.texts[0].trim()))) {
    const byId = new Map(jobs.map((j) => [j.id, j]));
    const offices = (await getJson(`${base}/offices`)).json.offices ?? [];
    for (const office of offices) {
      for (const dept of office.departments ?? []) {
        for (const job of dept.jobs ?? []) byId.get(job.id)?.texts.push(office.name ?? '', office.location ?? '');
      }
    }
  }
  return { status, name: board.json.name, total: jobs.length, counts: countJobs(jobs), basis: 'jobs' };
}

async function lever(entry) {
  const u = new URL(entry.careers_url);
  const host = u.hostname === 'jobs.eu.lever.co' ? 'api.eu.lever.co' : 'api.lever.co';
  const { status, json } = await getJson(`https://${host}/v0/postings/${encodeURIComponent(segments(entry.careers_url)[0])}?mode=json`);
  const jobs = (Array.isArray(json) ? json : []).map((j) => ({
    texts: [j.categories?.location ?? '', ...(j.categories?.allLocations ?? [])],
    codes: [j.country],
  }));
  return { status, total: jobs.length, counts: countJobs(jobs), basis: 'jobs' };
}

async function ashby(entry) {
  const slug = entry.careers_url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/)?.[1];
  const { status, json } = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(decodeURIComponent(slug))}`);
  const jobs = (json.jobs ?? []).map((j) => {
    const addr = j.address?.postalAddress ?? {};
    return {
      texts: [
        j.location ?? '',
        [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean).join(', '),
        ...(j.secondaryLocations ?? []).map((l) => {
          const a = l.address?.postalAddress ?? l.address ?? {};
          return [l.location, a.addressLocality, a.addressRegion, a.addressCountry].filter(Boolean).join(', ');
        }),
      ],
    };
  });
  return { status, total: jobs.length, counts: countJobs(jobs), basis: 'jobs' };
}

async function smartrecruiters(entry) {
  const slug = segments(entry.careers_url)[0];
  const api = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings`;
  const first = await getJson(`${api}?limit=100&offset=0`);
  const toJob = (p) => ({ texts: [p.location?.fullLocation ?? [p.location?.city, p.location?.region].filter(Boolean).join(', ')], codes: [p.location?.country] });
  const content = first.json.content ?? [];
  const total = first.json.totalFound ?? content.length;
  let counts = countJobs(content.map(toJob));
  let basis = 'jobs';
  if (total > content.length) {
    // Large boards: ask the API to filter by country, then trust its total only if the sample agrees.
    basis = 'country filter';
    for (const m of entry.markets) {
      const r = await getJson(`${api}?limit=100&offset=0&country=${m}`);
      const sample = r.json.content ?? [];
      const inMarket = countJobs(sample.map(toJob))[m];
      counts[m] = sample.length > 0 && inMarket === sample.length ? (r.json.totalFound ?? inMarket) : inMarket;
    }
  }
  return { status: first.status, name: content[0]?.company?.name, total, counts, basis };
}

async function workable(entry) {
  const slug = segments(entry.careers_url)[0];
  const { status, json } = await getJson(`https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}`);
  const jobs = (json.jobs ?? []).map((j) => ({
    texts: [[j.city, j.state, j.country].filter(Boolean).join(', '), ...(j.locations ?? []).map((l) => [l.city, l.region, l.country].filter(Boolean).join(', '))],
    codes: [j.countryCode, ...(j.locations ?? []).map((l) => l.countryCode)],
  }));
  return { status, name: json.name, total: jobs.length, counts: countJobs(jobs), basis: 'jobs' };
}

async function recruitee(entry) {
  const host = new URL(entry.careers_url).hostname;
  if (!/^[a-z0-9][a-z0-9-]*\.recruitee\.com$/.test(host)) throw new Error(`not a recruitee.com board: ${host}`);
  const { status, json } = await getJson(`https://${host}/api/offers/`);
  const offers = (json.offers ?? []).filter((o) => !/\(sample\)/i.test(o.title ?? ''));
  const jobs = offers.map((o) => ({
    texts: [o.location ?? '', [o.city, o.state_name, o.country].filter(Boolean).join(', '), ...(o.locations ?? []).map((l) => [l.city, l.state, l.country].filter(Boolean).join(', '))],
    codes: [o.country_code, ...(o.locations ?? []).map((l) => l.country_code)],
  }));
  return { status, name: offers[0]?.company_name, total: jobs.length, counts: countJobs(jobs), basis: 'jobs' };
}

function flattenFacets(facets, depth = 0, out = []) {
  for (const facet of Array.isArray(facets) ? facets : []) {
    const groups = (facet.values ?? []).filter((v) => typeof v?.facetParameter === 'string' && Array.isArray(v.values));
    if (groups.length > 0 && depth < 3) flattenFacets(groups, depth + 1, out);
    else out.push(facet);
  }
  return out;
}

async function workday(entry) {
  const m = entry.careers_url.match(/^https:\/\/([\w-]+)\.(wd[\w-]*)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([^/?#]+)/);
  if (!m) throw new Error('cannot derive the Workday CXS endpoint');
  const origin = `https://${m[1]}.${m[2]}.myworkdayjobs.com`;
  const api = `${origin}/wday/cxs/${m[1]}/${m[3]}/jobs`;
  const search = (limit, appliedFacets) => getJson(api, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, referer: `${origin}/${m[3]}/` },
    body: JSON.stringify({ limit, offset: 0, searchText: '', appliedFacets }),
  });
  const { status, json } = await search(20, {});
  let total = json.total ?? 0;
  // Prefer a country-level location facet; otherwise the location facet that places the most postings.
  let best = null;
  for (const facet of flattenFacets(json.facets)) {
    const param = String(facet.facetParameter ?? '');
    if (!/location|country|site/i.test(param)) continue;
    const values = (facet.values ?? []).map((v) => ({ id: v.id, label: v.descriptor ?? '', count: Number(v.count) || 0 }));
    const placed = Object.values(countFacet(values)).reduce((a, b) => a + b, 0);
    const isCountry = /country/i.test(param);
    const score = (isCountry ? 1e9 : 0) + placed;
    if (!best || score > best.score) best = { score, values, param, isCountry };
  }
  if (!best) {
    const jobs = (json.jobPostings ?? []).map((j) => ({ texts: [j.locationsText ?? ''] }));
    return { status, name: m[1], total, counts: countJobs(jobs), basis: 'first page only' };
  }
  // Workday reports at most 2000 as `total`; past that ceiling the country facet is the better total. Below it,
  // trust `total`: some tenants count a multi-site posting once per site even in the country facet.
  if (best.isCountry && total >= 2000) total = Math.max(total, best.values.reduce((sum, v) => sum + v.count, 0));
  // City-level facets list a multi-site posting under each site, so ask Workday for the filtered total instead.
  const counts = Object.fromEntries(MARKETS.map((mk) => [mk, 0]));
  for (const mk of entry.markets) {
    const ids = best.values.filter((v) => v.id && marketsOfText(v.label).size === 1 && marketsOfText(v.label).has(mk)).map((v) => v.id);
    if (ids.length > 0) counts[mk] = (await search(1, { [best.param]: ids })).json.total ?? 0;
  }
  return { status, name: m[1], total, counts, basis: `facet ${best.param}` };
}

async function oracle(entry) {
  const u = new URL(entry.careers_url);
  if (!/^[a-z0-9-]+\.fa\.(?:[a-z0-9-]+\.)?(?:ocs\.)?oraclecloud(?:[1-9][0-9]?)?\.com$/i.test(u.hostname)) throw new Error('not an Oracle Recruiting Cloud host');
  const segs = segments(entry.careers_url);
  const siteNumber = segs.includes('sites') ? segs[segs.indexOf('sites') + 1] : 'CX_1';
  const finder = `findReqs;siteNumber=${siteNumber},facetsList=LOCATIONS,limit=25,sortBy=POSTING_DATES_DESC,offset=0`;
  const api = `https://${u.hostname}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.secondaryLocations&finder=${finder}`;
  const { status, json } = await getJson(api);
  const item = json.items?.[0] ?? {};
  const jobs = (item.requisitionList ?? []).map((r) => ({ texts: [r.PrimaryLocation ?? '', ...(r.secondaryLocations ?? []).map((l) => l.Name ?? '')] }));
  const listCounts = countJobs(jobs);
  // Location facets repeat each country at several levels, so take the largest matching entry, not the sum.
  // Secondary locations are counted too, so a facet can exceed the board total; cap it there.
  const total = item.TotalJobsCount ?? jobs.length;
  const counts = { ...listCounts };
  for (const f of item.locationsFacet ?? []) {
    const found = marketsOfText(f.Name);
    if (found.size === 1) {
      const mk = [...found][0];
      counts[mk] = Math.min(total, Math.max(counts[mk], Number(f.TotalCount) || 0));
    }
  }
  return { status, name: u.hostname.split('.')[0], total, counts, basis: 'location facet' };
}

async function pageup(entry) {
  const u = new URL(entry.careers_url);
  const base = entry.careers_url.replace(/\/listing\/?.*$/i, '');
  if (base === entry.careers_url) throw new Error('PageUp careers_url must end in /listing/');
  const jobs = [];
  let status = 0;
  for (let page = 1; page <= 5; page++) {
    const res = await request(`${base}/listing/?page=${page}&page-items=100`, { headers: { accept: 'text/html' } });
    status = res.status;
    const html = await res.text();
    const body = html.match(/<tbody\b[^>]*id=["']search-results-content["'][^>]*>([\s\S]*?)<\/tbody>/i)?.[1];
    if (body === undefined) throw new Error('no PageUp results table on the listing page');
    const before = jobs.length;
    for (const row of body.split(/<tr\b/i).slice(1)) {
      if (!/class=["'][^"']*\bjob-link\b/i.test(row)) continue;
      const loc = row.match(/class=["']location["'][^>]*>([^<]*)/i)?.[1] ?? '';
      jobs.push({ texts: [loc.replace(/&amp;/g, '&').trim()] });
    }
    if (jobs.length - before < 100) break;
  }
  return { status, name: u.hostname, total: jobs.length, counts: countJobs(jobs), basis: 'listing (location column)' };
}

const PROVIDERS = { greenhouse, lever, ashby, smartrecruiters, workable, recruitee, workday, oracle, pageup };

// ── Main ─────────────────────────────────────────────────────────────────────

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function parseArgs(argv) {
  const args = { seed: null, only: null, market: null, provider: null, out: null, minJobs: 1 };
  for (const a of argv) {
    if (a.startsWith('--only=')) args.only = a.slice(7).toLowerCase();
    else if (a.startsWith('--provider=')) args.provider = a.slice(11).toLowerCase();
    else if (a.startsWith('--market=')) args.market = a.slice(9).toLowerCase();
    else if (a.startsWith('--out=')) args.out = a.slice(6);
    else if (a.startsWith('--min-jobs=')) args.minJobs = Math.max(1, Number.parseInt(a.slice(11), 10) || 1);
    else if (!a.startsWith('--')) args.seed = a;
    else throw new Error(`unknown flag ${a}`);
  }
  args.seed ??= path.join(path.dirname(fileURLToPath(import.meta.url)), 'employers.seed.json');
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let entries = JSON.parse(await readFile(args.seed, 'utf8'));
  if (args.only) entries = entries.filter((e) => e.name.toLowerCase().includes(args.only));
  if (args.market) entries = entries.filter((e) => e.markets.includes(args.market));
  if (args.provider) entries = entries.filter((e) => e.provider === args.provider);

  const results = [];
  for (const entry of entries) {
    const fetcher = PROVIDERS[entry.provider];
    let r;
    try {
      if (!fetcher) throw new Error(`unknown provider ${entry.provider}`);
      if (!entry.markets?.length || entry.markets.some((m) => !MARKETS.includes(m))) throw new Error('markets must be a non-empty subset of us, gb, in, au, nz');
      r = await fetcher(entry);
    } catch (err) {
      r = { status: err.status ?? 'ERR', error: err.message, total: 0, counts: {} };
    }
    const inMarket = Object.fromEntries(entry.markets.map((m) => [m, r.counts[m] ?? 0]));
    const pass = !r.error && entry.markets.every((m) => inMarket[m] > 0);
    results.push({ entry, r, inMarket, pass });
    const counts = entry.markets.map((m) => `${m} ${inMarket[m]}`).join('  ');
    const note = r.error ? `  ${r.error}` : `  [${r.name ?? '-'} · ${r.basis}]`;
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${entry.name.padEnd(32)} ${entry.provider.padEnd(15)} ${String(r.status).padEnd(4)} total ${String(r.total).padStart(5)}   ${counts}${note}`);
  }

  console.log('\nPer market (passing entries):');
  for (const m of MARKETS) {
    const ok = results.filter((x) => x.pass && x.entry.markets.includes(m));
    const providers = [...new Set(ok.map((x) => x.entry.provider))].sort().join(', ');
    console.log(`  ${m}: ${ok.length} employers${providers ? ` (${providers})` : ''}`);
  }
  const failed = results.filter((x) => !x.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);

  if (args.out) {
    const stamped = [];
    for (const { entry, r } of results) {
      if (r.error) continue;
      const markets = entry.markets.filter((m) => (r.counts[m] ?? 0) >= args.minJobs);
      if (markets.length === 0) continue;
      const jobsInMarket = Object.fromEntries(markets.map((m) => [m, r.counts[m]]));
      const out = { name: entry.name, provider: entry.provider, careers_url: entry.careers_url, markets };
      let options = entry.options;
      const share = r.total > 0 ? Math.min(1, markets.reduce((sum, m) => sum + r.counts[m], 0) / r.total) : 1;
      if (entry.provider === 'workday' && options?.workday?.marketOnly === undefined && share < MARKET_ONLY_SHARE) {
        options = { ...options, workday: { ...options?.workday, marketOnly: true } };
      }
      if (options) out.options = options;
      out.verified_at = today();
      out.jobs_in_market = jobsInMarket;
      stamped.push(out);
    }
    await writeFile(args.out, `${JSON.stringify(stamped, null, 2)}\n`);
    console.log(`wrote ${stamped.length} entries to ${args.out}`);
  }
  process.exitCode = failed > 0 ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
