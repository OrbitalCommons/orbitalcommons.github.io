#!/usr/bin/env bash
# Regenerate the checked-in FITS parser. No build runs during Pages deployment.
set -euo pipefail
site_root=$(cd "$(dirname "$0")/.." && pwd)
cd "$site_root"
if [[ $(wasm-bindgen --version) != 'wasm-bindgen 0.2.128' ]]; then
  echo 'Install wasm-bindgen-cli 0.2.128 to match the locked Rust dependency.' >&2
  exit 1
fi
cargo rustc --locked --release --target wasm32-unknown-unknown \
  --manifest-path demos/fits-inspector/Cargo.toml --lib -- \
  -C link-arg=--max-memory=134217728
wasm-bindgen --target web --no-typescript --out-name fits_inspector \
  --out-dir projects/fitsio-pure/wasm \
  demos/fits-inspector/target/wasm32-unknown-unknown/release/orbitalcommons_fits_inspector.wasm
