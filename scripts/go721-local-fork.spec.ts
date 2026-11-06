import {beforeAll,afterAll,describe,expect,it} from 'vitest';
import {spawn,type ChildProcess} from 'node:child_process';
import {createPublicClient,createWalletClient,http,getAddress,keccak256,
  stringToHex,parseAbi,parseEther,formatEther,zeroAddress,
  type Address,type Hex} from 'viem';
import {localChain} from '../src/lib/chains';
import {GO721_COLLECTION,GO721_STACKS,go721DropAbi,go721ViewsAbi,GO721_APPROVED,
  quoteGo721Mint} from '../src/lib/go721-sale-engine';
import {planGo721Drop} from '../src/lib/go721-sale-plan';

/** Real TLStacks721 and real ERC721TL EIP-1167 deployed bytecode in a local,
 * disposable Anvil fork of Ethereum. All transactions go ONLY to 127.0.0.1.
 * This does NOT establish real mainnet deployment safety or authorize signing.
 *
 * Run: TCM_GO721_FORK=1 npx vitest run scripts/go721-local-fork.spec.ts
 */
const enabled=process.env.TCM_GO721_FORK==='1';
const describeWhen=enabled?describe:describe.skip;
const port=18611;
const rpc='http://127.0.0.1:'+port;
const forkUrl=process.env.TCM_GO721_FORK_RPC||'https://ethereum-rpc.publicnode.com';
// PublicNode no longer allows historical archive calls without an API token.
// Use a coherent latest-state fork unless a private archive RPC + block is provided.
const forkBlock=Number(process.env.TCM_GO721_FORK_BLOCK||'0');
const c=createPublicClient({chain:localChain,transport:http(rpc,{retryCount:0,timeout:18000})});
const w=createWalletClient({chain:localChain,transport:http(rpc,{retryCount:0,timeout:18000})});
const creatorAbi=parseAbi([
  'function owner() view returns (address)',
  'function setRole(bytes32 role,address[] accounts,bool status)',
  'function hasRole(bytes32 role,address account) view returns (bool)',
  'function totalSupply() view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
]);
const configureAbi=[{
  type:'function',name:'configureDrop',stateMutability:'nonpayable',
  inputs:[{name:'nftAddress',type:'address'},{
    name:'drop',type:'tuple',components:go721DropAbi[0].outputs[0].components
  }],outputs:[],
}] as const;
const purchaseAbi=parseAbi([
 'function purchase(address nftAddress,address recipient,uint256 numberToMint,uint256 presaleNumberCanMint,bytes32[] proof) payable returns (uint256)',
]);
const minterRole=keccak256(stringToHex('APPROVED_MINT_CONTRACT'));
const presaleUri='ipfs://bafybeicrfkcsgbcxbkk6ica3al4k4ykxivdccw3issjqjipw3aepit5bhm';
const publicUri='ipfs://bafybeieqdjqgmt6dj6z7pxoa3r3cymkq3izcl3qdmlldvgbljhw73ravwm';
const fixtureWallet=GO721_APPROVED.presale.recipient;
let anvil:ChildProcess|undefined;
let owner:Address,buyers:Address[]=[],fee=0n;
let payoutBefore=0n;
const rpcCall=(method:string,params:any[]=[])=>c.request({method,params} as any) as Promise<any>;
async function tx(account:Address,address:Address,abi:any,functionName:string,args:any[],value?:bigint){
  const hash=await w.writeContract({
    account,address,abi,functionName,args,
    ...(value===undefined?{}:{value}),
  } as any);
  const receipt=await c.waitForTransactionReceipt({hash,confirmations:1});
  expect(receipt.status,'Local-fork transaction '+functionName).toBe('success');
  return receipt;
}
async function fund(address:Address,eth='10'){
  await rpcCall('anvil_setBalance',[address,'0x'+parseEther(eth).toString(16)]);
}
async function impersonate(address:Address){
  await rpcCall('anvil_impersonateAccount',[address]);await fund(address);
}
async function nextBlock(ts:number){
  await rpcCall('evm_setNextBlockTimestamp',[ts]);
  await rpcCall('evm_mine');
}

