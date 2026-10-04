const { test, expect } = require("@playwright/test");
test("zodiacal loads only on demand and solves locally in a worker", async ({
  page,
}) => {
  const requests = [];
  page.on("request", (r) =>
    requests.push({ url: r.url(), method: r.method() }),
  );
  await page.goto("/sky/");
  await page.addScriptTag({ url: "/projects/zodiacal/solver.js" });
  expect(
    requests.some((r) => /bright-quads|zodiacal_browser_bg/.test(r.url)),
  ).toBe(false);
  const result = await page.evaluate(async () => {
    const sources = OCSky.tanField(83.8, -2, 20, 1024, 768, 6.3);
    return OCZodiacal.solve(sources, 1024, 768);
  });
  expect(result.refined).toBe(true);
  expect(result.ra).toBeCloseTo(83.8, 5);
  expect(result.dec).toBeCloseTo(-2, 5);
  expect(result.matched).toBeGreaterThan(90);
  expect(result.sourcesUsed).toBe(107);
  expect(requests.filter((r) => r.method === "POST")).toEqual([]);
  expect(
    requests.filter((r) => r.url.endsWith("bright-quads.bin")),
  ).toHaveLength(1);
  const again = await page.evaluate(() =>
    OCZodiacal.solve(OCSky.tanField(10, 58, 20, 1024, 768, 6.3), 1024, 768),
  );
  expect(again.ra).toBeCloseTo(10, 5);
  expect(
    requests.filter((r) => r.url.endsWith("bright-quads.bin")),
  ).toHaveLength(1);
});
test("zodiacal recovers from a failed index download", async ({ page }) => {
  await page.route("**/bright-quads.bin", (route) => route.abort());
  await page.goto("/sky/");
  await page.addScriptTag({ url: "/projects/zodiacal/solver.js" });
  const failed = await page.evaluate(() =>
    OCZodiacal.load().then(
      () => false,
      () => true,
    ),
  );
  expect(failed).toBe(true);
  await page.unroute("**/bright-quads.bin");
  const result = await page.evaluate(() =>
    OCZodiacal.solve(OCSky.tanField(83.8, -2, 20, 1024, 768, 6.3), 1024, 768),
  );
  expect(result.matched).toBeGreaterThan(90);
});
test("zodiacal handles sparse and invalid measurements without loading the engine", async ({
  page,
}) => {
  const loads = [];
  page.on("request", (r) => {
    if (/bright-quads|zodiacal_browser_bg/.test(r.url())) loads.push(r.url());
  });
  await page.goto("/sky/");
  await page.addScriptTag({ url: "/projects/zodiacal/solver.js" });
  const result = await page.evaluate(async () => {
    const sparse = await OCZodiacal.solve([{ x: 1, y: 1, flux: 1 }], 1024, 768);
    const bad = await OCZodiacal.solve(
      [{ x: NaN, y: 1, flux: 1 }],
      1024,
      768,
    ).then(
      () => "",
      (e) => e.message,
    );
    return { sparse, bad };
  });
  expect(result.sparse).toBeNull();
  expect(result.bad).toContain("finite");
  expect(loads).toEqual([]);
});
