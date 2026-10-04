const { test, expect } = require("@playwright/test");
const fs = require("node:fs");

// These tests check visitor outcomes, including errors and keyboard interaction.
test("FITS workbench parses a sample without uploading it", async ({
  page,
}) => {
  const posts = [];
  page.on("request", (req) => {
    if (req.method() !== "GET") posts.push(req.url());
  });
  await page.goto("/projects/fitsio-pure/");
  const before = await page.evaluate(() =>
    performance.getEntriesByType("resource").map((r) => r.name),
  );
  expect(before.some((url) => url.endsWith(".wasm"))).toBe(false);
  await page.getByRole("button", { name: "Open sample star field" }).click();
  await expect(page.locator("#fits-status")).toContainText(
    "1 HDU · parsed locally",
  );
  await expect(page.locator("#fits-stats")).toContainText("256 × 256");
  await expect(page.locator("#fits-stats")).toContainText("BITPIX 16");
  await page.getByText("Explore header cards").click();
  await expect(page.locator("#fits-cards")).toContainText(
    "Synthetic star field",
  );
  await page.locator("#stretch").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#stretch-value")).toHaveText("0.45");
  const visiblePixels = await page
    .locator("#fits-canvas")
    .evaluate((canvas) => {
      const values = canvas
        .getContext("2d")
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let min = 255,
        max = 0;
      for (let i = 0; i < values.length; i += 4) {
        min = Math.min(min, values[i]);
        max = Math.max(max, values[i]);
      }
      return max - min;
    });
  expect(visiblePixels).toBeGreaterThan(200);
  expect(posts).toEqual([]);
});

test("FITS workbench recovers after a malformed local file", async ({
  page,
}) => {
  await page.goto("/projects/fitsio-pure/");
  await page
    .locator("#fits-file")
    .setInputFiles({
      name: "<bad>.fits",
      mimeType: "application/fits",
      buffer: Buffer.from("not a FITS file"),
    });
  await expect(page.locator("#fits-status")).toContainText(
    "Choose an uncompressed FITS file",
  );
  await expect(page.locator("#fits-output")).toBeHidden();
  await expect(page.locator("#fits-sample")).toBeEnabled();
  await page
    .locator("#fits-file")
    .setInputFiles({
      name: "local.fits",
      mimeType: "application/fits",
      buffer: fs.readFileSync("projects/fitsio-pure/sample.fits"),
    });
  await expect(page.locator("#fits-status")).toContainText(
    "local.fits · 1 HDU",
  );
  await expect(page.locator("#fits-output")).toBeVisible();
});

test("FITS workbench rejects oversized files before loading the parser", async ({
  page,
}) => {
  await page.goto("/projects/fitsio-pure/");
  await page
    .locator("#fits-file")
    .setInputFiles({
      name: "too-big.fits",
      mimeType: "application/fits",
      buffer: Buffer.alloc(16 * 1024 * 1024 + 1),
    });
  await expect(page.locator("#fits-status")).toContainText("up to 16 MiB");
  const resources = await page.evaluate(() =>
    performance.getEntriesByType("resource").map((r) => r.name),
  );
  expect(resources.some((url) => url.endsWith(".wasm"))).toBe(false);
});

test("catalog filtering responds to keyboard input and reports counts", async ({
  page,
}) => {
  await page.goto("/projects/starfield/");
  await expect(page.locator("#catalog-status")).toContainText("catalog stars");
  const initial = await page.locator("#catalog-status").textContent();
  await page.locator("#magnitude").focus();
  await page.keyboard.press("End");
  await expect(page.locator("#magnitude-value")).toHaveText("6.0");
  await expect(page.locator("#catalog-status")).not.toHaveText(initial);
  await expect(page.locator("#catalog-status")).toContainText("magnitude 6.0");
  await page.getByLabel("Constellation guides").uncheck();
  await expect(page.getByLabel("Constellation guides")).not.toBeChecked();
});

test("quad illustration transforms and resets", async ({ page }) => {
  await page.goto("/projects/zodiacal/");
  await page.locator("#quad-rotation").focus();
  await page.keyboard.press("Home");
  await expect(page.locator("#quad-angle")).toHaveText("-180°");
  await expect(page.locator("#quad-transformed")).toHaveAttribute(
    "transform",
    /rotate\(-180\)/,
  );
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.locator("#quad-angle")).toHaveText("25°");
  await expect(page.locator("#quad-size")).toHaveText("0.80×");
});

