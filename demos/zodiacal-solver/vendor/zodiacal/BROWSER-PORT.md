# Zodiacal 0.4.1 browser compatibility port

Source: https://crates.io/crates/zodiacal/0.4.1 (Apache-2.0; LICENSE retained).

The published package does not support wasm32 directly because its starfield
dependency includes native blocking HTTP clients. These compatibility changes
leave the matching, fitting, verification, quad coding, and KD-tree algorithms
unchanged:

- Cargo.toml: starfield is a dependency only on non-wasm32 targets.
- src/lib.rs: native pointing, realtime, and refinement modules are excluded on
  wasm32. The site implements its own bounded geometric refinement in the adapter.
- src/index/mod.rs: native index construction is excluded on wasm32.
- src/solver.rs: wasm32 uses a two-field RA/Dec carrier for the optional SkyRegion;
  the demo supplies no region or pointing hint.

The original native modules remain included for auditability. The adapter's
index reconstruction, projective refinement, resource limits, and worker API are
site-specific code, separate from the published library.
