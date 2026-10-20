import { chromium } from 'playwright';
import fs from 'node:fs';
const [,, page, out, w, h] = process.argv;
const exe = fs.readdirSync('/opt/pw-browsers').filter(d=>d.startsWith('chromium-')).map(d=>`/opt/pw-browsers/${d}/chrome-linux/chrome`).find(fs.existsSync);
const b = await chromium.launch({ executablePath: exe });
const p = await b.newPage({ viewport: { width: +w, height: +h }, reducedMotion: 'reduce' });
await p.goto(`http://localhost:4199/${page}`); await p.waitForTimeout(500);
await p.screenshot({ path: out });
await b.close();
