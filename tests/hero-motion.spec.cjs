const { test, expect } = require('@playwright/test');

test('hero pause stops autonomous drawing while keyboard navigation and resume still work', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  const pause = page.locator('#sky-pause'), sky = page.locator('#sky');
  await expect(pause).toBeVisible();
  await pause.click();
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  await expect(pause).toContainText('resume sky');
  const still = await sky.evaluate(c => c.toDataURL());
  await page.clock.fastForward(12000);
  expect(await sky.evaluate(c => c.toDataURL())).toBe(still);
  await sky.focus();
  await sky.press('ArrowLeft');
  await expect.poll(() => sky.evaluate(c => c.toDataURL())).not.toBe(still);
  const moved = await sky.evaluate(c => c.toDataURL());
  await pause.click();
  await expect(pause).toHaveAttribute('aria-pressed', 'false');
  await page.clock.fastForward(1000);
  await expect.poll(() => sky.evaluate(c => c.toDataURL())).not.toBe(moved);
});

test('reduced-motion visitors get static interaction without an animation toggle', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('#sky-pause')).toBeHidden();
  await expect(page.locator('#sky-solve')).toBeVisible();
  await expect(page.locator('#sky')).toHaveAttribute('aria-label', /Enter or Space/);
});

test('homepage hides unavailable sky controls without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(baseURL);
    for (const id of ['sky-pause', 'sky-solve', 'sky-zenith']) await expect(page.locator('#' + id)).toBeHidden();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('#projects')).toBeVisible();
  } finally {
    await context.close();
  }
});

test('homepage keeps its content when the sky engine cannot load', async ({ page }) => {
  await page.route('**/assets/sky-core.js', route => route.abort());
  await page.goto('/');
  for (const id of ['sky-pause', 'sky-solve', 'sky-zenith']) await expect(page.locator('#' + id)).toBeHidden();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('#projects')).toBeVisible();
});

for (const change of ['resize', 'overhead']) {
  test(`a pending hero solve resolves clearly after ${change}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    let release;
    await page.route('**/bright-quads.bin', async route => {
      await new Promise(resolve => { release = resolve; });
      await route.continue();
    });
    await page.goto('/');
    await page.locator('#sky-solve').click();
    await expect.poll(() => Boolean(release)).toBe(true);
    if (change === 'resize') {
      const size = page.viewportSize();
      await page.setViewportSize({ width: size.width + 20, height: size.height - 40 });
    } else {
      await page.locator('#sky-zenith').click();
    }
    release();
    await expect(page.locator('#sky-solve')).toBeEnabled();
    if (change === 'resize') {
      await expect(page.locator('#sky-status')).toContainText(/Solved in|No solution for this field/);
    } else {
      await expect(page.locator('#sky-status')).toContainText('result was set aside');
    }
  });
}
