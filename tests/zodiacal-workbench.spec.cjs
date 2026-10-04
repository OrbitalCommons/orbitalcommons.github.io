const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test('zodiacal workbench lazily solves measured pixels and exposes an accessible result', async ({ page }) => {
  const downloads = [];
  page.on('request', r => { if (/bright-quads\.bin|zodiacal_browser_bg\.wasm/.test(r.url())) downloads.push(r.url()); });
  await page.goto('/projects/zodiacal/');
  await expect(page.locator('#plate-workbench')).toBeVisible();
  expect(downloads).toEqual([]);
  await page.evaluate(() => {
    const solve = window.OCZodiacal.solve;
    window.OCZodiacal.solve = (...args) => { window.measuredInput = args; return solve(...args); };
  });
  const button = page.getByRole('button', { name: 'Solve this frame' });
  await button.focus();
  await button.press('Enter');
  await expect(page.locator('#plate-status')).toContainText('detections matched');
  await expect(page.locator('#plate-results')).toContainText('15.00° (input 15°)');
  await expect(page.locator('#plate-frame')).toHaveAttribute('aria-label', /green match rings/);
  const input = await page.evaluate(() => window.measuredInput);
  expect(input[1]).toBe(1024);
  expect(input[2]).toBe(768);
  for (const source of input[0]) expect(Object.keys(source).sort()).toEqual(['flux', 'x', 'y']);
  expect(downloads).toHaveLength(2);
  await page.getByText('What this demo measures', { exact: true }).click();
  await expect(page.locator('.plate-method')).toContainText('not real-camera accuracy');
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(audit.violations).toEqual([]);
});

test('changing the synthetic frame clears stale results and solves noisy rotated detections', async ({ page }) => {
  await page.goto('/projects/zodiacal/');
  const solve = page.locator('#plate-solve'), status = page.locator('#plate-status');
  await solve.click();
  await expect(status).toContainText('detections matched');
  await page.locator('#plate-field').selectOption('leo');
  await expect(page.locator('#plate-results')).toBeHidden();
  await expect(page.locator('#plate-frame')).toHaveAttribute('aria-label', /Not yet solved/);
  await page.locator('#plate-roll').fill('-45');
  await page.locator('#plate-noise').check();
  await solve.click();
  await expect(status).toContainText('37 of 40 detections matched');
  await expect(page.locator('#plate-results')).toContainText('(input -45°)');
  const value = await page.locator('#plate-results dd').nth(1).innerText();
  expect(parseFloat(value)).toBeCloseTo(-45, 1);
  await expect(page.locator('#plate-controls')).toBeEnabled();
});

test('workbench keeps controls locked during loading and recovers from a failed download', async ({ page }) => {
  let release;
  await page.route('**/bright-quads.bin', async route => {
    await new Promise(resolve => { release = resolve; });
    await route.abort();
  });
  await page.goto('/projects/zodiacal/');
  await page.locator('#plate-solve').click();
  await expect(page.locator('#plate-solve')).toBeDisabled();
  await expect(page.locator('#plate-field')).toBeDisabled();
  await expect.poll(() => Boolean(release)).toBe(true);
  release();
  await expect(page.locator('#plate-status')).toContainText('Could not solve this frame');
  await expect(page.locator('#plate-field')).toBeEnabled();
  await page.unroute('**/bright-quads.bin');
  await page.locator('#plate-solve').click();
  await expect(page.locator('#plate-status')).toContainText('detections matched');
});
