const { test, expect } = require('@playwright/test');

const picture = canvas => canvas.evaluate(async c => {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(c.toDataURL()));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
});

test('live motion preferences stop the hero and preserve an explicit pause', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  const pause = page.locator('#sky-pause'), sky = page.locator('#sky');
  await expect(pause).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(pause).toBeHidden();
  const still = await picture(sky);
  await page.clock.fastForward(5000);
  expect(await picture(sky)).toBe(still);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(pause).toBeVisible();
  await expect(pause).toHaveAttribute('aria-pressed', 'false');
  await page.clock.fastForward(1000);
  await expect.poll(() => picture(sky)).not.toBe(still);
  await pause.click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(pause).toBeHidden();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(pause).toBeVisible();
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  const paused = await picture(sky);
  await page.clock.fastForward(5000);
  expect(await picture(sky)).toBe(paused);
});

test('pausing an overhead flight prevents later hover from advancing it', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await expect(page.locator('#sky-pause')).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 100));
  await page.locator('#sky-zenith').evaluate(button => button.click());
  await page.clock.runFor(250);
  await page.locator('#sky-pause').evaluate(button => button.click());
  await expect(page.locator('#sky-pause')).toHaveAttribute('aria-pressed', 'true');
  const position = await page.locator('#sky-hud').textContent();
  await page.clock.runFor(5000);
  await page.locator('#sky').dispatchEvent('pointermove', { clientX: 100, clientY: 200, pointerType: 'mouse', pointerId: 1 });
  expect(await page.locator('#sky-hud').textContent()).toBe(position);
});

test('a live reduced-motion preference completes an explorer flight without further animation', async ({ page }) => {
  await page.clock.install();
  await page.goto('/sky/#ra=84&dec=0&fov=90&d=0');
  await page.clock.pauseAt(new Date(Date.now() + 100));
  await page.locator('#x-q').fill('Sirius');
  await page.locator('#x-search').evaluate(form => form.requestSubmit());
  await page.clock.runFor(200);
  await page.evaluate(() => {
    window.motionPreferenceDelivered = false;
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => {
      window.motionPreferenceDelivered = true;
    }, { once: true });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Media events use the real browser loop, while the hash debounce uses the paused clock.
  await expect.poll(() => page.evaluate(() => window.motionPreferenceDelivered)).toBe(true);
  await page.clock.runFor(400);
  await expect(page).toHaveURL(/ra=101\.30&dec=-16\.70&fov=50/);
  const view = page.url();
  await page.clock.runFor(3000);
  expect(page.url()).toBe(view);
});

test('explorer playback ignores elapsed time across visibility transitions', async ({ page }) => {
  await page.clock.install();
  await page.goto('/sky/#ra=84&dec=0&fov=90&d=0');
  await page.clock.pauseAt(new Date(Date.now() + 100));
  await page.locator('#x-play').evaluate(button => button.click());
  await page.clock.runFor(100);
  const days = Number(await page.locator('#x-days').inputValue());
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  // Fast-forward invokes a due RAF once, simulating the first frame after a long hidden interval.
  await page.clock.fastForward(60000);
  expect(Number(await page.locator('#x-days').inputValue())).toBe(days);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.clock.runFor(100);
  expect(Number(await page.locator('#x-days').inputValue())).toBeGreaterThan(days);
  expect(Number(await page.locator('#x-days').inputValue())).toBeLessThanOrEqual(days + 3);
  await expect(page.locator('#x-play')).toHaveAttribute('aria-pressed', 'true');
});
