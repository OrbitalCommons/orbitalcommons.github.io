# StratumZero page assets

Development-only scripts behind `projects/stratumzero/`. Nothing here runs on the site.
They were run against the StratumZero carrier design at `00a318e` and the gumstick module
(`OrbitalCommons/gumstick`, `current-df40-connectors/`) at `264c904`, with KiCad 10.0.6.
Paths at the top of each script point at local checkouts; adjust them before rerunning.

| Step | Script | Output |
|------|--------|--------|
| Raytraced renders | `render_carrier.sh` (and the same `kicad-cli pcb render` calls on the module) | PNGs |
| Web images | `webimg.py` (Pillow): crop to content, top-view close-ups by board mm, WebP at 2–3 widths, `og.jpg` | `img/*.webp` |
| Board-face textures | `kicad-cli pcb export svg --black-and-white` per layer, `raster.cjs` (Chromium), `board_texture.py` (copper/mask/silk/ENIG colours, drilled holes as alpha) | `model/*-top.webp`, `model/*-bottom.webp` |
| 3D models | `kicad-cli pcb export glb --subst-models` (components and board body only), then `pack.mjs`: one mesh per reference designator, simplified, quantized, meshopt | `model/carrier.glb`, `model/module.glb` |
| Part catalogue | `catalog.py`: value and functional block for every part (passives join the nearest block) | `parts.js` |

The 3D model's USB-C jack is swapped for the project's simplified envelope before export:
the detailed community model has no stated licence. `three.js` r181 (MIT) is vendored in
`projects/stratumzero/vendor/` with `GLTFLoader`, `OrbitControls`, `RoomEnvironment`
and the meshopt decoder; `GLTFLoader`'s `BufferGeometryUtils` import points at the
vendored copy.
