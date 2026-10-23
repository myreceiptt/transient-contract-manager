import { describe, expect, it } from 'vitest';
import { validUploadCid } from '../src/server/upload-cid';

describe('Pinata upload CID validation', () => {
  it('accepts canonical raw and dag-pb SHA-256 CIDv1', () => {
    expect(validUploadCid('bafkreicnu2aqjkoglrlrd65giwo4l64pdajxffk6jtq2vb7yaiopc3yu7m')).toBe(true);
    expect(validUploadCid('bafybeicycur6535m3r2lktirmxh4jaghvrwzbbymztz7my5bz2srkhmlbi')).toBe(true);
  });
  it.each(['bafknotarealcid','bafkreiii','bafy..evil','ipfs://bafkreicnu2aqjkoglrlrd65giwo4l64pdajxffk6jtq2vb7yaiopc3yu7m','',null,42])('rejects malformed CID %s', (value) => {
    expect(validUploadCid(value)).toBe(false);
  });
});
