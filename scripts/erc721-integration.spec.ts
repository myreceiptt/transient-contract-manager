import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFile, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  zeroAddress,
  parseAbi,
  type Address,
  type Hex,
} from 'viem';
import { NextRequest } from 'next/server';
import { localChain, ADMIN_ROLE } from '../src/lib/chains';
import { erc721Creator } from '../src/lib/erc721-creator';

// Only IPFS transport is a fixture. The exact JSON digest is checked by production code.
// RPC, contracts, roles, SIWE, CSRF, API handlers, persistence and receipt readbacks are real.
const bytes = Buffer.from(
  JSON.stringify({
    name: 'Isolated creator mint',
    description: 'Disposable fork test',
    image: 'ipfs://bafybeicrfkcsgbcxbkk6ica3al4k4ykxivdccw3issjqjipw3aepit5bhm',
    attributes: [],
  }),
);
function cid(data: Buffer) {
  let bits = 0,
    acc = 0,
    result = 'b';
  for (const byte of Buffer.concat([
    Buffer.from([1, 85, 18, 32]),
    createHash('sha256').update(data).digest(),
  ])) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += 'abcdefghijklmnopqrstuvwxyz234567'[(acc >> bits) & 31];
      acc &= (1 << bits) - 1;
    }
  }
  if (bits) result += 'abcdefghijklmnopqrstuvwxyz234567'[(acc << (5 - bits)) & 31];
  return result;
}
const uri = 'ipfs://' + cid(bytes);
vi.mock('../src/server/media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/server/media')>()),
  fetchMediaWithFallback: vi.fn(async (value: string) => {
    if (value !== uri) throw new Error('Unexpected test metadata URI');
    return bytes;
  }),
}));
const fork = process.env.TCM_ERC721_FORK === '1';
const forkBlock = Number(process.env.TCM_FORK_BLOCK || '26350623');
const port = fork ? 18548 : 18547,
  rpc = 'http://127.0.0.1:' + port;
const c = createPublicClient({
  chain: localChain,
  transport: http(rpc, { retryCount: 0, timeout: 15000 }),
});
const w = createWalletClient({
  chain: localChain,
  transport: http(rpc, { retryCount: 0, timeout: 15000 }),
});
let anvil: ChildProcess,
  owner: Address,
  admin: Address,
  apiActor: Address,
  outsider: Address,
  recipient: Address,
  contract: Address;
let mint: typeof import('../src/server/erc721-creator-mint'),
  db: any,
  POST: typeof import('../src/app/api/route').POST;
let fullAbi: any,
  report: Record<string, unknown> = {
    mode: fork ? 'PINNED_MAINNET_FORK' : 'LOCAL_EXACT_CONTRACTS',
    forkBlock: fork ? forkBlock : null,
    chainId: 31337,
    mainnetWrites: false,
    ipfsTransport: 'fixed digest-checked fixture',
    receipts: [],
  };
const rpcCall = (method: string, params: any[] = []) =>
  c.request({ method, params } as any) as Promise<any>;
