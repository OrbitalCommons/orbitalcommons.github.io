const { test, expect } = require('@playwright/test');

// The unlinked StratumZero hardware page: 3D viewer, reduced motion, reflow.
test('the board viewer loads, highlights a block and explains a part', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/projects/stratumzero/');
  await page.locator('#explore').scrollIntoViewIfNeeded();
  const viewer = page.locator('#board3d');
  // headless browsers without WebGL show the fallback text instead of the model
  await expect(viewer.locator('.viewer-status')).toBeHidden({ timeout: 45000 }).catch(() => {});
  if (!(await viewer.evaluate(el => el.classList.contains('ready')))) {
    await expect(viewer.locator('.viewer-status')).toContainText('WebGL');
    return;
  }
  await page.getByRole('button', { name: /10 MHz OCXO/ }).click();
  await expect(page.getByRole('button', { name: /10 MHz OCXO/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(viewer.locator('.viewer-info h3')).toHaveText('10 MHz OCXO');
  await viewer.locator('.viewer-parts button', { hasText: 'Y1' }).click();
  await expect(viewer.locator('.viewer-part')).toContainText('AOC97');
  await page.getByRole('button', { name: 'Lift the module' }).click();
  await expect(page.getByRole('button', { name: 'Seat the module' })).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('the viewer does not auto-rotate under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/projects/stratumzero/');
  await page.locator('#explore').scrollIntoViewIfNeeded();
  const viewer = page.locator('#board3d');
  await expect(viewer.locator('.viewer-status')).toBeHidden({ timeout: 45000 }).catch(() => {});
  if (!(await viewer.evaluate(el => el.classList.contains('ready')))) return;
  await expect(page.locator('[data-action="rotate"]')).toHaveAttribute('aria-pressed', 'false');
});

test('the StratumZero page reflows at 320 px with 200% text', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/projects/stratumzero/');
  await page.addStyleTag({ content: 'html { font-size: 200% !important }' });
  for (const id of ['system', 'explore', 'blocks', 'gallery']) await page.locator('#' + id).scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('the StratumZero page stays out of search indexes', async ({ page }) => {
  await page.goto('/projects/stratumzero/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
});
