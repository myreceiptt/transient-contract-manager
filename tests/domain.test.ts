import { describe, it, expect } from 'vitest';
import { zeroAddress, parseEther } from 'viem';
import {
  dropPhase,
  mintable,
  quote,
  configFingerprint,
  verifyProof,
  presaleLeaf,
  dropSchema,
  isSafeUrl,
  type Drop,
} from '../src/lib/domain';
import { mediaTarget, rasterType } from '../src/server/media';
import { nextDropCall } from '../src/server/transactions';
const nft = '0x1111111111111111111111111111111111111111',
  stacks = '0x2222222222222222222222222222222222222222';
const d: Drop = {
  dropType: 1,
  payoutReceiver: nft,
  initialSupply: 20n,
  supply: 12n,
  allowance: 5n,
  currencyAddress: zeroAddress,
  startTime: 100n,
  presaleDuration: 10n,
  publicDuration: 20n,
  presaleCost: 1n,
  publicCost: 2n,
  presaleMerkleRoot: '0x' + '0'.repeat(64),
  decayRate: 0n,
};
describe('Protocol boundary semantics', () => {
  it('uses half-open phase boundaries and ends when sold out', () => {
    expect([99n, 100n, 109n, 110n, 129n, 130n].map((t) => dropPhase(d, t))).toEqual([
      1, 2, 2, 3, 3, 4,
    ]);
    expect(dropPhase({ ...d, supply: 0n }, 110n)).toBe(4);
    expect(dropPhase({ ...d, payoutReceiver: zeroAddress }, 110n)).toBe(0);
  });
  it('counts prior presale and public purchases against the same recipient allowance', () => {
    expect(mintable(d, 4n)).toBe(1n);
    expect(mintable(d, 5n)).toBe(0n);
    expect(mintable({ ...d, supply: 1n }, 0n)).toBe(1n);
    expect(mintable(d, 0n, 0n)).toBe(0n);
  });
  it('charges native protocol fee for both ETH and ERC20 purchases', () => {
    expect(quote(d, 3n, 9n, 3)).toEqual({ price: 6n, protocolFee: 27n, value: 33n });
    expect(quote({ ...d, currencyAddress: nft }, 3n, 9n, 2)).toEqual({
      price: 3n,
      protocolFee: 27n,
      value: 27n,
    });
  });
  it('does not treat normal supply depletion as configuration drift', () => {
    expect(configFingerprint(d)).toBe(configFingerprint({ ...d, supply: 3n }));
    expect(configFingerprint(d)).not.toBe(configFingerprint({ ...d, allowance: 4n }));
  });
  it('binds presale proof to recipient and allowance', () => {
    const root = presaleLeaf(nft, 3n);
    expect(verifyProof(root, [], root)).toBe(true);
    expect(verifyProof(presaleLeaf(nft, 4n), [], root)).toBe(false);
    expect(verifyProof(presaleLeaf(stacks, 3n), [], root)).toBe(false);
  });
  it('rejects allocation changes on an active drop', () => {
    expect(() => nextDropCall(nft, 1n, stacks, d, { ...d, initialSupply: 21n }, 3)).toThrow(
      /allocation/,
    );
    expect(
      nextDropCall(nft, 1n, stacks, d, { ...d, initialSupply: 21n, supply: 21n }, 4)?.functionName,
    ).toBe('configureDrop');
  });
  it('prepares exactly one reviewed delta at a time', () => {
    expect(
      nextDropCall(nft, 1n, stacks, d, { ...d, payoutReceiver: stacks, allowance: 8n }, 3)
        ?.functionName,
    ).toBe('updateDropPayoutReceiver');
    expect(nextDropCall(nft, 1n, stacks, d, { ...d, startTime: 200n }, 3)?.args).toEqual([
      nft,
      1n,
      200n,
      10n,
      20n,
    ]);
    expect(nextDropCall(nft, 1n, stacks, d, d, 3)).toBeNull();
  });
});
describe('Untrusted media boundaries', () => {
  it('blocks script URLs, local hosts, userinfo, unapproved hosts and redirects by policy', () => {
    for (const uri of [
      'javascript:alert(1)',
      'data:text/html,hi',
      'https://localhost/a',
      'https://u:p@ipfs.io/a',
    ])
      expect(isSafeUrl(uri)).toBe(false);
    for (const uri of [
      'https://evil.example/a',
      'https://ipfs.io:9000/ipfs/a',
      'https://ipfs.io/admin',
      'ipfs://abc/../admin',
    ])
      expect(() => mediaTarget(uri)).toThrow();
  });
  it('rejects SVG and HTML even if the extension claims to be a PNG', () => {
    expect(() => rasterType(Buffer.from('<svg onload="alert(1)"></svg>'))).toThrow();
    expect(() => rasterType(Buffer.from('<!DOCTYPE html>'))).toThrow();
    expect(rasterType(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe('image/png');
  });
});
