import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
// Run against an already-started application; never owns or replaces the preview server.
const base = process.env.SMOKE_ORIGIN || 'http://localhost:3000';
const log = 'Start the application before running this check';
const results: any[] = [];
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + '/api')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(ready, log);
  for (const path of ['/', '/checker', '/guide', '/manage', '/mint/unpublished-page']) {
    const r = await fetch(base + path);
    const html = await r.text();
    assert.equal(r.status, 200);
    assert.ok(html.includes('Transient') || html.includes('transient'));
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    results.push({ path, status: r.status, securityHeaders: true, bytes: html.length });
  }
  const health = await (await fetch(base + '/api')).json();
  assert.equal(health.mainnetWrites, false);
  const req = await fetch(base + '/api', {
    method: 'POST',
    headers: { origin: base, 'content-type': 'application/json' },
    body: JSON.stringify({ op: 'session' }),
  });
  assert.ok([401, 503].includes(req.status));
  results.push({ check: 'Unauthenticated session rejected', status: req.status });
  console.log(JSON.stringify(results, null, 2));
  await writeFile(
    'docs/evidence/http-smoke.json',
    JSON.stringify({ at: new Date().toISOString(), results }, null, 2),
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
}
