const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const routes = ['/', '/404.html', '/projects/starfield/', '/projects/fitsio-pure/', '/projects/rizzma/', '/projects/zodiacal/', '/projects/starfield-datastore/'];
for (const route of routes) {
  test(`${route} has no detectable WCAG A/AA violations`, async ({ page }) => {
    await page.goto(route);
    if (route.includes('/starfield/')) await expect(page.locator('#catalog-status')).toContainText('catalog stars');
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations).toEqual([]);
  });
}

test('the populated FITS workbench remains accessible', async ({ page }) => {
  await page.goto('/projects/fitsio-pure/');
  await page.getByRole('button', { name: 'Open sample star field' }).click();
  await expect(page.locator('#fits-status')).toContainText('parsed locally');
  await page.getByText('Explore header cards').click();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
});
