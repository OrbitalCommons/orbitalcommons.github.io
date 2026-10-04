use std::cell::RefCell;
use wasm_bindgen::prelude::*;
use zodiacal::{
    extraction::DetectedSource,
    geom::sphere::{angular_distance, radec_to_xyz},
    index::{Index, IndexStar},
    kdtree::KdTree,
    quads::{Quad, compute_canonical_code},
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
        stars.push(IndexStar {
            catalog_id: i as u64,
            ra,
            dec,
            mag,
        });
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
        // No region or pointing hint. Browser deadlines are enforced by terminating
        // the worker, because std::time::Instant is unavailable on this target.
        let (solution, stats) = solve(&sources, &[index], (width, height), &config);
        let Some(mut solution) = solution else {
            return Ok("null".into());
        };
        let mut full = zodiacal::verify::VerifyConfig::default();
        full.log_odds_accept = f64::INFINITY;
        full.log_odds_bail = f64::NEG_INFINITY;
        // Gather all correspondences instead of stopping after the first ten.
        solution.verify_result =
            zodiacal::verify::verify_solution(&solution.wcs, &sources, index, &full);
        let mut refined = false;
        for _ in 0..3 {
            let Some(wcs) = robust_refine(
                &solution.wcs,
                &solution.verify_result.matched_pairs,
                &sources,
                index,
                config.verify.match_radius_pix * 0.5,
            ) else {
                break;
            };
            let verification = zodiacal::verify::verify_solution(&wcs, &sources, index, &full);
            if !verification.is_accepted(&config.verify) {
                break;
            }
            solution.wcs = wcs;
            solution.verify_result = verification;
            refined = true;
        }
        if !refined {
            return Ok("null".into());
        }
        let (ra, dec) = solution.wcs.field_center();
        Ok(serde_json::json!({
            "ra": ra.to_degrees().rem_euclid(360.0), "dec": dec.to_degrees(),
            "rotationDeg": rotation(&solution.wcs),
            "scaleArcsecPerPx": solution.wcs.pixel_scale() * 3600.0,
            "matched": solution.verify_result.n_matched, "candidates": stats.n_verified,
            "refined": true, "wcs": solution.wcs,
            "pairs": solution.verify_result.matched_pairs,
        })
        .to_string())
    })
}

