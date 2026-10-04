const { test, expect } = require('@playwright/test');

const today = new Date('2026-10-04T12:00:00Z');

test('a copied sky view keeps its calendar date when reopened tomorrow', async ({ page }) => {
  await page.clock.setFixedTime(today);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {
    configurable: true, value: { writeText: async text => { window.copiedSkyLink = text; } },
  }));
  await page.goto('/sky/#ra=101.3&dec=-16.7&fov=50&d=30');
  await page.getByRole('button', { name: 'Copy link', exact: true }).click();
  await expect(page.locator('#x-status')).toHaveText('Link to this view copied.');
  const link = await page.evaluate(() => window.copiedSkyLink);
  const hash = new URLSearchParams(new URL(link).hash.slice(1));
  expect(Object.fromEntries(hash)).toEqual({ ra: '101.30', dec: '-16.70', fov: '50', date: '2026-11-03' });
  for (const time of ['00:00:00', '12:00:00', '23:59:59']) {
    await page.clock.setFixedTime(new Date(`2026-10-05T${time}Z`));
    await page.goto('about:blank');
    await page.goto(link);
    await expect(page.locator('#x-days')).toHaveValue('29');
    await expect(page.locator('#x-date')).toHaveText('2026-11-03');
  }
});

for (const failure of ['denied', 'unavailable']) {
  test(`sky sharing exposes a usable link when the clipboard is ${failure}`, async ({ page }) => {
    await page.clock.setFixedTime(today);
    await page.setViewportSize({ width: 320, height: 720 });
    await page.addInitScript(mode => Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: mode === 'unavailable' ? undefined : { writeText: async () => { throw new DOMException('Denied', 'NotAllowedError'); } },
    }), failure);
    await page.goto('/sky/#ra=84&dec=0&fov=90&d=30');
    await page.getByRole('button', { name: 'Copy link', exact: true }).click();
    await expect(page.locator('#x-status')).toContainText('/sky/#ra=84.00&dec=0.00&fov=90&date=2026-11-03');
    await expect(page.locator('#x-share')).toHaveText('Copy link');
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const status = await page.locator('#x-status').boundingBox();
    expect(status.x).toBeGreaterThanOrEqual(0);
    expect(status.x + status.width).toBeLessThanOrEqual(321);
  });
}

test('shared dates reject impossible calendar values and take precedence over relative days', async ({ page }) => {
  await page.clock.setFixedTime(today);
  for (const date of ['2026-02-31', '2026-13-01', 'not-a-date']) {
    await page.goto(`/sky/#d=2&date=${date}`);
    await expect(page.locator('#x-days')).toHaveValue('2');
    await expect(page.locator('#x-date')).toHaveText('2026-10-06');
  }
  for (const hash of ['date=2026-11-03&d=2', 'd=2&date=2026-11-03']) {
    await page.goto(`/sky/#${hash}`);
    await expect(page.locator('#x-days')).toHaveValue('30');
    await expect(page.locator('#x-date')).toHaveText('2026-11-03');
  }
});
