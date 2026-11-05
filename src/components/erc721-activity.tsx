'use client';
import {useState} from 'react';
import {ArrowUpRight,History,LockKeyhole,RefreshCw} from 'lucide-react';
import {api,short} from '@/lib/api-client';
import {Loading,Notice} from './shell';
import {explorer,txExplorer} from '@/lib/chains';

const filters=['All activity','NFT transfers','Primary mint','Auctions','Application reviews'] as const;
type Filter=typeof filters[number];
type TransferRow={
  tokenId:string;from:string;to:string;type:'MINT'|'BURN'|'TRANSFER';
  blockNumber:string;transactionHash:string;logIndex:number;
};
type ActivityRead={
  events:TransferRow[];window:{from:string;to:string};observedBlock:string;
  nextBeforeBlock:string|null;capped:boolean;completeCollectionHistory:boolean;note:string;
};

export function Erc721Activity({chainId,contract}:{chainId:number;contract:string}){
  const [filter,setFilter]=useState<Filter>('All activity');
  const [events,setEvents]=useState<TransferRow[]>([]);
  const [lastRead,setLastRead]=useState<ActivityRead>();
  const [cursor,setCursor]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [requested,setRequested]=useState(false);
  async function read(older=false){
    setBusy(true);setError('');
    try{
      const result=await api('erc721_transfers',{chainId,contract,
        ...(older&&cursor?{beforeBlock:cursor}:{})}) as ActivityRead;
      setEvents(old=>older?[...old,...result.events]:result.events);
      setLastRead(result);setCursor(result.nextBeforeBlock);setRequested(true);
    }catch(e){setError(e instanceof Error?e.message:'Transfer history lookup failed.');}
    finally{setBusy(false);}
  }
  const canShowTransfers=filter==='All activity'||filter==='NFT transfers';
  return <div className="erc721-workflow">
    <section className="panel creator-studio-banner">
      <span className="eyebrow">COLLECTION LEDGER · ERC-721</span>
      <h2>Every action deserves a record.</h2>
      <p>One activity language for both GO1 and GO#|O, but independent
        transaction data and token standards. Existing ERC1155 reviews are never
        represented as ERC721 transactions.</p>
    </section>
    <section className="panel">
      <div className="section-top"><div><h2>Transactions & activity</h2>
        <p>Bounded, confirmed-block Transfer logs are available on demand.
          Complete on-chain indexing, sale settlement reconciliation and application
          review records are still separate unfinished capabilities.</p></div>
        <span className="tag">READ-ONLY</span>
      </div>
      <div className="erc721-metrics">
        <div><small>App-submitted ERC721 writes</small><strong>Disabled</strong></div>
        <div><small>Transfer event coverage</small>
          <strong>{lastRead?'Bounded scan':'Not indexed'}</strong></div>
        <div><small>Auction settlements</small><strong>Not indexed</strong></div>
      </div>
      <div className="erc721-filters" role="group" aria-label="Activity type">
        {filters.map(value=><button key={value} type="button"
          className={'button secondary compact'+(filter===value?' active':'')}
          aria-pressed={filter===value}
          onClick={()=>setFilter(value)}>{value}</button>)}
      </div>
      {canShowTransfers&&<div className="button-row">
        <button type="button" className="button secondary" disabled={busy}
          onClick={()=>void read(false)}><RefreshCw size={15}/> {busy?'Reading blocks…':'Read latest transfers'}</button>
        <button type="button" className="button secondary" disabled={busy||!cursor}
          onClick={()=>void read(true)}>Load earlier 1,000-block window</button>
      </div>}
      {busy&&<Loading label="Reading Ethereum ERC721 Transfer events…"/>}
      {error&&<Notice type="error">{error}</Notice>}
      {lastRead&&canShowTransfers&&<p className="fineprint">
        Last inspected block range {lastRead.window.from}–{lastRead.window.to}.
        {lastRead.capped?' More than 100 events were found; results are truncated. Narrower indexing is required to avoid gaps.':
          lastRead.completeCollectionHistory?' Inspected from genesis within this bounded result set.':
          ' Earlier chain activity may exist outside these windows.'}
      </p>}
      <div className="erc721-activity-table" role="region" aria-label="ERC721 transaction activity">
        <div className="erc721-activity-head">
          <span>Block</span><span>Action / Token</span><span>Wallet / Hash</span><span>Status</span>
        </div>
        {canShowTransfers&&events.length>0?events.map((event,i)=>
          <div key={event.transactionHash+':'+event.logIndex+':'+i}
            className="erc721-activity-entry">
            <span>{event.blockNumber}</span>
            <div><strong>{event.type} · Token #{event.tokenId}</strong>
              <small>From {short(event.from)} · To {short(event.to)}</small></div>
            <div><a href={txExplorer(chainId,event.transactionHash)}
                target="_blank" rel="noopener noreferrer" className="mono">
              {short(event.transactionHash)} <ArrowUpRight size={13}/></a></div>
            <span className="tag">On-chain log</span>
          </div>):<div className="erc721-empty-ledger">
            {filter==='Application reviews'?<LockKeyhole size={22}/>:<History size={22}/>}
            <strong>{filter==='Application reviews'?'No ERC721 transaction review ledger connected':
              canShowTransfers?
                requested?'No Transfer events found in the inspected window':'Read the latest window to inspect confirmed Transfer events':
                'No indexed '+filter.toLowerCase()+' available'}</strong>
            <p>This is an indexing/implementation limitation, <strong>not evidence that
              no on-chain activity has ever occurred</strong>. Prepared metadata or
              local auction proposals are not blockchain transactions.</p>
          </div>}
      </div>
      <Notice>No transaction is automatically retried or submitted. Transfer logs
        do not establish current ownership without a fresh ownerOf() read, and they
        do not include TLStacks721 sale configuration or AuctionHouse settlement.
        Royalty information remains unverified until a dedicated reader is accepted.</Notice>
      <p className="fineprint"><a href={explorer(chainId,contract)}
        target="_blank" rel="noopener noreferrer">
        Inspect the contract with an external block explorer <ArrowUpRight size={13}/>
      </a></p>
    </section>
  </div>;
}
