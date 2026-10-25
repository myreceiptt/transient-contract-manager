import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import manifest from '../docs/branding/asset-manifest.json';

const root = process.cwd();
const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

describe('Public Prof. NOTA brand assets', () => {
  it('keeps all five owner-supplied PNG files identical to their recorded originals', () => {
    expect(manifest.status).toBe('VERIFIED_IN_MAIN');
    expect(manifest.assets).toHaveLength(5);
    for (const entry of manifest.assets) {
      expect(entry.path.startsWith('public/brand/prof-nota/')).toBe(true);
      const bytes = readFileSync(path.join(root, entry.path));
      expect(bytes.length).toBe(entry.bytes);
      expect(bytes.subarray(0, 8)).toEqual(pngHeader);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
    }
  });
  it('only references local static brand images in the UI and site metadata', () => {
    const shell = readFileSync(path.join(root, 'src/components/shell.tsx'), 'utf8');
    const home = readFileSync(path.join(root, 'src/components/contract-entry.tsx'), 'utf8');
    const layout = readFileSync(path.join(root, 'src/app/layout.tsx'), 'utf8');
    for (const image of ['1.47.png', '1.48.png', 'prof-nota-typhography-2.png']) {
      expect(shell).toContain('/brand/prof-nota/' + image);
    }
    for (const image of ['beware-of-scams.png', 'prof-nota-typhography-1.png']) {
      expect(home).toContain('/brand/prof-nota/' + image);
    }
    expect(layout).toContain('/brand/prof-nota/1.47.png');
    expect(shell).toContain('Not operated by Transient Labs.');
  });
});
