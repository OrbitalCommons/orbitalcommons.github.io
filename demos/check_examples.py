"""Extract the displayed Rust examples and compile them against pinned releases.

Use --extract-only to populate sources before running cargo commands manually.
Generated sources are ignored; the website HTML is the source of truth.
"""
import ast
from html.parser import HTMLParser
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "demos/code-examples/Cargo.toml"


class Example(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_example = False
        self.in_code = False
        self.in_pre = False
        self.code = []

    def handle_starttag(self, tag, attrs):
        if tag == "section":
            self.in_example = dict(attrs).get("id") == "example"
        if tag == "pre":
            self.in_pre = True
        if tag == "code" and self.in_example and self.in_pre:
            self.in_code = True

    def handle_endtag(self, tag):
        if tag == "section":
            self.in_example = False
        if tag == "code":
            self.in_code = False
        if tag == "pre":
            self.in_pre = False

    def handle_data(self, value):
        if self.in_code:
            self.code.append(value)


out = MANIFEST.parent / "src/bin"
out.mkdir(parents=True, exist_ok=True)
for name in ["starfield", "fitsio-pure", "rizzma", "starfield-datastore"]:
    parser = Example()
    parser.feed((ROOT / "projects" / name / "index.html").read_text())
    code = "".join(parser.code)
    if not code.startswith("use ") or "fn main()" not in code:
        raise RuntimeError(f"Missing Rust example on {name}")
    (out / (name + ".rs")).write_text(code + "\n")
    print(f"Extracted {name}")

# The camera example requires libcamera hardware; check its syntax without
# pretending that a browser or CI runner can exercise the capture path.
parser = Example()
parser.feed((ROOT / "projects/scicamera/index.html").read_text())
code = "".join(parser.code)
if not code.strip():
    raise RuntimeError("Missing Python example on scicamera")
ast.parse(code, filename="scicamera-example.py")
print("Checked scicamera Python syntax (hardware execution not performed)")

if "--extract-only" not in sys.argv:
    subprocess.run(["cargo", "check", "--locked", "--bins", "--manifest-path", str(MANIFEST)], check=True)
