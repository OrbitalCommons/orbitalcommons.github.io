//! Small, bounded browser adapter around the published fitsio-pure crate.
use fitsio_pure::{
    hdu::{HduInfo, parse_fits},
    image::{ImageData, read_image_data},
    value::Value,
};
use serde::Serialize;
use wasm_bindgen::prelude::*;

const MAX_BYTES: usize = 16 * 1024 * 1024;
const MAX_PIXELS: usize = 4 * 1024 * 1024;

#[derive(Serialize)]
struct HeaderCard {
    keyword: String,
    value: String,
    comment: String,
}

#[derive(Serialize)]
struct ImagePreview {
    width: usize,
    height: usize,
    min: f64,
    max: f64,
    pixels: Vec<u8>,
}

#[derive(Serialize)]
struct Inspection {
    hdus: usize,
    kind: &'static str,
    dimensions: Vec<usize>,
    bitpix: Option<i64>,
    cards: Vec<HeaderCard>,
    preview: Option<ImagePreview>,
    note: &'static str,
}

fn describe_value(value: &Value) -> String {
    match value {
        Value::Integer(v) => v.to_string(),
        Value::Float(v) => v.to_string(),
        Value::Logical(v) => if *v { "T" } else { "F" }.to_owned(),
        Value::String(v) => v.clone(),
        Value::ComplexInt(re, im) => format!("({re}, {im})"),
        Value::ComplexFloat(re, im) => format!("({re}, {im})"),
    }
}

fn inspect(data: &[u8]) -> Result<Inspection, String> {
    if data.len() > MAX_BYTES {
        return Err("This demo accepts files up to 16 MiB.".into());
    }
    if !data.starts_with(b"SIMPLE  =") {
        return Err("Choose an uncompressed FITS file beginning with a SIMPLE header.".into());
    }
    let fits = parse_fits(data).map_err(|e| format!("Could not read this FITS file: {e}"))?;
    let hdu = fits.hdus.first().ok_or("The file contains no HDUs.")?;
    let (kind, dimensions, bitpix) = match &hdu.info {
        HduInfo::Primary { naxes, bitpix } => ("Primary image", naxes.clone(), Some(*bitpix)),
        HduInfo::Image { naxes, bitpix } => ("Image extension", naxes.clone(), Some(*bitpix)),
        HduInfo::RandomGroups { naxes, bitpix, .. } => {
            ("Random groups", naxes.clone(), Some(*bitpix))
        }
        _ => ("Table", vec![], None),
    };
    let cards = hdu
        .cards
        .iter()
        .filter(|c| !c.is_blank() && !c.is_end())
        .take(100)
        .map(|c| HeaderCard {
            keyword: c.keyword_str().to_owned(),
            value: c.value.as_ref().map(describe_value).unwrap_or_default(),
            comment: c.comment.clone().unwrap_or_default(),
        })
        .collect();
    let mut note = "Showing the primary HDU header. Image preview supports uncompressed, two-dimensional primary images up to 4 million pixels.";
    let mut preview = None;
    if dimensions.len() == 2 && matches!(&hdu.info, HduInfo::Primary { .. }) {
        let count = dimensions[0]
            .checked_mul(dimensions[1])
            .ok_or("Image dimensions are too large.")?;
        if count > 0 && count <= MAX_PIXELS {
            let pixels = read_image_data(data, hdu)
                .map_err(|e| format!("Could not read image pixels: {e}"))?;
            let values: Vec<f64> = match pixels {
                ImageData::U8(v) => v.into_iter().map(f64::from).collect(),
                ImageData::I16(v) => v.into_iter().map(f64::from).collect(),
                ImageData::I32(v) => v.into_iter().map(f64::from).collect(),
                ImageData::I64(v) => v.into_iter().map(|x| x as f64).collect(),
                ImageData::F32(v) => v.into_iter().map(f64::from).collect(),
                ImageData::F64(v) => v,
            };
            if values.len() != count {
                return Err("Image data does not match its dimensions.".into());
            }
            let numeric = |name: &str, default: f64| {
                hdu.cards
                    .iter()
                    .find(|c| c.keyword_str() == name)
                    .and_then(|c| c.value.as_ref())
                    .and_then(|v| match v {
                        Value::Integer(v) => Some(*v as f64),
                        Value::Float(v) => Some(*v),
                        _ => None,
                    })
                    .unwrap_or(default)
            };
            let scale = numeric("BSCALE", 1.0);
            let zero = numeric("BZERO", 0.0);
            let blank = hdu
                .cards
                .iter()
                .find(|c| c.keyword_str() == "BLANK")
                .and_then(|c| c.value.as_ref())
                .and_then(|v| match v {
                    Value::Integer(v) => Some(*v as f64),
                    _ => None,
                });
            let calibrated: Vec<f64> = values
                .into_iter()
                .map(|v| {
                    if bitpix.unwrap_or(-32) > 0 && blank == Some(v) {
                        f64::NAN
                    } else {
                        v * scale + zero
                    }
                })
                .collect();
            let min = calibrated
                .iter()
                .copied()
                .filter(|v| v.is_finite())
                .fold(f64::INFINITY, f64::min);
            let max = calibrated
                .iter()
                .copied()
                .filter(|v| v.is_finite())
                .fold(f64::NEG_INFINITY, f64::max);
            if min.is_finite() && max.is_finite() {
                let shrink = (dimensions[0].max(dimensions[1]) as f64 / 384.0).max(1.0);
                let width = (dimensions[0] as f64 / shrink).round().max(1.0) as usize;
                let height = (dimensions[1] as f64 / shrink).round().max(1.0) as usize;
                let span = max - min;
                let mut pixels = Vec::with_capacity(width * height);
                for y in 0..height {
                    for x in 0..width {
                        let sx = x * dimensions[0] / width;
                        let sy = y * dimensions[1] / height;
                        let v = calibrated[sy * dimensions[0] + sx];
                        pixels.push(if v.is_finite() && span > 0.0 {
                            (((v - min) / span).clamp(0.0, 1.0) * 255.0).round() as u8
                        } else {
                            0
                        });
                    }
                }
                preview = Some(ImagePreview {
                    width,
                    height,
                    min,
                    max,
                    pixels,
                });
                note = "Primary image, nearest-neighbor preview. BSCALE/BZERO applied; blank and nonfinite pixels are black. Display stretch changes only the preview.";
            } else {
                note = "The primary image contains no finite pixel values.";
            }
        }
    }
    Ok(Inspection {
        hdus: fits.hdus.len(),
        kind,
        dimensions,
        bitpix,
        cards,
        preview,
        note,
    })
}

