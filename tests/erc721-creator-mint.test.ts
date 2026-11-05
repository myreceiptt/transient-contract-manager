import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { encodeEventTopics, zeroAddress } from 'viem';
import { erc721CreatorAbi } from '../src/lib/erc721-creator';
import {
  approvalKey,
  creatorSigningAllowed,
  creatorMintInput,
  localCreatorExecution,
  verifyCreatorMetadata,
  mintedTokenFromReceipt,
  assertMintTransaction,
} from '../src/server/erc721-creator-mint';

const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
});
const actor = '0x1111111111111111111111111111111111111111';
const recipient = '0x2222222222222222222222222222222222222222';
const contract = '0x3333333333333333333333333333333333333333';
const tx = { chainId: 1, account: actor, to: contract, data: '0x1234', nonce: 3, value: '0' };
function permission() {
  process.env.MAINNET_WRITES_ENABLED = 'true';
  delete process.env.VERCEL_ENV;
  process.env.ERC721_MINT_APPROVAL = JSON.stringify({
    key: approvalKey(tx),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    maxNetworkFeeWei: '1000000000000000',
  });
}
describe('isolated ERC721 execution permission', () => {
  it('does not inherit GO1 or draft approval', () => {
    process.env.MAINNET_WRITES_ENABLED = 'true';
    process.env.ERC721_DRAFTS_ENABLED = 'true';
    delete process.env.ERC721_MINT_APPROVAL;
    expect(creatorSigningAllowed(tx)).toBe(false);
  });
  it('requires exact calldata, wallet, nonce, chain and zero value', () => {
    permission();
    expect(creatorSigningAllowed(tx)).toBe(true);
    for (const change of [
      { data: '0x1235' },
      { account: recipient },
      { to: recipient },
      { nonce: 4 },
      { chainId: 8453 },
      { value: '1' },
    ])
      expect(creatorSigningAllowed({ ...tx, ...change })).toBe(false);
  });
  it('blocks preview, expired and overlong approvals', () => {
    permission();
    process.env.VERCEL_ENV = 'preview';
    expect(creatorSigningAllowed(tx)).toBe(false);
    delete process.env.VERCEL_ENV;
    for (const time of [Date.now() - 1, Date.now() + 2 * 86400000]) {
      process.env.ERC721_MINT_APPROVAL = JSON.stringify({
        key: approvalKey(tx),
        expiresAt: new Date(time).toISOString(),
        maxNetworkFeeWei: '100',
      });
      expect(creatorSigningAllowed(tx)).toBe(false);
    }
  });
  it('rejects malformed approvals', () => {
    for (const value of ['', 'true', '{}', '{"key":"x"}']) {
      process.env.ERC721_MINT_APPROVAL = value;
      expect(creatorSigningAllowed(tx)).toBe(false);
    }
  });
  it('allows local transactions only on loopback outside hosted environments', () => {
    vi.stubEnv('NODE_ENV', 'test');
    process.env.LOCAL_CHAIN_ENABLED = 'true';
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    process.env.LOCAL_RPC_URL = 'http://127.0.0.1:8545';
    expect(localCreatorExecution(31337)).toBe(true);
    process.env.LOCAL_RPC_URL = 'https://example.com';
    expect(localCreatorExecution(31337)).toBe(false);
    process.env.LOCAL_RPC_URL = 'http://127.0.0.1:8545';
    process.env.VERCEL = '1';
    expect(localCreatorExecution(31337)).toBe(false);
    delete process.env.VERCEL;
    vi.stubEnv('NODE_ENV', 'production');
    expect(localCreatorExecution(31337)).toBe(false);
  });
});
export function rawCid(bytes: Buffer) {
  const data = Buffer.concat([
    Buffer.from([1, 85, 18, 32]),
    createHash('sha256').update(bytes).digest(),
  ]);
  let acc = 0,
    bits = 0,
    result = 'b';
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  for (const byte of data) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += alphabet[(acc >> bits) & 31];
      acc &= (1 << bits) - 1;
    }
  }
  if (bits) result += alphabet[(acc << (5 - bits)) & 31];
  return result;
}
describe('creator metadata and receipt integrity', () => {
  const bytes = Buffer.from(
    JSON.stringify({
      name: 'Local fixture',
      description: 'Test only',
      image: 'ipfs://bafybeicrfkcsgbcxbkk6ica3al4k4ykxivdccw3issjqjipw3aepit5bhm',
      attributes: [],
    }),
  );
  const uri = 'ipfs://' + rawCid(bytes);
  it('verifies exact raw CID bytes and refuses substituted JSON', () => {
    expect(verifyCreatorMetadata(uri, bytes).metadata.name).toBe('Local fixture');
    expect(() => verifyCreatorMetadata(uri, Buffer.from('{}'))).toThrow(/do not match/);
  });
  it('rejects zero recipients and unsupported URI formats', () => {
    expect(() => creatorMintInput.parse({ recipient: zeroAddress, uri })).toThrow();
    for (const value of ['https://example.com/a.json', uri + '/1.json', uri + ' '])
      expect(() => creatorMintInput.parse({ recipient, uri: value })).toThrow();
  });
  const mintLog = {
    address: contract,
    data: '0x',
    topics: encodeEventTopics({
      abi: erc721CreatorAbi,
      eventName: 'Transfer',
      args: { from: zeroAddress, to: recipient, tokenId: 47n },
    }),
  };
  it('uses the unique Transfer mint event instead of a supply counter', () => {
    expect(mintedTokenFromReceipt(contract, recipient, [mintLog])).toBe(47n);
    expect(() => mintedTokenFromReceipt(contract, recipient, [])).toThrow();
    expect(() => mintedTokenFromReceipt(contract, recipient, [mintLog, mintLog])).toThrow();
    expect(() => mintedTokenFromReceipt(contract, actor, [mintLog])).toThrow();
    expect(() => mintedTokenFromReceipt(actor, recipient, [mintLog])).toThrow();
  });
  it('rejects unrelated or altered transaction hashes before receipt confirmation', () => {
    const intent = { actor, contract, chain_id: 1, payload: { tx } };
    const actual = { from: actor, to: contract, input: tx.data, value: 0n, nonce: 3, chainId: 1 };
    expect(() => assertMintTransaction(intent, actual)).not.toThrow();
    for (const changes of [
      { from: recipient },
      { to: recipient },
      { input: '0x5678' },
      { value: 1n },
      { nonce: 4 },
      { chainId: 31337 },
    ])
      expect(() => assertMintTransaction(intent, { ...actual, ...changes })).toThrow();
  });
});
