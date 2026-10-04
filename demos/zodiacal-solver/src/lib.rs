use std::cell::RefCell;
use wasm_bindgen::prelude::*;
use zodiacal::{
    extraction::DetectedSource,
    geom::sphere::{angular_distance, radec_to_xyz},
    index::{Index, IndexStar},
    kdtree::KdTree,
    quads::{Quad, compute_canonical_code, compute_code},
    solver::{SolverConfig, solve},
};
thread_local! { static INDEX: RefCell<Option<Index>> = const { RefCell::new(None) }; }
fn error(s: &str) -> JsValue {
    JsValue::from_str(s)
}
#[wasm_bindgen]
pub fn load_index(bytes: &[u8]) -> Result<String, JsValue> {
    if bytes.len() < 16 || &bytes[..8] != b"OCZI0001" {
        return Err(error("Invalid demo index"));
    }
    let ns = u32::from_le_bytes(bytes[8..12].try_into().unwrap()) as usize;
    let nq = u32::from_le_bytes(bytes[12..16].try_into().unwrap()) as usize;
    if ns > 10000 || nq > 400000 || bytes.len() != 16 + ns * 20 + nq * 8 {
        return Err(error("Index size limit"));
    }
    let mut pos = 16;
    let mut stars = Vec::with_capacity(ns);
    let mut xyz = Vec::with_capacity(ns);
    for i in 0..ns {
        let ra = f64::from_le_bytes(bytes[pos..pos + 8].try_into().unwrap());
        let dec = f64::from_le_bytes(bytes[pos + 8..pos + 16].try_into().unwrap());
        let mag = f32::from_le_bytes(bytes[pos + 16..pos + 20].try_into().unwrap()) as f64;
        pos += 20;
        if !ra.is_finite() || !dec.is_finite() || !mag.is_finite() {
            return Err(error("Nonfinite index coordinate"));
        }
        xyz.push(radec_to_xyz(ra, dec));
        stars.push(IndexStar::without_pm(i as u64, ra, dec, mag));
    }
    let mut quads = Vec::with_capacity(nq);
    let mut codes = Vec::with_capacity(nq);
    for _ in 0..nq {
        let mut ids = [0usize; 4];
        for id in &mut ids {
            *id = u16::from_le_bytes(bytes[pos..pos + 2].try_into().unwrap()) as usize;
            pos += 2;
            if *id >= ns {
                return Err(error("Invalid star index"));
            }
        }
        let mut pair = (0, 1);
        let mut best = 0.0;
        for i in 0..4 {
            for j in i + 1..4 {
                let d = angular_distance(xyz[ids[i]], xyz[ids[j]]);
                if d > best {
                    best = d;
                    pair = (i, j);
                }
            }
        }
        if best < 1e-8 {
            continue;
        }
        let rest: Vec<_> = (0..4).filter(|i| *i != pair.0 && *i != pair.1).collect();
        let order = [ids[pair.0], ids[pair.1], ids[rest[0]], ids[rest[1]]];
        let coords = order.map(|i| xyz[i]);
        let (code, star_ids, _) = compute_canonical_code(&coords, order);
        if code.iter().all(|c| c.is_finite()) {
            codes.push(code);
            quads.push(Quad { star_ids });
        }
    }
    let n = quads.len();
    let idx = Index {
        star_tree: KdTree::build(xyz, (0..ns).collect()),
        stars,
        code_tree: KdTree::build(codes, (0..n).collect()),
        quads,
        scale_lower: 0.0,
        scale_upper: std::f64::consts::PI,
        metadata: None,
    };
    INDEX.with(|v| *v.borrow_mut() = Some(idx));
    Ok(serde_json::json!({"stars":ns,"quads":n}).to_string())
}
#[wasm_bindgen]
pub fn solve_sources(json: &str, width: f64, height: f64) -> Result<String, JsValue> {
    if json.len() > 65536
        || !width.is_finite()
        || !height.is_finite()
        || width < 32.0
        || height < 32.0
        || width > 4096.0
        || height > 4096.0
    {
        return Err(error("Invalid image size"));
    }
    let sources: Vec<DetectedSource> =
        serde_json::from_str(json).map_err(|_| error("Invalid source list"))?;
    if sources.len() < 10 || sources.len() > 256 {
        return Err(error("Supply 10 to 256 sources"));
    }
    if sources.iter().any(|s| {
        !s.x.is_finite()
            || !s.y.is_finite()
            || !s.flux.is_finite()
            || s.x < 0.0
            || s.y < 0.0
            || s.x > width
            || s.y > height
            || s.flux <= 0.0
    }) {
        return Err(error("Invalid source position"));
    }
    INDEX.with(|value| {
        let borrowed = value.borrow();
        let index = borrowed.as_ref().ok_or_else(|| error("Index not loaded"))?;
        let mut config = SolverConfig::default();
        config.max_field_stars = 24;
        config.code_tolerance = 0.0004;
        // No region or pointing hint. The host enforces a hard deadline by
        // terminating the worker; no cooperative solver timeout is set here.
        let (solution, stats) = solve(&sources, &[index], (width, height), &config);
        let Some(mut solution) = solution else {
            return Ok("null".into());
        };
        let refined = zodiacal::refit::refine_solution(
            &mut solution,
            &sources,
            index,
            &config.verify,
            &zodiacal::refit::RefitConfig::default(),
            None,
        );
        if !refined {
            return Ok("null".into());
        }
        let (ra, dec) = solution.wcs.field_center();
        // Expose the actual winning correspondence for the visual replay. These
        // neighbouring index records are not a chronological KD-tree search trace.
        let matched_quad = &solution.quad_match;
        let quad_id = index
            .quads
            .iter()
            .position(|q| q.star_ids == matched_quad.index_indices)
            .expect("Solver match belongs to the loaded index");
        let quad_code = |ids: [usize; 4]| {
            compute_code(&ids.map(|i| radec_to_xyz(index.stars[i].ra, index.stars[i].dec)))
        };
        let ab_arcsec = |ids: [usize; 4]| {
            angular_distance(
                radec_to_xyz(index.stars[ids[0]].ra, index.stars[ids[0]].dec),
                radec_to_xyz(index.stars[ids[1]].ra, index.stars[ids[1]].dec),
            ).to_degrees() * 3600.0
        };
        let rows: Vec<_> = (quad_id.saturating_sub(8)..(quad_id + 8).min(index.quads.len()))
            .map(|id| {
                let ids = index.quads[id].star_ids;
                let anchor = &index.stars[ids[0]];
                serde_json::json!({
                    "id": id, "code": quad_code(ids), "matched": id == quad_id,
                    "raDeg": anchor.ra.to_degrees(), "decDeg": anchor.dec.to_degrees(),
                    "abArcsec": ab_arcsec(ids),
                })
            })
            .collect();
        let pixels = matched_quad.field_indices.map(|i| {
            serde_json::json!({"x": sources[i].x, "y": sources[i].y})
        });
        let stars = matched_quad.index_indices.map(|i| {
            serde_json::json!({"ra": index.stars[i].ra.to_degrees(), "dec": index.stars[i].dec.to_degrees()})
        });
        Ok(serde_json::json!({
            "ra": ra.to_degrees().rem_euclid(360.0), "dec": dec.to_degrees(),
            "rotationDeg": rotation(&solution.wcs),
            "scaleArcsecPerPx": solution.wcs.pixel_scale() * 3600.0,
            "matched": solution.verify_result.n_matched, "candidates": stats.n_verified,
            "refined": true, "wcs": solution.wcs,
            "pairs": solution.verify_result.matched_pairs,
            "match": {
                "fieldIndices": matched_quad.field_indices,
                "indexIndices": matched_quad.index_indices,
                "pixels": pixels, "stars": stars,
                "code": quad_code(matched_quad.index_indices), "rows": rows,
                "abArcsec": ab_arcsec(matched_quad.index_indices),
            },
        })
        .to_string())
    })
}

fn rotation(wcs: &zodiacal::geom::tan::TanWcs) -> f64 {
    let (ra, dec) = wcs.field_center();
    let v = wcs.pixel_to_xyz(wcs.image_size[0] / 2.0, wcs.image_size[1] / 2.0 - 1.0);
    let east = -ra.sin() * v[0] + ra.cos() * v[1];
    let north = -dec.sin() * ra.cos() * v[0] - dec.sin() * ra.sin() * v[1] + dec.cos() * v[2];
    (-east).atan2(north).to_degrees()
}
