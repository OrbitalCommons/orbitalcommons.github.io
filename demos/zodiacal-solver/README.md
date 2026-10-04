# Browser plate-solving demonstrator

This adapter runs the quad matcher, TAN fitter, and Bayesian verification from
zodiacal 0.4.1 in WebAssembly. Its local compatibility port is documented in
[vendor/zodiacal/BROWSER-PORT.md](vendor/zodiacal/BROWSER-PORT.md). The published
crate does not currently compile for wasm32 unchanged.

The adapter adds deterministic RANSAC and a projective least-squares refinement
of the accepted match's correspondences, followed by full zodiacal verification.
This is site-specific refinement, not a claim about the upstream solver's fit.
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

The source index is rebuilt deterministically. Cargo.lock pins the port's
transitive dependencies. The tests exercise the actual shipped browser WASM,
including 480 clean all-sky fields, 120 seeded noisy/rotated fields, invalid input
recovery, lazy asset loading, and failed-download recovery. Some sparse fields
legitimately yield no match; tests require accurate accepted results and a high
success rate, rather than pretending every view must solve.
