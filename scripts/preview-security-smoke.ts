import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Production build, loopback HTTP transport, synthetic canonical HTTPS Host.
// No database credentials, wallet, external RPC or deployed resource is used.
const host = 'preview-security.example',
  port = 13031;
const env: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: 'production',
  APP_ORIGIN: `https://${host}`,
  VERCEL: '1',
  VERCEL_ENV: 'preview',
  SUPABASE_URL: '',
  SUPABASE_SERVICE_ROLE_KEY: '',
  MAINNET_WRITES_ENABLED: 'false',
  LOCAL_CHAIN_ENABLED: 'false',
  NEXT_PUBLIC_LOCAL_CHAIN_ENABLED: 'false',
};
const server = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)],
  { env, stdio: ['ignore', 'pipe', 'pipe'] },
);
let log = '';
server.stdout.on('data', (b) => {
  log += b.toString();
});
server.stderr.on('data', (b) => {
  log += b.toString();
});
const results: { check: string; status: string }[] = [];
const get = (path: string, init: RequestInit = {}) =>
  new Promise<Response>((resolve, reject) => {
    // node:http retains the test Host header; Node fetch normalizes it to the URL.
    const r = request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: init.method || 'GET',
        agent: false,
        headers: { host, ...(init.headers as Record<string, string>) },
        signal: AbortSignal.timeout(10000),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () => {
          const headers = new Headers();
          for (const [key, value] of Object.entries(res.headers))
            if (value !== undefined)
              headers.set(key, Array.isArray(value) ? value.join(', ') : value);
          resolve(new Response(Buffer.concat(chunks), { status: res.statusCode!, headers }));
        });
      },
    );
    r.on('error', reject);
    r.end(init.body as string | undefined);
  });
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await get('/api')).ok) {
        ready = true;
        break;
      }
    } catch {}
    if (server.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'Local production server did not start');
  let previousNonce = '';
  for (const path of ['/', '/checker', '/guide', '/manage', '/mint/unpublished-page', '/']) {
    const response = await get(path),
      html = await response.text();
    assert.equal(response.status, 200, path);
    const csp = response.headers.get('content-security-policy') || '';
    const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
    assert.ok(nonce, 'Missing CSP nonce');
    assert.notEqual(nonce, previousNonce);
    previousNonce = nonce;
    const scriptDirective = csp.split(';').find((x) => x.trim().startsWith('script-src '))!;
    assert.ok(
      !scriptDirective.includes('unsafe-inline') && !scriptDirective.includes('unsafe-eval'),
    );
    assert.ok(response.headers.get('cache-control')?.includes('no-store'));
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000');
    const scripts = [...html.matchAll(/<script\b([^>]*)>/g)];
    assert.ok(scripts.length > 0, 'No rendered scripts found');
    for (const [, attrs] of scripts)
      assert.ok(attrs.includes(`nonce="${nonce}"`), 'Rendered script lacks matching nonce');
    results.push({
      check: `${path}: production nonce, script attributes, cache and security headers`,
      status: 'PASS',
    });
  }
  assert.equal((await get('/', { headers: { host: 'evil.example' } })).status, 403);
  const denied = await get('/api', {
    method: 'POST',
    headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
    body: '{"op":"challenge"}',
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('cache-control'), 'no-store');
  const health = await (await get('/api')).json();
  assert.equal(health.mainnetWrites, false);
  assert.deepEqual(health.networkWritePermissions, {
    1: false,
    360: false,
    4663: false,
    8453: false,
  });
  results.push({ check: 'Host/Origin rejection and four disabled network gates', status: 'PASS' });
  console.log(JSON.stringify(results, null, 2));
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  server.kill('SIGTERM');
  await mkdir('artifacts/ci', { recursive: true });
  await writeFile(
    'artifacts/ci/preview-http.json',
    JSON.stringify({ at: new Date().toISOString(), results, success: !process.exitCode }, null, 2),
  );
  await writeFile('artifacts/ci/preview-http-server.txt', log);
}