#[wasm_bindgen]
pub fn inspect_fits(data: &[u8]) -> Result<String, JsValue> {
    let result = inspect(data).map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&result).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(extra: &[&str], pixels: &[i16]) -> Vec<u8> {
        let mut data = Vec::new();
        for card in [
            "SIMPLE  =                    T",
            "BITPIX  =                   16",
            "NAXIS   =                    2",
            "NAXIS1  =                    2",
            "NAXIS2  =                    2",
        ]
        .iter()
        .chain(extra.iter())
        .chain(["END"].iter())
        {
            let mut bytes = [b' '; 80];
            bytes[..card.len()].copy_from_slice(card.as_bytes());
            data.extend_from_slice(&bytes);
        }
        data.resize(2880, b' ');
        for p in pixels {
            data.extend_from_slice(&p.to_be_bytes());
        }
        data.resize(5760, 0);
        data
    }

    #[test]
    fn parses_and_calibrates_signed_pixels() {
        let file = fixture(
            &["BZERO   =                32768"],
            &[-32768, -32767, 0, 32767],
        );
        let result = inspect(&file).unwrap();
        assert_eq!(result.hdus, 1);
        assert_eq!(result.dimensions, [2, 2]);
        let preview = result.preview.unwrap();
        assert_eq!(preview.min, 0.0);
        assert_eq!(preview.max, 65535.0);
        assert_eq!(preview.pixels, [0, 0, 128, 255]);
    }

    #[test]
    fn blank_pixels_do_not_distort_the_display_range() {
        let file = fixture(
            &["BLANK   =               -32768"],
            &[-32768, 100, 150, 200],
        );
        let preview = inspect(&file).unwrap().preview.unwrap();
        assert_eq!((preview.min, preview.max), (100.0, 200.0));
        assert_eq!(preview.pixels, [0, 0, 128, 255]);
    }

    #[test]
    fn rejects_non_fits_truncated_and_oversized_files() {
        assert!(inspect(b"not a fits file").is_err());
        assert!(inspect(&fixture(&[], &[1, 2, 3, 4])[..2900]).is_ok());
        assert!(inspect(&fixture(&[], &[1, 2, 3, 4])[..2882]).is_err());
        assert!(inspect(&vec![0; MAX_BYTES + 1]).is_err());
    }
}
