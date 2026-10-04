const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const field = '/sky/#ra=84&dec=0&fov=60';

test('explorer solves a synthetic field on demand and announces accessible results', async ({ page }) => {
  const engineRequests = [];
  page.on('request', request => {
    if (/bright-quads\.bin|zodiacal_browser_bg\.wasm/.test(request.url())) engineRequests.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(field);
  const solve = page.getByRole('button', { name: 'Plate-solve this view' });
  await expect(solve).toBeVisible();
  expect(engineRequests).toEqual([]);
  await solve.focus();
  await solve.press('Enter');
  const result = page.locator('#x-result');
  await expect(result).toContainText('Solved in');
  await expect(result).toHaveAttribute('role', 'status');
  await expect(result).toContainText('least-squares fit');
  await expect(result).toContainText('not real-camera accuracy');
  await expect(result).toContainText('<0.1″ from the true centre');
  expect(engineRequests).toHaveLength(2);
  await expect(solve).toBeEnabled();
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(audit.violations).toEqual([]);
});

test('compact explorer keeps solved results above reachable controls', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(field);
  await page.locator('#x-solve').click();
  await expect(page.locator('#x-result')).toContainText('Solved in');
  const result = await page.locator('#x-result').boundingBox();
  const controls = await page.locator('#controls').boundingBox();
  expect(result.y + result.height).toBeLessThan(controls.y);
  await expect(page.locator('#x-result .r-title')).toBeInViewport();
  // Scroll the compact panel to the controls, then solve again without a reload.
  await page.locator('#x-solve').scrollIntoViewIfNeeded();
  await expect(page.locator('#x-solve')).toBeInViewport();
  await page.locator('#x-solve').click();
  await expect(page.locator('#x-result')).toContainText('Solved in');
  await expect(page.locator('#x-result .r-title')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

test('explorer reports an unavailable engine as text and lets the visitor retry', async ({ page }) => {
  await page.goto(field);
  await page.evaluate(() => {
    const load = window.OCZodiacal.load;
    window.OCZodiacal.load = () => {
      window.OCZodiacal.load = load;
      return Promise.reject(new Error('<img src=x onerror="window.injected=true">'));
    };
  });
  await page.locator('#x-solve').click();
  const result = page.locator('#x-result');
  await expect(result).toContainText('Solver unavailable');
  await expect(result).toContainText('<img src=x');
  await expect(result.locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
  await page.locator('#x-solve').click();
  await expect(result).toContainText('Solved in');
});

test('explorer explains a sparse field without claiming a solve', async ({ page }) => {
  await page.goto(field);
  await page.evaluate(() => { window.OCSky.tanField = () => []; });
  await page.locator('#x-solve').click();
  await expect(page.locator('#x-result')).toContainText('No solution');
  await expect(page.locator('#x-result')).toContainText('0 sources produced no verified match');
  await expect(page.locator('#x-solve')).toBeEnabled();
});
