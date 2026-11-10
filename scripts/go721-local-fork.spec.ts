import {beforeAll,afterAll,describe,expect,it} from 'vitest';
import {spawn,type ChildProcess} from 'node:child_process';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createPublicClient,createWalletClient,http,getAddress,parseAbi,parseEther,toHex,zeroAddress,type Address} from 'viem';
import {NextRequest} from 'next/server';
import {localChain,ADMIN_ROLE} from '../src/lib/chains';
import {GO721_COLLECTION,GO721_STACKS,GO721_APPROVED} from '../src/lib/go721-sale-engine';
import {GO721_DRAFT_ID,GO721_FOLDERS,GO721_RUNTIME} from '../src/lib/go721-launch';
import {GO_APPROVED_TERMS} from '../src/lib/erc721-sale-terms';

// Only the loopback client can write. Original Owner impersonation and known
// fixture signers exist exclusively inside this disposable chain 31337 fork.
const describeWhen=process.env.TCM_GO721_FORK==='1'?describe:describe.skip;
const rpc='http://127.0.0.1:18611';
const c=createPublicClient({chain:localChain,transport:http(rpc,{retryCount:0,timeout:25000})});
const w=createWalletClient({chain:localChain,transport:http(rpc,{retryCount:0,timeout:25000})});
const creatorAbi=parseAbi(['function owner() view returns(address)','function setRole(bytes32,address[],bool)',
  'function ownerOf(uint256) view returns(address)','function tokenURI(uint256) view returns(string)',
  'function totalSupply() view returns(uint256)','function burn(uint256)']);