test("cache scenarios explain offline and upstream behavior", async ({
  page,
}) => {
  await page.goto("/projects/starfield-datastore/");
  await page.getByRole("button", { name: "Offline miss" }).click();
  await expect(page.locator("#cache-status")).toContainText(
    "No network requests are made",
  );
  await expect(page.locator("#cache-mirror")).toContainText("Offline");
  await page.getByRole("button", { name: "Allow upstream" }).click();
  await expect(page.locator("#cache-upstream")).toContainText(
    "Explicitly allowed",
  );
  await expect(page.locator("#cache-status")).toContainText(
    "do not write to the mirror",
  );
});

test("plot selection updates the figure and downloadable outputs", async ({
  page,
}) => {
  await page.goto("/projects/rizzma/");
  await page.getByRole("button", { name: "Scatter", exact: true }).click();
  await expect(page.locator("#plot-image")).toHaveAttribute(
    "src",
    "plots/sources.svg",
  );
  await expect(page.locator("#plot-svg")).toHaveAttribute(
    "href",
    "plots/sources.svg",
  );
  await expect(page.locator("#plot-png")).toHaveAttribute(
    "href",
    "plots/sources.png",
  );
  await expect(
    page.getByRole("button", { name: "Scatter", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Line", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#plot-image")).toHaveJSProperty("complete", true);
});

test("project content remains navigable without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4173/projects/fitsio-pure/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "fitsio-pure",
  );
  await expect(
    page.getByRole("link", { name: "Start building" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download the synthetic sample" }),
  ).toHaveAttribute("href", "sample.fits");
  await expect(page.locator("#fits-sample")).toBeHidden();
  await context.close();
});

test("FITS workbench rejects an unbounded primary-axis count and recovers", async ({
  page,
}) => {
  await page.goto("/projects/fitsio-pure/");
  const bytes = Buffer.from(
    fs.readFileSync("projects/fitsio-pure/sample.fits"),
  );
  bytes.write(
    "NAXIS   =  9223372036854775807".padEnd(80, " "),
    160,
    80,
    "ascii",
  );
  await page
    .locator("#fits-file")
    .setInputFiles({
      name: "invalid-axes.fits",
      mimeType: "application/fits",
      buffer: bytes,
    });
  await expect(page.locator("#fits-status")).toContainText(
    "NAXIS value must be an integer",
  );
  await page.getByRole("button", { name: "Open sample star field" }).click();
  await expect(page.locator("#fits-status")).toContainText("parsed locally");
});

for (const project of ["starfield", "zodiacal"]) {
  test(`${project} header renders real sky art with a no-script fallback`, async ({
    page,
    browser,
  }) => {
    const loads = [];
    page.on("request", (request) => {
      if (request.url().endsWith("/assets/stars.js")) loads.push(request.url());
    });
    await page.goto(`/projects/${project}/`);
    await expect(page.locator("canvas.sky-art")).toBeVisible();
    await expect(page.locator(".sky-art-fallback")).toBeHidden();
    if (project === "starfield")
      await expect(page.locator("#catalog-status")).toContainText(
        "catalog stars",
      );
    expect(loads).toHaveLength(1);
    const context = await browser.newContext({ javaScriptEnabled: false });
    const fallback = await context.newPage();
    await fallback.goto(`http://127.0.0.1:4173/projects/${project}/`);
    await expect(fallback.locator(".sky-art-fallback")).toBeVisible();
    await expect(fallback.locator("canvas.sky-art")).toBeHidden();
    await context.close();
  });
}

test("sky artwork retains its fallback when the renderer cannot load", async ({
  page,
}) => {
  await page.route("**/assets/sky-core.js", (route) => route.abort());
  await page.goto("/projects/starfield/");
  await expect(page.locator(".sky-art-fallback")).toBeVisible();
  await expect(page.locator("canvas.sky-art")).toBeHidden();
  await expect(page.locator("#catalog-status")).toContainText("catalog stars");
});

test("code copy announces success for assistive technology", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.resolve() },
    }),
  );
  await page.goto("/projects/rizzma/");
  await page
    .getByRole("button", { name: "Copy Terminal code", exact: true })
    .click();
  await expect(page.locator(".copy-feedback")).toHaveText(
    "Code copied to the clipboard.",
  );
});

test("code copy selects the snippet when clipboard permission is denied", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: () => Promise.reject(new Error("Permission denied")),
      },
    }),
  );
  await page.goto("/projects/rizzma/");
  await page
    .getByRole("button", { name: "Copy Terminal code", exact: true })
    .click();
  await expect(page.locator(".copy-feedback")).toContainText("Code selected");
  expect(await page.evaluate(() => window.getSelection().toString())).toBe(
    "cargo add rizzma",
  );
  expect(errors).toEqual([]);
});
