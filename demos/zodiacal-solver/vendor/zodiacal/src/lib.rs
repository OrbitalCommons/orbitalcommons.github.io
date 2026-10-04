//! Blind astrometry plate-solving library.
//!
//! Zodiacal identifies the region of sky depicted in an astronomical image
//! by matching geometric star patterns against a reference catalog,
//! returning a WCS (World Coordinate System) solution.

pub mod extraction;
pub mod fitting;
pub mod geom;
pub mod index;
pub mod kdtree;
#[cfg(not(target_arch = "wasm32"))]
pub mod pointing;
pub mod quads;
#[cfg(not(target_arch = "wasm32"))]
pub mod realtime;
#[cfg(not(target_arch = "wasm32"))]
pub mod refinement;
pub mod solver;
pub mod tweak;
pub mod verify;
