import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const guide = readFileSync('src/app/guide/page.tsx', 'utf8');
const handbook = readFileSync('docs/USER_GUIDE.md', 'utf8');

describe('Complete in-app creator guide', () => {
  it('includes every working step in navigable, uniquely identified sections', () => {
    const required = [
      'start', 'connect', 'overview', 'metadata', 'tokens', 'eligibility',
      'draft', 'publish', 'lifecycle', 'transactions', 'collector', 'networks',
      'troubleshooting',
    ];
    for (const id of required) {
      expect(guide).toContain("['" + id + "',");
      expect(guide).toContain('id="' + id + '"');
    }
    expect((guide.match(/className="panel guide-section"/g) || []).length).toBe(required.length);
    expect(guide).toContain('aria-label="Guide contents"');
  });
  it('documents current collection UI and verified adapters', () => {
    for (const name of [
      'Start managing', 'Contract Checker', 'NFT Metadata &amp; Edition Studio',
      'Pin metadata JSON to IPFS', 'Create token ID', 'Mint existing token / airdrop',
      'Create multiple token IDs', 'Tokens &amp; Editions', 'Collection Settings',
      'Save revision', 'Prepare publication', 'Check confirmation',
    ]) expect(guide).toContain(name);
    expect(guide).toContain('targetChains.map');
    expect(guide).toContain('TLStacks1155 v2.3.1');
    expect(guide).toContain('ERC1155TL v4.1.2');
  });
  it('explains cross-app closing without promising private Lab page synchronization', () => {
    for (const phrase of [
      'Ended is not Closed',
      'The Lab',
      'Review close',
      'Prepare closeDrop wallet review',
      'NOT_CONFIGURED',
      'Restore',
      'HTTP 308',
      'Edit URL',
      'SUBMITTED',
      'PUBLISHING',
      'Public duration (seconds)',
      'Start (UTC)',
      'collector',
      'not',
    ]) expect(guide).toContain(phrase);
    expect(handbook).toContain('Ended is not Closed');
    expect(handbook).toContain('does not burn');
    expect(handbook).toContain('HTTP 308');
  });
  it('does not claim all mainnet writes are permanently disabled', () => {
    expect(guide).not.toContain('Runtime verified; mainnet writes locked by default');
    expect(handbook).not.toContain('Mainnet writes are intentionally locked in this development release');
  });
});
