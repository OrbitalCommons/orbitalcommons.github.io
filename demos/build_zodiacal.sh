#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Keep the wasm-bindgen CLI aligned with Cargo.lock.
test "$(wasm-bindgen --version)" = "wasm-bindgen 0.2.128"
node demos/zodiacal-solver/build-index.cjs
RUSTFLAGS='--cfg getrandom_backend="wasm_js"' cargo rustc --locked --release --target wasm32-unknown-unknown --manifest-path demos/zodiacal-solver/Cargo.toml --lib -- -C link-arg=--max-memory=134217728
wasm-bindgen demos/zodiacal-solver/target/wasm32-unknown-unknown/release/zodiacal_browser.wasm --target web --out-dir projects/zodiacal/wasm --no-typescript
