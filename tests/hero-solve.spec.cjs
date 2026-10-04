const { test, expect } = require('@playwright/test');

test('hero provides a real keyboard solve with reduced motion and a spoken result', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const downloads = [];
  page.on('request', r => { if (/projects\/zodiacal\//.test(r.url())) downloads.push(r.url()); });
  await page.goto('/');
  const sky = page.locator('#sky'), button = page.getByRole('button', { name: 'solve a field' });
  await expect(button).toBeVisible();
  expect(downloads).toEqual([]);
  await sky.focus();
  await sky.press('Enter');
  const status = page.locator('#sky-status');
  await expect(status).toHaveAttribute('role', 'status');
  await expect(status).toContainText('Solved in');
  await expect(status).toContainText('synthetic frame');
  await expect(button).toBeEnabled();
  const indexCount = downloads.filter(url => url.endsWith('bright-quads.bin')).length;
  expect(indexCount).toBe(1);
  await page.evaluate(() => {
    const solve = window.OCZodiacal.solve;
    window.repeatSolves = 0;
    window.OCZodiacal.solve = (...args) => { window.repeatSolves++; return solve(...args); };
  });
  await sky.press('Space');
  await expect.poll(() => page.evaluate(() => window.repeatSolves)).toBe(1);
  await expect(status).toContainText('Solved in');
  await expect(button).toBeEnabled();
  expect(downloads.filter(url => url.endsWith('bright-quads.bin'))).toHaveLength(1);
});

test('hero illustration stays light and a slow visitor solve survives the animation cycle', async ({ page }) => {
  await page.clock.install();
  let release;
  let count = 0;
  await page.route('**/bright-quads.bin', async route => {
    count++;
    await new Promise(resolve => { release = resolve; });
    await route.continue();
  });
  await page.goto('/');
  await page.clock.fastForward(12000);
  expect(count).toBe(0);
  expect(await page.evaluate(() => Boolean(window.OCZodiacal))).toBe(false);
  const button = page.locator('#sky-solve'), status = page.locator('#sky-status');
  await button.click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await expect(button).toBeDisabled();
  const pending = await status.innerText();
  // These are real keyboard triggers, not clicks forced through a disabled button.
  await page.locator('#sky').focus();
  await page.locator('#sky').press('Enter');
  await page.locator('#sky').press('Space');
  await page.clock.fastForward(12000);
  await expect(status).toHaveText(pending);
  expect(count).toBe(1);
  release();
  await expect(status).toContainText(/Solved in|No solution for this field/);
  await expect(button).toBeEnabled();
});

test('hero reports a loading failure and can solve after retry', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/bright-quads.bin', route => route.abort());
  await page.goto('/');
  const button = page.locator('#sky-solve'), status = page.locator('#sky-status');
  await button.click();
  await expect(status).toContainText('solver could not load');
  await expect(button).toBeEnabled();
  await page.unroute('**/bright-quads.bin');
  await button.click();
  await expect(status).toContainText('Solved in');
});
