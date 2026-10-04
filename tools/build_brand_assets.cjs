// Render the touch icon and homepage card from the checked-in SVG identity.
// Start the site server first. Optional: SITE_URL, CHROME_PATH.
const { chromium } = require('playwright');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const base = (process.env.SITE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  try {
    const context = await browser.newContext({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    await context.addInitScript(() => { Math.random = () => 0.35; });
    const page = await context.newPage();
    await page.goto(base + '/');
    await page.setContent('<html><body style="margin:0;width:180px;height:180px;background:#1a1b26;display:grid;place-items:center"><img width="132" height="132" src="' + base + '/assets/favicon.svg"></body></html>');
    await page.screenshot({ path: path.join(root, 'assets/apple-touch-icon.png') });
    await page.goto('about:blank');
    await page.setViewportSize({ width: 1200, height: 630 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(base + '/tools/og.html');
    await page.evaluate(async () => { await Promise.all([...document.images].map(image => image.decode())); });
    // Capture the existing illustrative quad after its detections/readout appear.
    await page.waitForTimeout(9600);
    await page.screenshot({ path: path.join(root, 'assets/og.jpg'), type: 'jpeg', quality: 72 });
    console.log('Rendered apple-touch-icon.png and og.jpg from the shared star mark.');
  } finally {
    await browser.close();
  }
})();
