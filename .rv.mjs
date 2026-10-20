import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2];
const exe = fs.readdirSync('/opt/pw-browsers').filter(d=>d.startsWith('chromium-')).map(d=>`/opt/pw-browsers/${d}/chrome-linux/chrome`).find(fs.existsSync);
const b = await chromium.launch({ executablePath: exe });
const pages = ['index','cv','projects','publications','travel','links','now','404','projects/mnist-lenet','projects/gaussian-nerf','projects/aroundtheworld','projects/rag-document-qa'];
for (const w of [1440, 390]) {
  const ctx = await b.newContext({ viewport: { width: w, height: w === 1440 ? 900 : 844 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  for (const pg of pages) {
    await p.goto(`http://localhost:4199/${pg}.html`, { waitUntil: 'networkidle' });
    await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); } scrollTo(0, 0); });
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${out}/${pg.replace('/', '_')}-${w}.png`, fullPage: true });
  }
  console.log(w, 'console errors:', errs);
  await ctx.close();
}
await b.close();
