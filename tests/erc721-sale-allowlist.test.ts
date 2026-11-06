import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {prepareOneWalletPresale,verifyOneWalletPresaleFile,singleWalletPresaleRoot} from '../src/lib/erc721-sale-allowlist';

const collection='0x99b8ae3c16559b80424a45c92dd530d50d970a46';
const recipient='0x0000000000000000000000000000000000000001';
describe('TLStacks721 v2.3.1 single recipient Merkle presale (off-chain)',()=>{
  it('matches independently computed Solidity double-hash and empty proof vector',()=>{
    const r=singleWalletPresaleRoot(recipient);
    expect(r.merkleRoot).toBe('0x1b90c1ff31eca8aace246b20102ca9eae0a997cd7008de3ab4a861e761462d92');
    expect(r.merkleProof).toEqual([]);
  });
  it('binds one recipient to 3 free NFT allowance and the intended mainnet collection',()=>{
    const r=prepareOneWalletPresale(recipient,1,collection);
    expect(r).toMatchObject({recipient,presaleSupply:3,presaleNumberCanMint:3,
      presaleCostEth:'0',allowedRecipientCount:1,merkleProof:[],
      status:'OFFCHAIN_PREPARATION_ONLY'});
    expect(verifyOneWalletPresaleFile(r,1,collection)).toEqual(r);
  });
  it('rejects mismatched Merkle roots, allowance, phase, contract and chain',()=>{
    const r=prepareOneWalletPresale(recipient,1,collection);
    expect(()=>verifyOneWalletPresaleFile({...r,merkleRoot:'0x'+'00'.repeat(32)},1,collection))
      .toThrow('Merkle root mismatch');
    expect(()=>verifyOneWalletPresaleFile({...r,presaleNumberCanMint:4},1,collection))
      .toThrow('3-NFT');
    expect(()=>verifyOneWalletPresaleFile({...r,merkleProof:['0x12']},1,collection))
      .toThrow('3-NFT');
    expect(()=>verifyOneWalletPresaleFile(r,1,'0x0000000000000000000000000000000000000002'))
      .toThrow('3-NFT');
    expect(()=>verifyOneWalletPresaleFile(r,8453,collection)).toThrow('3-NFT');
    expect(()=>singleWalletPresaleRoot(recipient,2)).toThrow('exactly 3');
  });
  it('does not expose wallet transactions or write API in whitelist preparation UI',()=>{
    const ui=readFileSync('src/components/erc721-sale-preparation.tsx','utf8');
    const lib=readFileSync('src/lib/erc721-sale-allowlist.ts','utf8');
    expect(ui).toContain('prepareOneWalletPresale');
    expect(ui).toContain('verifyOneWalletPresaleFile');
    expect(ui).toContain('presaleMerkleRoot:presale.merkleRoot');
    expect(ui).not.toContain('sendTransaction');
    expect(lib).not.toContain('writeContract');
    expect(lib).not.toContain('sendTransaction');
  });
});