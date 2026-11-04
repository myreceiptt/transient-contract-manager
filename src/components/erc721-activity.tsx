'use client';
import {useState} from 'react';
import {ArrowUpRight,History,LockKeyhole} from 'lucide-react';
import {Notice} from './shell';
import {explorer} from '@/lib/chains';

const filters=['All activity','NFT transfers','Primary mint','Auctions','Application reviews'] as const;
type Filter=typeof filters[number];
export function Erc721Activity({chainId,contract}:{
  chainId:number;contract:string;
}){
  const [filter,setFilter]=useState<Filter>('All activity');
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
        <p>Real on-chain history requires a verified, bounded Transfer-event
          and sale-contract indexer. The ERC721 workspace has no indexed ledger yet.</p></div>
        <span className="tag">READ-ONLY · NOT INDEXED</span>
      </div>
      <div className="erc721-metrics">
        <div><small>App-submitted ERC721 writes</small><strong>Disabled</strong></div>
        <div><small>On-chain Transfer history</small><strong>Not indexed</strong></div>
        <div><small>Auction settlements</small><strong>Not indexed</strong></div>
      </div>
      <div className="erc721-filters" role="group" aria-label="Activity type">
        {filters.map(value=><button key={value} type="button"
          className={'button secondary compact'+(filter===value?' active':'')}
          aria-pressed={filter===value}
          onClick={()=>setFilter(value)}>{value}</button>)}
      </div>
      <div className="erc721-activity-table" role="region" aria-label="ERC721 transaction activity">
        <div className="erc721-activity-head">
          <span>Time</span><span>Action / Token</span><span>Wallet / Hash</span><span>Status</span>
        </div>
        <div className="erc721-empty-ledger">
          {filter==='Application reviews'?<LockKeyhole size={22}/>:<History size={22}/>}
          <strong>{filter==='Application reviews'?'No ERC721 transaction review ledger connected':
            'No indexed '+filter.toLowerCase()+' available'}</strong>
          <p>This is an indexing/implementation limitation, <strong>not evidence that
            no on-chain activity has ever occurred</strong>. Prepared metadata or
            local auction proposals are not transactions.</p>
        </div>
      </div>
      <Notice>Confirmed, reverted, replaced and pending transactions will be distinguished
        only after a separate ERC721 adapter, receipt reconciler and indexer are accepted.
        No transaction is automatically retried or submitted.</Notice>
      <p className="fineprint"><a href={explorer(chainId,contract)}
        target="_blank" rel="noopener noreferrer">
        Inspect the contract with an external block explorer <ArrowUpRight size={13}/>
      </a></p>
    </section>
  </div>;
}
