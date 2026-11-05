"""Generate exact static routes and an explicit-marker runtime proxy template.

Negotiation follows the private lab's server priority among acceptable codings,
not highest-q ordering. An explicit q=0 always excludes a coding.
"""

import json
import mimetypes
from pathlib import Path
import re
import sys

from docker.assets import public_files


CODINGS = (("br", "br"), ("zstd", "zstd"), ("gzip", "gzip"), ("deflate", "deflate"), ("identity", "identity"), ("*", "star"))
MIME = {".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".wasm": "application/wasm", ".woff": "font/woff", ".woff2": "font/woff2"}


def accept_patterns(token: str) -> tuple[str, str]:
    token = re.escape(token)
    zero = rf"(?:^|,)\s*{token}\s*;\s*q\s*=\s*0(?:\.0{{0,3}})?\s*(?:,|$)"
    positive = rf"(?:^|,)\s*{token}\s*(?:;\s*q\s*=\s*(?:1(?:\.0{{0,3}})?|0\.[0-9]{{1,3}}))?\s*(?:,|$)"
    return zero, positive


def encoding_maps() -> str:
    maps = []
    for token, name in CODINGS:
        zero, positive = accept_patterns(token)
        maps.append(f'''map $http_accept_encoding $raw_{name} {{
    default "-";
    {json.dumps("~*" + zero)} 0;
    {json.dumps("~*" + positive)} 1;
}}''')
    for name in ("br", "zstd", "gzip", "deflate"):
        maps.append(f'''map "${{raw_{name}}}:${{raw_star}}" $can_{name} {{
    default 0;
    ~^1: 1;
    "-:1" 1;
}}''')
    maps.append('''map "${raw_identity}:${raw_star}" $can_identity {
    default 1;
    ~^0: 0;
    "-:0" 0;
}
map "${can_br}${can_zstd}${can_gzip}${can_deflate}${can_identity}" $selected_coding {
    default reject;
    ~^1 br;
    ~^01 zstd;
    ~^001 gzip;
    ~^0001 deflate;
    ~^00001 "";
}
map $selected_coding $encoding_suffix {
    default "";
    br .br;
    zstd .zst;
    gzip .gz;
    deflate .deflate;
}''')
    return "\n".join(maps)


def static_location(uri: str, relative: str) -> str:
    suffix = Path(relative).suffix
    mime = MIME.get(suffix) or mimetypes.guess_type(relative)[0] or "application/octet-stream"
    immutable = relative.startswith("_app/immutable/") and suffix != ".html"
    cache = "public, max-age=31536000, immutable" if immutable else "no-cache"
    return f'''location = {uri} {{
    if ($selected_coding = reject) {{ return 406; }}
    types {{ }}
    default_type {mime};
    etag on;
    if_modified_since exact;
    add_header Vary "Accept-Encoding" always;
    add_header Content-Encoding $selected_coding;
    add_header Cache-Control "{cache}";
    try_files /{relative}$encoding_suffix =404;
}}'''


def proxy_location(pattern: str) -> str:
    return f'''location {pattern} {{
    set $api_upstream "@@API_UPSTREAM@@";
    proxy_pass $api_upstream$request_uri;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host @@API_AUTHORITY@@;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $http_host;
    proxy_cache off;
    proxy_buffering off;
    proxy_intercept_errors off;
    proxy_redirect off;
    proxy_connect_timeout 10s;
    proxy_read_timeout 60s;
    proxy_ssl_server_name on;
    proxy_ssl_name @@API_HOST@@;
    proxy_ssl_verify on;
    proxy_ssl_verify_depth 5;
    proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;
}}'''


def render_config(root: Path) -> str:
    root = Path(root)
    locations = []
    for path in public_files(root):
        relative = path.relative_to(root).as_posix()
        locations.append(static_location("/" + relative, relative))
        if path.name == "index.html":
            directory = relative.removesuffix("index.html")
            locations.append(static_location("/" + directory, relative))
            if directory:
                locations.append(static_location("/" + directory.rstrip("/"), relative))
    return '''# Generated from actual Kit build files. Only explicit markers are runtime values.
worker_processes 1;
error_log stderr warn;
pid /tmp/nginx.pid;
events { worker_connections 1024; }
http {
    include /etc/nginx/mime.types;
    access_log off;
    client_body_temp_path /tmp/client_temp;
    proxy_temp_path /tmp/proxy_temp;
    client_max_body_size 10m;
    sendfile on;
    tcp_nopush on;
    keepalive_timeout 30;
    server_tokens off;
    max_ranges 0;
    resolver @@RESOLVERS@@ valid=10s;
    resolver_timeout 5s;
''' + encoding_maps() + '''
    server {
        listen @@PORT@@;
        root /srv;
        location = /healthz {
            default_type text/plain;
            add_header Cache-Control "no-store";
            return 200 "ready\\n";
        }
''' + proxy_location("= /api") + "\n" + proxy_location("^~ /api/") + "\n" + "\n".join(locations) + '''
        location / { return 404; }
    }
}
'''


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: python3 -m docker.nginx STATIC_DIRECTORY OUTPUT_TEMPLATE")
    path = Path(sys.argv[2])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render_config(Path(sys.argv[1])))
