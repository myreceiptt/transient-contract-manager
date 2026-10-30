import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import {
  createPublicClient,
  createWalletClient,
  http,
  zeroAddress,
  parseEther,
  erc20Abi,
  type Address,
  type Hex,
} from 'viem';
import { NextRequest } from 'next/server';
import { localChain, ADMIN_ROLE } from '../src/lib/chains';
import { creatorAbi, stacksAbi } from '../src/lib/abi';
import { setupLocal } from './setup-local';
import { presaleLeaf } from '../src/lib/domain';
process.env.LOCAL_CHAIN_ENABLED = 'true';
process.env.LOCAL_RPC_URL = 'http://127.0.0.1:18545';
process.env.APP_ORIGIN = 'http://localhost:3000';
process.env.MAINNET_WRITES_ENABLED = 'false';
process.env.TCM_TEST_DB = await mkdtemp(join(tmpdir(), 'tcm-db-'));
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const report: { name: string; status: string; ms: number }[] = [];
const started = new Date().toISOString();
const anvil = spawn(
  process.execPath,
  [
    'node_modules/@foundry-rs/anvil/bin.mjs',
    '--host',
    '127.0.0.1',
    '--port',
    '18545',
    '--chain-id',
    '31337',
    '--silent',
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
let anvilError = '';
anvil.stderr.on('data', (d) => (anvilError += d.toString()));
const c = createPublicClient({
  chain: localChain,
  transport: http(process.env.LOCAL_RPC_URL, { retryCount: 0 }),
});
const wallet = createWalletClient({
  chain: localChain,
  transport: http(process.env.LOCAL_RPC_URL),
});
async function test(name: string, fn: () => Promise<void>) {
  const t = Date.now();
  try {
    if (resetRate) await resetRate();
    await fn();
    report.push({ name, status: 'PASS', ms: Date.now() - t });
    console.log('PASS', name);
  } catch (e) {
    report.push({ name, status: 'FAIL', ms: Date.now() - t });
    console.error('FAIL', name, e);
    throw e;
  }
}
let resetRate: (() => Promise<unknown>) | undefined;
let exitCode = 0;
let closeDb: (() => Promise<void>) | undefined;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      ready = (await c.getChainId()) === 31337;
      if (ready) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!ready) throw new Error('Anvil startup failed: ' + anvilError);
  const f = await setupLocal();
  process.env.LOCAL_STACKS_ADDRESS = f.stacks;
  const { POST } = await import('../src/app/api/route');
  const { localDb, command } = await import('../src/server/db');
  const db = await localDb();
  closeDb = () => db.close();
  resetRate = () => db.exec('delete from public.rate_limits');
  class Browser {
    cookies = new Map<string, string>();
    constructor(
      public account?: Address,
      public ip = 'test',
    ) {}
    async request(op: string, p: any = {}, headers: Record<string, string> = {}) {
      const req = new NextRequest('http://localhost:3000/api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          origin: process.env.APP_ORIGIN!,
          cookie: [...this.cookies].map(([k, v]) => k + '=' + v).join('; '),
          'x-csrf-token': this.cookies.get('tcm_csrf') || '',
          'x-vercel-forwarded-for': this.ip,
          ...headers,
        },
        body: JSON.stringify({ op, p }),
      });
      const res = await POST(req);
      if (op === 'login' && res.status === 200) {
        assert.equal(res.cookies.get('tcm_session')?.httpOnly, true);
        assert.equal(res.cookies.get('tcm_session')?.sameSite, 'strict');
      }
      for (const ck of res.cookies.getAll()) this.cookies.set(ck.name, ck.value);
      return { status: res.status, body: await res.json() };
    }
    async call(op: string, p: any = {}) {
      const r = await this.request(op, p);
      assert.equal(r.status, 200, op + ': ' + JSON.stringify(r.body));
      return r.body;
    }
    async denied(op: string, p: any, code: string, headers: Record<string, string> = {}) {
      const r = await this.request(op, p, headers);
      assert.equal(r.body.error, code, op + ': ' + JSON.stringify(r));
    }
    async login() {
      const { message } = await this.call('challenge', { wallet: this.account, chainId: 31337 });
      const challengeToken = this.cookies.get('tcm_challenge');
      const signature = await wallet.signMessage({ account: this.account!, message });
      await this.call('login', { signature });
      return { message, signature, challengeToken };
    }
  }
  const owner = new Browser(f.owner, 'owner'),
    admin = new Browser(f.admin, 'admin'),
    collector = new Browser(f.collector, 'collector'),
    outsider = new Browser(f.outsider, 'outsider'),
    anon = new Browser(undefined, 'anon');
  const identity = { chainId: 31337, contract: f.nft };
  async function read(fn: string, args: readonly unknown[] = [], addr = f.nft, abi = creatorAbi) {
    return c.readContract({ address: addr, abi, functionName: fn, args });
  }
  async function write(
    fn: string,
    args: readonly unknown[] = [],
    addr = f.nft,
    abi = creatorAbi,
    account = f.owner,
    value = 0n,
  ) {
    const hash = await wallet.writeContract({
      account,
      address: addr,
      abi,
      functionName: fn,
      args,
      value,
    });
    const r = await c.waitForTransactionReceipt({ hash });
    assert.equal(r.status, 'success', fn);
    return hash;
  }
  async function submit(i: any, b: Browser) {
    const tx = await b.call('preflight', { id: i.id });
    const hash = await wallet.sendTransaction({
      account: b.account!,
      to: tx.to,
      data: tx.data,
      value: BigInt(tx.value),
    });
    await b.call('attach', { id: i.id, txHash: hash });
    await c.waitForTransactionReceipt({ hash });
    const result = await b.call('confirm', { id: i.id });
    assert.equal(result.status, 'CONFIRMED');
    return result;
  }
  async function adminAction(action: any, b = owner) {
    const i = await b.call('prepare_admin', { ...identity, action });
    await submit(i, b);
    return i;
  }
  await test('Pinned creator and Stacks runtime; owner and admin recognition', async () => {
    const a = await anon.call('inspect', { ...identity, wallet: f.owner });
    assert.equal(a.version, '4.1.2');
    assert.equal(a.sale.version, '2.3.1');
    assert.equal(a.role, 'owner');
    assert.equal((await anon.call('inspect', { ...identity, wallet: f.admin })).role, 'admin');
    assert.equal((await anon.call('inspect', { ...identity, wallet: f.outsider })).role, 'viewer');
    await anon.denied('inspect', { ...identity, contract: f.stacks }, 'UNSUPPORTED_IMPLEMENTATION');
  });
  await test('SIWE login, nonce replay rejection, cookie flags and CSRF', async () => {
    const signed = await owner.login();
    owner.cookies.set('tcm_challenge', signed.challengeToken!);
    await owner.denied('login', { signature: signed.signature }, 'NONCE_USED');
    await admin.login();
    await collector.login();
    await outsider.login();
    await owner.denied('pages', identity, 'CSRF_DENIED', { 'x-csrf-token': 'tampered' });
    await owner.denied('pages', identity, 'ORIGIN_DENIED', { origin: 'https://evil.example' });
    await anon.denied('pages', identity, 'SIGN_IN_REQUIRED');
  });
  await test('Invalid signature, expired nonce, wrong session chain and oversized request are rejected', async () => {
    const bad = new Browser(f.admin, 'invalid-signature');
    const challenge = await bad.call('challenge', { wallet: f.admin, chainId: 31337 });
    const signature = await wallet.signMessage({ account: f.owner, message: challenge.message });
    await bad.denied('login', { signature }, 'SIGNATURE_INVALID');
    const expired = new Browser(f.admin, 'expired-nonce');
    const next = await expired.call('challenge', { wallet: f.admin, chainId: 31337 });
    const sig = await wallet.signMessage({ account: f.admin, message: next.message });
    await db.exec("update public.auth_challenges set expires_at=now()-interval '1 minute'");
    await expired.denied('login', { signature: sig }, 'NONCE_USED');
    await owner.denied(
      'prepare_admin',
      { chainId: 1, contract: f.nft, action: { action: 'approveStacks' } },
      'SESSION_CHAIN',
    );
    await anon.denied('inspect', { padding: 'a'.repeat(70000) }, 'BODY_TOO_LARGE');
  });
  await test('Unsigned and unauthorized wallets cannot mutate the workspace', async () => {
    await outsider.denied('pages', identity, 'ACCESS_DENIED');
    await outsider.denied(
      'prepare_admin',
      { ...identity, action: { action: 'approveStacks' } },
      'ACCESS_DENIED',
    );
  });
  const now = Number((await c.getBlock()).timestamp);
  const draft = {
    ...identity,
    tokenId: '1',
    slug: 'local-first-edition',
    content: {
      title: 'Local First Edition',
      description: 'Controlled integration test',
      artwork: '',
      banner: '',
      externalUrl: '',
    },
    sale: {
      payoutReceiver: f.payout,
      initialSupply: '20',
      allowance: '5',
      currencyAddress: zeroAddress,
      publicCost: parseEther('0.01').toString(),
      startTime: String(now - 10),
      publicDuration: '86400',
      presaleDuration: '0',
      presaleCost: '0',
      presaleMerkleRoot: '0x' + '0'.repeat(64),
    },
  };
  let page: any;
  await test('Persistent draft shared by owner/admin; optimistic concurrency and private drafts', async () => {
    page = await owner.call('page_create', { draft });
    const shared = await admin.call('page', { id: page.id });
    assert.equal(shared.page.id, page.id);
    const next = { ...draft, content: { ...draft.content, title: 'Shared Edition' } };
    const prior = page.version;
    page = await admin.call('page_save', { id: page.id, expectedVersion: prior, draft: next });
    await owner.denied(
      'page_save',
      { id: page.id, expectedVersion: prior, draft },
      'VERSION_CONFLICT',
    );
    await anon.denied('public', { slug: draft.slug }, 'NOT_FOUND');
    assert.equal((await owner.call('revisions', { id: page.id })).length, 2);
    assert.ok((await owner.call('audit', { id: page.id })).length >= 2);
  });
  await test('A second Mint Page for one NFT is rejected atomically', async () => {
    await owner.denied('page_create',{
      draft:{...draft,slug:'second-page-same-token'}
    },'CONFLICT');
    const review=await owner.call('preview_publication',{id:page.id,expectedVersion:page.version});
    assert.equal(review.relatedPages.length,0);
  });
  await test('Revoked admin loses access without waiting for session expiration', async () => {
    await write('setRole', [ADMIN_ROLE, [f.admin], false]);
    await admin.denied('page', { id: page.id }, 'ACCESS_DENIED');
    await admin.denied(
      'page_save',
      { id: page.id, expectedVersion: page.version, draft: page.draft },
      'ACCESS_DENIED',
    );
    await write('setRole', [ADMIN_ROLE, [f.admin], true]);
    assert.equal((await admin.call('page', { id: page.id })).page.id, page.id);
  });
  await test('Database roles cannot read private rows or execute service RPC', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec('set role ' + role);
      await assert.rejects(db.query('select * from public.mint_pages'), /permission denied/);
      await assert.rejects(
        db.query("select public.tcm_command('page_list','{}')"),
        /permission denied/,
      );
      await db.exec('reset role');
    }
    const r = await db.query<any>(
      "select relname,relrowsecurity from pg_class where relname in ('collections','mint_pages','app_sessions','publication_records')",
    );
    assert.equal(r.rows.length, 4);
    assert.ok(r.rows.every((x) => x.relrowsecurity));
  });
  await test('NFT metadata pinning requires SIWE and admin role; invalid metadata is never uploaded', async () => {
    const data = { name: 'Example', description: 'Untrusted trial', image: 'https://bad.invalid/a.png', attributes: [] };
    await anon.denied('metadata_pin', { ...identity, metadata: data }, 'SIGN_IN_REQUIRED');
    await outsider.denied('metadata_pin', { ...identity, metadata: data }, 'ACCESS_DENIED');
    await owner.denied('metadata_pin', { ...identity, metadata: data }, 'VALIDATION_ERROR');
    await admin.denied('metadata_pin', { ...identity, metadata: data }, 'VALIDATION_ERROR');
  });
  await test('Read-only NFT simulations validate admin roles without creating intents or changing token supply', async () => {
    const initialSupply = await read('totalSupply');
    const initialHistory = await owner.call('history', identity);
    const action = {
      action: 'createToken',
      uri: 'ipfs://bafyReadonlyPreview',
      recipients: [{ address: f.owner, amount: '0' }],
    };
    const ownerPreview = await owner.call('preview_admin', { ...identity, action });
    assert.equal(ownerPreview.mode, 'READ_ONLY_SIMULATION');
    assert.equal(ownerPreview.broadcast, false);
    assert.equal(ownerPreview.signerRequired, false);
    assert.equal(ownerPreview.tx.simulation, 'passed');
    assert.equal(ownerPreview.tx.functionName, 'createToken');
    assert.equal(ownerPreview.tx.account.toLowerCase(), f.owner.toLowerCase());
    const adminPreview = await admin.call('preview_admin', { ...identity, action });
    assert.equal(adminPreview.mode, 'READ_ONLY_SIMULATION');
    assert.equal(adminPreview.tx.simulation, 'passed');
    await outsider.denied('preview_admin', { ...identity, action }, 'ACCESS_DENIED');
    await anon.denied('preview_admin', { ...identity, action }, 'SIGN_IN_REQUIRED');
    await owner.denied('preview_admin', {
      ...identity,
      action: { action: 'setDefaultRoyalty', royalty: { recipient: f.owner, bps: 1001 } },
    }, 'VALIDATION_ERROR');
    assert.equal(await read('totalSupply'), initialSupply);
    assert.deepEqual(await owner.call('history', identity), initialHistory);
  });
  await test('Create token overloads and batch creation execute exact ABI', async () => {
    await adminAction(
      {
        action: 'createToken',
        uri: 'ipfs://bafyLocalToken2',
        recipients: [{ address: f.owner, amount: '0' }],
      },
      admin,
    );
    await adminAction({
      action: 'createToken',
      uri: 'ipfs://bafyLocalToken3',
      recipients: [{ address: f.owner, amount: '2' }],
      royalty: { recipient: f.payout, bps: 700 },
    });
    await adminAction({
      action: 'batchCreateToken',
      tokens: [
        { uri: 'ipfs://bafyLocalToken4', recipients: [{ address: f.owner, amount: '0' }] },
        { uri: 'ipfs://bafyLocalToken5', recipients: [{ address: f.owner, amount: '0' }] },
      ],
    });
    assert.equal(await read('totalSupply'), 5n);
    assert.equal(await read('balanceOf', [f.owner, 3n]), 2n);
    assert.equal(((await read('royaltyInfo', [3n, 10000n])) as any)[1], 700n);
  });
  await test('Batch token creation with per-token royalties uses the five-argument overload', async () => {
    await adminAction({
      action: 'batchCreateToken',
      tokens: [
        {
          uri: 'ipfs://bafyRoyalty6',
          recipients: [{ address: f.owner, amount: '0' }],
          royalty: { recipient: f.payout, bps: 450 },
        },
        {
          uri: 'ipfs://bafyRoyalty7',
          recipients: [{ address: f.owner, amount: '0' }],
          royalty: { recipient: f.admin, bps: 650 },
        },
      ],
    });
    assert.equal(await read('totalSupply'), 7n);
    assert.equal(((await read('royaltyInfo', [6n, 10000n])) as any)[1], 450n);
    assert.equal(((await read('royaltyInfo', [7n, 10000n])) as any)[1], 650n);
  });
  await test('Draft identity can change to an available token and release its claim on archive', async () => {
    const old=await owner.call('page_create',{
      draft:{...draft,tokenId:'4',slug:'token-reassignment-first'}
    });
    const next=await admin.call('page_save',{
      id:old.id,expectedVersion:old.version,
      draft:{...old.draft,tokenId:'5',slug:'token-reassignment-second'}
    });
    assert.equal(next.id,old.id);
    assert.equal(next.token_id,'5');
    await owner.denied('page_create',{
      draft:{...draft,tokenId:'5',slug:'another-page-token-five'}
    },'CONFLICT');
    const archived=await owner.call('page_lifecycle',{
      id:next.id,expectedVersion:next.version,action:'archive'
    });
    assert.ok(archived.archived_at);
    assert.equal(archived.identity_retained,false);
    const newPage=await owner.call('page_create',{
      draft:{...draft,tokenId:'5',slug:'reassigned-token-five'}
    });
    assert.equal(newPage.token_id,'5');
    assert.equal(await read('totalSupply'),7n);
  });
  await test('Airdrop, token URI, default royalty, token royalty and Stacks grant', async () => {
    await adminAction(
      {
        action: 'mintToken',
        tokenId: '2',
        recipients: [
          { address: f.collector, amount: '2' },
          { address: f.admin, amount: '3' },
        ],
      },
      admin,
    );
    assert.equal(await read('balanceOf', [f.collector, 2n]), 2n);
    await adminAction({ action: 'setTokenUri', tokenId: '2', uri: 'ipfs://bafyUpdatedToken2' });
    assert.equal(await read('uri', [2n]), 'ipfs://bafyUpdatedToken2');
    await adminAction({ action: 'setDefaultRoyalty', royalty: { recipient: f.payout, bps: 600 } });
    await adminAction({
      action: 'setTokenRoyalty',
      tokenId: '2',
      royalty: { recipient: f.admin, bps: 400 },
    });
    assert.equal(((await read('royaltyInfo', [2n, 10000n])) as any)[1], 400n);
    await adminAction({ action: 'approveStacks' });
  });
  await test('Unsupported destructive action, invalid royalty, missing token and locked mint fail', async () => {
    await owner.denied(
      'prepare_admin',
      { ...identity, action: { action: 'setRole' } },
      'VALIDATION_ERROR',
    );
    await owner.denied(
      'prepare_admin',
      {
        ...identity,
        action: { action: 'setDefaultRoyalty', royalty: { recipient: f.owner, bps: 1001 } },
      },
      'VALIDATION_ERROR',
    );
    await owner.denied(
      'prepare_admin',
      {
        ...identity,
        action: {
          action: 'mintToken',
          tokenId: '999',
          recipients: [{ address: f.owner, amount: '1' }],
        },
      },
      'TOKEN_MISSING',
    );
    await write('lockToken', [5n]);
    await owner.denied(
      'prepare_admin',
      {
        ...identity,
        action: {
          action: 'mintToken',
          tokenId: '5',
          recipients: [{ address: f.owner, amount: '1' }],
        },
      },
      'TOKEN_LOCKED',
    );
    await owner.denied(
      'prepare_admin',
      { ...identity, action: { action: 'setTokenUri', tokenId: '2', uri: 'javascript:alert(1)' } },
      'VALIDATION_ERROR',
    );
  });
  await test('Authenticated read-only sale preflight simulates Stacks without creating a publication intent', async () => {
    const before = await owner.call('history', identity);
    const result = await admin.call('preview_publication', {
      id: page.id, expectedVersion: page.version,
    });
    assert.equal(result.mode, 'READ_ONLY_SALE_PREFLIGHT');
    assert.equal(result.status, 'READY_FOR_REVIEW');
    assert.equal(result.nextAction, 'configureDrop');
    assert.equal(result.tx.simulation, 'passed');
    assert.equal(result.tx.functionName, 'configureDrop');
    assert.ok(result.checks.some((c: any) => c.status === 'PASS'));
    await outsider.denied('preview_publication',
      { id: page.id, expectedVersion: page.version }, 'ACCESS_DENIED');
    await anon.denied('preview_publication',
      { id: page.id, expectedVersion: page.version }, 'SIGN_IN_REQUIRED');
    assert.deepEqual(await owner.call('history', identity), before);
    assert.equal((await owner.call('page', { id: page.id })).page.published_revision, null);
  });
  await test('Draft collector quote includes protocol fee without creating a mint or publication intent', async () => {
    const prior = await owner.call('history', identity);
    const quote = await owner.call('preview_collector_quote', {
      id: page.id, expectedVersion: page.version, quantity: '2',
    });
    assert.equal(quote.mode, 'DRAFT_COLLECTOR_QUOTE');
    assert.equal(quote.draftOnly, true);
    assert.equal(quote.paymentAmount, parseEther('0.02').toString());
    assert.equal(quote.totalNativeWei, parseEther('0.0218').toString());
    assert.equal(quote.protocolFeeWei, parseEther('0.0018').toString());
    await anon.denied('preview_collector_quote', {
      id: page.id, expectedVersion: page.version, quantity: '1',
    }, 'SIGN_IN_REQUIRED');
    await outsider.denied('preview_collector_quote', {
      id: page.id, expectedVersion: page.version, quantity: '1',
    }, 'ACCESS_DENIED');
    await owner.denied('preview_collector_quote', {
      id: page.id, expectedVersion: page.version, quantity: '21',
    }, 'QUANTITY');
    assert.deepEqual(await owner.call('history', identity), prior);
  });
  await test('Autonomous non-owner admin prepares, signs and publishes native sale', async () => {
    const i = await admin.call('prepare_publication', {
      id: page.id,
      expectedVersion: page.version,
    });
    assert.equal(i.payload.tx.functionName, 'configureDrop');
    assert.equal((await admin.call('page', { id: page.id })).page.published_revision, null);
    await submit(i, admin);
    page = (await owner.call('page', { id: page.id })).page;
    assert.equal(page.state, 'PUBLISHED');
    assert.equal((await anon.call('public', { slug: page.slug })).consistent, true);
  });
  await test('Published Mint Page slug can change without minting or publishing another revision', async () => {
    const prior=page;
    const target='local-first-edition-renamed';
    // A fresh unsigned review must block identity changes; once its wallet
    // review expires, the server can expire it atomically without gas.
    const pending=await db.query<{id:string}>(
      "insert into public.publication_records(page_id,revision,actor,chain_id,contract,payload,status) "+
      "values ($1,$2,$3,31337,$4,jsonb_build_object('tx',jsonb_build_object('expiresAt',"+
      "(now()+interval '10 minutes')::text)),'PREPARED') returning id",
      [page.id,page.version,f.owner,f.nft]
    );
    await owner.denied('page_slug_edit',{
      id:prior.id,expectedVersion:prior.version,expectedSlug:prior.slug,slug:target
    },'SLUG_EDIT_BLOCKED');
    await db.query(
      "update public.publication_records set payload=jsonb_set(payload,'{tx,expiresAt}',"+
      "to_jsonb((now()-interval '10 minutes')::text)) where id=$1",
      [pending.rows[0].id]
    );
    page=await admin.call('page_slug_edit',{
      id:prior.id,expectedVersion:prior.version,expectedSlug:prior.slug,slug:target
    });
    const expired=(await db.query<{status:string}>(
      "select status from public.publication_records where id=$1",[pending.rows[0].id]
    )).rows[0].status;
    assert.equal(expired,'EXPIRED');
    assert.equal(page.id,prior.id);
    assert.equal(page.token_id,prior.token_id);
    assert.equal(page.published_revision,prior.published_revision);
    assert.equal(page.version,prior.version+1);
    assert.equal((await anon.call('public',{slug:page.slug})).content.title,'Shared Edition');
    await anon.denied('public',{slug:prior.slug},'NOT_FOUND');
    const alias=await db.query<{slug:string,page_id:string}>(
      'select slug,page_id from public.mint_page_slug_aliases where slug=$1',[prior.slug]);
    assert.equal(alias.rows[0].page_id,prior.id);
    await owner.denied('page_create',{
      draft:{...draft,tokenId:'2',slug:prior.slug}
    },'SLUG_RESERVED');
    await outsider.denied('page_slug_edit',{
      id:page.id,expectedVersion:page.version,expectedSlug:page.slug,
      slug:'outsider-tried-to-rename'
    },'ACCESS_DENIED');
    await owner.denied('page_slug_edit',{
      id:page.id,expectedVersion:prior.version,expectedSlug:prior.slug,
      slug:'stale-rename-attempt'
    },'VERSION_CONFLICT');
    const changeBack=await owner.call('page_slug_edit',{
      id:page.id,expectedVersion:page.version,expectedSlug:page.slug,
      slug:prior.slug
    });
    assert.equal(changeBack.slug,prior.slug);
    const aliasAfter=await db.query<{slug:string}>(
      'select slug from public.mint_page_slug_aliases where page_id=$1',[page.id]);
    assert.deepEqual(aliasAfter.rows.map(r=>r.slug),[target]);
    page=changeBack;
    assert.equal((await anon.call('public',{slug:page.slug})).state,'PUBLISHED');
  });
  await test('Native mint transfers editions, exact payout and per-unit protocol fee', async () => {
    const beforePayout = await c.getBalance({ address: f.payout }),
      beforeFee = await c.getBalance({ address: f.feeReceiver });
    const i = await collector.call('prepare_mint', { slug: page.slug, quantity: '2' });
    assert.equal(BigInt(i.payload.tx.value), parseEther('0.0218'));
    const confirmed = await submit(i, collector);
    assert.equal(confirmed.payload.receipt.actualMinted, '2');
    assert.equal(await read('balanceOf', [f.collector, 1n]), 2n);
    assert.equal((await c.getBalance({ address: f.payout })) - beforePayout, parseEther('0.02'));
    assert.equal(
      (await c.getBalance({ address: f.feeReceiver })) - beforeFee,
      parseEther('0.0018'),
    );
    const pub = await anon.call('public', { slug: page.slug });
    assert.equal(pub.onchain.sale.drop.supply, '18');
    assert.equal(pub.consistent, true);
  });
  await test('Duplicate confirmation is idempotent; wrong wallet cannot read collector intent', async () => {
    const i = await collector.call('prepare_mint', { slug: page.slug, quantity: '1' });
    await outsider.denied('intent', { id: i.id }, 'ACCESS_DENIED');
    await submit(i, collector);
    await collector.call('confirm', { id: i.id });
    assert.equal(await read('balanceOf', [f.collector, 1n]), 3n);
    await collector.denied('preflight', { id: i.id }, 'ALREADY_SUBMITTED');
    await collector.denied('prepare_mint', { slug: page.slug, quantity: '3' }, 'QUANTITY');
  });
  await test('Changed draft keeps old public content until explicit content publication', async () => {
    page = (await owner.call('page', { id: page.id })).page;
    page = await owner.call('page_save', {
      id: page.id,
      expectedVersion: page.version,
      draft: { ...page.draft, content: { ...page.draft.content, title: 'Revised story' } },
    });
    assert.equal((await anon.call('public', { slug: page.slug })).content.title, 'Shared Edition');
    const review = await owner.call('prepare_publication', {
      id: page.id,
      expectedVersion: page.version,
    });
    assert.equal(review.contentOnly, true);
    page = await owner.call('publish_content', {
      id: page.id,
      expectedVersion: page.version,
      expectedBaseline: review.expectedBaseline,
    });
    assert.equal((await anon.call('public', { slug: page.slug })).content.title, 'Revised story');
  });
  await test('External sale change blocks mint and publication until baseline review', async () => {
    await write('updateDropAllowance', [f.nft, 1n, 7n], f.stacks, stacksAbi);
    assert.equal((await anon.call('public', { slug: page.slug })).state, 'OUT_OF_SYNC');
    await collector.denied('prepare_mint', { slug: page.slug, quantity: '1' }, 'MINT_UNAVAILABLE');
    await owner.denied(
      'prepare_publication',
      { id: page.id, expectedVersion: page.version },
      'OUT_OF_SYNC',
    );
    const state = await owner.call('page', { id: page.id });
    page = await owner.call('page_rebase', {
      id: page.id,
      expectedVersion: page.version,
      accepted: state.currentBaseline,
    });
    const i = await owner.call('prepare_publication', {
      id: page.id,
      expectedVersion: page.version,
    });
    assert.equal(i.payload.tx.functionName, 'updateDropAllowance');
    await submit(i, owner);
    assert.equal((await anon.call('public', { slug: page.slug })).state, 'PUBLISHED');
  });
  await test('Changed configuration between simulation and wallet signing is rejected', async () => {
    const i = await collector.call('prepare_mint', { slug: page.slug, quantity: '1' });
    await write('updateDropAllowance', [f.nft, 1n, 6n], f.stacks, stacksAbi);
    await collector.denied('preflight', { id: i.id }, 'STATE_CHANGED');
    await write('updateDropAllowance', [f.nft, 1n, 5n], f.stacks, stacksAbi);
  });
  // Compile a local-only ERC-20 fixture with 6 decimals. It is not an application deployment artifact.
  const solc = (await import('solc')).default;
  const tokenSource =
    '// SPDX-License-Identifier: MIT\npragma solidity 0.8.30; contract TestToken { string public constant symbol="TUSD"; uint8 public constant decimals=6; mapping(address=>uint256) public balanceOf; mapping(address=>mapping(address=>uint256)) public allowance; function mint(address a,uint256 n) external {balanceOf[a]+=n;} function approve(address s,uint256 n) external returns(bool){allowance[msg.sender][s]=n;return true;} function transferFrom(address a,address b,uint256 n) external returns(bool){require(balanceOf[a]>=n&&allowance[a][msg.sender]>=n);balanceOf[a]-=n;balanceOf[b]+=n;allowance[a][msg.sender]-=n;return true;} }';
  const compilation = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: 'Solidity',
        sources: { 'TestToken.sol': { content: tokenSource } },
        settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
      }),
    ),
  );
  const artifact = compilation.contracts['TestToken.sol'].TestToken;
  const tokenHash = await wallet.deployContract({
    account: f.owner,
    abi: artifact.abi,
    bytecode: ('0x' + artifact.evm.bytecode.object) as Hex,
  });
  const token = (await c.waitForTransactionReceipt({ hash: tokenHash })).contractAddress!;
  await write('mint', [f.collector, 100000000n], token, artifact.abi);
  let ercPage: any;
  await test('ERC-20 sale quotes 6-decimal units; exact approval then purchase with native fee', async () => {
    ercPage = await owner.call('page_create', {
      draft: {
        ...draft,
        tokenId: '2',
        slug: 'local-erc20',
        sale: { ...draft.sale, currencyAddress: token, publicCost: '2500000' },
      },
    });
    await submit(
      await owner.call('prepare_publication', { id: ercPage.id, expectedVersion: 1 }),
      owner,
    );
    const approval = await collector.call('prepare_mint', { slug: ercPage.slug, quantity: '2' });
    assert.equal(approval.payload.kind, 'approval');
    assert.equal(approval.payload.tx.arguments[1], '5000000');
    await submit(approval, collector);
    const i = await collector.call('prepare_mint', { slug: ercPage.slug, quantity: '2' });
    assert.equal(i.payload.kind, 'mint');
    assert.equal(i.payload.tx.value, parseEther('0.0018').toString());
    await submit(i, collector);
    assert.equal(await read('balanceOf', [f.payout], token, erc20Abi), 5000000n);
    assert.equal(await read('balanceOf', [f.collector, 2n]), 4n);
    await outsider.denied(
      'prepare_mint',
      { slug: ercPage.slug, quantity: '1' },
      'INSUFFICIENT_TOKEN',
    );
  });
  await test('Nonzero insufficient ERC-20 allowance is reset before exact approval', async () => {
    await write('approve', [f.stacks, 1n], token, erc20Abi, f.collector);
    const reset = await collector.call('prepare_mint', { slug: ercPage.slug, quantity: '1' });
    assert.equal(reset.payload.kind, 'approval');
    assert.equal(reset.payload.tx.arguments[1], '0');
    await submit(reset, collector);
    const approval = await collector.call('prepare_mint', { slug: ercPage.slug, quantity: '1' });
    assert.equal(approval.payload.tx.arguments[1], '2500000');
    await submit(approval, collector);
    await submit(
      await collector.call('prepare_mint', { slug: ercPage.slug, quantity: '1' }),
      collector,
    );
  });
  await test('Presale Merkle proof, invalid proof and per-recipient allowance', async () => {
    const root = presaleLeaf(f.collector, 2n);
    const p = await owner.call('page_create', {
      draft: {
        ...draft,
        tokenId: '3',
        slug: 'local-presale',
        sale: {
          ...draft.sale,
          presaleDuration: '3600',
          presaleCost: parseEther('0.005').toString(),
          presaleMerkleRoot: root,
        },
      },
    });
    await submit(await owner.call('prepare_publication', { id: p.id, expectedVersion: 1 }), owner);
    await outsider.denied(
      'prepare_mint',
      { slug: p.slug, quantity: '1', presaleAllowance: '2', proof: [] },
      'ALLOWLIST',
    );
    const i = await collector.call('prepare_mint', {
      slug: p.slug,
      quantity: '2',
      presaleAllowance: '2',
      proof: [],
    });
    assert.equal(i.payload.tx.value, parseEther('0.0118').toString());
    await submit(i, collector);
    await collector.denied(
      'prepare_mint',
      { slug: p.slug, quantity: '1', presaleAllowance: '2', proof: [] },
      'QUANTITY',
    );
  });
  await test('Publication rejects an unsent review after another draft revision is saved', async () => {
    const p = await owner.call('page_create', {
      draft: {
        ...draft,
        tokenId: '4',
        slug: 'local-race',
        sale: { ...draft.sale, initialSupply: '2' },
      },
    });
    const i = await owner.call('prepare_publication', { id: p.id, expectedVersion: p.version });
    const changed = await owner.call('page_save', {
      id: p.id,
      expectedVersion: p.version,
      draft: { ...p.draft, content: { ...p.draft.content, title: 'Race fixture' } },
    });
    await owner.denied('preflight', { id: i.id }, 'VERSION_CONFLICT');
    await submit(
      await owner.call('prepare_publication', { id: p.id, expectedVersion: changed.version }),
      owner,
    );
  });
  await test('Receipt reports actual quantity when another buyer consumes supply after preflight', async () => {
    const i = await collector.call('prepare_mint', { slug: 'local-race', quantity: '2' });
    const tx = await collector.call('preflight', { id: i.id });
    await submit(await owner.call('prepare_mint', { slug: 'local-race', quantity: '1' }), owner);
    const h = await wallet.sendTransaction({
      account: f.collector,
      to: tx.to,
      data: tx.data,
      value: BigInt(tx.value),
    });
    await collector.call('attach', { id: i.id, txHash: h });
    await c.waitForTransactionReceipt({ hash: h });
    const result = await collector.call('confirm', { id: i.id });
    assert.equal(result.payload.receipt.actualMinted, '1');
    assert.equal(result.payload.receipt.quantityAdjusted, true);
    assert.equal(await read('balanceOf', [f.collector, 4n]), 1n);
  });
  await test('Pending transaction recovery, replacement cancellation and no automatic retry', async () => {
    await c.request({ method: 'evm_setAutomine' as any, params: [false] as any });
    try {
      const i = await owner.call('prepare_admin', {
        ...identity,
        action: { action: 'setTokenUri', tokenId: '4', uri: 'ipfs://bafyNeverApplied' },
      });
      const tx = await owner.call('preflight', { id: i.id });
      const nonce = await c.getTransactionCount({ address: f.owner });
      const h = await wallet.sendTransaction({
        account: f.owner,
        to: tx.to,
        data: tx.data,
        value: 0n,
        nonce,
        maxFeePerGas: 10000000000n,
        maxPriorityFeePerGas: 1000000000n,
        gas: 200000n,
      });
      await owner.call('attach', { id: i.id, txHash: h });
      assert.equal((await owner.call('confirm', { id: i.id })).status, 'SUBMITTED');
      const replacement = await wallet.sendTransaction({
        account: f.owner,
        to: f.owner,
        value: 0n,
        nonce,
        maxFeePerGas: 30000000000n,
        maxPriorityFeePerGas: 3000000000n,
        gas: 21000n,
      });
      await c.request({ method: 'evm_mine' as any });
      const cancelled = await owner.call('cancel_replacement', { id: i.id, txHash: replacement });
      assert.equal(cancelled.status, 'REPLACED');
      assert.equal(await read('uri', [4n]), 'ipfs://bafyLocalToken4');
    } finally {
      await c.request({ method: 'evm_setAutomine' as any, params: [true] as any });
    }
  });
  await test('Insufficient ETH, ended sale, locked token and unsafe media fail closed', async () => {
    await c.request({ method: 'anvil_setBalance' as any, params: [f.outsider, '0x0'] as any });
    const r = await outsider.request('prepare_mint', { slug: page.slug, quantity: '1' });
    assert.ok(['INSUFFICIENT_ETH', 'SIMULATION_FAILED'].includes(r.body.error));
    await write('lockToken', [1n]);
    assert.equal((await anon.call('public', { slug: page.slug })).state, 'ACTION_REQUIRED');
    await collector.denied('prepare_mint', { slug: page.slug, quantity: '1' }, 'MINT_UNAVAILABLE');
    await anon.denied('metadata', { uri: 'https://127.0.0.1/secrets' }, 'MEDIA_URL');
    await anon.denied('metadata', { uri: 'https://evil.example/metadata' }, 'MEDIA_HOST');
    await c.request({ method: 'evm_increaseTime' as any, params: [90000] as any });
    await c.request({ method: 'evm_mine' as any });
    await collector.denied('prepare_mint', { slug: ercPage.slug, quantity: '1' }, 'SALE_CLOSED');
  });
  await test('Request throttling rejects overflow in an active window', async () => {
    await command('rate', { key: 'test-window', limit: 1 });
    assert.equal((await command('rate', { key: 'test-window', limit: 1 })).allowed, false);
  });
  await test('Public quota exhaustion does not consume authenticated workspace capacity', async () => {
    const { hash } = await import('../src/server/auth');
    await db.query(
      "insert into public.rate_limits(key,hits,reset_at) values($1,40,now()+interval '1 minute')",
      ['v2:public:ip:' + hash('local')],
    );
    await anon.denied('inspect', identity, 'RATE_LIMIT');
    assert.ok(Array.isArray(await owner.call('pages', identity)));
    const consumed = await db.query(
      "select key from public.rate_limits where key='v2:public:total'",
    );
    assert.equal(consumed.rows.length, 0);
  });
  await test('Media GET is throttled before network fetch and returns retry/no-store headers', async () => {
    const { hash } = await import('../src/server/auth');
    const { GET } = await import('../src/app/media/route');
    await db.query(
      "insert into public.rate_limits(key,hits,reset_at) values($1,60,now()+interval '1 minute')",
      ['v2:media:ip:' + hash('local')],
    );
    const response = await GET(
      new NextRequest('http://localhost:3000/media?url=ipfs://bafyLocalFixture123'),
    );
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '60');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });
  await test('Bounded private lists paginate and preserve collection isolation', async () => {
    const first = await owner.call('pages', { ...identity, limit: 1 });
    const next = await owner.call('pages', { ...identity, limit: 1, offset: 1 });
    assert.equal(first.length, 1);
    assert.equal(next.length, 1);
    assert.notEqual(first[0].id, next[0].id);
    const { listRecords } = await import('../src/server/db');
    assert.deepEqual(
      await listRecords('pages', {
        ...identity,
        contract: '0x1111111111111111111111111111111111111111',
        limit: 25,
        offset: 0,
      }),
      [],
    );
    const revisions = await owner.call('revisions', { id: page.id, limit: 1 });
    const older = await owner.call('revisions', { id: page.id, limit: 1, offset: 1 });
    assert.equal(revisions.length, 1);
    assert.equal(older.length, 1);
    assert.ok(revisions[0].version > older[0].version);
    await owner.denied('pages', { ...identity, limit: 26 }, 'VALIDATION_ERROR');
    await owner.denied('pages', { ...identity, offset: 10001 }, 'VALIDATION_ERROR');
    await anon.denied('pages', { ...identity, limit: 1 }, 'SIGN_IN_REQUIRED');
  });
  await test('Malformed envelopes and unknown operations fail before upstream work', async () => {
    await anon.denied('unknown_operation', {}, 'UNKNOWN_OPERATION');
    await anon.denied('inspect', null, 'VALIDATION_ERROR');
    await anon.denied('inspect', [], 'VALIDATION_ERROR');
  });
  await test('Session logout invalidates server token; mainnet write gate remains closed', async () => {
    await owner.call('logout');
    await owner.denied('pages', identity, 'SIGN_IN_REQUIRED');
    const { requireWrites } = await import('../src/server/chain');
    assert.throws(() => requireWrites(1), /disabled|locked/i);
  });
} catch (e) {
  exitCode = 1;
  console.error(e instanceof Error ? e.message : e);
} finally {
  if (closeDb) await closeDb();
  anvil.kill('SIGTERM');
  await mkdir('docs/evidence', { recursive: true });
  await writeFile(
    'docs/evidence/integration-results.json',
    JSON.stringify(
      {
        started,
        finished: new Date().toISOString(),
        environment:
          'Anvil 31337 + actual pinned contracts + PGlite PostgreSQL + Next API handlers',
        mainnetTransactions: 0,
        passed: report.filter((x) => x.status === 'PASS').length,
        failed: report.filter((x) => x.status === 'FAIL').length,
        results: report,
      },
      null,
      2,
    ),
  );
  process.exitCode = exitCode;
}
