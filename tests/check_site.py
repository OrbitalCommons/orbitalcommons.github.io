"""Validate static HTML and local links without a build or third-party packages."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
import sys

ROOT = Path(__file__).resolve().parents[1]
IGNORED = {"node_modules", ".git", ".worktrees", "test-results", "playwright-report"}


class Page(HTMLParser):
    def __init__(self, path):
        super().__init__(convert_charrefs=True)
        self.path = path
        self.ids = set()
        self.links = []
        self.errors = []
        self.title = False
        self.lang = False
        self.viewport = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get("id"):
            if attrs["id"] in self.ids:
                self.errors.append(f'duplicate id: {attrs["id"]}')
            self.ids.add(attrs["id"])
        if tag == "title":
            self.title = True
        if tag == "html":
            self.lang = bool(attrs.get("lang"))
        if tag == "meta" and attrs.get("name") == "viewport":
            self.viewport = True
        if tag == "img" and "alt" not in attrs:
            self.errors.append("image is missing alt text")
        for attr in ("href", "src", "poster"):
            if attrs.get(attr):
                self.links.append(attrs[attr])


def check():
    pages = {}
    errors = []
    for path in ROOT.rglob("*.html"):
        if IGNORED.intersection(path.relative_to(ROOT).parts):
            continue
        page = Page(path)
        page.feed(path.read_text())
        pages[path] = page
    for path, page in pages.items():
        name = path.relative_to(ROOT)
        for required in ("title", "lang", "viewport"):
            if not getattr(page, required):
                page.errors.append(f"missing {required}")
        for href in page.links:
            url = urlsplit(href)
            if url.scheme or url.netloc:
                continue
            if url.path.startswith("/"):
                target = ROOT / unquote(url.path).lstrip("/")
            elif url.path:
                target = path.parent / unquote(url.path)
            else:
                target = path
            target = target.resolve()
            if not target.is_relative_to(ROOT):
                page.errors.append(f"link escapes site root: {href}")
                continue
            if target.is_dir():
                target = target / "index.html"
            if not target.exists():
                page.errors.append(f"missing link target: {href}")
            elif url.fragment and target in pages and unquote(url.fragment) not in pages[target].ids:
                page.errors.append(f"missing anchor: {href}")
        errors.extend(f"{name}: {error}" for error in page.errors)
    for error in errors:
        print(error, file=sys.stderr)
    print(f"Checked {len(pages)} HTML pages; {len(errors)} errors.")
    return bool(errors)


if __name__ == "__main__":
    sys.exit(check())
