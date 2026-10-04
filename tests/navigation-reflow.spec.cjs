const { test, expect } = require('@playwright/test');

for (const blocked of [false, true]) {
  test(`enlarged project headings remain visible with nav measurement ${blocked ? 'unavailable' : 'enabled'}`, async ({ page }) => {
    if (blocked) await page.route('**/assets/nav.js', route => route.abort());
    await page.setViewportSize({ width: 320, height: 720 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/projects/starfield/');
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await page.locator('.project-index a[href="#example"]').click();
    const heading = page.locator('#example h2');
    await expect.poll(() => heading.evaluate(el => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && el.contains(document.elementFromPoint(r.left + 5, r.top + 5));
    })).toBe(true);
    if (!blocked) {
      const gap = await page.evaluate(() => document.querySelector('#example h2').getBoundingClientRect().top - document.querySelector('.site-nav').getBoundingClientRect().bottom);
      expect(gap).toBeGreaterThanOrEqual(10);
      expect(gap).toBeLessThan(60);
    }
  });
}

test('enlarged compact explorer keeps readout and search below navigation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.goto('about:blank');
    await page.goto('/sky/#ra=84&dec=0&fov=90&d=0');
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await expect.poll(() => page.evaluate(() => {
      const nav = document.querySelector('.site-nav').getBoundingClientRect();
      const readout = document.querySelector('.readout').getBoundingClientRect();
      const panel = document.querySelector('.explorer-panels').getBoundingClientRect();
      return readout.top >= nav.bottom && panel.top >= nav.bottom && readout.bottom <= panel.bottom;
    })).toBe(true);
    const search = page.locator('#x-q');
    await search.scrollIntoViewIfNeeded();
    const box = await search.boundingBox();
    const nav = await page.locator('.site-nav').boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(nav.y + nav.height);
    expect(box.width).toBeGreaterThanOrEqual(160);
    await search.fill('Sirius');
    await page.getByRole('button', { name: 'Go', exact: true }).click();
    await expect(page).toHaveURL(/ra=101\.30&dec=-16\.70&fov=50/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
});
