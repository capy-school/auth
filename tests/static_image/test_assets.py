"""Build-time codecs use real bytes, never benchmark/authentication fixtures."""

import gzip
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
import zlib


ROOT = Path(__file__).resolve().parents[2]


def load_helper(name):
    path = ROOT / "docker" / f"{name}.py"
    if not path.is_file():
        raise AssertionError(f"missing build helper: {path}")
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class AssetsTests(unittest.TestCase):
    def setUp(self):
        self.assets = load_helper("assets")
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.source = Path(self.temp.name) / "static"
        self.output = Path(self.temp.name) / "out"
        self.source.mkdir()

    def test_all_four_representations_round_trip_and_are_deterministic(self):
        original = (b"<h1>Prerendered public shell</h1>\n" * 125) + bytes(range(256))
        encoded = self.assets.representations(original)
        self.assertEqual(set(encoded), {".br", ".zst", ".gz", ".deflate"})
        self.assertEqual(encoded, self.assets.representations(original))
        self.assertEqual(gzip.decompress(encoded[".gz"]), original)
        self.assertEqual(zlib.decompress(encoded[".deflate"]), original)
        with self.assertRaises(zlib.error):
            zlib.decompress(encoded[".deflate"], -zlib.MAX_WBITS)
        for suffix, command in [(".br", ["brotli", "-d", "-c"]), (".zst", ["zstd", "-d", "-q", "-c"])]:
            decoded = subprocess.run(command, input=encoded[suffix], capture_output=True, check=True)
            self.assertEqual(decoded.stdout, original)

    def test_copy_real_output_keep_originals_and_compress_nested_files(self):
        files = {"index.html": b"<h1>Login</h1>", "dashboard/index.html": b"<h1>Account</h1>",
                 "_app/immutable/entry/start.abc123.js": b"export const hydrate = true;"}
        for relative, data in files.items():
            path = self.source / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        self.assets.build_assets(self.source, self.output)
        for relative, data in files.items():
            self.assertEqual((self.output / relative).read_bytes(), data)
            for suffix in (".br", ".zst", ".gz", ".deflate"):
                self.assertTrue(Path(str(self.output / relative) + suffix).is_file())
        self.assertFalse((self.output / "manifest.json").exists())
        self.assertFalse((self.output / "auth.htpasswd").exists())

    def test_reject_private_api_diagnostic_paths_and_unsafe_names(self):
        for relative in ["api/index.html", "api/session.json", "__migration/index.html", ".env", "nested/.env.local", "state.sqlite", "bad;name.js"]:
            with self.subTest(relative=relative), tempfile.TemporaryDirectory() as directory:
                source = Path(directory) / "src"
                path = source / relative
                path.parent.mkdir(parents=True)
                path.write_bytes(b"must not be public")
                with self.assertRaises(ValueError):
                    self.assets.build_assets(source, Path(directory) / "out")

    def test_reject_symlinks_and_overlapping_or_dirty_output(self):
        secret = Path(self.temp.name) / "secret"
        secret.write_text("not public")
        (self.source / "leak.txt").symlink_to(secret)
        with self.assertRaises(ValueError):
            self.assets.build_assets(self.source, self.output)
        (self.source / "leak.txt").unlink()
        (self.source / "index.html").write_text("public")
        with self.assertRaises(ValueError):
            self.assets.build_assets(self.source, self.source / "out")
        self.output.mkdir(exist_ok=True)
        (self.output / "stale.js").write_text("stale")
        with self.assertRaises(ValueError):
            self.assets.build_assets(self.source, self.output)


if __name__ == "__main__":
    unittest.main()
