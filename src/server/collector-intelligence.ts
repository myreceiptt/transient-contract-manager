import { getAddress, parseAbiItem, zeroAddress, type Address } from 'viem';
import { AppError } from '../lib/domain';
import { creatorAbi } from '../lib/abi';
import { client } from './chain';
import { command } from './db';
import { publicPage } from './transactions';

const transferSingle = parseAbiItem(
  'event TransferSingle(address indexed operator,address indexed from,address indexed to,uint256 id,uint256 value)');
const transferBatch = parseAbiItem(
  'event TransferBatch(address indexed operator,address indexed from,address indexed to,uint256[] ids,uint256[] values)');
const purchase = parseAbiItem(
  'event Purchase(address indexed nftAddress,uint256 indexed tokenId,address nftReceiver,address currencyAddress,uint256 amount,uint256 price,int256 decayRate,bool isPresale)');
const ZERO = zeroAddress.toLowerCase();
const chunkSize = 5000n;
// On-demand, bounded chain scans. Repeated calls incrementally fill the database.
// A partial index can show recent activity, but MUST NOT claim a complete collector count.
type EventRow = {
  kind:'TRANSFER'|'PURCHASE'; txHash:string;logIndex:number;block:string;
  fromWallet:string|null;toWallet:string|null;amount:string;
};
function cursor(p:{chainId:number;contract:string;tokenId:string}) {
  return {chainId:p.chainId,contract:p.contract.toLowerCase(),tokenId:p.tokenId};
}
async function logsInRange(chainId:number,contract:Address,tokenId:bigint,stacks:Address,
  from:bigint,to:bigint):Promise<EventRow[]>{
  const c=client(chainId);
  const [single,batch,purchases]=await Promise.all([
    c.getLogs({address:contract,event:transferSingle,fromBlock:from,toBlock:to}),
    c.getLogs({address:contract,event:transferBatch,fromBlock:from,toBlock:to}),
    c.getLogs({address:stacks,event:purchase,args:{nftAddress:contract,tokenId},
      fromBlock:from,toBlock:to}),
  ]);
  const rows:EventRow[]=[];
  function push(kind:EventRow['kind'],log:{transactionHash:string;logIndex:number;blockNumber:bigint},
    fromWallet:string|null,toWallet:string|null,amount:bigint){
    if(amount===0n)return;
    rows.push({kind,txHash:log.transactionHash.toLowerCase(),logIndex:log.logIndex,
      block:log.blockNumber.toString(),fromWallet:fromWallet?.toLowerCase()||null,
      toWallet:toWallet?.toLowerCase()||null,amount:amount.toString()});
  }
  for(const log of single)if(log.args.id===tokenId)
    push('TRANSFER',log,log.args.from!,log.args.to!,log.args.value!);
  for(const log of batch){
    const ids=log.args.ids||[],values=log.args.values||[];
    const qty=ids.reduce((sum,id,i)=>id===tokenId?sum+values[i]:sum,0n);
    if(qty>0n)push('TRANSFER',log,log.args.from!,log.args.to!,qty);
  }
  for(const log of purchases)
    push('PURCHASE',log,null,log.args.nftReceiver!,log.args.amount!);
  return rows;
}
async function scanChunk(input:ReturnType<typeof cursor>,state:any,verifiedStacks:Address,
  finalized:bigint):Promise<void>{
  const c=client(input.chainId);
  const backfill=BigInt(state.backfill_to);
  const live=BigInt(state.live_from);
  const mode=live<=finalized?'live':backfill>=0n?'backfill':null;
  if(!mode)return;
  let from=mode==='live'?live:backfill>=chunkSize-1n?backfill-chunkSize+1n:0n;
  let to=mode==='live'?(from+chunkSize-1n<finalized?from+chunkSize-1n:finalized):backfill;
  let events:EventRow[]|undefined;
  for(let attempt=0;attempt<3;attempt++){
    try{
      events=await logsInRange(input.chainId,getAddress(input.contract),
        BigInt(input.tokenId),verifiedStacks,from,to);
      if(events.length>1000)throw new Error('EVENT_CHUNK_TOO_LARGE');
      break;
    }catch(e){
      if(attempt===2)throw e;
      const narrow=to-from>1000n?1000n:to-from>50n?50n:10n;
      if(mode==='backfill')from=to-narrow>0n?to-narrow:0n;
      else to=from+narrow<finalized?from+narrow:finalized;
    }
  }
  if(!events)throw new AppError('INDEXING_FAILED','Event indexer did not read blockchain logs',503);
  await command('nft_index_ingest',{...input,from:from.toString(),to:to.toString(),mode,events});
}
export async function publicCollectorData(slug:string,holder?:Address,activityOffset=0,
  holderOffset=0){
  // Verify this is an accessible, non-archived published Mint Page before querying
  // indexed public event history. No admin session or secret is returned to callers.
  const page=await publicPage(slug);
  const input=cursor({chainId:page.chainId,contract:page.contract,tokenId:page.tokenId});
  const c=client(page.chainId);
  const observed=BigInt(page.onchain.blockNumber);
  const finalized=observed>12n?observed-12n:0n;
  let state=await command('nft_index_init',{...input,head:finalized.toString()});
  let scanWarning:string|null=null;
  if(!page.onchain.sale?.address){
    scanWarning='Verified TLStacks1155 is not currently available on this network.';
  }else{
    try{
      await scanChunk(input,state,getAddress(page.onchain.sale.address),finalized);
    }catch{
      scanWarning='Historical event synchronization is temporarily unavailable. Previously verified data remains visible.';
    }
  }
  const snapshot=await command('nft_index_read',{...input,activityOffset,holderOffset});
  state=snapshot.progress||state;
  const wallets=(snapshot.wallets as string[]||[]).slice(0,25);
  // Every displayed wallet quantity is a fresh ERC-1155 balanceOf read, NOT
  // the sum of partial event logs. If RPC fails, we omit the holder rather
  // than display an incorrect zero.
  const holderReads=await Promise.allSettled(wallets.map(async address=>{
    const balance=await c.readContract({address:getAddress(page.contract),abi:creatorAbi,
      functionName:'balanceOf',args:[getAddress(address),BigInt(page.tokenId)],
      blockNumber:observed}) as bigint;
    return {address,quantity:balance.toString()};
  }));
  const holders=holderReads.filter(r=>r.status==='fulfilled')
    .map(r=>(r as PromiseFulfilledResult<{address:string;quantity:string}>).value)
    .filter(r=>BigInt(r.quantity)>0n);
  let yourBalance:string|null=null;
  if(holder){
    try{
      const value=await c.readContract({address:getAddress(page.contract),abi:creatorAbi,
        functionName:'balanceOf',args:[holder,BigInt(page.tokenId)],
        blockNumber:observed}) as bigint;
      yourBalance=value.toString();
    }catch{
      scanWarning='Balance verification failed; please refresh. Ownership is not assumed to be zero.';
    }
  }
  return {
    yourBalance,holders,hasMoreWalletCandidates:wallets.length===25,
    activity:snapshot.activities||[],
    moreActivity:(snapshot.activities||[]).length===25,
    historyComplete:snapshot.complete===true,
    historicalBackfillTo:String(state.backfill_to),
    syncedThroughBlock:String(state.observed_head),
    observedBlock:String(observed),
    scanWarning,
  };
}
