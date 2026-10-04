const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

function pagePaths(dir = '.', prefix = '/') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.name.startsWith('.') || ['node_modules', 'playwright-report', 'test-results', 'tests'].includes(entry.name)) return [];
    if (entry.isDirectory()) return pagePaths(path.join(dir, entry.name), `${prefix}${entry.name}/`);
    if (entry.name === 'index.html') return [prefix];
    if (entry.name === '404.html') return [`${prefix}404.html`];
    return [];
  });
}

for (const url of pagePaths()) {
  test(`${url} loads without external requests, browser errors, or overflow`, async ({ page, baseURL }) => {
    const errors = [];
    page.on('request', request => {
      const url = new URL(request.url());
      if (['http:', 'https:'].includes(url.protocol) && url.origin !== new URL(baseURL).origin) {
        errors.push(`External runtime request: ${url.href}`);
      }
    });
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (new URL(response.url()).origin === new URL(baseURL).origin && response.status() >= 400) {
        errors.push(`${response.status()} ${response.url()}`);
      }
    });
    await page.goto(url);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page).toHaveTitle(/OrbitalCommons/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
    expect(errors).toEqual([]);
  });
}

test('homepage stays under its advertised 100 kB compressed initial payload', async ({ page, baseURL }) => {
  const { gzipSync } = require('node:zlib');
  const bodies = new Map();
  const onResponse = response => {
    if (response.status() !== 200 || new URL(response.url()).origin !== new URL(baseURL).origin) return;
    const type = response.headers()['content-type'] || '';
    bodies.set(response.url(), response.body().then(body => ({
      url: response.url(),
      bytes: /text\/|javascript|json|svg/.test(type) ? gzipSync(body).length : body.length,
    })));
  };
  page.on('response', onResponse);
  await page.goto('/');
  await expect(page.locator('#sky-solve')).toBeVisible();
  page.off('response', onResponse);
  const assets = await Promise.all(bodies.values());
  const bytes = assets.reduce((sum, asset) => sum + asset.bytes, 0);
  expect(bytes, JSON.stringify(assets, null, 2)).toBeLessThan(100000);
});
