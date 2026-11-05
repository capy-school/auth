import re
from pathlib import Path
import tempfile
import unittest

from test_assets import load_helper


class ConfigTests(unittest.TestCase):
    def setUp(self):
        self.nginx = load_helper("nginx")
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for relative in ["index.html", "dashboard/index.html", "settings/security/index.html", "_app/immutable/entry/start.abc123.js", "site.css", "favicon.svg"]:
            path = self.root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("public static content")

    def test_known_pages_and_files_only_with_correct_mime_and_cache(self):
        config = self.nginx.render_config(self.root)
        for uri in ["/", "/index.html", "/dashboard", "/dashboard/", "/settings/security", "/settings/security/", "/_app/immutable/entry/start.abc123.js", "/site.css", "/favicon.svg"]:
            self.assertIn(f"location = {uri} {{", config)
        for mime in ["text/html", "application/javascript", "text/css", "image/svg+xml"]:
            self.assertIn(f"default_type {mime};", config)
        self.assertIn('Cache-Control "no-cache"', config)
        self.assertIn('Cache-Control "public, max-age=31536000, immutable"', config)
        self.assertIn("location / { return 404; }", config)
        self.assertNotIn("try_files $uri /index.html", config)
        self.assertNotIn("location = /index.html.br", config)
        self.assertNotIn("gzip on", config)
        self.assertIn('Vary "Accept-Encoding" always', config)
        self.assertIn("etag on;", config)
        self.assertIn("return 406", config)

    def test_api_is_exclusive_runtime_dns_proxy_with_verified_tls(self):
        config = self.nginx.render_config(self.root)
        for location in ["location = /api {", "location ^~ /api/ {"]:
            self.assertIn(location, config)
        for directive in ["proxy_pass $api_upstream$request_uri;", "proxy_cache off;", "proxy_intercept_errors off;", "proxy_redirect off;", "proxy_ssl_verify on;", "proxy_ssl_server_name on;", "proxy_ssl_name @@API_HOST@@;", "proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;", "resolver @@RESOLVERS@@ valid=10s;", "listen @@PORT@@;", 'set $api_upstream "@@API_UPSTREAM@@";']:
            self.assertIn(directive, config)
        self.assertNotIn("proxy_ssl_verify off", config)
        self.assertNotIn("location /api {", config)
        health = config.split("location = /healthz {", 1)[1].split("}", 1)[0]
        self.assertIn('return 200 "ready\\n";', health)
        self.assertNotIn("proxy_", health)

    def test_encoding_exclusions_case_wildcards_and_server_priority(self):
        def select(header):
            raw = {}
            for token in ("br", "zstd", "gzip", "deflate", "identity", "*"):
                zero, positive = self.nginx.accept_patterns(token)
                raw[token] = 0 if re.search(zero, header, re.I) else 1 if re.search(positive, header, re.I) else None
            for token in ("br", "zstd", "gzip", "deflate"):
                if raw[token] == 1 or (raw[token] is None and raw["*"] == 1):
                    return token
            return "identity" if raw["identity"] != 0 and not (raw["identity"] is None and raw["*"] == 0) else "reject"

        cases = {"": "identity", "identity": "identity", "br": "br", "gzip, deflate": "gzip", "GZIP;Q=0, BR;q=0.5": "br", "br;q=0, gzip;q=0.8": "gzip", "br;q=0.000, br;q=1, zstd": "zstd", "br;q=0, *;q=0.5": "zstd", "*": "br", "*;q=0": "reject", "*;q=0, identity;q=1": "identity", "br;q=0, zstd;q=0, gzip;q=0, deflate;q=0, identity;q=0": "reject", "gzip;q=1, br;q=0.1": "br", "xbr, gzip;q=0.000": "identity", "br;q=0.001": "br"}
        for header, expected in cases.items():
            with self.subTest(header=header):
                self.assertEqual(select(header), expected)


if __name__ == "__main__":
    unittest.main()
