#!/usr/bin/env node
/* ============================================================
   check-links — advisory link rot check for the curated links.

   NOT a CI gate, on purpose. Gating a pull request on 80-odd third-party
   hosts buys flakiness for no safety: a link that dies does not break the
   build, it disappoints a visitor, and that is a slower clock than a PR.
   So this runs on a schedule (.github/workflows/link-check.yml), opens an
   issue when something is genuinely dead, and never fails a build.

   It exists because two links had rotted unnoticed. Out of 49 blogroll
   entries, one pointed at an apex serving no certificate (julian.ac, whose
   own http:// redirects to www) and one at a host that had gone away
   entirely (vihart.com). Roughly 4% in eighteen months, and it compounds.

   WHAT COUNTS AS DEAD is the whole difficulty, and getting it wrong makes
   the report worthless:

     · 401 / 403 / 405 / 429 are NOT failures. Bot-blocking is the single
       most common response to an automated checker from a datacentre IP.
       Measured against the real link set: whc.unesco.org returns 403 to
       every request, as do github.com, dl.acm.org (behind doi.org) and
       several publishers. A checker that reports those is a checker nobody
       reads by the second run.
     · Timeouts and connection resets are retried once before counting.
       Transient network failure looks exactly like a dead host on the first
       attempt.
     · 404, 410 and persistent 5xx are failures. So is a DNS or TLS failure
       that survives the retry — that is what both real casualties looked
       like.

   Scope is the hand-curated links: the blogroll (data/links.yaml) and the
   publication URLs (data/publications.js). UNESCO site links are excluded by
   default: there are ~130 of them, they are generated from a stable numeric
   ID scheme, and they 403 uniformly, so they would be 130 lines of noise
   hiding the two lines that matter. Pass --all to include them.

   Run:  node scripts/check-links.mjs [--all] [--json] [--concurrency N]
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(
    'Usage: node scripts/check-links.mjs [--all] [--json] [--concurrency N]\n'
    + '  --all          also check the ~130 UNESCO site links (noisy: they 403 uniformly)\n'
    + '  --json         emit machine-readable output\n'
    + '  --concurrency  parallel requests (default 8)\n',
  );
  process.exit(0);
}
const INCLUDE_ALL = args.includes('--all');
const AS_JSON = args.includes('--json');
const CONCURRENCY = Number(args[args.indexOf('--concurrency') + 1]) || 8;

const TIMEOUT_MS = 20_000;
const UA = 'Mozilla/5.0 (compatible; stefanomasneri.com link-check; +https://stefanomasneri.com)';

/* Statuses that mean "a server answered and does not want to be scraped",
   which is not the same as "this link is broken for a human in a browser". */
const NOT_A_FAILURE = new Set([401, 403, 405, 406, 429]);

/* ── Collect the links worth checking ─────────────────────────────────── */

function fromLinksYaml() {
  const src = fs.readFileSync(path.join(ROOT, 'data', 'links.yaml'), 'utf8');
  const out = [];
  let name = null;
  for (const line of src.split('\n')) {
    const n = /^\s*-\s+name:\s*"([^"]+)"/.exec(line);
    if (n) { name = n[1]; continue; }
    const u = /^\s*url:\s*"(https?:\/\/[^"]+)"/.exec(line);
    if (u) out.push({ url: u[1], where: 'data/links.yaml', label: name || u[1] });
  }
  return out;
}