let anvil:ChildProcess|undefined, owner:Address, admin:Address, buyers:Address[], db:any;
let server:typeof import('../src/server/go721-transactions'), state:typeof import('../src/server/go721-launch-state');
let POST:typeof import('../src/app/api/route').POST, api:ApiSession, forkBlock:bigint;
const report:any={chainId:31337,mainnetWrites:false,ipfsAuditsRepeated:false,transactions:[],checks:[]};
const rpcCall=(method:string,params:any[]=[])=>c.request({method,params} as any) as Promise<any>;
const session=(wallet:Address)=>({wallet,chainId:31337});
async function fund(wallet:Address){await rpcCall('anvil_setBalance',[wallet,toHex(parseEther('10'))]);}
async function advance(ts:number){await rpcCall('evm_setNextBlockTimestamp',[ts]);await rpcCall('evm_mine');}
async function rawRole(accounts:Address[],status:boolean){
  const hash=await w.writeContract({account:owner,address:GO721_COLLECTION,abi:creatorAbi,functionName:'setRole',args:[ADMIN_ROLE,accounts,status]});
  expect((await c.waitForTransactionReceipt({hash})).status).toBe('success');
}
async function execute(i:any,actor:Address){
  const tx=await server.preflightGo721(i.id,session(actor));
  const hash=await w.sendTransaction({account:actor,to:tx.to,data:tx.data,value:BigInt(tx.value),nonce:tx.nonce,
    gas:BigInt(tx.gas),maxFeePerGas:BigInt(tx.maxFeePerGas),maxPriorityFeePerGas:BigInt(tx.maxPriorityFeePerGas)});
  await c.waitForTransactionReceipt({hash});
  await server.attachGo721(i.id,hash,session(actor));
  const result=await server.confirmGo721(i.id,session(actor));
  expect(result.status).toBe('CONFIRMED');report.transactions.push(result);
  return result;
}
class ApiSession{
  cookies=new Map<string,string>();
  constructor(public actor:Address){}
  async request(op:string,p:any={},headers:Record<string,string>={}){
    await db.exec('delete from public.rate_limits');
    const res=await POST(new NextRequest('http://localhost:3000/api',{method:'POST',headers:{
      'content-type':'application/json',origin:'http://localhost:3000',cookie:[...this.cookies].map(([k,v])=>k+'='+v).join('; '),
      'x-csrf-token':this.cookies.get('tcm_csrf')||'',...headers},body:JSON.stringify({op,p})}));
    for(const cookie of res.cookies.getAll())this.cookies.set(cookie.name,cookie.value);
    return {status:res.status,body:await res.json()};
  }
  async call(op:string,p:any={}){const r=await this.request(op,p);expect(r.status,JSON.stringify(r.body)).toBe(200);return r.body;}
  async login(){const x=await this.call('challenge',{wallet:this.actor,chainId:31337});
    await this.call('login',{signature:await w.signMessage({account:this.actor,message:x.message})});}
}
describeWhen('GO#|O guarded application lifecycle on real forked contracts',()=>{
  beforeAll(async()=>{
    process.env.LOCAL_CHAIN_ENABLED='true';process.env.LOCAL_RPC_URL=rpc;
    process.env.APP_ORIGIN='http://localhost:3000';process.env.MAINNET_WRITES_ENABLED='false';
    process.env.TCM_TEST_DB=await mkdtemp(tmpdir()+'/tcm-go721-');
    for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','VERCEL','VERCEL_ENV','GO721_TRANSACTION_APPROVAL','GO721_CHECKOUT_APPROVAL'])delete process.env[key];
    const forkUrl=process.env.TCM_GO721_FORK_RPC||'https://ethereum-rpc.publicnode.com';
    const upstream=createPublicClient({transport:http(forkUrl,{timeout:30000})});
    forkBlock=process.env.TCM_GO721_FORK_BLOCK?BigInt(process.env.TCM_GO721_FORK_BLOCK):await upstream.getBlockNumber();
    process.env.TCM_GO721_FORK_BLOCK=forkBlock.toString();report.forkBlock=forkBlock.toString();
    anvil=spawn(process.execPath,['node_modules/@foundry-rs/anvil/bin.mjs','--host','127.0.0.1','--port','18611','--chain-id','31337','--silent','--fork-url',forkUrl,'--fork-block-number',forkBlock.toString()],{stdio:['ignore','pipe','pipe']});
    let err='';anvil.stderr?.on('data',v=>err+=v);
    const startup=createPublicClient({transport:http(rpc,{retryCount:0,timeout:500})});
    for(let n=0;n<100;n++){try{if(await startup.getChainId()===31337)break;}catch{}
      if(anvil.exitCode!==null)throw Error(err);await new Promise(ok=>setTimeout(ok,500));}
    expect(await c.getChainId()).toBe(31337);
    [admin,...buyers]=(await w.getAddresses()).map(a=>getAddress(a));
    owner=await c.readContract({address:GO721_COLLECTION,abi:creatorAbi,functionName:'owner'});
    await rpcCall('anvil_impersonateAccount',[owner]);await fund(owner);
    for(const a of [admin,...buyers.slice(0,4)]){await rpcCall('anvil_setCode',[a,'0x']);await fund(a);}
    server=await import('../src/server/go721-transactions');state=await import('../src/server/go721-launch-state');
    db=await (await import('../src/server/db')).localDb();POST=(await import('../src/app/api/route')).POST;
    await db.query(`insert into public.erc721_workspace_drafts(id,chain_id,contract,kind,identity,actor,draft,version)
      values($1,1,$2,'MINT_PAGE','collection',$3,$4,10)`,[GO721_DRAFT_ID,GO721_COLLECTION.toLowerCase(),owner.toLowerCase(),{
      title:'Ganti Oli #1 | One of One',description:'Owner-audited campaign fixture',artwork:'',price:'0.025',currency:'ETH',
      payout:GO_APPROVED_TERMS.payoutReceiver,maxPerWallet:'10',start:'2026-11-10T10:10',end:'2027-11-10T10:10',
      presaleMetadataBaseUri:GO721_FOLDERS[1],publicMetadataBaseUri:GO721_FOLDERS[2]}]);
    await rawRole([admin],true);api=new ApiSession(admin);await api.login();
  },240000);
  afterAll(async()=>{await mkdir('artifacts/go721',{recursive:true});
    await writeFile('artifacts/go721/fork-lifecycle.json',JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2));anvil?.kill('SIGTERM');},30000);
  it('attests exact runtimes and real historical counter; preserves audited folder identities',async()=>{
    const s=await state.readGo721State(31337,owner);expect(s.counter).toBe(0n);expect(s.burns).toBe(0n);expect(s.phase).toBe(0);expect(s.approved).toBe(false);
    expect((await state.savedGo721Campaign()).version).toBe(10);
    const r=await api.call('public_go721_status',{chainId:31337});expect(r.exactRuntimeVerified).toBe(true);expect(r.observedRuntimeHash).toBe(GO721_RUNTIME);
    expect(r.displayedQuote.allowed).toBe(false);
    expect(r.displayedQuote.issues).toEqual(['Sale is not configured on Ethereum. The saved launch draft and IPFS folders do not activate it.']);
    expect(r.transactionExecutionEnabled).toBe(false);report.checks.push('exact runtime + historical minted/burned counters + saved CIDs');
  });
  it('enforces SIWE, CSRF, chain, Owner-only grant and GO1 intent separation',async()=>{
    const noSession=new ApiSession(admin);expect((await noSession.request('prepare_go721',{chainId:31337,action:{type:'grant'}})).status).toBe(401);
    expect((await api.request('prepare_go721',{chainId:31337,action:{type:'grant'}},{'x-csrf-token':'wrong'})).status).toBe(403);
    expect((await api.request('prepare_go721',{chainId:1,action:{type:'grant'}})).status).toBe(403);
    expect((await api.request('prepare_go721',{chainId:31337,action:{type:'grant'}})).body.error).toBe('OWNER_REQUIRED');
    report.checks.push('SIWE + CSRF + same-chain + Owner-only grant');
  });
  it('reviews, preflights, sends and confirms the Owner minter grant only on loopback',async()=>{
    const i=await server.prepareGo721(31337,{type:'grant'},session(owner));report.ownerReview=i;
    expect(i.payload.tx.value).toBe('0');await execute(i,owner);
    expect((await state.readGo721State(31337)).approved).toBe(true);
    await expect(server.getGo721Intent(i.id,session(admin))).rejects.toThrow('another wallet');
  });
  it('keeps actor-owned recovery available after more than 25 other-wallet reviews',async()=>{
    await db.query(`insert into public.publication_records(actor,chain_id,contract,payload)
      select $1,31337,$2,'{"kind":"go721_launch","action":{"type":"grant"}}'::jsonb from generate_series(1,30)`,
      [buyers[0].toLowerCase(),GO721_COLLECTION.toLowerCase()]);
    const own=await server.go721History(31337,session(owner));
    expect(own.some((i:any)=>i.id===report.ownerReview.id)).toBe(true);
    expect(own.every((i:any)=>i.actor===owner.toLowerCase())).toBe(true);
    report.checks.push('actor filtering precedes the recovery ledger limit');
  });
  it('blocks expired reviews, revoked roles, changed nonce and altered saved CID',async()=>{
    const a={type:'configure',round:1,startTime:Number((await c.getBlock()).timestamp)+900};const i=await api.call('prepare_go721',{chainId:31337,action:a});
    expect((await api.request('intent',{id:i.id})).body.error).toBe('WRONG_TRANSACTION_FLOW');
    await db.query("update public.publication_records set payload=jsonb_set(payload,'{tx,expiresAt}','\"2020-01-01T00:00:00.000Z\"') where id=$1",[i.id]);
    expect((await api.request('preflight_go721',{id:i.id})).body.error).toBe('REVIEW_EXPIRED');
    const fresh=await api.call('prepare_go721',{chainId:31337,action:a});await rawRole([admin],false);
    expect((await api.request('preflight_go721',{id:fresh.id})).body.error).toBe('ADMIN_REQUIRED');await rawRole([admin],true);
    const beforeNonce=await api.call('prepare_go721',{chainId:31337,action:a});
    const h=await w.sendTransaction({account:admin,to:admin,value:0n});await c.waitForTransactionReceipt({hash:h});
    expect((await api.request('preflight_go721',{id:beforeNonce.id})).body.error).toBe('GO721_STATE_CHANGED');
    await db.query("update public.erc721_workspace_drafts set draft=jsonb_set(draft,'{presaleMetadataBaseUri}',to_jsonb($1::text)) where id=$2",[GO721_FOLDERS[2],GO721_DRAFT_ID]);
    expect((await api.request('prepare_go721',{chainId:31337,action:a})).body.error).toBe('GO721_DRAFT_CHANGED');
    await db.query("update public.erc721_workspace_drafts set draft=jsonb_set(draft,'{presaleMetadataBaseUri}',to_jsonb($1::text)) where id=$2",[GO721_FOLDERS[1],GO721_DRAFT_ID]);
    report.checks.push('expiry + revoked admin + nonce change + CID change + GO1 separation');
  });
  it('recovers a same-nonce cancellation without resending or configuring a drop',async()=>{
    const i=await api.call('prepare_go721',{chainId:31337,action:{type:'configure',round:1,startTime:Number((await c.getBlock()).timestamp)+900}});
    const tx=await server.preflightGo721(i.id,session(admin));
    await rpcCall('anvil_setAutomine',[false]);
    try{
      const original=await w.sendTransaction({account:admin,to:tx.to,data:tx.data,nonce:tx.nonce,
        gas:BigInt(tx.gas),maxFeePerGas:BigInt(tx.maxFeePerGas),maxPriorityFeePerGas:BigInt(tx.maxPriorityFeePerGas)});
      await server.attachGo721(i.id,original,session(admin));
      const cancel=await w.sendTransaction({account:admin,to:admin,value:0n,nonce:tx.nonce,gas:21000n,
        maxFeePerGas:BigInt(tx.maxFeePerGas)*2n,maxPriorityFeePerGas:BigInt(tx.maxPriorityFeePerGas)*2n});
      await rpcCall('evm_mine');
      const result=await server.cancelGo721(i.id,cancel,session(admin));expect(result.status).toBe('REPLACED');
      expect((await state.readGo721State(31337)).phase).toBe(0);
      report.checks.push('same-nonce cancellation verified; no resubmission');
    }finally{await rpcCall('anvil_setAutomine',[true]);}
  });
  it('configures the exact presale through the authenticated API and rejects early public round',async()=>{
    const i=await api.call('prepare_go721',{chainId:31337,action:{type:'configure',round:1,startTime:Number((await c.getBlock()).timestamp)+900}});report.presaleReview=i;
    const result=await execute(i,admin);expect(result.payload.receipt.action).toBe('configure');
    expect((await api.request('prepare_go721',{chainId:31337,action:{type:'configure',round:2,startTime:Number((await c.getBlock()).timestamp)+300}})).status).toBe(409);
    await expect(server.prepareGo721(31337,{type:'purchase',quantity:3},session(owner))).rejects.toThrow('phase');
  });
  it('rejects unlisted recipients and burned history; quotes free artwork plus protocol fee',async()=>{
    await advance(Number(report.presaleReview.payload.drop.startTime)+5);
    const no=new ApiSession(buyers[0]);await no.login();expect((await no.request('prepare_go721',{chainId:31337,action:{type:'purchase',quantity:1}})).body.error).toBe('GO721_ELIGIBILITY');
    // No RPC transport or metadata mocks: altered local storage must fail closed.
    const snap=await rpcCall('evm_snapshot');await rpcCall('anvil_setStorageAt',[GO721_COLLECTION,toHex(0,{size:32}),toHex(1,{size:32})]);
    await rpcCall('anvil_setStorageAt',[GO721_COLLECTION,toHex(1,{size:32}),toHex(1,{size:32})]);
    await expect(server.prepareGo721(31337,{type:'purchase',quantity:3},session(owner))).rejects.toThrow('history');
    await rpcCall('evm_revert',[snap]);
    const i=await server.prepareGo721(31337,{type:'purchase',quantity:3},session(owner));report.presaleCheckoutReview=i;
    expect(i.payload.mintPriceWei).toBe('0');expect(BigInt(i.payload.tx.value)).toBe(3n*BigInt(i.payload.protocolFeeWei));
    const result=await execute(i,owner);expect(result.payload.receipt.tokens.map((t:any)=>t.tokenId)).toEqual(['1','2','3']);
    expect((await state.verifyFinalPresale(31337)).tokenIds).toEqual(['1','2','3']);
    expect((await server.go721Readiness(31337,session(admin))).publicRoundReady).toBe(true);
  });
  it('configures the separate public round only after verified presale purchases',async()=>{
    const when=Number((await c.getBlock()).timestamp)+60;
    const i=await api.call('prepare_go721',{chainId:31337,action:{type:'configure',round:2,startTime:when}});report.publicReview=i;
    expect(i.payload.presaleEvidence.tokenIds).toEqual(['1','2','3']);await execute(i,admin);await advance(when+5);
  });
  it('runs public checkout, rejects forged receipts and verifies 27 NFTs plus exact 0.675 ETH payout',async()=>{
    const payoutBefore=await c.getBalance({address:GO721_APPROVED.payoutReceiver});
    // Simulate the documented mempool race: a third buyer reviews 10 before
    // two earlier transactions consume 20. The real contract caps it to 7.
    const race=await server.prepareGo721(31337,{type:'purchase',quantity:10},session(buyers[2]));
    const raceTx=await server.preflightGo721(race.id,session(buyers[2]));
    for(const [n,amount] of [10,10,7].entries()){
      const buyer=buyers[n],sessionApi=new ApiSession(buyer);await sessionApi.login();
      const quote=await sessionApi.call('public_go721_status',{chainId:31337,recipient:buyer,quantity:10});
      expect(quote.displayedQuote.mintableQuantity).toBe(amount);
      const i=n===2?race:await sessionApi.call('prepare_go721',{chainId:31337,action:{type:'purchase',quantity:10}});
      if(n===0){report.publicCheckoutReview=i;const bad=report.transactions[0].tx_hash;
        expect((await sessionApi.request('attach_go721',{id:i.id,txHash:bad})).body.error).toBe('TX_MISMATCH');}
      let result;
      if(n===2){
        expect((await sessionApi.request('preflight_go721',{id:i.id})).body.error).toBe('GO721_STATE_CHANGED');
        const balanceBefore=await c.getBalance({address:buyer});
        const hash=await w.sendTransaction({account:buyer,to:raceTx.to,data:raceTx.data,value:BigInt(raceTx.value),nonce:raceTx.nonce,
          gas:BigInt(raceTx.gas),maxFeePerGas:BigInt(raceTx.maxFeePerGas),maxPriorityFeePerGas:BigInt(raceTx.maxPriorityFeePerGas)});
        await c.waitForTransactionReceipt({hash});await server.attachGo721(i.id,hash,session(buyer));
        result=await server.confirmGo721(i.id,session(buyer));expect(result.status).toBe('CONFIRMED');
        expect(result.payload.receipt.partialFill).toBe(true);
        const net=balanceBefore-await c.getBalance({address:buyer})-BigInt(result.payload.receipt.gasPaidWei);
        expect(net).toBe(7n*(parseEther('0.025')+BigInt(i.payload.protocolFeeWei)));
        report.transactions.push(result);report.checks.push('mempool partial fill 10 → 7; excess ETH refund verified by balance delta excluding gas');
      }else result=await execute(i,buyer);
      expect(result.payload.receipt.actualQuantity).toBe(amount);
      expect(await server.confirmGo721(i.id,session(buyer))).toMatchObject(result);
      expect((await sessionApi.request('preflight_go721',{id:i.id})).body.error).toBe('GO721_ALREADY_SUBMITTED');
    }
    expect(await c.getBalance({address:GO721_APPROVED.payoutReceiver})-payoutBefore).toBe(parseEther('0.675'));
    for(let id=1;id<=30;id++){
      const uri=await c.readContract({address:GO721_COLLECTION,abi:creatorAbi,functionName:'tokenURI',args:[BigInt(id)]});
      expect(uri).toBe(GO721_FOLDERS[id<=3?1:2]+'/'+(id<=3?id-1:id-4));
      const expected=id<=3?owner:id<=13?buyers[0]:id<=23?buyers[1]:buyers[2];
      expect(await c.readContract({address:GO721_COLLECTION,abi:creatorAbi,functionName:'ownerOf',args:[BigInt(id)]})).toBe(getAddress(expected));
    }
    const final=await state.readGo721State(31337);expect(final.counter).toBe(30n);expect(final.burns).toBe(0n);expect(final.drop.supply).toBe(0n);
    report.final={counter:'30',burned:'0',remaining:'0',publicPayoutWei:parseEther('0.675').toString(),metadataPathsVerified:30};
    report.checks.push('public purchases + 10-wallet cap + reduced final quote + token IDs and URIs 1–30 + exact payout + receipt idempotency');
  },180000);
});
