//! Generate the checked-in website gallery with the published rizzma crate.
use rizzma::{
    Figure,
    core::{color::Rgba, rcparams::RcParams},
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
        for mobile in [false, true] {
            let mut compact = rc.clone();
            if mobile {
                compact.font_size = 15.0;
                compact.axes_titlesize = 16.0;
                compact.axes_labelsize = 15.0;
                compact.xtick_labelsize = 14.0;
                compact.ytick_labelsize = 14.0;
            }
            let (width, height) = if mobile { (3.2, 3.0) } else { (7.0, 4.0) };
            let mut fig = Figure::new(width, height).with_rcparams(compact);
            let ax = if mobile {
                fig.add_subplot(1, 1, 1)
            } else {
                fig.add_axes(0.125, 0.11, 0.775, 0.79)
            };
            match kind {
                "signal" => {
                    let t: Vec<f64> = (0..400).map(|i| i as f64 / 40.0).collect();
                    let y: Vec<f64> = t
                        .iter()
                        .map(|x| (-x / 4.0).exp() * (TAU * x / 2.0).sin())
                        .collect();
                    ax.plot(&t, &y);
                    ax.set_title("A fading signal");
                    ax.set_xlabel("Time (s)");
                    ax.set_ylabel("Amplitude");
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
                    ax.scatter(&x, &y);
                    ax.set_title("A field of points");
                    ax.set_xlabel("x");
                    ax.set_ylabel("y");
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
                    ax.imshow(&data, n, n);
                    ax.set_title("A synthetic sensor frame");
                    ax.set_xlabel("Pixel x");
                    ax.set_ylabel("Pixel y");
                }
            }
            if mobile {
                match kind {
                    "signal" => {
                        ax.set_xticks(&[0.0, 5.0, 10.0]);
                        ax.set_yticks(&[-0.5, 0.0, 0.5]);
                    }
                    "sources" => {
                        ax.set_xticks(&[-10.0, 0.0, 10.0]);
                        ax.set_yticks(&[-10.0, 0.0, 10.0]);
                    }
                    _ => {
                        ax.set_xticks(&[0.0, 30.0, 60.0]);
                        ax.set_yticks(&[0.0, 30.0, 60.0]);
                    }
                }
            }
            let suffix = if mobile { "-mobile" } else { "" };
            fig.save_svg(format!("{output}/{kind}{suffix}.svg"))
                .unwrap();
            if !mobile {
                fig.save_png(format!("{output}/{kind}.png")).unwrap();
            }
        }
    }
}
