const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('node:fs/promises');

test('simulated exposure exports pixels and metadata readable by real fitsio-pure', async ({ page }) => {
  await page.goto('/projects/scicamera/');
  const lab = page.locator('#exposure-lab');
  await expect(lab).toBeVisible();
  await page.locator('#sensor-noise').uncheck();
  await page.locator('#sensor-time').fill('0');
  await expect(page.locator('#sensor-status')).toContainText('0.10 s exposure · 0 saturated pixels');
  await page.locator('#sensor-time').fill('100');
  await expect(page.locator('#sensor-time')).toHaveAttribute('aria-valuetext', '10.00 s');
  await expect(page.locator('#sensor-status')).not.toContainText('· 0 saturated pixels');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#sensor-download').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('synthetic-10.00s.fits');
  const file = await download.path();
  const data = await fs.readFile(file);
  expect(data.length % 2880).toBe(0);
  expect(data.toString('ascii', 0, 80)).toMatch(/^SIMPLE  = +T/);
  // This round-trip executes the shipped Rust/WASM parser, not a JS mock.
  await page.goto('/projects/fitsio-pure/');
  await page.locator('#fits-file').setInputFiles({ name: download.suggestedFilename(), mimeType: 'application/fits', buffer: data });
  await expect(page.locator('#fits-output')).toBeVisible();
  await expect(page.locator('#fits-stats')).toContainText('256 × 192');
  await expect(page.locator('#fits-stats')).toContainText('4095');
  await expect(page.locator('#fits-cards tr').filter({ hasText: 'EXPTIME' }).locator('td').nth(1)).toHaveText('10');
  await expect(page.locator('#fits-cards')).toContainText('SIMULATED');
  await expect(page.locator('#fits-canvas')).toBeVisible();
});

test('exposure controls work by keyboard and remain accessible on small screens', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/projects/scicamera/');
  const slider = page.locator('#sensor-time');
  await slider.focus(); await slider.press('End');
  await expect(slider).toHaveAttribute('aria-valuetext', '10.00 s');
  await page.locator('#sensor-noise').focus(); await page.locator('#sensor-noise').press('Space');
  await expect(page.locator('#sensor-status')).toContainText('noise off');
  await page.getByText('What this model includes', { exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(audit.violations).toEqual([]);
});
