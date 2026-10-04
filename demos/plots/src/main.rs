//! Generate the checked-in website gallery with the published rizzma crate.
use rizzma::{
    core::{color::Rgba, rcparams::RcParams},
    pyplot as plt,
};
use std::f64::consts::TAU;

fn main() {
    let output = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "projects/rizzma/plots".into());
    std::fs::create_dir_all(&output).unwrap();
    let color = |hex| Rgba::from_hex(hex).unwrap();
    let rc = RcParams {
        figure_facecolor: color("#1a1b26"),
        axes_facecolor: color("#1a1b26"),
        axes_edgecolor: color("#565f89"),
        text_color: color("#c0caf5"),
        grid_color: color("#565f89"),
        grid_alpha: 0.25,
        axes_prop_cycle: vec![color("#7dcfff"), color("#bb9af7"), color("#e0af68")],
        axes_grid: true,
        lines_linewidth: 2.0,
        font_size: 11.0,
        ..RcParams::default()
    };
    for kind in ["signal", "sources", "sensor"] {
        plt::style(rc.clone());
        plt::figure_sized(7.0, 4.0);
        match kind {
            "signal" => {
                let t: Vec<f64> = (0..400).map(|i| i as f64 / 40.0).collect();
                let y: Vec<f64> = t
                    .iter()
                    .map(|x| (-x / 4.0).exp() * (TAU * x / 2.0).sin())
                    .collect();
                plt::plot(&t, &y);
                plt::title("A fading signal");
                plt::xlabel("Time (s)");
                plt::ylabel("Amplitude");
            }
            "sources" => {
                let t: Vec<f64> = (0..180).map(|i| i as f64 * 2.399963229728653).collect();
                let x: Vec<f64> = t
                    .iter()
                    .enumerate()
                    .map(|(i, a)| (i as f64).sqrt() * a.cos())
                    .collect();
                let y: Vec<f64> = t
                    .iter()
                    .enumerate()
                    .map(|(i, a)| (i as f64).sqrt() * a.sin())
                    .collect();
                plt::scatter(&x, &y);
                plt::title("A field of points");
                plt::xlabel("x");
                plt::ylabel("y");
            }
            _ => {
                let n = 64;
                let data: Vec<f64> = (0..n * n)
                    .map(|i| {
                        let x = (i % n) as f64 - 31.5;
                        let y = (i / n) as f64 - 31.5;
                        (-(x * x + y * y) / 120.0).exp()
                            + 0.35 * (-((x - 16.0).powi(2) + (y + 13.0).powi(2)) / 25.0).exp()
                    })
                    .collect();
                plt::imshow(&data, n, n);
                plt::title("A synthetic sensor frame");
                plt::xlabel("Pixel x");
                plt::ylabel("Pixel y");
            }
        }
        plt::savefig(format!("{output}/{kind}.svg")).unwrap();
        plt::savefig(format!("{output}/{kind}.png")).unwrap();
        plt::close();
    }
}
