"""Copy the real Kit output and precompress it; only used during the build."""

import gzip
import os
from pathlib import Path
import re
import subprocess
import sys
import zlib


SUFFIXES = (".br", ".zst", ".gz", ".deflate")
PRIVATE_SUFFIXES = {".db", ".sqlite", ".sqlite3", ".pem", ".key", ".map"}


def public_files(root: Path):
    """Fail closed instead of silently publishing private or injectable paths."""
    root = Path(root)
    if not root.is_dir() or root.is_symlink():
        raise ValueError("static input must be a real directory")
    files = []
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root)
        if path.is_symlink():
            raise ValueError(f"symlink in static output: {relative}")
        if not path.is_file():
            continue
        if (not re.fullmatch(r"[A-Za-z0-9_./@+~-]+", relative.as_posix())
                or any(part.startswith(".") for part in relative.parts)
                or relative.parts[0] in {"api", "__migration", "__dev", "dev", "server", "server-rust"}
                or path.suffix.lower() in PRIVATE_SUFFIXES):
            raise ValueError(f"non-public path in static output: {relative}")
        # Adapter precompression, when enabled, is replaced with all four codings.
        if path.suffix not in SUFFIXES:
            files.append(path)
    if not files:
        raise ValueError("static output is empty")
    return files


def representations(data: bytes) -> dict[str, bytes]:
    return {
        ".br": subprocess.run(["brotli", "-q", "11", "-c"], input=data, capture_output=True, check=True).stdout,
        ".zst": subprocess.run(["zstd", "-19", "-q", "-c"], input=data, capture_output=True, check=True).stdout,
        ".gz": gzip.compress(data, compresslevel=9, mtime=0),
        # HTTP deflate means the zlib wrapper, NOT a raw DEFLATE stream.
        ".deflate": zlib.compress(data, level=9),
    }


def build_assets(source: Path, output: Path) -> None:
    source, output = Path(source).resolve(), Path(output).resolve()
    if source == output or source in output.parents or output in source.parents:
        raise ValueError("static input and output must not overlap")
    if output.exists() and any(output.iterdir()):
        raise ValueError("static output directory must be empty")
    files = public_files(source)
    output.mkdir(parents=True, exist_ok=True)
    for original in files:
        path = output / original.relative_to(source)
        path.parent.mkdir(parents=True, exist_ok=True)
        data = original.read_bytes()
        path.write_bytes(data)
        timestamp = int(original.stat().st_mtime)
        os.utime(path, (timestamp, timestamp))
        for index, (suffix, encoded) in enumerate(representations(data).items(), 1):
            sidecar = Path(str(path) + suffix)
            sidecar.write_bytes(encoded)
            # Native Nginx ETags must distinguish codings even when sizes match.
            os.utime(sidecar, (timestamp - index, timestamp - index))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: python3 -m docker.assets KIT_STATIC_DIRECTORY OUTPUT_DIRECTORY")
    build_assets(Path(sys.argv[1]), Path(sys.argv[2]))
