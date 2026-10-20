import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', proxy: { server: process.env.HTTPS_PROXY }, args: ['--ignore-certificate-errors'] });
for (const [site, want] of [['brescia-dataviz', [5, 8, 15, 20]], ['donostia-dataviz', [1, 7, 13]]]) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
  await p.goto('https://stefanomasneri.com/' + site + '/', { waitUntil: 'networkidle', timeout: 60000 });
  for (let y = 0; y < 40; y++) { await p.mouse.wheel(0, 900); await p.waitForTimeout(250); }
  const figs = await p.$$('figure, svg, canvas');
  let n = 0;
  for (const f of figs) {
    const bb = await f.boundingBox();
    if (!bb || bb.width < 400 || bb.height < 250) continue;
    if (await f.evaluate((el) => !!el.parentElement.closest('figure, svg'))) continue;
    if (want.includes(n)) console.log(site, n, await f.evaluate((el) => {
      const svgs = [...el.querySelectorAll('svg')].map((s) => `${s.getAttribute('class')}|${s.id}|${Math.round(s.getBoundingClientRect().width)}x${Math.round(s.getBoundingClientRect().height)}|paths:${s.querySelectorAll('path').length}`);
      return `${el.tagName}#${el.id}.${el.className?.baseVal ?? el.className} cap="${(el.querySelector('figcaption,h3,h4')?.textContent || '').slice(0, 60)}" svgs=${svgs.join(' ; ')}`;
    }));
    n++;
  }
  await p.close();
}
await b.close();
