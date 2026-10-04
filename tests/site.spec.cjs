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
  test(`${url} loads without browser errors or horizontal overflow`, async ({ page, baseURL }) => {
    const errors = [];
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
