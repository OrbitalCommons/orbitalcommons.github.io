# Browser plate-solving demonstrator

This adapter runs the unmodified published zodiacal 0.5.1 crate in WebAssembly.
It uses starfield's portable core with default features disabled; there is no
vendored solver, target-specific coordinate substitute, or Cargo patch override.

The upstream `zodiacal::refit` module performs deterministic RANSAC and a projective
least-squares refit of the accepted match's correspondences, followed by full
zodiacal verification. The adapter loads the compact demo index, validates inputs,
and translates results for the browser; it contains no separate fitting algorithm.
No true pointing, catalog IDs, or sky region is supplied with the measured sources.

## Runtime contract

Load `projects/zodiacal/solver.js` before calling `window.OCZodiacal`:

- `load()` lazily starts a module worker, loads the WASM and index, and resolves
  once the index is constructed. Loading the script alone fetches neither asset.
- `solve(sources, width, height, {timeoutMs})` accepts `{x,y,flux}` measurements.
  It drops out-of-frame/nonpositive-flux sources and uses the brightest 200.
  Nonfinite values and invalid dimensions are rejected. Fewer than ten sources
  return `null` without loading the engine.
- A successful result contains RA/Dec in degrees at the image centre, angular
  pixel scale, matched count, compute time in milliseconds, and `refined: true`.
  `rotationDeg` measures image-up toward celestial west from north; rotating the
  measured pixels clockwise rotates the inferred camera axes oppositely.
  `sourcesUsed` and `inputSources` expose truncation; `wcs` includes the fitted
  TAN parameters. `pairs` contains `[sourceIndex, catalogIndex]` matches; source
  indices refer to the filtered, brightness-sorted, capped list used by the SDK.
  `match` exposes the actual winning quad in canonical A/B/C/D order: source
  and index indices, measured `pixels`, catalog `stars` (RA/Dec in degrees),
  four-dimensional `code`, and A–B angular separation `abArcsec`. Its `rows`
  are up to 16 adjacent records in the loaded index, each with its index ID,
  anchor RA/Dec, A–B separation, code, and a `matched` flag. These are a visual
  index sample, **not a chronological search trace**; zodiacal searches a KD-tree.
  `null` means no verified, refined match was found.

The worker is terminated on timeout; a later call can initialize a new worker.
The shipped WASM has a hard 128 MiB memory ceiling. No data is uploaded.

## Index and scope

`build-index.cjs` deterministically derives a 773,392-byte index from the existing
Hipparcos catalog in `assets/stars.js` (ESA, 1997). It contains all 7,038 catalog
entries plus 79,077 unique quads sampled from the seven brightest stars in
7°, 12°, and 20° caps about 1,024 evenly distributed sphere points. Constellation
line data is not included. The generator uses no private data or network service.

The intended demo uses 15–40° synthetic TAN fields and stars through V=6.3.
This sparse bright-star index is not intended for arbitrary real telescope
images. The catalog coordinates are quantized for display. Synthetic tests share
that catalog and therefore measure algorithmic consistency, not observational
accuracy, proper motion, lens calibration, or performance on real exposures.

## Rebuild and test

Install the wasm32-unknown-unknown Rust target and wasm-bindgen-cli 0.2.128, then:

```sh
./demos/build_zodiacal.sh
node --test tests/zodiacal-wasm.test.cjs
CHROME_PATH=/path/to/chrome npx playwright test tests/zodiacal-browser.spec.cjs
```

The source index is rebuilt deterministically. Cargo.lock pins the adapter's
transitive dependencies. The tests exercise the actual shipped browser WASM,
including 480 clean all-sky fields, 120 seeded noisy/rotated fields, invalid input
recovery, lazy asset loading, and failed-download recovery. Some sparse fields
legitimately yield no match; tests require accurate accepted results and a high
success rate, rather than pretending every view must solve.

## Upgrade comparison

Before rebuilding, copy the shipped `projects/zodiacal/wasm/zodiacal_browser.js`
and `zodiacal_browser_bg.wasm` into a directory outside the repository. Compare
all 480 clean and 120 noisy/rotated cases against that reference build with:

```sh
ZODIACAL_REFERENCE_DIR=/path/to/reference node --test tests/zodiacal-wasm.test.cjs
```

This requires identical results, including accepted matches, WCS and failures.
Set `ZODIACAL_WASM_DIR` to check an experimental build without replacing the shipped
files; it must contain the same two filenames as the reference directory.
The 0.5.1 migration replaces a post-release upstream snapshot previously labeled
0.4.1, not the older crates.io 0.4.1 package. The [previous site release](https://github.com/OrbitalCommons/orbitalcommons.github.io/tree/9efb20450c7acbefd106d8bb0c12dd0513f6043a/demos/zodiacal-solver)
retains that snapshot and its compatibility changes; it is no longer a dependency.
