import { describe, expect, it } from 'vitest';
import { summarizeAudit } from '../scripts/report-dependency-audit.mjs';

describe('npm audit diagnostics', () => {
  it('reports fixable advisories while retaining the severity and affected range', () => {
    const lines = summarizeAudit({
      metadata: { vulnerabilities: { critical: 0, high: 1, moderate: 0, low: 0 } },
      vulnerabilities: {
        demo: {
          severity: 'high', range: '<2.0.0',
          fixAvailable: { name: 'demo', version: '2.0.0', isSemVerMajor: true },
          via: [{ url: 'https://github.com/advisories/GHSA-xxxx-xxxx-xxxx' }],
        },
      },
    });
    expect(lines.join(' ')).toContain('demo | high | range <2.0.0');
    expect(lines.join(' ')).toContain('upgrade demo@2.0.0 (major)');
    expect(lines.join(' ')).toContain('github.com/advisories');
  });
  it('does not interpret registry errors or incomplete JSON as a clean audit', () => {
    expect(() => summarizeAudit({ error: { summary: 'registry unavailable' } }))
      .toThrow(/registry unavailable/);
    expect(() => summarizeAudit(null)).toThrow();
  });
  it('excludes low severities from threshold-matching package summaries', () => {
    const lines = summarizeAudit({
      metadata: { vulnerabilities: { low: 1, moderate: 0, high: 0, critical: 0 } },
      vulnerabilities: {
        harmless: { severity: 'low', range: '*', fixAvailable: false, via: [] },
      },
    });
    expect(lines.join(' ')).not.toContain('harmless |');
  });
});
