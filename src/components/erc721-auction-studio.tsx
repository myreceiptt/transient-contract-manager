'use client';
import {useEffect,useState} from 'react';
import {isAddress,parseEther,zeroAddress} from 'viem';
import {Gavel,ShieldCheck} from 'lucide-react';
import {api,short} from '@/lib/api-client';
import {reviewAuctionProposalLocally} from '@/lib/auction-planning';
import {Erc721MarketStatus} from './erc721-market-status';
import {Loading,Notice} from './shell';
import {Artwork} from './safe-media';

type Ownership={tokenId:string;owner:string;observedBlock:string};
const listingTypes=[
  ['SCHEDULED_AUCTION','Scheduled auction'],
  ['RESERVE_AUCTION','Reserve auction'],
  ['RESERVE_AUCTION_PLUS_BUY_NOW','Reserve + Buy Now'],
  ['BUY_NOW','Buy Now'],
] as const;

export function Erc721AuctionStudio({chainId,contract,wallet}:{
  chainId:number;contract:string;wallet?:string;
}){
  const [tokenId,setTokenId]=useState('');
  const [ownership,setOwnership]=useState<Ownership>();
  const [ownerError,setOwnerError]=useState('');
  const [tokenMetadata,setTokenMetadata]=useState<any>();
  const [checking,setChecking]=useState(false);
  const [listingType,setListingType]=useState<string>('RESERVE_AUCTION');
  const [payoutReceiver,setPayoutReceiver]=useState(wallet||'');
  const [reserveEth,setReserveEth]=useState('');
  const [buyNowEth,setBuyNowEth]=useState('');
  const [durationHours,setDurationHours]=useState('24');
  const [proposal,setProposal]=useState<ReturnType<typeof reviewAuctionProposalLocally>>();
  const [proposalError,setProposalError]=useState('');
  useEffect(()=>{
    setOwnership(undefined);setProposal(undefined);setTokenMetadata(undefined);setPayoutReceiver(wallet||'');
  },[wallet,contract,chainId]);
  function clearReview(){setProposal(undefined);setProposalError('');}
  async function lookupOwnership(){
    setChecking(true);setOwnerError('');setOwnership(undefined);setTokenMetadata(undefined);clearReview();
    try {
      if(!/^[1-9][0-9]*$/.test(tokenId)||Number(tokenId)>100000000)
        throw Error('Enter an existing Token ID between 1 and 100000000.');
      const out=await api('scan_erc721',{chainId,contract,start:Number(tokenId),count:1});
      const row=out.tokens?.[0];
      if(row?.status!=='OWNED'||!row.owner)
        throw Error('NFT ownership not verified. It may be missing, burned, or unavailable.');
      setOwnership({tokenId,owner:row.owner,observedBlock:String(out.observedBlock)});
      if(row.tokenUri){
        try{setTokenMetadata(await api('metadata',{uri:row.tokenUri}));}
        catch{/* Ownership remains authoritative even if media cannot be resolved. */}
      }
    }catch(e){setOwnerError(e instanceof Error?e.message:'Ownership lookup failed');}
    finally{setChecking(false);}
  }
  const hasOwner=!!wallet&&!!ownership&&ownership.owner.toLowerCase()===wallet.toLowerCase();
  const withBuyNow=listingType==='BUY_NOW'||listingType==='RESERVE_AUCTION_PLUS_BUY_NOW';
  const withReserve=listingType!=='BUY_NOW';
  function review(){
    clearReview();
    try{
      if(!hasOwner||!wallet||!ownership||ownership.tokenId!==tokenId)
        throw Error('A fresh ownerOf read must show that the connected wallet owns this NFT.');
      if(!isAddress(payoutReceiver,{strict:false}))throw Error('A valid payout wallet is required.');
      if(chainId!==1)throw Error('Auction preparation is currently scoped to Ethereum Mainnet.');
      const reservePrice=withReserve?parseEther(reserveEth).toString():'0';
      const buyNowPrice=withBuyNow?parseEther(buyNowEth).toString():'0';
      const duration=listingType==='BUY_NOW'?'0':String(Number(durationHours)*3600);
      const out=reviewAuctionProposalLocally({
        chainId,nftContract:contract,tokenId,seller:wallet,
        payoutReceiver,currencyAddress:zeroAddress,listingType,
        openTime:'0',reservePrice,duration,buyNowPrice,
      });
      setProposal(out);
    }catch(e){setProposalError(e instanceof Error?e.message:'Invalid listing proposal');}
  }
  return <div className="erc721-workflow">
    <section className="panel creator-studio-banner">
      <span className="eyebrow">SECONDARY SALES · TLAUCTIONHOUSE</span>
      <h2>Every original has its own story.</h2>
      <p>Explore individual NFT listings and prepare a proposed sale for an already minted
        token. The seller must be the token owner, not merely a collection administrator.
        Real listing would transfer the NFT into AuctionHouse escrow.</p>
    </section>
    <section className="panel">
      <div className="section-top"><div><h2>Auction catalogue</h2>
        <p>Collection-wide listing indexing has not been implemented.
          Inspect a specific Token ID; no active-auction totals are inferred.</p></div>
        <span className="tag">UNINDEXED · READ ONLY</span>
      </div>
      <div className="erc721-metrics">
        <div><small>Listings discovered</small><strong>Not indexed</strong></div>
        <div><small>Connected seller wallet</small><strong>{wallet?short(wallet):'Not connected'}</strong></div>
        <div><small>Signing status</small><strong>Disabled</strong></div>
      </div>
      <Erc721MarketStatus chainId={chainId} contract={contract} view="auction"/>
    </section>
    <section className="panel">
      <div className="section-top"><div><h2>Prepare an NFT auction</h2>
        <p>Review an illustrative listing plan locally. This does not send a transaction,
          create an approval, custody a token, or persist a draft.</p></div>
        <span className="tag">LOCAL REVIEW ONLY</span>
      </div>
      <Notice>ERC721 approval and AuctionHouse escrow are major asset movements.
        No approval or listing action is enabled until the exact protocol runtime,
        seller permissions, marketplace status, and wallet transaction review are verified.</Notice>
      <div className="form-grid">
        <label>Existing NFT Token ID
          <input inputMode="numeric" value={tokenId} placeholder="e.g. 1"
            onChange={e=>{setTokenId(e.target.value);setOwnership(undefined);setTokenMetadata(undefined);clearReview();}}/>
        </label>
        <div className="erc721-lookup-control">
          <button type="button" className="button secondary" onClick={()=>void lookupOwnership()}
            disabled={checking||!/^[1-9][0-9]*$/.test(tokenId)}>
            {checking?'Checking owner…':'Check NFT owner'}
          </button>
        </div>
      </div>
      {checking&&<Loading label="Reading ownerOf() at one Ethereum block…"/>}
      {ownerError&&<Notice type="error">{ownerError}</Notice>}
      {ownership&&<div className="erc721-diagnostic">
        {tokenMetadata&&<div className="erc721-token-observation">
          <Artwork uri={tokenMetadata.image} alt={tokenMetadata.name||'NFT artwork'}/>
          <div><span className="eyebrow">EXISTING ERC721 NFT</span>
            <h3>{tokenMetadata.name||'Token #'+ownership.tokenId}</h3>
            <p>{tokenMetadata.description||'No description in resolved metadata.'}</p>
          </div>
        </div>}
        <h3>Ownership observation</h3>
        <dl><dt>Token ID</dt><dd>{ownership.tokenId}</dd>
          <dt>Current owner</dt><dd className="mono">{ownership.owner}</dd>
          <dt>Observed block</dt><dd>{ownership.observedBlock}</dd>
          <dt>Seller authorization</dt><dd>{hasOwner?'Connected wallet matched':'Not the connected wallet'}</dd>
        </dl>
        <small>Ownership can change after this read; a new check is required for any future transaction.</small>
      </div>}
      <div className="form-grid">
        <label>Listing type
          <select value={listingType} onChange={e=>{setListingType(e.target.value);clearReview();}}>
            {listingTypes.map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>Payout receiver
          <input spellCheck={false} value={payoutReceiver} onChange={e=>{setPayoutReceiver(e.target.value);clearReview();}}
            placeholder="0x..."/></label>
        {withReserve&&<label>Reserve price (ETH, draft)
          <input inputMode="decimal" value={reserveEth} onChange={e=>{setReserveEth(e.target.value);clearReview();}}
            placeholder="e.g. 0.2"/></label>}
        {withBuyNow&&<label>Buy Now price (ETH, draft)
          <input inputMode="decimal" value={buyNowEth} onChange={e=>{setBuyNowEth(e.target.value);clearReview();}}
            placeholder="e.g. 0.5"/></label>}
        {listingType!=='BUY_NOW'&&<label>Duration (hours, draft)
          <input inputMode="numeric" value={durationHours}
            onChange={e=>{setDurationHours(e.target.value);clearReview();}} placeholder="24"/></label>}
      </div>
      {proposalError&&<Notice type="error">{proposalError}</Notice>}
      <div className="button-row">
        <button className="button secondary" type="button" disabled={!hasOwner}
          onClick={review}><Gavel size={15}/> Review listing proposal locally</button>
        <button className="button" type="button" disabled>Approve / list disabled</button>
      </div>
      {proposal&&<div className="erc721-diagnostic">
        <div className="section-top"><h3>Listing review · no transaction</h3><ShieldCheck size={18}/></div>
        <dl>
          <dt>Listing type</dt><dd>{proposal.data.listingType}</dd>
          <dt>Token</dt><dd>#{proposal.data.tokenId}</dd>
          <dt>Seller</dt><dd className="mono">{proposal.data.seller}</dd>
          <dt>Receiver</dt><dd className="mono">{proposal.data.payoutReceiver}</dd>
          <dt>Reserve (wei)</dt><dd>{proposal.data.reservePrice}</dd>
          <dt>Buy Now (wei)</dt><dd>{proposal.data.buyNowPrice}</dd>
          <dt>Escrow</dt><dd>Would transfer token to the auction contract; not executed</dd>
          <dt>Signing</dt><dd>DISABLED</dd>
        </dl>
        {proposal.warnings.map(w=><p className="fineprint" key={w}>{w}</p>)}
      </div>}
    </section>
  </div>;
}
