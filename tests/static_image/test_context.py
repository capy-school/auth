"""Production and CI contexts allow frontend inputs, never API source or env."""

from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]


class BuildContextTests(unittest.TestCase):
    def test_frontend_contexts_include_workspace_manifest_but_not_backend(self):
        for name in [".dockerignore", "docker/ci/Dockerfile.dockerignore"]:
            patterns = (ROOT / name).read_text().splitlines()
            self.assertIn("**", patterns)
            for allowed in ["!api/package.json", "!src/**", "!shared/**", "!static/**"]:
                self.assertIn(allowed, patterns)
            for forbidden in ["!api/**", "!api/src/**", "!server/**", "!server-rust/**"]:
                self.assertNotIn(forbidden, patterns)
            self.assertGreater(patterns.index("**/.env*"), patterns.index("!static/**"))
        self.assertFalse((ROOT / "static/.assetsignore").exists())


if __name__ == "__main__":
    unittest.main()
