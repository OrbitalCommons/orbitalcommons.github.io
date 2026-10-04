const { test, expect } = require('@playwright/test');

for (const name of ['starfield', 'fitsio-pure', 'zodiacal', 'rizzma', 'starfield-datastore', 'scicamera']) {
  test(`${name} demo controls and related links remain inside the page at 200% text size`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto(`/projects/${name}/`);
    await page.addStyleTag({ content: 'html { font-size: 200% !important }' });
    // Inspect controls even inside an overflow:hidden panel, which could hide a regression.
    const overflow = await page.locator('main button, main input, main select, .demo-badge').evaluateAll(nodes => nodes.filter(el => {
      const r = el.getBoundingClientRect();
      return r.width && (r.right > innerWidth || r.left < 0);
    }).map(el => el.id || el.className));
    expect(overflow).toEqual([]);
    await page.locator('.related-project').scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const card = await page.locator('.related-project').boundingBox();
    const arrow = await page.locator('.related-arrow').boundingBox();
    expect(arrow.x + arrow.width).toBeLessThanOrEqual(card.x + card.width);
    if (name === 'zodiacal') {
      await page.locator('#plate-field').selectOption('crux');
      await expect(page.locator('#plate-field')).toHaveValue('crux');
    }
  });
}

test('project skip link bypasses navigation and section links stay keyboard reachable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/projects/starfield/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter'); await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement.closest('main'))).toBe(true);
  const last = page.locator('.project-index a').last();
  await last.focus(); await last.press('Enter');
  await expect(page).toHaveURL(/#features$/);
  await expect.poll(async () => (await page.locator('#features-title').boundingBox()).y).toBeLessThan(150);
  const heading = await page.locator('#features-title').boundingBox();
  expect(heading.y).toBeGreaterThanOrEqual(60);
  expect(heading.y).toBeLessThan(700);
});
