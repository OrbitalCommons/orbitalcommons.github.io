const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const context = { window: {} };
for (const file of ["stars.js", "sky-core.js"])
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "assets", file), "utf8"),
    context,
  );
const sky = context.window.OCSky;
let solver, reference;
const wasmDir = process.env.ZODIACAL_WASM_DIR || path.join(root, "projects/zodiacal/wasm");
const index = fs.readFileSync(
  path.join(root, "projects/zodiacal/bright-quads.bin"),
);
test.before(async () => {
  const code = fs.readFileSync(
    path.join(wasmDir, "zodiacal_browser.js"),
  );
  solver = await import(
    `data:text/javascript;base64,${code.toString("base64")}`
  );
  await solver.default({
    module_or_path: fs.readFileSync(
      path.join(wasmDir, "zodiacal_browser_bg.wasm"),
    ),
  });
  // Optional migration check against a previously shipped build, using identical
  // sources and index. The old binary stays outside the site repository.
  if (process.env.ZODIACAL_REFERENCE_DIR) {
    const folder = process.env.ZODIACAL_REFERENCE_DIR;
    const code = fs.readFileSync(path.join(folder, "zodiacal_browser.js"));
    reference = await import(
      `data:text/javascript;base64,${code.toString("base64")}#reference`
    );
    await reference.default({
      module_or_path: fs.readFileSync(path.join(folder, "zodiacal_browser_bg.wasm")),
    });
    reference.load_index(index);
  }
  const info = JSON.parse(solver.load_index(index));
  assert.equal(info.stars, 7038);
  assert.equal(info.quads, 79077);
});
function errorArcsec(ra, dec, result) {
  const a = sky.radec(ra, dec),
    b = sky.radec(result.ra, result.dec);
  const cross = [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  return (
    ((Math.atan2(
      Math.hypot(...cross),
      a.reduce((sum, v, i) => sum + v * b[i], 0),
    ) *
      180) /
      Math.PI) *
    3600
  );
}
function run(sources) {
  // Deliberately remove catalog IDs and truth coordinates at the adapter boundary.
  const input = JSON.stringify(sources.map(({ x, y, flux }) => ({ x, y, flux })));
  const result = JSON.parse(solver.solve_sources(input, 1024, 768));
  if (reference) {
    // Match metadata is additive; compare the astrometric output independently.
    const astrometry = value => {
      if (!value) return value;
      const { match, ...rest } = value;
      return rest;
    };
    assert.deepEqual(astrometry(result), astrometry(JSON.parse(reference.solve_sources(input, 1024, 768))),
      "solver output differs from the reference build");
  }
  return result;
}
test("visual replay reports the actual canonical matched quad and real index rows", () => {
  const sources = sky.tanField(83.8, -2, 20, 1024, 768, 6.3).slice(0, 200);
  const result = run(sources), match = result.match;
  const ns = index.readUInt32LE(8), start = 16 + ns * 20;
  assert.equal(match.pixels.length, 4);
  assert.equal(new Set(match.fieldIndices).size, 4);
  assert.equal(new Set(match.indexIndices).size, 4);
  match.fieldIndices.forEach((id, i) => {
    assert.ok(Math.hypot(match.pixels[i].x - sources[id].x, match.pixels[i].y - sources[id].y) < 1e-10);
    const offset = 16 + match.indexIndices[i] * 20;
    assert.ok(Math.abs(match.stars[i].ra - index.readDoubleLE(offset) * 180 / Math.PI) < 1e-10);
    assert.ok(Math.abs(match.stars[i].dec - index.readDoubleLE(offset + 8) * 180 / Math.PI) < 1e-10);
  });
  assert.ok(match.rows.length >= 8 && match.rows.length <= 16);
  const winners = match.rows.filter(row => row.matched);
  assert.equal(winners.length, 1);
  assert.deepEqual(winners[0].code, match.code);
  assert.equal(winners[0].abArcsec, match.abArcsec);
  for (const row of match.rows) {
    const ids = Array.from({ length: 4 }, (_, i) => index.readUInt16LE(start + row.id * 8 + i * 2));
    assert.ok(ids.some(id => Math.abs(index.readDoubleLE(16 + id * 20) * 180 / Math.PI - row.raDeg) < 1e-10));
    assert.ok(row.abArcsec > 0 && row.abArcsec < 180 * 3600);
    assert.ok(row.code.every(Number.isFinite));
    assert.ok(row.code[0] <= row.code[2] + 1e-12);
    assert.ok(row.code[0] + row.code[2] <= 1 + 1e-12);
    if (row.matched) assert.deepEqual(ids.sort((a,b) => a-b), [...match.indexIndices].sort((a,b) => a-b));
  }
});
test("the shipped solver recovers independent clean TAN fields across the sky", () => {
  let solved = 0,
    attempts = 0;
  for (let i = 0; i < 120; i++)
    for (const fov of [15, 20, 30, 40]) {
      const ra = (i * 137.507764) % 360,
        dec = (Math.asin(1 - (2 * (i + 0.5)) / 120) * 180) / Math.PI;
      const sources = sky.tanField(ra, dec, fov, 1024, 768, 6.3).slice(0, 200);
      attempts++;
      const result = run(sources);
      if (!result) continue;
      solved++;
      assert.equal(result.refined, true);
      assert.ok(result.matched >= 10);
      assert.ok(
        errorArcsec(ra, dec, result) < 0.1,
        `incorrect centre for ${ra},${dec},${fov}`,
      );
      assert.ok(Math.abs(result.rotationDeg) < 0.01);
    }
  assert.equal(attempts, 480);
  assert.ok(solved >= 475, `only ${solved}/480 fields solved`);
});
test("the solver tolerates seeded noise, dropouts, false sources and detector rotation", () => {
  let seed = 891237;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed + 0.5) / 4294967296;
  };
  const gauss = () =>
    Math.sqrt(-2 * Math.log(random())) * Math.cos(2 * Math.PI * random());
  let solved = 0;
  for (let i = 0; i < 120; i++) {
    const ra = (i * 137.507764) % 360,
      dec = (Math.asin(1 - (2 * (i + 0.5)) / 120) * 180) / Math.PI,
      fov = [15, 20, 30, 40][i % 4];
    const angle = (((i % 5) - 2) * 13 * Math.PI) / 180;
    let sources = sky
      .tanField(ra, dec, fov, 1024, 768, 6.3)
      .filter(() => random() > 0.08)
      .map((s) => {
        const x = s.x - 512,
          y = s.y - 384;
        return {
          x: 512 + x * Math.cos(angle) - y * Math.sin(angle) + gauss() * 0.6,
          y: 384 + x * Math.sin(angle) + y * Math.cos(angle) + gauss() * 0.6,
          flux: s.flux * (1 + 0.05 * gauss()),
        };
      })
      .filter((s) => s.x >= 0 && s.x <= 1024 && s.y >= 0 && s.y <= 768);
    for (let j = 0; j < 3; j++)
      sources.push({
        x: random() * 1024,
        y: random() * 768,
        flux: Math.pow(10, -0.4 * (5 + random())),
      });
    sources.sort((a, b) => b.flux - a.flux);
    const result = run(sources.slice(0, 200));
    if (!result) continue;
    solved++;
    assert.ok(
      errorArcsec(ra, dec, result) < 60,
      `noisy centre error at ${ra},${dec}`,
    );
    // Rotating measured pixels clockwise is an equal opposite rotation of the camera axes.
    assert.ok(Math.abs(result.rotationDeg + (angle * 180) / Math.PI) < 1);
  }
  assert.ok(solved >= 114, `only ${solved}/120 noisy fields solved`);
});
test("malformed source and index inputs fail without preventing a later solve", () => {
  assert.throws(() => solver.solve_sources("[]", 1024, 768), /10 to 256/);
  assert.throws(
    () => solver.solve_sources("not JSON", 1024, 768),
    /source list/,
  );
  assert.throws(() => solver.solve_sources("[]", Infinity, 768), /image size/);
  assert.throws(
    () => solver.load_index(new Uint8Array(20)),
    /Invalid demo index/,
  );
  const result = run(sky.tanField(83.8, -2, 20, 1024, 768, 6.3));
  assert.ok(errorArcsec(83.8, -2, result) < 0.1);
});
