# Reproducing the checked-in examples

These are optional development tools, not a website build. GitHub Pages serves
the checked-in HTML, CSS, JavaScript, images, and WebAssembly directly.

## FITS workbench

The worker runs **fitsio-pure 0.13.5** with a small Rust adapter. The adapter reads
headers, reports primary-image metadata, and creates a bounded preview. It
applies BSCALE/BZERO, masks integer BLANK values, and excludes nonfinite pixels
from the preview range. It does not preview extensions, compressed images, or
cubes. Header output is limited to 100 cards.

The page rejects files larger than 16 MiB before reading their bytes. Parsing
runs in a dedicated worker with a 15-second timeout; the worker is destroyed
after every request. No user file is uploaded or persisted. The WebAssembly is
only loaded when the visitor opens a sample or file.

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.128 --locked
cargo test --locked --manifest-path demos/fits-inspector/Cargo.toml
cargo build --locked --release --target wasm32-unknown-unknown \
  --manifest-path demos/fits-inspector/Cargo.toml
wasm-bindgen --target web --no-typescript --out-name fits_inspector \
  --out-dir projects/fitsio-pure/wasm \
  demos/fits-inspector/target/wasm32-unknown-unknown/release/orbitalcommons_fits_inspector.wasm
python3 demos/make_sample.py
```

Commit the source, Cargo.lock, generated JavaScript/WebAssembly, and sample when
updating the adapter. Keep the wasm-bindgen CLI version equal to Cargo.toml.

## rizzma figures

The three gallery views are actual output from **rizzma 1.13.3**, with synthetic
input data and a shared dark palette. SVGs and PNGs are checked in so opening the
page never requires compiling Rust or fetching a plotting library.

```sh
cargo run --locked --release --manifest-path demos/plots/Cargo.toml \
  -- projects/rizzma/plots
```

## Other illustrations

The starfield catalog explorer uses the bundled Hipparcos data in
`assets/stars.js`; see that file and the assets source notes for provenance. The
zodiacal geometry and datastore scenarios are explanatory JavaScript
illustrations. They do not claim to execute either Rust library.

## Checking the published code examples

`python3 demos/check_examples.py` extracts the Rust snippets from the project
pages and compiles them against the exact release versions recorded in
`demos/code-examples/Cargo.toml` and its lockfile. Generated Rust files are
ignored; edit the HTML examples directly. CI runs this check and the FITS
adapter's parsing tests, so the displayed examples stay executable.