async function write(account: Address, fn: string, args: any[] = []) {
  const hash = await w.writeContract({
    account,
    address: contract,
    abi: fullAbi,
    functionName: fn,
    args,
  });
  const receipt = await c.waitForTransactionReceipt({ hash });
  expect(receipt.status).toBe('success');
  return receipt;
}
class ApiSession {
  cookies = new Map<string, string>();
  constructor(public actor: Address) {}
  async request(op: string, p: any = {}, headers: Record<string, string> = {}) {
    await db.exec('delete from public.rate_limits');
    const res = await POST(
      new NextRequest('http://localhost:3000/api', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
          cookie: [...this.cookies].map(([k, v]) => k + '=' + v).join('; '),
          'x-csrf-token': this.cookies.get('tcm_csrf') || '',
          ...headers,
        },
        body: JSON.stringify({ op, p }),
      }),
    );
    for (const ck of res.cookies.getAll()) this.cookies.set(ck.name, ck.value);
    return { status: res.status, body: await res.json() };
  }
  async call(op: string, p: any = {}) {
    const r = await this.request(op, p);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    return r.body;
  }
  async login() {
    const challenge = await this.call('challenge', { wallet: this.actor, chainId: 31337 });
    await this.call('login', {
      signature: await w.signMessage({ account: this.actor, message: challenge.message }),
    });
  }
}
let api: ApiSession;
beforeAll(async () => {
  process.env.LOCAL_CHAIN_ENABLED = 'true';
  process.env.LOCAL_RPC_URL = rpc;
  process.env.APP_ORIGIN = 'http://localhost:3000';
  process.env.MAINNET_WRITES_ENABLED = 'false';
  process.env.TCM_TEST_DB = await mkdtemp(tmpdir() + '/tcm-erc721-');
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.ERC721_MINT_APPROVAL;
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  const args = [
    'node_modules/@foundry-rs/anvil/bin.mjs',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--chain-id',
    '31337',
    '--silent',
    ...(fork
      ? [
          '--fork-url',
          'https://ethereum-rpc.publicnode.com',
          '--fork-block-number',
          String(forkBlock),
        ]
      : []),
  ];
  anvil = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  anvil.stderr?.on('data', (d) => (stderr += String(d)));
  const startup = createPublicClient({ transport: http(rpc, { retryCount: 0, timeout: 500 }) });
  let ready = false;
  for (let n = 0; n < 120; n++) {
    try {
      ready = (await startup.getChainId()) === 31337;
      if (ready) break;
    } catch {}
    if (anvil.exitCode !== null) throw new Error(stderr);
    await new Promise((r) => setTimeout(r, 500));
  }
  expect(ready, stderr).toBe(true);
  expect(await c.getChainId()).toBe(31337);
  const accounts = await w.getAddresses();
  [apiActor, recipient, outsider] = accounts;
  const artifact = JSON.parse(await readFile('contracts/ERC721TL.artifact.json', 'utf8'));
  fullAbi = artifact.abi;
  if (fork) {
    contract = '0x99B8AE3C16559B80424a45C92Dd530d50d970a46';
    owner = '0xbeE916aBC292D4EfF57702fABbA1AAC4d4046036';
    admin = '0x29bF68E3969E0b6686ea55B7C48241ba3f6B9bA0';
    for (const actor of [owner, admin]) {
      await rpcCall('anvil_impersonateAccount', [actor]);
      await rpcCall('anvil_setBalance', [actor, '0x56bc75e2d63100000']);
    }
    // Public Anvil accounts can already carry EIP-7702 delegations on mainnet.
    // Normalize only these disposable fixture accounts on the local fork.
    for (const actor of [apiActor, recipient, outsider])
      await rpcCall('anvil_setCode', [actor, '0x']);
    // Disposable fork only: give a known test signer an admin role for genuine SIWE/API tests.
    await write(owner, 'setRole', [ADMIN_ROLE, [apiActor], true]);
  } else {
    owner = accounts[0];
    admin = accounts[3];
    const h = await w.deployContract({
      account: owner,
      abi: artifact.abi,
      bytecode: artifact.bytecode,
      args: [true],
    });
    const implementation = (await c.waitForTransactionReceipt({ hash: h })).contractAddress!;
    const clone =
      '0x3d602d80600a3d3981f3363d3d373d3d3d363d73' +
      implementation.slice(2) +
      '5af43d82803e903d91602b57fd5bf3';
    const deployment = await w.sendTransaction({ account: owner, data: clone as Hex });
    contract = (await c.waitForTransactionReceipt({ hash: deployment })).contractAddress!;
    await write(owner, 'initialize', [
      'Local One of One',
      'LOCAL',
      owner,
      500n,
      owner,
      [admin],
      false,
      zeroAddress,
      0,
      zeroAddress,
    ]);
  }
  mint = await import('../src/server/erc721-creator-mint');
  ({ POST } = await import('../src/app/api/route'));
  db = await (await import('../src/server/db')).localDb();
  api = new ApiSession(apiActor);
  await api.login();
  report.contract = contract;
  report.initialAttestation = await mint.attestCreator(31337, contract, owner);
});
afterAll(async () => {
  try {
    await mkdir('artifacts/erc721', { recursive: true });
    await writeFile(
      'artifacts/erc721/' + (fork ? 'fork' : 'local') + '-evidence.json',
      JSON.stringify(report, (_, v) => (typeof v === 'bigint' ? String(v) : v), 2),
    );
    await db?.close();
  } finally {
    anvil?.kill('SIGTERM');
  }
});

