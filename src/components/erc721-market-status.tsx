'use client';
import {useState} from 'react';
import {api,short} from '@/lib/api-client';
import {Notice,Loading} from './shell';
import {explorer} from '@/lib/chains';

type Props={chainId:number;contract:string;view:'stacks'|'auction'};
export function Erc721MarketStatus({chainId,contract,view}:Props){
  const [tokenId,setTokenId]=useState('');
  const [result,setResult]=useState<any>();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function read(){
    setBusy(true);setError('');setResult(undefined);
    try{
      const p:any={chainId,contract};
      if(view==='auction'&&tokenId)p.tokenId=tokenId;
      const response=await api('read_erc721_market',p);
      setResult(response);
    }catch(e){setError((e as Error).message);}
    finally{setBusy(false);}
  }
  const data=result?.[view==='stacks'?'sale':'auction'];
  return <div className="erc721-market-status">
    <div className="section-top">
      <div>
        <h3>{view==='stacks'?'On-chain TLStacks721 status':'On-chain AuctionHouse status'}</h3>
        <p className="muted">Read only · Ethereum Mainnet · observed at a specific block</p>
      </div>
      <span className="tag">NO SIGNING</span>
    </div>
    {view==='auction'&&<label>
      Existing ERC-721 Token ID (optional)
      <input inputMode="numeric" pattern="[1-9][0-9]*" value={tokenId}
        onChange={e=>{setTokenId(e.target.value);setResult(undefined);}}
        placeholder="e.g. 1 · leave blank for protocol information"/>
    </label>}
    <div className="button-row">
      <button className="button secondary" type="button" onClick={()=>void read()}
        disabled={busy||view==='auction'&&!!tokenId&&!/^[1-9][0-9]*$/.test(tokenId)}>
        {busy?'Reading Ethereum…':'Read current protocol status'}
      </button>
    </div>
    {busy&&<Loading label="Checking official deployment candidate and state…"/>}
    {error&&<Notice type="error">{error}</Notice>}
    {data&&<div className="erc721-diagnostic">
      <h3>{data.status==='READ_OK'?'Protocol observation':'Protocol read unavailable'}</h3>
      <dl>
        <dt>Read block</dt><dd>{result.observedBlock}</dd>
        <dt>Candidate protocol</dt>
        <dd><a href={explorer(chainId,data.address)}
          target="_blank" rel="noopener noreferrer" className="mono">
          {short(data.address)} ↗</a></dd>
        <dt>Reported VERSION()</dt><dd>{data.version??'Unavailable'}</dd>
        <dt>Read status</dt><dd>{data.status}</dd>
        {data.codeHash&&<><dt>Observed runtime hash</dt><dd className="mono">{data.codeHash}</dd></>}
        {view==='stacks'&&data.status==='READ_OK'&&<>
          <dt>Configured drop phase</dt><dd>{data.phaseLabel} ({data.phase})</dd>
          <dt>Collection sale round</dt><dd>{data.round}</dd>
          <dt>Identity scope</dt><dd>One primary drop per collection, not per Token ID</dd>
        </>}
        {view==='auction'&&data.listing&&<>
          <dt>Token ID</dt><dd>{data.tokenId}</dd>
          <dt>Listing configured</dt><dd>{data.listing.configured?'Yes':'No'}</dd>
          {data.listing.configured&&<>
            <dt>Listing type</dt><dd>{data.listing.typeLabel}</dd>
            <dt>Seller</dt><dd className="mono">{data.listing.seller}</dd>
            <dt>Payout receiver</dt><dd className="mono">{data.listing.payoutReceiver}</dd>
            <dt>Highest bid (base units)</dt><dd>{data.listing.highestBid}</dd>
            <dt>Next bid (base units)</dt><dd>{data.listing.nextBid}</dd>
            <dt>Listing ID</dt><dd>{data.listing.id}</dd>
          </>}
        </>}
      </dl>
      {data.message&&<p>{data.message}</p>}
      <Notice>{result.notice}</Notice>
      {view==='auction'&&data.listing?.configured&&<p className="fineprint">
        An on-chain listing is not proof that its auction is still open,
        that a bid can be submitted, or that its escrow is transferable.
        Live clock, pause and owner checks are required before any transaction.
      </p>}
    </div>}
  </div>;
}
