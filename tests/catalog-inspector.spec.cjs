const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test('catalog stars can be inspected by name and traversed by keyboard', async ({ page }) => {
  await page.goto('/projects/starfield/');
  await expect(page.locator('#catalog-inspector')).toBeVisible();
  await page.locator('#catalog-name').selectOption({ label: 'Sirius' });
  await expect(page.locator('#catalog-star-name')).toHaveText('Sirius');
  await expect(page.locator('#catalog-ra')).toHaveText('101.30°');
  await expect(page.locator('#catalog-dec')).toHaveText('-16.70°');
  await expect(page.locator('#catalog-mag')).toHaveText('-1.4');
  await expect(page.locator('#catalog-bv')).toHaveText('0.01');
  await expect(page.locator('#catalog-selection-status')).toContainText('1 of 186 visible stars');
  await expect(page.locator('#catalog-prev')).toBeDisabled();
  await page.locator('#catalog-next').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#catalog-star-name')).toHaveText('Canopus');
  await page.locator('#catalog-prev').focus(); await page.keyboard.press('Space');
  await expect(page.locator('#catalog-star-name')).toHaveText('Sirius');
  await page.locator('#magnitude').fill('0');
  await page.locator('#catalog-name').selectOption({ label: 'Polaris' });
  await expect(page.locator('#magnitude-value')).toHaveText('2.0');
  await expect(page.locator('#catalog-star-name')).toHaveText('Polaris');
  await page.locator('#magnitude').fill('0');
  await expect(page.locator('#catalog-detail')).toBeHidden();
  await expect(page.locator('#catalog-name')).toHaveValue('');
  await page.locator('#catalog-next').click();
  await expect(page.locator('#catalog-star-name')).toHaveText('Sirius');
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(audit.violations).toEqual([]);
});

test('clicking a plotted star reports the same data and enlarged controls fit', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/projects/starfield/');
  const canvas = page.locator('#catalog-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  // Sirius at (101.30°, -16.70°) on the documented equatorial chart.
  const x = 42 + (1 - 101.3 / 360) * (box.width - 60);
  const y = 20 + (90 + 16.7) / 180 * (box.height - 70);
  await canvas.click({ position: { x, y } });
  await expect(page.locator('#catalog-star-name')).toHaveText('Sirius');
  await page.addStyleTag({ content: 'html { font-size: 200% !important }' });
  const overflow = await page.locator('#catalog-inspector button, #catalog-inspector select').evaluateAll(nodes => nodes.filter(el => {
    const r = el.getBoundingClientRect(); return r.right > innerWidth || r.left < 0;
  }).map(el => el.id));
  expect(overflow).toEqual([]);
});

test('catalog controls stay hidden when bundled data cannot load', async ({ page }) => {
  await page.route('**/assets/stars.js', route => route.abort());
  await page.goto('/projects/starfield/');
  await expect(page.locator('#catalog-status')).toContainText('could not load');
  await expect(page.locator('#catalog-inspector')).toBeHidden();
  await expect(page.locator('[data-demo=catalog] .demo-controls')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Select the brightest stars' })).toBeVisible();
});
