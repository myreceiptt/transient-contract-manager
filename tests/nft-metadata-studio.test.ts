import { describe, expect, it } from 'vitest';
import { nftMetadataSchema, validatedMetadata } from '../src/lib/nft-metadata';

const GO1_URI = 'ipfs://bafybeicycur6535m3r2lktirmxh4jaghvrwzbbymztz7my5bz2srkhmlbi/0';

describe('NFT metadata Studio contract', () => {
  it('creates standards-compatible pinned metadata with safe image and attributes', () => {
    const original = { name: 'Pancasila vs Pancakaki', description: 'A work of art.',
      image: GO1_URI, attributes: [{ trait_type: 'Artist', value: 'A creative' }],
      external_url: 'https://example.com' };
    const result = validatedMetadata(original);
    expect(result.metadata).toEqual(original);
    expect(JSON.parse(new TextDecoder().decode(result.bytes))).toEqual(original);
  });
  it('requires a pinned IPFS image, not arbitrary HTTPS or executable content', () => {
    for (const image of [
      '', 'https://evil.invalid/a.png', 'javascript:alert(1)',
      'ipfs://CID/../bad', 'ipfs://CID/%2e%2e/bad',
    ]) {
      expect(nftMetadataSchema.safeParse({
        name: 'Example', description: '', image, attributes: [],
      }).success).toBe(false);
    }
  });
  it('rejects unbounded attributes, unsafe external URLs and prototype-like extra keys', () => {
    const base = { name: 'Example', description: '', image: GO1_URI, attributes: [] };
    expect(nftMetadataSchema.safeParse({ ...base, attributes: Array(41).fill({ trait_type: 'X', value: 'Y' }) }).success).toBe(false);
    expect(nftMetadataSchema.safeParse({ ...base, external_url: 'file:///etc/passwd' }).success).toBe(false);
    expect(nftMetadataSchema.safeParse({ ...base, image_url_html: '<svg>' }).success).toBe(false);
  });
  it('rejects metadata payloads larger than the server-defined 24 KiB maximum', () => {
    const payload = { name: 'A', description: 'x'.repeat(6000), image: GO1_URI,
      attributes: Array(40).fill({trait_type:'trait'.repeat(20),value:'x'.repeat(250)}) };
    expect(() => validatedMetadata(payload)).toThrow(/24 KiB/);
  });
});
