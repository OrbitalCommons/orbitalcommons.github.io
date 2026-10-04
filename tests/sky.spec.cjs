const { test, expect } = require('@playwright/test');

function hashState(url) {
  return Object.fromEntries(new URLSearchParams(new URL(url).hash.slice(1)));
}

test('sky explorer supports keyboard navigation and restores a shared view', async ({ page }) => {
  await page.goto('/sky/#ra=84&dec=0&fov=90&d=12');
  const sky = page.locator('#sky-x');
  await expect(page.locator('#x-days')).toHaveValue('12');
  await sky.focus();
  await sky.press('ArrowLeft');
  await expect.poll(() => hashState(page.url()).ra).toBe('88.50');
  await sky.press('ArrowUp');
  await expect.poll(() => hashState(page.url()).dec).toBe('4.50');
  await sky.press('+');
  await expect.poll(() => +hashState(page.url()).fov).toBeLessThan(90);
  const shared = page.url();
  await page.reload();
  await expect(page.locator('#x-days')).toHaveValue('12');
  expect(page.url()).toBe(shared);
  await expect(page.locator('#x-center')).toContainText('FOV 78°');
});

test('sky explorer finds named stars without animation when reduced motion is requested', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/sky/');
  // Input with a datalist has a combobox role in some browser accessibility trees.
  const search = page.locator('#x-q');
  await search.fill('Sirius');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(search).toHaveAttribute('aria-invalid', 'false');
  await expect.poll(() => +hashState(page.url()).ra).toBeCloseTo(101.3, 1);
  await expect(page.locator('#x-center')).toContainText('FOV 50°');
  await search.fill('not a catalog object');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(search).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#x-status')).toHaveAttribute('role', 'status');
  await expect(page.locator('#x-status')).toContainText('No match.');
  await search.fill('Mars');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(search).toHaveAttribute('aria-invalid', 'false');
});

test('sky explorer date controls play, pause and return to today', async ({ page }) => {
  await page.goto('/sky/');
  const days = page.getByRole('slider', { name: 'Days from today' });
  await days.focus();
  await days.press('ArrowRight');
  await expect(days).toHaveValue('1');
  await expect(page.locator('#x-date')).toHaveText(/^\d{4}-\d{2}-\d{2}$/);
  await page.getByRole('button', { name: 'Play time' }).click();
  await expect(page.getByRole('button', { name: 'Pause time' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => +(await days.inputValue())).toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Pause time' }).click();
  await expect(page.getByRole('button', { name: 'Play time' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(days).toHaveValue('0');
  await expect(page.locator('#x-date')).toHaveText('today');
});

test('sky explorer layer controls redraw the map', async ({ page }) => {
  await page.goto('/sky/');
  const before = await page.locator('#sky-x').evaluate(c => c.toDataURL());
  const lines = page.getByRole('checkbox', { name: 'Constellations', exact: true });
  await lines.uncheck();
  await expect(lines).not.toBeChecked();
  await expect.poll(() => page.locator('#sky-x').evaluate(c => c.toDataURL())).not.toBe(before);
  await lines.check();
  await expect.poll(() => page.locator('#sky-x').evaluate(c => c.toDataURL())).toBe(before);
});

test('sky explorer keeps controls reachable on a small screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/sky/');
  for (const control of ['#x-q', '#x-play', '#x-days', '#x-now']) {
    await expect(page.locator(control)).toBeInViewport();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});


test('sky explorer rejects nonfinite shared coordinates and keeps zoom controls usable', async ({ page }) => {
  await page.goto('/sky/#ra=Infinity&dec=NaN&fov=-Infinity&d=Infinity');
  await expect(page.locator('#x-center')).not.toContainText(/NaN|Infinity/);
  await expect(page.locator('#x-days')).toHaveValue('0');
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect.poll(() => +hashState(page.url()).fov).toBe(69);
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect.poll(() => +hashState(page.url()).fov).toBe(90);
  for (const value of Object.values(hashState(page.url()))) expect(Number.isFinite(+value)).toBe(true);
});