async function fromPublications() {
  const { PUBLICATIONS } = await import('../data/publications.js');
  return PUBLICATIONS
    .filter((p) => typeof p.url === 'string' && /^https?:\/\//.test(p.url))
    .map((p) => ({ url: p.url, where: 'data/publications.js', label: p.title.slice(0, 60) }));
}

function fromUnesco() {
  const src = fs.readFileSync(path.join(ROOT, 'data', 'unesco.js'), 'utf8');
  return [...src.matchAll(/"url":\s*"(https?:\/\/[^"]+)"/g)]
    .map((m) => ({ url: m[1], where: 'data/unesco.yaml', label: m[1] }));
}

/* ── Check one link ───────────────────────────────────────────────────── */

async function probe(url, method) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': UA, accept: '*/*' },
    });
    return { status: res.status, finalUrl: res.url };
  } finally {
    clearTimeout(timer);
  }
}

async function checkOnce(url) {
  /* HEAD first — cheap, and most hosts answer it. Some reject HEAD with 405
     or answer it wrongly, so fall back to GET before believing a failure. */
  try {
    const head = await probe(url, 'HEAD');
    if (head.status < 400 || NOT_A_FAILURE.has(head.status)) return head;
  } catch { /* fall through to GET */ }
  return probe(url, 'GET');
}

/* Three attempts with growing backoff, not one.

   A reset or a timeout on the first try is indistinguishable from a dead host
   and usually is not one. 5xx especially: an egress proxy that cannot reach
   the origin answers on the origin's behalf, so the status says nothing about
   the site. That is not hypothetical — running this from a sandbox behind an
   Envoy proxy reported `HTTP 503` for addi.ehu.eus, a host that is perfectly
   healthy in a browser; the body was Envoy's own "upstream connect error",
   not the repository's. A dead host stays dead across all three attempts, so
   the retries cost ten seconds and remove most of the false positives.

   If a report ever lists a single 5xx on a host you can open in a browser,
   suspect the runner's egress before the site. */
const ATTEMPTS = 3;

async function check(entry) {
  let last = { ok: false, status: 0, reason: 'unreachable' };
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      const { status, finalUrl } = await checkOnce(entry.url);
      if (status < 400 || NOT_A_FAILURE.has(status)) {
        return { ...entry, ok: true, status, finalUrl };
      }
      last = { ok: false, status, reason: `HTTP ${status}` };
    } catch (err) {
      const reason = err?.name === 'AbortError' ? 'timeout' : (err?.cause?.code || err?.message || 'network error');
      last = { ok: false, status: 0, reason };
    }
    if (attempt < ATTEMPTS - 1) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  return { ...entry, ...last };
}

async function pool(items, worker, size) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  }));
  return results;
}

/* ── Main ─────────────────────────────────────────────────────────────── */

async function main() {
  const entries = [
    ...fromLinksYaml(),
    ...await fromPublications(),
    ...(INCLUDE_ALL ? fromUnesco() : []),
  ];

  /* De-duplicate by URL, keeping the first place it was found. */
  const seen = new Map();
  for (const e of entries) if (!seen.has(e.url)) seen.set(e.url, e);
  const unique = [...seen.values()];

  const results = await pool(unique, check, CONCURRENCY);
  const dead = results.filter((r) => !r.ok);

  if (AS_JSON) {
    process.stdout.write(`${JSON.stringify({ checked: unique.length, dead }, null, 2)}\n`);
  } else {
    process.stdout.write(`Checked ${unique.length} links.\n`);
    if (!dead.length) {
      process.stdout.write('All reachable (401/403/405/429 treated as bot-blocking, not breakage).\n');
    } else {
      process.stdout.write(`\n${dead.length} need attention:\n\n`);
      for (const d of dead) {
        process.stdout.write(`  ${d.reason.padEnd(16)} ${d.url}\n`);
        process.stdout.write(`  ${''.padEnd(16)} ↳ ${d.label} (${d.where})\n`);
      }
      process.stdout.write(
        '\nBefore editing anything, open one in a browser. 401/403/405/429 are already\n'
        + 'filtered out as bot-blocking; a lone 5xx or timeout that survived three\n'
        + "attempts can still be the runner's egress rather than the site.\n",
      );
    }
  }

  /* Always exit 0. This is advisory: the workflow reads the report and opens
     an issue. A non-zero exit here would turn a dead third-party host into a
     red mark on the repository, which is exactly the flakiness this design
     is avoiding. */
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    process.stderr.write(`check-links failed: ${err.stack || err.message}\n`);
    /* Even a crash is not a build failure — see above. */
  });
}

export { check, NOT_A_FAILURE, fromLinksYaml, main };
