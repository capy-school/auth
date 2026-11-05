"""Regression against the real public tree, not only runtime fixtures."""

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]


class BuildContextTests(unittest.TestCase):
    def test_cloudflare_asset_control_is_excluded_after_public_allowlist(self):
        self.assertTrue((ROOT / "public/.assetsignore").is_file())
        patterns = (ROOT / ".dockerignore").read_text().splitlines()
        self.assertIn("public/.assetsignore", patterns)
        self.assertGreater(patterns.index("public/.assetsignore"), patterns.index("!public/**"))


if __name__ == "__main__":
    unittest.main()
