"""Local-only HTTP/TLS echo API. Copied exclusively by Docker's test-api target."""

import argparse
import base64
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import ssl
import threading
from urllib.parse import parse_qs, urlsplit


class FixtureServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address, instance):
        super().__init__(address, Handler)
        self.instance = instance
        self.sequence = 0
        self.sequence_lock = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def respond(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        query = parse_qs(urlsplit(self.path).query)
        try:
            status = int(query.get("status", ["200"])[0])
        except ValueError:
            status = 400
        if status < 200 or status > 599:
            status = 400
        with self.server.sequence_lock:
            self.server.sequence += 1
            sequence = self.server.sequence
        payload = json.dumps({
            "instance": self.server.instance,
            "method": self.command,
            "target": self.path,
            "bodyBase64": base64.b64encode(body).decode(),
            "cookie": self.headers.get("Cookie", ""),
            "authorization": self.headers.get("Authorization", ""),
            "host": self.headers.get("Host", ""),
            "sni": getattr(self.connection, "fixture_sni", None),
            "sequence": sequence,
        }).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Fixture-Method", self.command)
        self.send_header("X-Fixture-Target", self.path)
        self.send_header("Set-Cookie", f"fixture_one={self.server.instance}; Path=/; HttpOnly; SameSite=Lax")
        self.send_header("Set-Cookie", "fixture_two=second; Path=/; Secure; SameSite=None")
        if status == 302:
            self.send_header("Location", "/api/next?keep=1")
        if status in (204, 304):
            payload = b""
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(payload)

    do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = do_OPTIONS = do_HEAD = respond

    def log_message(self, *_args):
        pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--instance", default="fixture")
    parser.add_argument("--cert")
    parser.add_argument("--key")
    args = parser.parse_args()
    if bool(args.cert) != bool(args.key):
        parser.error("--cert and --key must be supplied together")
    server = FixtureServer(("0.0.0.0", args.port), args.instance)
    if args.cert:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        context.load_cert_chain(args.cert, args.key)

        def record_sni(connection, name, _context):
            connection.fixture_sni = name

        context.set_servername_callback(record_sni)
        server.socket = context.wrap_socket(server.socket, server_side=True)
    print(json.dumps({"port": server.server_port, "instance": args.instance, "tls": bool(args.cert)}), flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
