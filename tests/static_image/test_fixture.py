import base64
import http.client
import json
from pathlib import Path
import subprocess
import sys
import unittest


class ApiFixtureTests(unittest.TestCase):
    def test_echo_preserves_bytes_target_cookies_status_and_head(self):
        fixture = Path(__file__).resolve().parents[1] / "fixtures/static-api.py"
        self.assertTrue(fixture.is_file(), "missing isolated HTTP/TLS API fixture")
        process = subprocess.Popen([sys.executable, "-u", str(fixture), "--port", "0", "--instance", "UNIT"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.addCleanup(process.stderr.close)
        self.addCleanup(process.stdout.close)
        self.addCleanup(process.wait)
        self.addCleanup(process.terminate)
        ready = json.loads(process.stdout.readline())
        connection = http.client.HTTPConnection("127.0.0.1", ready["port"], timeout=3)
        self.addCleanup(connection.close)
        body = bytes(range(256))
        target = "/api/echo%2Fitem//a?x=1&x=2&status=418"
        connection.request("PATCH", target, body=body, headers={"Cookie": "one=1; two=2", "Authorization": "Bearer fixture-only"})
        response = connection.getresponse()
        self.assertEqual(response.status, 418)
        cookies = [value for key, value in response.getheaders() if key.lower() == "set-cookie"]
        self.assertEqual(len(cookies), 2)
        data = json.loads(response.read())
        self.assertEqual(data["instance"], "UNIT")
        self.assertEqual(data["method"], "PATCH")
        self.assertEqual(data["target"], target)
        self.assertEqual(data["bodyBase64"], base64.b64encode(body).decode())
        self.assertEqual(data["cookie"], "one=1; two=2")
        self.assertEqual(data["authorization"], "Bearer fixture-only")
        connection.request("HEAD", "/api?status=401")
        response = connection.getresponse()
        self.assertEqual(response.status, 401)
        self.assertEqual(response.getheader("X-Fixture-Method"), "HEAD")
        self.assertEqual(response.read(), b"")


if __name__ == "__main__":
    unittest.main()