describe('ERC721 creator transaction lifecycle against exact contracts', () => {
  it('attests exact clone runtime and rejects wrong standards', async () => {
    const result = await mint.attestCreator(31337, contract, admin);
    expect(result.runtimeHash).toBe(erc721Creator.runtimeHash);
    expect(result.role).toBe('admin');
    await expect(mint.attestCreator(31337, outsider, admin)).rejects.toThrow(/clone/);
  });
  it('requires SIWE, CSRF and actor ownership through the real API', async () => {
    const guest = new ApiSession(outsider);
    expect(
      (await guest.request('prepare_erc721_mint', { chainId: 31337, contract, recipient, uri }))
        .status,
    ).toBe(401);
    expect(
      (
        await api.request(
          'prepare_erc721_mint',
          { chainId: 31337, contract, recipient, uri },
          { 'x-csrf-token': 'invalid' },
        )
      ).status,
    ).toBe(403);
    await guest.login();
    expect(
      (await guest.request('prepare_erc721_mint', { chainId: 31337, contract, recipient, uri }))
        .body.error,
    ).toBe('ERC721_ADMIN_REQUIRED');
  });
  it('mints through owner then admin and verifies receipt-derived IDs after a burn', async () => {
    const ids = [];
    for (const wallet of [owner, admin]) {
      const s = { wallet, chainId: 31337 };
      const i = await mint.prepareCreatorMint(31337, contract, { recipient, uri }, s);
      const fresh = await mint.preflightCreatorMint(i.id, s);
      const h = await w.sendTransaction({
        account: wallet,
        to: contract,
        data: fresh.data,
        value: 0n,
        nonce: fresh.nonce,
        gas: BigInt(fresh.gas),
        maxFeePerGas: BigInt(fresh.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(fresh.maxPriorityFeePerGas),
      });
      await c.waitForTransactionReceipt({ hash: h });
      await mint.attachCreatorMint(i.id, h, s);
      const result = await mint.confirmCreatorMint(i.id, s);
      expect(result.status).toBe('CONFIRMED');
      expect(result.payload.receipt.tokenURI).toBe(uri);
      ids.push(BigInt(result.payload.receipt.tokenId));
      (report.receipts as unknown[]).push(result.payload.receipt);
      await expect(mint.preflightCreatorMint(i.id, s)).rejects.toThrow(/existing transaction/);
      await write(recipient, 'burn', [ids.at(-1)]);
    }
    expect(ids[1]).toBe(ids[0] + 1n);
  });
  it('persists reviews and completes the authenticated API flow', async () => {
    const i = await api.call('prepare_erc721_mint', { chainId: 31337, contract, recipient, uri });
    if (!fork) {
      await mkdir('artifacts/erc721', { recursive: true });
      await writeFile(
        'artifacts/erc721/ui-review.json',
        JSON.stringify({ ...i, signingEnabled: false }),
      );
    }
    expect(
      (await api.call('history_erc721_mint', { chainId: 31337, contract })).some(
        (r: any) => r.id === i.id,
      ),
    ).toBe(true);
    expect((await api.request('preflight', { id: i.id })).body.error).toBe(
      'WRONG_TRANSACTION_FLOW',
    );
    const fresh = await api.call('preflight_erc721_mint', { id: i.id });
    const hash = await w.sendTransaction({
      account: apiActor,
      to: contract,
      data: fresh.data,
      value: 0n,
      nonce: fresh.nonce,
      gas: BigInt(fresh.gas),
    });
    await c.waitForTransactionReceipt({ hash });
    await api.call('attach_erc721_mint', { id: i.id, txHash: hash });
    const done = await api.call('confirm_erc721_mint', { id: i.id });
    expect(done.status).toBe('CONFIRMED');
    const other = new ApiSession(outsider);
    await other.login();
    expect((await other.request('intent_erc721_mint', { id: i.id })).status).toBe(403);
    expect((await api.call('confirm_erc721_mint', { id: i.id })).payload.receipt.tokenId).toBe(
      done.payload.receipt.tokenId,
    );
  });
  it('rejects revoked authority, changed nonce, locked supply and renderer overrides', async () => {
    const s = { wallet: admin, chainId: 31337 };
    let snapshot = await rpcCall('evm_snapshot');
    const i = await mint.prepareCreatorMint(31337, contract, { recipient, uri }, s);
    await write(owner, 'setRole', [ADMIN_ROLE, [admin], false]);
    await expect(mint.preflightCreatorMint(i.id, s)).rejects.toThrow(/ADMIN_ROLE/);
    await rpcCall('evm_revert', [snapshot]);
    snapshot = await rpcCall('evm_snapshot');
    await w.sendTransaction({ account: admin, to: admin, value: 0n });
    await expect(mint.preflightCreatorMint(i.id, s)).rejects.toThrow(/nonce changed/);
    await rpcCall('evm_revert', [snapshot]);
    snapshot = await rpcCall('evm_snapshot');
    await write(owner, 'lockSupply');
    await expect(mint.prepareCreatorMint(31337, contract, { recipient, uri }, s)).rejects.toThrow(
      /locked/,
    );
    await rpcCall('evm_revert', [snapshot]);
    snapshot = await rpcCall('evm_snapshot');
    await write(owner, 'setRenderingContract', [outsider]);
    await expect(mint.prepareCreatorMint(31337, contract, { recipient, uri }, s)).rejects.toThrow(
      /rendering contract/,
    );
    await rpcCall('evm_revert', [snapshot]);
  });
  it('fails closed on changed runtime, insufficient gas, contract recipient and altered metadata bytes', async () => {
    let snapshot = await rpcCall('evm_snapshot');
    const s = { wallet: admin, chainId: 31337 };
    const info = await mint.attestCreator(31337, contract);
    await rpcCall('anvil_setCode', [info.implementation, '0x6000']);
    await expect(mint.prepareCreatorMint(31337, contract, { recipient, uri }, s)).rejects.toThrow(
      /runtime/,
    );
    await rpcCall('evm_revert', [snapshot]);
    snapshot = await rpcCall('evm_snapshot');
    await rpcCall('anvil_setBalance', [admin, '0x0']);
    await expect(mint.prepareCreatorMint(31337, contract, { recipient, uri }, s)).rejects.toThrow();
    await rpcCall('evm_revert', [snapshot]);
    await expect(
      mint.prepareCreatorMint(31337, contract, { recipient: contract, uri }, s),
    ).rejects.toThrow(/EOA/);
    const media = await import('../src/server/media');
    vi.mocked(media.fetchMediaWithFallback).mockResolvedValueOnce(Buffer.from('{}'));
    await expect(mint.prepareCreatorMint(31337, contract, { recipient, uri }, s)).rejects.toThrow(
      /do not match/,
    );
  });
  it('reconciles a cancellation without falsely reporting a mint', async () => {
    const s = { wallet: admin, chainId: 31337 };
    const i = await mint.prepareCreatorMint(31337, contract, { recipient, uri }, s);
    const fresh = await mint.preflightCreatorMint(i.id, s);
    await rpcCall('evm_setAutomine', [false]);
    try {
      const gasPrice = (await c.getGasPrice()) * 4n;
      const hash = await w.sendTransaction({
        account: admin,
        to: contract,
        data: fresh.data,
        nonce: fresh.nonce,
        gas: BigInt(fresh.gas),
        gasPrice,
      });
      await mint.attachCreatorMint(i.id, hash, s);
      const cancellation = await w.sendTransaction({
        account: admin,
        to: admin,
        value: 0n,
        nonce: fresh.nonce,
        gas: 21000n,
        gasPrice: gasPrice * 2n,
      });
      await rpcCall('evm_mine');
      expect((await mint.cancelCreatorMint(i.id, cancellation, s)).status).toBe('REPLACED');
    } finally {
      await rpcCall('evm_setAutomine', [true]);
    }
  });
});
