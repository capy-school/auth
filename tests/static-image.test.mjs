// Opt in explicitly: AUTH_STATIC_IMAGE=auth-static:local node --test this-file.
// Runtime-only development (NOT final app acceptance): use the runtime target
// with AUTH_STATIC_FIXTURE=1. No host Kit build is invoked by this test.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { join, relative, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync, gunzipSync, inflateRawSync, inflateSync } from 'node:zlib';
import { test } from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const image = process.env.AUTH_STATIC_IMAGE;
const fixtureMode = process.env.AUTH_STATIC_FIXTURE === '1';
const routes = ['/', '/dashboard', '/logout', ...['security', 'sessions', 'passkey', '2fa', 'api-keys', 'organizations'].map(section => `/settings/${section}`)];
const hardening = ['--pull=never', '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '64'];

function command(file, args, options = {}) {
  return execFileSync(file, args, { cwd: root, encoding: 'utf8', timeout: 120_000, maxBuffer: 32 * 1024 * 1024, ...options });
}
const docker = (...args) => command('docker', args).trim();
const inspect = (...args) => JSON.parse(docker('inspect', ...args))[0];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const logs = id => {
  const result = spawnSync('docker', ['logs', id], { cwd: root, encoding: 'utf8', timeout: 15_000 });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout + result.stderr;
};

function request(port, path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolveResponse, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers, timeout: 15_000 }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolveResponse({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
      response.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error(`timeout: ${method} ${path}`)));
    req.on('error', reject);
    req.end(body);
  });
}

async function waitFor(work, description, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try { return await work(); } catch (error) { last = error; await delay(100); }
  }
  throw new Error(`${description}: ${last?.stack || last}`);
}

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

function decode(coding, bytes) {
  if (coding === 'br') return brotliDecompressSync(bytes);
  if (coding === 'gzip') return gunzipSync(bytes);
  if (coding === 'deflate') return inflateSync(bytes);
  if (coding === 'zstd') return command('zstd', ['-d', '-q', '-c'], { input: bytes, encoding: 'buffer' });
  return bytes;
}

