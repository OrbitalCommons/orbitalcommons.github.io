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
after every request. The checked-in module caps linear memory at 128 MiB and
the adapter bounds the primary header before parsing HDUs. No user file is
uploaded or persisted. The WebAssembly is
only loaded when the visitor opens a sample or file.

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.128 --locked
cargo test --locked --manifest-path demos/fits-inspector/Cargo.toml
./demos/build_fits.sh
python3 demos/make_sample.py
```

Commit the source, Cargo.lock, generated JavaScript/WebAssembly, and sample when
updating the adapter. Keep the wasm-bindgen CLI version equal to Cargo.toml.
The memory-limit test inspects the shipped binary, so regeneration cannot
silently remove the browser memory bound.

## rizzma figures

The three gallery views are actual output from **rizzma 1.13.3**, with synthetic
input data and a shared dark palette. SVGs and PNGs are checked in so opening the
page never requires compiling Rust or fetching a plotting library. The generator
produces 700 × 400 desktop SVG/PNG files and compact 320 × 300 `*-mobile.svg`
variants with larger labels and fewer ticks. A native `<picture>` source selects
the compact figure at viewport widths up to 640px, including without JavaScript;
download links always point to the full desktop outputs.

```sh
cargo run --locked --release --manifest-path demos/plots/Cargo.toml \
  -- projects/rizzma/plots
```

## zodiacal browser solver

The homepage, sky explorer, and zodiacal project workbench share a lazy worker
running a browser compatibility port of **zodiacal 0.4.1**, followed by
site-specific least-squares refinement on the matched stars. The index and
WebAssembly are checked in; no server performs the solve. The field generator
is synthetic, and no known coordinates are sent to the matcher.

See [zodiacal-solver/README.md](zodiacal-solver/README.md) for the SDK contract,
index provenance, port changes, memory limits, and reproducible build commands.
The project workbench uses fixed field presets and repeatable noise to make
camera-roll comparisons reproducible. Its match rings refer to the exact
sorted source list passed to the SDK. Displayed engine time excludes initial
download and worker setup.

## Other illustrations

The starfield catalog explorer uses the bundled Hipparcos data in
`assets/stars.js`; see that file and the assets source notes for provenance. The
four-star zodiacal geometry slider and datastore scenarios are explanatory
JavaScript illustrations. They remain distinct from the real zodiacal workbench
and do not claim to execute the libraries.

## Checking the published code examples

`python3 demos/check_examples.py` extracts the Rust snippets from the project
pages and compiles them against the exact release versions recorded in
`demos/code-examples/Cargo.toml` and its lockfile. Generated Rust files are
ignored; edit the HTML examples directly. CI runs this check and the FITS
adapter's parsing tests, so the displayed examples stay executable.
