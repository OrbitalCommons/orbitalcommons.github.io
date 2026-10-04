import contextlib
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import check_site


class ResponsiveImageLinks(unittest.TestCase):
    def test_candidate_urls_keep_commas_inside_urls(self):
        self.assertEqual(list(check_site.srcset_urls(
            "small.svg 320w, large.svg 700w, data:image/png;base64,AAAA 2x"
        )), ["small.svg", "large.svg", "data:image/png;base64,AAAA"])
        self.assertEqual(list(check_site.srcset_urls("small.svg, large.svg")),
                         ["small.svg", "large.svg"])
        self.assertEqual(list(check_site.srcset_urls("plot,one.svg 1x, plot%20two.svg 2x")),
                         ["plot,one.svg", "plot%20two.svg"])

    def test_missing_picture_source_fails_the_site_check(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "index.html").write_text('''<!doctype html><html lang="en">
              <title>Fixture</title><meta name="viewport" content="width=device-width">
              <picture><source srcset="compact.svg 320w, large.svg 700w">
              <img src="large.svg" alt="A plot"></picture></html>''')
            (root / "large.svg").write_text('<svg/>')
            output = io.StringIO()
            with patch.object(check_site, "ROOT", root), contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
                self.assertTrue(check_site.check())
                self.assertIn("missing link target: compact.svg", output.getvalue())
                (root / "compact.svg").write_text('<svg/>')
                self.assertFalse(check_site.check())


if __name__ == "__main__":
    unittest.main()
