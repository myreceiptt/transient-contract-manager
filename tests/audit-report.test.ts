import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function run(report: unknown) {
  const dir = mkdtempSync(join(tmpdir(), 'tcm-audit-test-'));
  const file = join(dir, 'audit.json');
  try {
    writeFileSync(file, JSON.stringify(report));
    return spawnSync(process.execPath, [
      resolve(process.cwd(), 'scripts/report-dependency-audit.mjs'), file,
    ], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('npm audit diagnostics', () => {
  it('reports fixable advisories while retaining severity and range', () => {
    const r = run({
      metadata: { vulnerabilities: { critical: 0, high: 1, moderate: 0, low: 0 } },
      vulnerabilities: {
        demo: {
          severity: 'high', range: '<2.0.0',
          fixAvailable: { name: 'demo', version: '2.0.0', isSemVerMajor: true },
          via: [{ url: 'https://github.com/advisories/GHSA-xxxx-xxxx-xxxx' }],
        },
      },
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('demo | high | range <2.0.0');
    expect(r.stdout).toContain('upgrade demo@2.0.0 (major)');
    expect(r.stdout).toContain('github.com/advisories');
  });
  it('fails closed on registry errors rather than treating them as a clean audit', () => {
    const r = run({ error: { summary: 'registry unavailable' } });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('registry unavailable');
  });
  it('shows only moderate-or-higher packages as actionable items', () => {
    const r = run({
      metadata: { vulnerabilities: { low: 1, moderate: 0, high: 0, critical: 0 } },
      vulnerabilities: {
        harmless: { severity: 'low', range: '*', fixAvailable: false, via: [] },
      },
    });
    expect(r.status).toBe(0);
    expect(r.stdout).not.toContain('harmless |');
  });
});
