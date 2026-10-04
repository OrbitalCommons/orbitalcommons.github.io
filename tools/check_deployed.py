#!/usr/bin/env python3
"""Verify that GitHub Pages serves this checkout's public files unchanged.

No dependencies, browser install, credentials, or write requests are needed.
Run against the deployed commit, not an unpublished branch.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
from pathlib import Path
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_SUFFIXES = {".html", ".css", ".js", ".svg", ".png", ".jpg", ".wasm", ".bin", ".fits"}
MIME_TYPES = {
    ".html": {"text/html"},
    ".css": {"text/css"},
    ".js": {"application/javascript", "text/javascript"},
    ".wasm": {"application/wasm"},
    ".svg": {"image/svg+xml"},
    ".png": {"image/png"},
    ".jpg": {"image/jpeg"},
}


def public_files(root=ROOT):
    files = [root / name for name in ("index.html", "404.html", "style.css", "robots.txt", "sitemap.xml")]
    for directory in ("assets", "projects", "sky", "starfield", "fitsio-pure"):
        files.extend(path for path in (root / directory).rglob("*")
                     if path.is_file() and path.suffix in PUBLIC_SUFFIXES)
    return sorted(set(files))


def verify(base_url, route, expected, content_type=None, status=200):
    digest = hashlib.sha256(expected).hexdigest()
    url = base_url.rstrip("/") + "/" + quote(route.lstrip("/"), safe="/") + "?verify=" + digest[:16]
    request = Request(url, headers={
        "User-Agent": "OrbitalCommons-Pages-check/1.0",
        "Accept-Encoding": "identity",
        "Cache-Control": "no-cache",
    })
    try:
        response = urlopen(request, timeout=20)
    except HTTPError as error:
        response = error  # A custom 404 is expected to have an HTTP error status.
    with response:
        if response.status != status:
            raise ValueError(f"{route}: HTTP {response.status}, expected {status}")
        actual_type = response.headers.get_content_type()
        if content_type and actual_type not in content_type:
            raise ValueError(f"{route}: Content-Type {actual_type}, expected {' or '.join(sorted(content_type))}")
        # Bound reads even if a proxy or hosting error returns an unrelated file.
        actual = response.read(len(expected) + 1)
        if actual != expected:
            raise ValueError(f"{route}: published bytes differ from this commit")


def checks(root=ROOT):
    for path in public_files(root):
        route = path.relative_to(root).as_posix()
        if path.name == "index.html":
            route = route[:-len("index.html")]
        yield route, path.read_bytes(), MIME_TYPES.get(path.suffix), 200
    # Check a genuinely missing route, not merely the directly accessible
    # /404.html document; the host must return our body with HTTP 404.
    yield "__site_check__/missing/nested-page/", (root / "404.html").read_bytes(), {"text/html"}, 404


def run(base_url, attempts=5, delay=10, root=ROOT):
    remaining = list(checks(root))
    total = len(remaining)
    for attempt in range(attempts):
        def check(item):
            try:
                verify(base_url, *item)
                return None
            except (OSError, URLError, ValueError) as error:
                return str(error)
        with ThreadPoolExecutor(max_workers=6) as pool:
            results = list(pool.map(check, remaining))
        failures = [(item, error) for item, error in zip(remaining, results) if error]
        if not failures:
            print(f"Verified {total} published files/routes, including WASM MIME types and the custom 404.")
            return 0
        print(f"Attempt {attempt + 1}/{attempts}: {len(failures)} checks still failing.", flush=True)
        if attempt + 1 < attempts:
            remaining = [item for item, _ in failures]
            time.sleep(delay)
    for _, error in failures:
        print(error)
    return 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="https://orbitalcommons.github.io")
    parser.add_argument("--attempts", type=int, default=5)
    parser.add_argument("--delay", type=float, default=10)
    args = parser.parse_args()
    if args.attempts < 1 or args.delay < 0:
        parser.error("attempts must be positive and delay nonnegative")
    raise SystemExit(run(args.base_url, args.attempts, args.delay))
