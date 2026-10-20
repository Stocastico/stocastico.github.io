/* Headings are sentence case (Montaggio, #190/#194).

   The chrome went sentence case in #190, and the section titles with it — but
   the sub-pages kept their title case ("Full Publication List", "Experience &
   Education") and so did every h2 in the project write-ups ("My Role", "Tech
   Stack", "What We Measured"). Mixed, it reads as two sites.

   What is checked: the headings that structure a page — section, page and
   globe titles, the 404 title, the MNIST lab heading, and the classless h2/h3
   inside a project write-up (and the drafts they are generated from). What is
   not: the names of works — project titles, publication titles, blogroll
   names — which keep the case their owners gave them.

   The rule: after the first word, a word written Capitalised (one capital,
   then lower case) must be a proper noun from the allowlist. Words with
   capitals inside them (cleAR, MLOps, LiDAR) or all capitals (UFC, RAG) are
   names or acronyms and pass on their own. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Proper nouns that may appear capitalised mid-heading. */
const PROPER = new Set([
  'I', "I've", "I'm", 'Spanish', 'Google', 'Scholar', 'Vertex', 'Azure', 'Python',
  'Basque', 'Europe', 'European', 'Stefano', 'Masneri', 'Brescia', 'Berlin',
  'Frankfurt', 'Donostia', 'Sebastián', 'San', 'Opera', 'Horizon', 'Vicomtech',
  'Fraunhofer', 'Mediapro', 'Octagon',
]);

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/<[^>]+>/g, '').trim();

export function titleCased(text) {
  const words = decode(text).split(/\s+/).flatMap((w) => w.split('-'));
  const bad = [];
  words.slice(1).forEach((raw) => {
    const w = raw.replace(/^["'“‘(]+|["'”’),.:;!?]+$/g, '');
    if (/^[A-Z][a-z'’]+$/.test(w) && !PROPER.has(w)) bad.push(w);
  });
  return bad;
}

const pages = [
  ...fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')),
  ...fs.readdirSync(path.join(ROOT, 'projects')).filter((f) => f.endsWith('.html')).map((f) => `projects/${f}`),
];

const STRUCTURAL = /<(h[1-3]) class="(?:section-title|globe-title|post-title|error-title|mnist-lab__heading)[^"]*"[^>]*>([\s\S]*?)<\/\1>/g;
const CLASSLESS = /<(h[23])(?:\s+id="[^"]*")?>([\s\S]*?)<\/\1>/g;

test('titleCased: flags Capitalised words, passes acronyms, names and the allowlist', () => {
  assert.deepEqual(titleCased('Full Publication List'), ['Publication', 'List']);
  assert.deepEqual(titleCased('Sensor fusion: vision + accelerometers'), []);
  assert.deepEqual(titleCased('MLOps platform on GCP for a Spanish media group'), []);
  assert.deepEqual(titleCased('Proof-of-Concept applications'), ['Concept']);
  assert.deepEqual(titleCased("Where I've been"), []);
});

for (const rel of pages) {
  test(`sentence case: structural headings in ${rel}`, () => {
    const html = fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    const found = [...html.matchAll(STRUCTURAL), ...(rel.startsWith('projects/') ? html.matchAll(CLASSLESS) : [])];
    const offenders = found.map((m) => [decode(m[2]), titleCased(m[2])]).filter(([, bad]) => bad.length);
    assert.deepEqual(offenders.map(([t, bad]) => `${t} (${bad.join(', ')})`), []);
  });
}

test('sentence case: the drafts the project pages are generated from', () => {
  const dir = path.join(ROOT, 'drafts');
  const offenders = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      const m = line.match(/^#{2,3}\s+(.+)$/);
      if (m && titleCased(m[1]).length) offenders.push(`${f}: ${m[1]}`);
    }
  }
  assert.deepEqual(offenders, []);
});