test('scratch runtime: isolated static, negotiation and verified HTTP/TLS proxy', { skip: !image, timeout: 180_000 }, async t => {
  const apiImage = process.env.AUTH_STATIC_API_IMAGE || 'auth-static:test-api';
  const imageInfo = inspect(image);
  // Require the exclusive fixture image rather than pulling/running arbitrary images.
  inspect(apiImage);
  assert.ok(existsSync('/tmp/opencode'), 'test temporary root must exist');
  const temp = mkdtempSync('/tmp/opencode/auth-static-');
  chmodSync(temp, 0o755);
  const containers = [];
  const network = `auth-static-${randomUUID().slice(0, 12)}`;
  const volume = `${network}-input`;
  let networkCreated = false;
  let volumeCreated = false;
  let stager;
  assert.equal(imageInfo.Config.User, '101:101');
  assert.deepEqual(imageInfo.Config.Entrypoint, ['/launcher']);
  t.diagnostic(`image ${imageInfo.Id}, ${imageInfo.Size} bytes; fixture mode=${fixtureMode}`);

  const ownContainer = (...args) => {
    const id = docker(...args);
    containers.push(id);
    return id;
  };
  let mounts = [];
  let expected;
  // Docker Desktop need not share host /tmp. Copy only test-owned bytes into a
  // test-owned volume, then give runtime containers read-only subdirectory mounts.
  const mountInput = (subdirectory, destination) => ['--mount', `type=volume,src=${volume},dst=${destination},volume-subpath=${subdirectory},readonly`];
  const stageDirectory = (directory, name) => docker('cp', `${directory}/.`, `${stager}:/test-input/${name}`);
  const createFixture = audit => {
    const source = join(temp, 'input');
    expected = join(temp, 'srv');
    for (const route of routes) {
      const path = join(source, route.slice(1), 'index.html');
      mkdirSync(resolve(path, '..'), { recursive: true });
      writeFileSync(path, `<html><head><link rel="stylesheet" href="/_app/immutable/assets/app.fixture123.css"></head><body><h1>Static runtime fixture ${route}</h1><script type="module" src="/_app/immutable/entry/start.fixture123.js"></script></body></html>`);
    }
    for (const [name, contents] of Object.entries({ '_app/immutable/entry/start.fixture123.js': 'export const hydration = "fixture-only";\n'.repeat(80), '_app/immutable/assets/app.fixture123.css': 'body { color: #24334a; }\n'.repeat(80), 'favicon.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>' })) {
      const path = join(source, name);
      mkdirSync(resolve(path, '..'), { recursive: true });
      writeFileSync(path, contents);
    }
    command('python3', ['-m', 'docker.assets', source, expected]);
    const configDirectory = join(temp, 'nginx');
    mkdirSync(configDirectory);
    const template = join(configDirectory, 'nginx.conf.template');
    command('python3', ['-m', 'docker.nginx', expected, template]);
    docker('cp', `${audit}:/etc/nginx/mime.types`, join(configDirectory, 'mime.types'));
    stageDirectory(expected, 'srv');
    stageDirectory(configDirectory, 'nginx');
    mounts = [...mountInput('srv', '/srv'), ...mountInput('nginx', '/etc/nginx')];
  };

  const portOf = (id, containerPort) => {
    const info = inspect(id);
    const bindings = info.NetworkSettings.Ports[`${containerPort}/tcp`];
    assert.ok(info.State.Running && bindings?.length, `no published loopback port: ${JSON.stringify(info.State)} ${logs(id)}`);
    assert.ok(bindings.every(binding => binding.HostIp === '127.0.0.1'));
    assert.equal(info.Config.User, '101:101');
    assert.equal(info.HostConfig.ReadonlyRootfs, true);
    assert.deepEqual(info.HostConfig.CapDrop, ['ALL']);
    assert.ok(info.HostConfig.SecurityOpt.includes('no-new-privileges'));
    return Number(bindings[0].HostPort);
  };
  const startApi = async (instance, alias, extra = []) => {
    const port = extra.includes('--cert') ? 8443 : 8000;
    const id = ownContainer('run', '-d', ...hardening, '--network', network, '--network-alias', alias,
      ...(alias === 'api-tls' ? ['--network-alias', 'wrong-name'] : []),
      '-p', `127.0.0.1::${port}`, ...(port === 8443 ? mountInput('tls', '/tls') : []),
      apiImage, '--port', String(port), '--instance', instance, ...extra);
    if (port === 8000) await waitFor(async () => assert.equal((await request(portOf(id, port), '/api/ready')).status, 200), 'API fixture ready');
    else await waitFor(async () => assert.match(logs(id), /"port": 8443/), 'TLS fixture ready');
    return id;
  };
  const startFrontend = async (upstream, { port = 8080, ca = false } = {}) => {
    const id = ownContainer('run', '-d', ...hardening, '--network', network, '-p', `127.0.0.1::${port}`, ...mounts,
      ...(ca ? mountInput('ca', '/etc/ssl/certs') : []),
      '-e', `API_UPSTREAM=${upstream}`, ...(port !== 8080 ? ['-e', `PORT=${port}`] : []), imageInfo.Id);
    const boundPort = portOf(id, port);
    await waitFor(async () => {
      const response = await request(boundPort, '/healthz');
      assert.equal(response.status, 200);
      assert.equal(response.body.toString(), 'ready\n');
    }, `static health (${id}): ${logs(id)}`);
    assert.equal(inspect(id).Image, imageInfo.Id);
    return { id, port: boundPort };
  };

  try {
    // Docker 29 internal bridges suppress published ports. A dedicated bridge
    // plus explicit loopback bindings keeps every HTTP request local.
    docker('network', 'create', '--label', `auth-static-test=${network}`, network);
    networkCreated = true;
    docker('volume', 'create', '--label', `auth-static-test=${network}`, volume);
    volumeCreated = true;
    stager = ownContainer('create', '--network', 'none', '--mount', `type=volume,src=${volume},dst=/test-input`, apiImage);
    const audit = ownContainer('create', imageInfo.Id);
    if (fixtureMode) createFixture(audit);
    if (!fixtureMode) {
      expected = join(temp, 'expected');
      mkdirSync(expected);
      docker('cp', `${audit}:/srv/.`, expected);
    }

    await t.test('rootfs has static ELF binaries, CA/licenses and no backend/secrets/tooling', () => {
      const archive = command('docker', ['export', audit], { encoding: 'buffer' });
      const names = command('tar', ['-tf', '-'], { input: archive }).split('\n');
      for (const required of ['nginx', 'launcher', 'etc/nginx/mime.types', 'etc/ssl/certs/ca-certificates.crt', 'licenses/nginx-LICENSE', 'licenses/openssl-LICENSE.txt', 'licenses/rust-LICENSE-MIT']) assert.ok(names.includes(required), required);
      assert.ok(!names.some(name => /(^|\/)(?:\.env[^/]*|\.git|node_modules|server|server-rust|__migration|bin|sbin|lib|usr)(?:\/|$)/.test(name)), 'runtime must not include backend, secret, shell or dynamic loader trees');
      for (const binary of ['nginx', 'launcher']) {
        const path = join(temp, `elf-${binary}`);
        writeFileSync(path, command('tar', ['-xOf', '-', binary], { input: archive, encoding: 'buffer' }));
        assert.doesNotMatch(command('readelf', ['-l', path]), /INTERP/);
        assert.doesNotMatch(command('readelf', ['-d', path]), /NEEDED/);
      }
      if (!fixtureMode) {
        assert.ok(!names.includes('fixture/static-api.py'));
        assert.ok(!names.some(name => /(?:\.db|\.sqlite|\.pem|\.key)$/.test(name)));
      }
    });

    await t.test('launcher rejects absent/injectable env and forwards nginx -t without resolving backend', () => {
      for (const env of [[], ['API_UPSTREAM=http://user:pass@api-a'], ['API_UPSTREAM=http://api-a/path'], ['API_UPSTREAM=http://api-a\ninclude /tmp/x;'], ['API_UPSTREAM=http://api-a', 'PORT=65536']]) {
        const args = ['run', '--rm', ...hardening, '--network', network, ...mounts, ...env.flatMap(value => ['-e', value]), imageInfo.Id, '-t'];
        const result = spawnSync('docker', args, { cwd: root, encoding: 'utf8', timeout: 15_000 });
        assert.equal(result.status, 1, result.stderr);
        assert.match(result.stderr, /auth-static-launcher:/);
      }
      const config = docker('run', '--rm', ...hardening, '--network', network, ...mounts, '-e', 'API_UPSTREAM=https://not-running:8443', imageInfo.Id, 'nginx', '-T');
      assert.ok(config.includes('$request_uri'));
      assert.ok(config.includes('$encoding_suffix'));
      assert.ok(!config.includes('@@'));
    });

    const a = await startFrontend('http://api-a:8000');
    await t.test('static startup/deep links do not wait for an absent backend; unknown files stay 404', async () => {
      for (const route of routes) {
        const response = await request(a.port, route, { headers: { 'Accept-Encoding': 'identity' } });
        assert.equal(response.status, 200, route);
        assert.match(response.headers['content-type'], /^text\/html/);
        assert.equal(response.headers['cache-control'], 'no-cache');
        assert.doesNotMatch(response.body.toString(), /John Doe|john\.doe|__migration/);
        if (route !== '/') assert.equal((await request(a.port, `${route}/`)).status, 200);
      }
      for (const path of ['/no-such-page', '/no-such-file.js', '/index.html.br', '/apix', '/settings/unknown', '/__migration/login']) assert.equal((await request(a.port, path)).status, 404, path);
      const failedApi = await request(a.port, '/api/session');
      assert.equal(failedApi.status, 502);
      assert.ok(!failedApi.body.includes(Buffer.from('login-page')));
      assert.equal((await request(a.port, '/')).status, 200);
    });

    await startApi('A', 'api-a');
    await startApi('B', 'api-b');
    await waitFor(async () => assert.equal(JSON.parse((await request(a.port, '/api')).body).instance, 'A'), 'runtime DNS discovers newly started backend', 25_000);
    const b = await startFrontend('http://api-b:8000', { port: 19081 });

    await t.test('one immutable image switches A/B upstream and PORT with exact API forwarding', async () => {
      assert.equal(inspect(a.id).Image, inspect(b.id).Image);
      assert.equal(JSON.parse((await request(a.port, '/api')).body).instance, 'A');
      assert.equal(JSON.parse((await request(b.port, '/api')).body).instance, 'B');
      for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
        const target = '/api/echo%2Fitem//nested?x=a%2Fb&x=2&empty=';
        const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? Buffer.from(Array.from({ length: 80_000 }, (_, index) => index % 256)) : undefined;
        const response = await request(a.port, target, { method, body, headers: { Cookie: 'one=1; two=2', Authorization: 'Bearer fixture-only', ...(body ? { 'Content-Length': body.length, 'Content-Type': 'application/octet-stream' } : {}) } });
        assert.equal(response.status, 200);
        assert.equal(response.headers['x-fixture-method'], method);
        assert.equal(response.headers['x-fixture-target'], target);
        assert.equal(response.headers['set-cookie'].length, 2);
        assert.match(response.headers['set-cookie'][0], /^fixture_one=A;.*HttpOnly/);
        assert.match(response.headers['set-cookie'][1], /^fixture_two=second;.*Secure/);
        assert.equal(response.headers['cache-control'], 'no-store');
        if (method === 'HEAD') assert.equal(response.body.length, 0);
        else {
          const echo = JSON.parse(response.body);
          assert.equal(echo.method, method);
          assert.equal(echo.target, target);
          assert.equal(echo.cookie, 'one=1; two=2');
          assert.equal(echo.authorization, 'Bearer fixture-only');
          assert.equal(echo.bodyBase64, body?.toString('base64') || '');
        }
      }
      for (const status of [201, 302, 401, 403, 404, 418, 500, 503]) {
        const response = await request(a.port, `/api?status=${status}`);
        assert.equal(response.status, status);
        assert.match(response.headers['content-type'], /^application\/json/);
        assert.equal(JSON.parse(response.body).target, `/api?status=${status}`);
        if (status === 302) assert.equal(response.headers.location, '/api/next?keep=1');
      }
      const first = JSON.parse((await request(a.port, '/api/no-cache')).body);
      const second = JSON.parse((await request(a.port, '/api/no-cache')).body);
      assert.ok(second.sequence > first.sequence, 'API must never use a static/proxy cache');
      assert.deepEqual((await request(a.port, '/')).body, (await request(b.port, '/')).body);
      assert.match(docker('top', a.id, '-eo', 'pid,user,comm,args'), /nginx: master process/);
    });

    await t.test('real HTML/JS/CSS codecs, MIME, HEAD and validators round-trip', async () => {
      const files = filesBelow(expected);
      const samples = ['index.html', relative(expected, files.find(path => /_app\/immutable\/.*\.js$/.test(path))), relative(expected, files.find(path => /_app\/immutable\/.*\.css$/.test(path)))];
      for (const file of samples) {
        const original = readFileSync(join(expected, file));
        const uri = file === 'index.html' ? '/' : `/${file}`;
        const validators = new Set();
        for (const coding of ['identity', 'br', 'zstd', 'gzip', 'deflate']) {
          const headers = { 'Accept-Encoding': coding };
          const response = await request(a.port, uri, { headers });
          assert.equal(response.status, 200, `${uri} ${coding}`);
          assert.equal(response.headers['content-encoding'], coding === 'identity' ? undefined : coding);
          assert.match(response.headers.vary, /Accept-Encoding/i);
          assert.match(response.headers['content-type'], file.endsWith('.js') ? /^application\/javascript/ : file.endsWith('.css') ? /^text\/css/ : /^text\/html/);
          assert.equal(hash(decode(coding, response.body)), hash(original));
          if (coding === 'deflate') assert.throws(() => inflateRawSync(response.body));
          assert.ok(response.headers.etag);
          assert.ok(response.headers['last-modified']);
          validators.add(response.headers.etag);
          const head = await request(a.port, uri, { method: 'HEAD', headers });
          assert.equal(head.status, 200);
          assert.equal(head.body.length, 0);
          assert.equal(Number(head.headers['content-length']), response.body.length);
          assert.equal(head.headers.etag, response.headers.etag);
          for (const conditional of [{ 'If-None-Match': response.headers.etag }, { 'If-Modified-Since': response.headers['last-modified'] }]) {
            const cached = await request(a.port, uri, { headers: { ...headers, ...conditional } });
            assert.equal(cached.status, 304);
            assert.equal(cached.body.length, 0);
            assert.match(cached.headers.vary, /Accept-Encoding/i);
          }
          assert.equal(response.headers['cache-control'], file === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable');
        }
        assert.equal(validators.size, 5, 'representation validators must not alias');
        const gzip = await request(a.port, uri, { headers: { 'Accept-Encoding': 'gzip' } });
        assert.equal((await request(a.port, uri, { headers: { 'Accept-Encoding': 'br', 'If-None-Match': gzip.headers.etag } })).status, 200);
      }
    });

    await t.test('HTTP negotiation honors q=0, wildcard, identity and duplicate exclusions', async () => {
      const cases = [['br;q=0, gzip;q=1', 'gzip'], ['br;q=0, *;q=0.5', 'zstd'], ['*', 'br'], ['*;q=0, identity;q=1', undefined], ['GZIP;Q=0, BR;q=0.1', 'br'], ['br;q=0.000, br;q=1, deflate', 'deflate'], ['gzip;q=1, br;q=0.1', 'br'], ['', undefined]];
      const original = readFileSync(join(expected, 'index.html'));
      for (const [encoding, selected] of cases) {
        const response = await request(a.port, '/', { headers: { 'Accept-Encoding': encoding } });
        assert.equal(response.status, 200, encoding);
        assert.equal(response.headers['content-encoding'], selected, encoding);
        assert.equal(hash(decode(selected, response.body)), hash(original));
      }
      for (const encoding of ['*;q=0', 'identity;q=0', 'br;q=0,zstd;q=0,gzip;q=0,deflate;q=0,identity;q=0']) {
        const response = await request(a.port, '/', { headers: { 'Accept-Encoding': encoding } });
        assert.equal(response.status, 406, encoding);
        assert.match(response.headers.vary, /Accept-Encoding/i);
        assert.equal(response.headers['content-encoding'], undefined);
      }
    });

    await t.test('HTTPS upstream sends SNI, verifies trust/name and fails closed', async () => {
      const tls = join(temp, 'tls');
      mkdirSync(tls);
      command('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-subj', '/CN=Auth runtime test CA', '-addext', 'basicConstraints=critical,CA:TRUE', '-keyout', join(tls, 'ca.key'), '-out', join(tls, 'ca.crt')], { stdio: ['ignore', 'pipe', 'pipe'] });
      command('openssl', ['req', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=api-tls', '-keyout', join(tls, 'server.key'), '-out', join(tls, 'server.csr')], { stdio: ['ignore', 'pipe', 'pipe'] });
      writeFileSync(join(tls, 'server.ext'), 'subjectAltName=DNS:api-tls\nextendedKeyUsage=serverAuth\nkeyUsage=critical,digitalSignature,keyEncipherment\nbasicConstraints=critical,CA:FALSE\n');
      command('openssl', ['x509', '-req', '-days', '2', '-in', join(tls, 'server.csr'), '-CA', join(tls, 'ca.crt'), '-CAkey', join(tls, 'ca.key'), '-CAcreateserial', '-extfile', join(tls, 'server.ext'), '-out', join(tls, 'server.crt')], { stdio: ['ignore', 'pipe', 'pipe'] });
      chmodSync(join(tls, 'server.key'), 0o644); // Public, ephemeral fixture key; UID 101 must read it.
      stageDirectory(tls, 'tls');
      const ca = join(temp, 'ca');
      mkdirSync(ca);
      writeFileSync(join(ca, 'ca-certificates.crt'), readFileSync(join(tls, 'ca.crt')));
      stageDirectory(ca, 'ca');
      await startApi('TLS', 'api-tls', ['--cert', '/tls/server.crt', '--key', '/tls/server.key']);
      const trusted = await startFrontend('https://api-tls:8443', { ca: true });
      const response = await request(trusted.port, '/api/tls?keep=1');
      assert.equal(response.status, 200, logs(trusted.id));
      assert.equal(JSON.parse(response.body).sni, 'api-tls');
      const untrusted = await startFrontend('https://api-tls:8443');
      const mismatch = await startFrontend('https://wrong-name:8443', { ca: true });
      for (const frontend of [untrusted, mismatch]) {
        assert.equal((await request(frontend.port, '/api/session')).status, 502);
        assert.equal((await request(frontend.port, '/')).status, 200);
        assert.match(logs(frontend.id), /certificate.*(?:verify|match)/i);
      }
    });
  } finally {
    for (const id of containers.reverse()) {
      try { docker('rm', '-f', id); } catch (error) { t.diagnostic(`cleanup container ${id}: ${error.message}`); }
    }
    if (networkCreated) {
      try { docker('network', 'rm', network); } catch (error) { t.diagnostic(`cleanup network ${network}: ${error.message}`); }
    }
    if (volumeCreated) {
      try { docker('volume', 'rm', volume); } catch (error) { t.diagnostic(`cleanup volume ${volume}: ${error.message}`); }
    }
    rmSync(temp, { recursive: true, force: true });
  }
});
