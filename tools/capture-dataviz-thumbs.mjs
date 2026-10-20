/* Captures the map the card frame shows for each off-site dataviz project
   (brescia-dataviz, donostia-dataviz) into drafts/thumbs/<id>.png.

   Those pieces draw their figures in the browser, so there is no image file
   to borrow: this opens the published page, takes one map's <svg> on a
   transparent ground (the pages are white, which would glare on this site's
   dark cards) and writes it out. generate-thumbs then fits it onto the
   card's ground. Run by hand when a map changes — not deployed, not bundled:

     node tools/capture-dataviz-thumbs.mjs   (then npm run generate-thumbs) */
import { chromium } from 'playwright';
import { THEME } from '../js/theme.js';

const ORIGIN = 'https://stefanomasneri.com';
/* One map each: Brescia's province with its 205 comuni (share of residents of
   foreign origin — the full silhouette in the strongest ramp), Donostia's
   barrios by their dominant profile (the most colour on one map). Donostia
   keeps only its top 54%, with any shape starting below the halfway line
   hidden: those are three rural exclaves that would take half the frame, and its unhighlighted barrios are near-white, which glares
   on a dark card — they are dimmed to the card's own faint text tone. */
const SHOTS = [
  { id: 'brescia-dataviz', path: '/brescia-dataviz/', sel: '#fig-21 svg.mappa' },
  { id: 'donostia-dataviz', path: '/donostia-dataviz/', sel: 'svg#map_prof', keepTop: 0.54, dropBelow: 0.5, dimPale: true },
];

const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
const browser = await chromium.launch({ proxy, executablePath: process.env.CHROMIUM || undefined });
try {
  for (const s of SHOTS) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 2000 }, deviceScaleFactor: 2, ignoreHTTPSErrors: !!proxy });
    await page.goto(ORIGIN + s.path, { waitUntil: 'networkidle', timeout: 60000 });
    const svg = page.locator(s.sel).first();
    await svg.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
    /* Nothing fixed or sticky (a page's navbar) may sit over the map. */
    await page.evaluate(() => document.querySelectorAll('*').forEach((n) => {
      const pos = getComputedStyle(n).position;
      if (pos === 'fixed' || pos === 'sticky') n.style.setProperty('display', 'none', 'important');
    }));
    if (s.dropBelow) {
      await svg.evaluate((el, f) => {
        const h = el.getBoundingClientRect().height;
        const top = el.getBoundingClientRect().top;
        el.querySelectorAll('path').forEach((p) => {
          if (p.getBoundingClientRect().top - top > h * f) p.style.display = 'none';
        });
      }, s.dropBelow);
    }
    if (s.dimPale) {
      await svg.evaluate((el, ink) => el.querySelectorAll('path').forEach((p) => {
        const [r, g, b] = getComputedStyle(p).fill.match(/\d+/g).map(Number);
        if (Math.min(r, g, b) > 220) { p.style.fill = ink; p.style.fillOpacity = '0.22'; }
      }), THEME.text);
    }
    /* Transparent ground: clear every background from the svg up. */
    await svg.evaluate((el) => {
      for (let n = el; n; n = n.parentElement) n.style.setProperty('background', 'transparent', 'important');
      el.querySelectorAll('rect').forEach((r) => {
        const b = r.getBBox();
        const v = el.viewBox.baseVal;
        if (v && b.width >= v.width * 0.95 && b.height >= v.height * 0.95) r.remove();
      });
    });
    /* boundingBox() is in viewport coordinates; a fullPage clip is in page ones. */
    const box = await svg.boundingBox();
    const scroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
    const clip = { x: box.x + scroll.x, y: box.y + scroll.y, width: box.width, height: box.height * (s.keepTop || 1) };
    await page.screenshot({ path: `drafts/thumbs/${s.id}.png`, omitBackground: true, clip, fullPage: true });
    console.log(`drafts/thumbs/${s.id}.png`);
    await page.close();
  }
} finally {
  await browser.close();
}
