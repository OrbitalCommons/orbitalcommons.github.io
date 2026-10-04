"""Exercise hosting failures without depending on the public deployment."""
import importlib.util
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import unittest
from urllib.parse import urlsplit

spec = importlib.util.spec_from_file_location("deployed", Path(__file__).resolve().parents[1] / "tools/check_deployed.py")
deployed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deployed)


class Handler(BaseHTTPRequestHandler):
    routes = {}

    def do_GET(self):
        status, mime, body = self.routes.get(urlsplit(self.path).path, (404, "text/html", b"missing"))
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass


class PublishedFileTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def test_accepts_the_deployed_wasm_with_its_correct_mime_type(self):
        Handler.routes = {"/engine.wasm": (200, "application/wasm", b"\0asm")}
        deployed.verify(self.base, "engine.wasm", b"\0asm", {"application/wasm"})

    def test_rejects_correct_bytes_with_a_wrong_mime_type(self):
        Handler.routes = {"/engine.wasm": (200, "text/plain", b"\0asm")}
        with self.assertRaisesRegex(ValueError, "Content-Type"):
            deployed.verify(self.base, "engine.wasm", b"\0asm", {"application/wasm"})

    def test_rejects_stale_html_even_when_the_request_is_successful(self):
        Handler.routes = {"/": (200, "text/html", b"old deployment")}
        with self.assertRaisesRegex(ValueError, "published bytes differ"):
            deployed.verify(self.base, "", b"new deployment", {"text/html"})

    def test_accepts_the_custom_404_but_rejects_a_soft_404(self):
        Handler.routes = {"/missing/": (404, "text/html", b"our error page")}
        deployed.verify(self.base, "missing/", b"our error page", {"text/html"}, 404)
        Handler.routes = {"/missing/": (200, "text/html", b"our error page")}
        with self.assertRaisesRegex(ValueError, "HTTP 200"):
            deployed.verify(self.base, "missing/", b"our error page", {"text/html"}, 404)