// A TAN-to-TAN mapping is projective. Fit eight homography coefficients to
// measured/catalog correspondences, then express the recovered camera basis at
// the image centre. Pixel normalization keeps the least-squares system scaled.
fn refine(
    wcs: &zodiacal::geom::tan::TanWcs,
    pairs: &[(usize, usize)],
    sources: &[DetectedSource],
    index: &Index,
) -> Option<zodiacal::geom::tan::TanWcs> {
    use nalgebra::{DMatrix, DVector};
    use zodiacal::geom::sphere::{star_coords, xyz_to_radec};
    if pairs.len() < 4 {
        return None;
    }
    let w = wcs.image_size[0];
    let h = wcs.image_size[1];
    let reference = radec_to_xyz(wcs.crval[0], wcs.crval[1]);
    // At an exact celestial pole RA/roll and the tangent basis are degenerate.
    // The explorer stays within ±89°; fail gracefully for this singular input.
    if reference[2].abs() == 1.0 {
        return None;
    }
    let mut a = DMatrix::<f64>::zeros(2 * pairs.len(), 8);
    let mut rhs = DVector::<f64>::zeros(2 * pairs.len());
    for (i, &(fi, si)) in pairs.iter().enumerate() {
        let p = &sources[fi];
        let s = &index.stars[si];
        let (x, y) = star_coords(radec_to_xyz(s.ra, s.dec), reference)?;
        let u = (p.x - w / 2.0) / w;
        let v = (p.y - h / 2.0) / w;
        for (j, value) in [u, v, 1.0, 0.0, 0.0, 0.0, -x * u, -x * v]
            .iter()
            .enumerate()
        {
            a[(2 * i, j)] = *value;
        }
        for (j, value) in [0.0, 0.0, 0.0, u, v, 1.0, -y * u, -y * v]
            .iter()
            .enumerate()
        {
            a[(2 * i + 1, j)] = *value;
        }
        rhs[2 * i] = x;
        rhs[2 * i + 1] = y;
    }
    let q = a.svd(true, true).solve(&rhs, 1e-12).ok()?;
    let (ra, dec) = (wcs.crval[0], wcs.crval[1]);
    let east = [-ra.sin(), ra.cos(), 0.0];
    let north = [-dec.sin() * ra.cos(), -dec.sin() * ra.sin(), dec.cos()];
    let combine = |x: f64, y: f64, z: f64| {
        std::array::from_fn::<_, 3, _>(|i| east[i] * x + north[i] * y + reference[i] * z)
    };
    let center = combine(q[2], q[5], 1.0);
    let norm = center.iter().map(|x| x * x).sum::<f64>().sqrt();
    let center = center.map(|x| x / norm);
    if center[2].abs() == 1.0 {
        return None;
    }
    let (ra, dec) = xyz_to_radec(center);
    let new_east = [-ra.sin(), ra.cos(), 0.0];
    let new_north = [-dec.sin() * ra.cos(), -dec.sin() * ra.sin(), dec.cos()];
    let u = combine(q[0], q[3], q[6]);
    let v = combine(q[1], q[4], q[7]);
    let dot = |a: [f64; 3], b: [f64; 3]| a.iter().zip(b).map(|(x, y)| x * y).sum::<f64>();
    let cd = [
        [dot(u, new_east) / (w * norm), dot(v, new_east) / (w * norm)],
        [
            dot(u, new_north) / (w * norm),
            dot(v, new_north) / (w * norm),
        ],
    ];
    if !cd.iter().flatten().all(|x| x.is_finite()) {
        return None;
    }
    Some(zodiacal::geom::tan::TanWcs {
        crval: [ra, dec],
        crpix: [w / 2.0, h / 2.0],
        cd,
        image_size: [w, h],
    })
}
fn rotation(wcs: &zodiacal::geom::tan::TanWcs) -> f64 {
    let (ra, dec) = wcs.field_center();
    let v = wcs.pixel_to_xyz(wcs.image_size[0] / 2.0, wcs.image_size[1] / 2.0 - 1.0);
    let east = -ra.sin() * v[0] + ra.cos() * v[1];
    let north = -dec.sin() * ra.cos() * v[0] - dec.sin() * ra.sin() * v[1] + dec.cos() * v[2];
    (-east).atan2(north).to_degrees()
}

// Initial wide-field fits can associate a source with a nearby wrong star.
// Bounded, deterministic RANSAC rejects those correspondences before refitting.
fn robust_refine(
    wcs: &zodiacal::geom::tan::TanWcs,
    pairs: &[(usize, usize)],
    sources: &[DetectedSource],
    index: &Index,
    inlier_radius: f64,
) -> Option<zodiacal::geom::tan::TanWcs> {
    if pairs.len() < 4 {
        return None;
    }
    let mut seed = 0x9e3779b9u32;
    let mut best = Vec::new();
    let mut best_error = f64::INFINITY;
    for attempt in 0..129 {
        let sample = if attempt == 0 {
            pairs.to_vec()
        } else {
            let mut ids = Vec::new();
            while ids.len() < 4 {
                seed ^= seed << 13;
                seed ^= seed >> 17;
                seed ^= seed << 5;
                let i = seed as usize % pairs.len();
                if !ids.contains(&i) {
                    ids.push(i);
                }
            }
            ids.iter().map(|i| pairs[*i]).collect()
        };
        let Some(candidate) = refine(wcs, &sample, sources, index) else {
            continue;
        };
        let mut unique = std::collections::BTreeMap::new();
        for &(fi, si) in pairs {
            let s = &index.stars[si];
            if let Some((x, y)) = candidate.radec_to_pixel(s.ra, s.dec) {
                let p = &sources[fi];
                let d = (x - p.x).powi(2) + (y - p.y).powi(2);
                if d < inlier_radius * inlier_radius {
                    let best = unique.entry(si).or_insert((fi, d));
                    if d < best.1 {
                        *best = (fi, d);
                    }
                }
            }
        }
        let error: f64 = unique.values().map(|(_, distance)| distance).sum();
        let inliers: Vec<_> = unique.into_iter().map(|(si, (fi, _))| (fi, si)).collect();
        if inliers.len() > best.len() || (inliers.len() == best.len() && error < best_error) {
            best = inliers;
            best_error = error;
        }
        if best.len() == pairs.len() && best_error < 1e-6 {
            break;
        }
    }
    if best.len() < 6 {
        return None;
    }
    refine(wcs, &best, sources, index)
}
