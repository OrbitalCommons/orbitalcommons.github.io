"""Collect original dependency license texts for the shipped wasm32 module."""
import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
metadata = json.loads(subprocess.check_output([
    "cargo", "metadata", "--locked", "--format-version", "1", "--filter-platform",
    "wasm32-unknown-unknown", "--manifest-path", str(root / "demos/zodiacal-solver/Cargo.toml"),
]))
ids = {node["id"] for node in metadata["resolve"]["nodes"]}
output = [
    "Third-party notices for the zodiacal browser demonstrator.\n"
    "The adapter is Apache-2.0; see demos/zodiacal-solver/LICENSE.\n"
    "Hipparcos star data: ESA (1997), derived from assets/stars.js.\n"
    "The solver uses the unmodified published zodiacal crate.\n"
]
for package in sorted(metadata["packages"], key=lambda p: p["name"]):
    if package["id"] not in ids:
        continue
    output.append(f"\n{'=' * 72}\n{package['name']} {package['version']} — {package.get('license', 'unspecified')}\n{package.get('repository') or ''}\n")
    folder = Path(package["manifest_path"]).parent
    files = {f for f in folder.iterdir() if f.is_file() and f.name.upper().startswith(("LICENSE", "COPYING", "NOTICE"))}
    if package.get("license_file"):
        files.add(folder / package["license_file"])
    for file in sorted(files):
        if file.exists():
            output.append("\n" + file.name + "\n" + file.read_text(errors="replace"))
# Preserve license text while normalizing trailing whitespace in generated notices.
notice = "\n".join(line.rstrip() for line in "\n".join(output).splitlines()) + "\n"
(root / "projects/zodiacal/wasm/NOTICE.txt").write_text(notice)
