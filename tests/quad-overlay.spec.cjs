const { test, expect } = require('@playwright/test');

async function recordCanvas(page) {
  await page.addInitScript(() => {
    window.quadInk = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...rest) {
      if (this.canvas.id === 'sky') {
        window.quadInk.push({ text: String(text), color: this.fillStyle, x, y });
        if (window.quadInk.length > 2000) window.quadInk.splice(0, 1000);
      }
      return original.call(this, text, x, y, ...rest);
    };
  });
}

for (const width of [undefined, 320]) test(`real hero overlay uses the winning index entry and canonical role colors without motion${width ? ' at 320px' : ''}`, async ({ page }) => {
  if (width) await page.setViewportSize({ width, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await recordCanvas(page);
  await page.goto('/');
  // Installing the lazy wrapper does not load its worker/index. Capture the real
  // result so the visible/accessible index entry can be checked against it.
  await page.addScriptTag({ url: '/projects/zodiacal/solver.js' });
  await page.evaluate(() => {
    const solve = OCZodiacal.solve;
    OCZodiacal.solve = async (...args) => {
      const result = await solve(...args);
      window.actualQuad = result.match;
      return result;
    };
  });
  await page.locator('#sky-solve').click();
  const status = page.locator('#sky-status');
  await expect(status).toContainText('Matched index entry');
  await expect(status).toContainText('not the search order');
  const actual = await page.evaluate(() => window.actualQuad);
  const winner = actual.rows.find(row => row.matched);
  await expect(status).toContainText(`Matched index entry ${winner.id} `);
  const ink = await page.evaluate(() => window.quadInk);
  const canvasWidth = await page.locator('#sky').evaluate(canvas => canvas.getBoundingClientRect().width);
  const controlsTop = await page.evaluate(() => document.querySelector('.hero-foot').getBoundingClientRect().top - document.querySelector('#sky').getBoundingClientRect().top);
  for (const [role, color] of [['A','#fc6255'],['B','#83c167'],['C','#58c4dd'],['D','#ff862f']]) {
    const label = ink.findLast(item => item.text === role && item.color.toLowerCase() === color);
    expect(label).toBeTruthy();
    expect(label.x).toBeGreaterThanOrEqual(0);
    expect(label.x).toBeLessThanOrEqual(canvasWidth - 7);
    expect(label.y).toBeLessThan(controlsTop - 4);
  }
  expect(ink.some(item => item.text === 'MATCHED INDEX CODE')).toBe(true);
  expect(ink.some(item => item.text === 'INDEX SAMPLE · NOT SEARCH ORDER')).toBe(true);
  const before = await page.locator('#sky').evaluate(canvas => canvas.toDataURL());
  await page.waitForTimeout(200);
  expect(await page.locator('#sky').evaluate(canvas => canvas.toDataURL())).toBe(before);
});

test('illustrative index rows scroll without downloading the solver and stop when paused', async ({ page }) => {
  await page.clock.install();
  await recordCanvas(page);
  await page.addInitScript(() => { Math.random = () => .35; });
  await page.goto('/');
  await page.clock.fastForward(3500);
  await page.evaluate(() => { window.quadInk = []; });
  await page.clock.fastForward(4400);
  const rowCode = () => page.evaluate(() => window.quadInk.filter(item => /^[+−]\d/.test(item.text)).map(item => item.text));
  const first = await rowCode();
  expect(first.length).toBeGreaterThan(4);
  await page.evaluate(() => { window.quadInk = []; });
  await page.clock.fastForward(600);
  expect(await rowCode()).not.toEqual(first);
  expect(await page.evaluate(() => Boolean(window.OCZodiacal))).toBe(false);
  await page.evaluate(() => { window.quadInk = []; });
  await page.locator('#sky-pause').click();
  expect(await page.evaluate(() => window.quadInk.some(item => item.text === 'QUAD MATCHED'))).toBe(true);
  const paused = await page.locator('#sky').evaluate(canvas => canvas.toDataURL());
  await page.clock.fastForward(3000);
  expect(await page.locator('#sky').evaluate(canvas => canvas.toDataURL())).toBe(paused);
});
