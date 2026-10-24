// GitHub CI only: concise, safely escaped npm audit diagnostics.
// This script never changes audit thresholds or dependency resolutions.
import { readFileSync } from 'node:fs';

export function summarizeAudit(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error('Audit output is not a JSON object');
  }
  if (!report.vulnerabilities || typeof report.vulnerabilities !== 'object' ||
      Array.isArray(report.vulnerabilities)) {
    const reason = typeof report.error?.summary === 'string'
      ? report.error.summary : 'Registry returned no vulnerabilities map';
    throw new Error('npm audit output invalid or registry unavailable: ' + reason.slice(0, 180));
  }
  const counts = report.metadata?.vulnerabilities ?? {};
  const entries = Object.entries(report.vulnerabilities)
    .filter(([, info]) => info && ['moderate', 'high', 'critical'].includes(info.severity))
    .sort(([a], [b]) => a.localeCompare(b));
  const result = [
    'Dependency audit results: ' + ['critical', 'high', 'moderate', 'low']
      .map(severity => severity + '=' + (counts[severity] ?? '?')).join(', '),
    'Moderate-or-higher affected packages: ' + entries.length,
  ];
  for (const [name, info] of entries) {
    const advisory = (Array.isArray(info.via) ? info.via : [])
      .filter(v => v && typeof v === 'object')
      .map(v => String(v.url ?? ''))
      .filter(x => /^https:\/\/(?:github\.com|www\.npmjs\.com|osv\.dev)\//.test(x))
      .slice(0, 3);
    const fix = info.fixAvailable === false
      ? 'none indicated'
      : info.fixAvailable === true ? 'automatic'
      : info.fixAvailable && typeof info.fixAvailable === 'object'
        ? 'upgrade ' + String(info.fixAvailable.name ?? '').slice(0, 80) +
          '@' + String(info.fixAvailable.version ?? '').slice(0, 50) +
          (info.fixAvailable.isSemVerMajor ? ' (major)' : '')
        : 'unknown';
    result.push([
      String(name).replace(/[\r\n:]/g, '').slice(0, 100),
      String(info.severity).slice(0, 20),
      'range ' + String(info.range ?? '?').replace(/[\r\n]/g, ' ').slice(0, 100),
      'fix ' + fix,
      advisory.join(', '),
    ].filter(Boolean).join(' | '));
  }
  return result;
}

if (process.argv[1]?.endsWith('/report-dependency-audit.mjs')) {
  try {
    const data = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    for (const line of summarizeAudit(data)) console.log(line);
  } catch (error) {
    console.error('Dependency audit diagnostics unavailable:', String(error).slice(0, 300));
    process.exitCode = 1; // fail closed if registry output is malformed
  }
}
