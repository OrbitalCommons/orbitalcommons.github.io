const { chromium } = require('/Users/meawoppl/repos/orbitalcommons.github.io/node_modules/@playwright/test');
const fs = require('fs');
(async () => {
  const [,, dir, pxPerMm] = process.argv;
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.svg'))) {
    const svg = fs.readFileSync(`${dir}/${f}`, 'utf8');
    const vb = svg.match(/viewBox="([\d.\s-]+)"/)[1].split(/\s+/).map(Number);
    const W = Math.round(vb[2] * pxPerMm), H = Math.round(vb[3] * pxPerMm);
    await p.setViewportSize({ width: W, height: H });
    const s = svg.replace(/width="[^"]*mm"/, `width="${W}px"`).replace(/height="[^"]*mm"/, `height="${H}px"`);
    await p.setContent(`<html><body style="margin:0;background:transparent">${s}</body></html>`);
    await p.screenshot({ path: `${dir}/${f.replace('.svg', '.png')}`, omitBackground: true, clip: { x: 0, y: 0, width: W, height: H } });
    console.log(f, W, H, vb.join(' '));
  }
  await b.close();
})();