describeWhen('GO#|O local mainnet-fork TLStacks721 3+27 lifecycle (never mainnet writes)',()=>{
  beforeAll(async()=>{
    if(!Number.isSafeInteger(forkBlock)||forkBlock<0)throw Error('Invalid fork block');
    anvil=spawn(process.execPath,[
      'node_modules/@foundry-rs/anvil/bin.mjs','--host','127.0.0.1','--port',String(port),
      '--chain-id','31337','--silent','--fork-url',forkUrl,
      ...(forkBlock>0?['--fork-block-number',String(forkBlock)]:[]),
    ],{stdio:['ignore','pipe','pipe']});
    let stderr='';
    anvil.stderr?.on('data',x=>{stderr+=String(x)});
    let connected=false;
    for(let i=0;i<80;i++){
      try{connected=(await c.getChainId())===31337;if(connected)break;}catch{}
      if(anvil.exitCode!==null)throw Error('Anvil exited: '+stderr.slice(-2000));
      await new Promise(ok=>setTimeout(ok,500));
    }
    expect(connected,'Fork startup failed: '+stderr.slice(-2000)).toBe(true);
    const accounts=await w.getAddresses();buyers=accounts.slice(0,3).map(getAddress);
    expect(buyers).toHaveLength(3);
    owner=await c.readContract({address:GO721_COLLECTION,abi:creatorAbi,functionName:'owner'});
    await impersonate(owner);await impersonate(fixtureWallet);
    fee=await c.readContract({address:GO721_STACKS,abi:go721ViewsAbi,functionName:'protocolFee'});
    const version=await c.readContract({address:GO721_STACKS,abi:go721ViewsAbi,functionName:'VERSION'});
    expect(version).toBe('2.3.1');
    const prior=await c.readContract({address:GO721_COLLECTION,abi:creatorAbi,functionName:'totalSupply'});
    expect(prior,'Fork snapshot must contain no previously minted GO#|O NFTs').toBe(0n);
    const phase=await c.readContract({address:GO721_STACKS,abi:go721ViewsAbi,
      functionName:'getDropPhase',args:[GO721_COLLECTION]});
    expect(Number(phase),'Do not overwrite an active real-world sale in the fork fixture').toBe(0);
    payoutBefore=await c.getBalance({address:GO721_APPROVED.payoutReceiver});
  },200000);
  afterAll(async()=>{
    anvil?.kill('SIGTERM');
  },30000);
  it('grants ONLY the official TLStacks721 local-fork minter role',async()=>{
    const existing=await c.readContract({address:GO721_COLLECTION,abi:creatorAbi,
      functionName:'hasRole',args:[minterRole,GO721_STACKS]});
    if(!existing)await tx(owner,GO721_COLLECTION,creatorAbi,
      'setRole',[minterRole,[GO721_STACKS],true]);
    expect(await c.readContract({address:GO721_COLLECTION,abi:creatorAbi,
      functionName:'hasRole',args:[minterRole,GO721_STACKS]})).toBe(true);
  });
  it('configures a three-NFT allowlisted drop and sequentially mints token IDs 1–3',async()=>{
    const start=GO721_APPROVED.presale.startTimestampSeconds;
    await nextBlock(start-20);
    const config=planGo721Drop({round:1,metadataBaseUri:presaleUri,
      historicalTokenCounterVerified:true,presaleDurationSeconds:86400});
    await tx(owner,GO721_STACKS,configureAbi,'configureDrop',[GO721_COLLECTION,config]);
    const drop=await c.readContract({address:GO721_STACKS,abi:go721DropAbi,
      functionName:'getDrop',args:[GO721_COLLECTION]});
    expect(drop.initialSupply).toBe(3n);expect(drop.presaleMerkleRoot).toBe(GO721_APPROVED.presale.merkleRoot);
    await nextBlock(start+5);
    const phase=await c.readContract({address:GO721_STACKS,abi:go721ViewsAbi,
      functionName:'getDropPhase',args:[GO721_COLLECTION]});
    expect(Number(phase)).toBe(2);
    const q=quoteGo721Mint({
      reportedVersion:'2.3.1',paused:false,phase:2,roundNumber:0n,
      supply:drop.supply,initialSupply:drop.initialSupply,allowance:drop.allowance,
      presaleMerkleRoot:drop.presaleMerkleRoot,presaleCost:drop.presaleCost,
      publicCost:drop.publicCost,currencyAddress:drop.currencyAddress,
      payoutReceiver:drop.payoutReceiver,baseUri:drop.baseUri,
      protocolFee:fee,mintedByWallet:0n,
    },fixtureWallet,3);
    expect(q.allowed).toBe(true);
    await tx(fixtureWallet,GO721_STACKS,purchaseAbi,'purchase',
      [GO721_COLLECTION,fixtureWallet,3n,3n,[]],3n*fee);
    for(let n=1;n<=3;n++){
      expect(await c.readContract({address:GO721_COLLECTION,abi:creatorAbi,
        functionName:'ownerOf',args:[BigInt(n)]})).toBe(getAddress(fixtureWallet));
      expect(await c.readContract({address:GO721_COLLECTION,abi:creatorAbi,
        functionName:'tokenURI',args:[BigInt(n)]})).toBe(presaleUri+'/'+(n-1));
    }
    const after=await c.readContract({address:GO721_STACKS,abi:go721DropAbi,
      functionName:'getDrop',args:[GO721_COLLECTION]});
    expect(after.supply).toBe(0n);
    const ended=await c.readContract({address:GO721_STACKS,abi:go721ViewsAbi,
      functionName:'getDropPhase',args:[GO721_COLLECTION]});
    expect(Number(ended)).toBe(4);
  },120000);
  it('configures a second distinct 27-NFT public drop and mints IDs 4–30',async()=>{
    const start=GO721_APPROVED.presale.startTimestampSeconds+60;
    const publicPlan=planGo721Drop({round:2,metadataBaseUri:publicUri,
      historicalTokenCounterVerified:true,confirmedPresaleMints:3,round2StartSeconds:start});
    await tx(owner,GO721_STACKS,configureAbi,'configureDrop',[GO721_COLLECTION,publicPlan]);
    const round=await c.readContract({address:GO721_STACKS,abi:go721ViewsAbi,
      functionName:'getDropRound',args:[GO721_COLLECTION]});
    expect(round).toBe(1n);
    await nextBlock(start+5);
    const phase=await c.readContract({address:GO721_STACKS,abi:go721ViewsAbi,
      functionName:'getDropPhase',args:[GO721_COLLECTION]});
    expect(Number(phase)).toBe(3);
    const sales=[10,10,7] as const;
    for(let buyer=0;buyer<3;buyer++){
      const account=buyers[buyer];await fund(account);
      const amount=BigInt(sales[buyer]);
      await tx(account,GO721_STACKS,purchaseAbi,'purchase',
        [GO721_COLLECTION,account,amount,0n,[]],amount*(parseEther('0.025')+fee));
      const got=await c.readContract({address:GO721_STACKS,abi:go721ViewsAbi,
        functionName:'getNumberMinted',args:[GO721_COLLECTION,account]});
      expect(got).toBe(amount);
    }
    for(let n=4;n<=30;n++){
      const expected= n<=13?buyers[0]:n<=23?buyers[1]:buyers[2];
      expect(await c.readContract({address:GO721_COLLECTION,abi:creatorAbi,
        functionName:'ownerOf',args:[BigInt(n)]})).toBe(getAddress(expected));
      expect(await c.readContract({address:GO721_COLLECTION,abi:creatorAbi,
        functionName:'tokenURI',args:[BigInt(n)]})).toBe(publicUri+'/'+(n-4));
    }
    expect(await c.readContract({address:GO721_COLLECTION,abi:creatorAbi,
      functionName:'totalSupply'})).toBe(30n);
    const payoutAfter=await c.getBalance({address:GO721_APPROVED.payoutReceiver});
    expect(payoutAfter-payoutBefore).toBe(parseEther('0.675'));
    const drop=await c.readContract({address:GO721_STACKS,abi:go721DropAbi,
      functionName:'getDrop',args:[GO721_COLLECTION]});
    expect(drop.supply).toBe(0n);
  },180000);
});
