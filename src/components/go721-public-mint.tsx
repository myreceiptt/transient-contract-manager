'use client';
import {useEffect,useState} from 'react';
import {formatEther} from 'viem';
import {useConnection} from './providers';
import {api} from '@/lib/api-client';
import {Notice} from './shell';
import {GO_APPROVED_TERMS} from '@/lib/erc721-sale-terms';

type Status={
  collection:string;chainId:number;phase:number;phaseLabel:string;
  saleConfigured:boolean;paused?:boolean;round?:number;remainingSupply?:string;
  initialSupply?:string;protocolFeeWei?:string;priceWei?:string;
  alreadyMintedByWallet?:string;transactionExecutionEnabled:false;
  displayedQuote?:{allowed:boolean;issues:string[];mintableQuantity:number;
    reduced:boolean;totalBeforeGasWei:string};protocolStatus?:string;
  payoutReceiver?:string;startTime?:string;observedBlock?:string;
};
const safeEth=(v?:string)=>{try{return formatEther(BigInt(v||'0'));}catch{return '—';}};
export function Go721PublicMint(){
  const {address}=useConnection();
  const [status,setStatus]=useState<Status|null>(null);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [qty,setQty]=useState(1);
  async function refresh(wallet?:string){
    setBusy(true);setError('');
    try{setStatus(await api('public_go721_status',wallet?{recipient:wallet}:{}) as Status);}
    catch(e){setError(e instanceof Error?e.message:'Could not read Ethereum sale status.');}
    finally{setBusy(false);}
  }
  useEffect(()=>{
    void refresh(address);
    const timer=setInterval(()=>{void refresh(address);},30000);
    return()=>clearInterval(timer);
  },[address]);
  const max=Number(status?.remainingSupply||0);
  const limited=Number(status?.alreadyMintedByWallet||0);
  const cap=status?.phase===2?3:10;
  const mintable=Math.max(0,Math.min(qty,Math.max(0,max),Math.max(0,cap-limited)));
  const unitPrice=BigInt(status?.priceWei||'0');
  const fee=BigInt(status?.protocolFeeWei||'0');
  const subtotal=BigInt(mintable)*unitPrice;
  const protocolFee=BigInt(mintable)*fee;
  const statusText=!status?'Reading Ethereum…':status.phaseLabel||'Sale not configured';
  return <section className="go721-public">
    <div className="creator-studio-banner panel">
      <span className="eyebrow">ENDHONESA · ERC721TL · ONE OF ONE</span>
      <h1>Ganti Oli #1 | One of One</h1>
      <p>Thirty original NFTs, minted sequentially into the wallets of their first collectors.
        Artwork assignment follows the approved collection order; collectors cannot choose an edition number.</p>
      <span className="tag">MAINNET ETHEREUM · SALE NOT YET ENABLED</span>
    </div>
    <div className="go721-collector-layout">
      <section className="panel">
        <div className="section-top">
          <h2>Primary collection mint</h2>
          <button className="button secondary compact" type="button" disabled={busy}
            onClick={()=>void refresh(address)}>{busy?'Refreshing…':'Refresh status'}</button>
        </div>
        {error&&<Notice type="error">{error}</Notice>}
        <div className="erc721-campaign-facts">
          <div className="erc721-campaign-fact"><span>Observed phase</span><strong>{statusText}</strong></div>
          <div className="erc721-campaign-fact"><span>Mint allocation</span>
            <strong>{status?.saleConfigured?String(status.remainingSupply)+' remaining':'Not configured on-chain'}</strong></div>
          <div className="erc721-campaign-fact"><span>Whitelist phase</span><strong>3 originals · 0 ETH</strong>
            <small>Begins 10 Nov 2026, 10:10 WIB when configured</small></div>
          <div className="erc721-campaign-fact"><span>Public phase</span><strong>27 originals · 0.025 ETH each</strong>
            <small>Maximum 10 per recipient, after all 3 presale NFTs minted</small></div>
        </div>
        <label>Desired quantity
          <input type="number" min="1" max="10" value={qty}
            onChange={e=>setQty(Math.max(1,Math.min(10,Number(e.target.value)||1)))}/>
        </label>
        <div className="erc721-campaign-facts">
          <div className="erc721-campaign-fact">
            <span>Quantity currently eligible (estimate)</span><strong>{status?.saleConfigured?mintable:'—'}</strong>
            <small>TLStacks721 may cap requested quantity at the remaining allowance.</small>
          </div>
          <div className="erc721-campaign-fact"><span>Artwork price</span>
            <strong>{safeEth(subtotal.toString())} ETH</strong></div>
          <div className="erc721-campaign-fact"><span>Protocol fee</span>
            <strong>{safeEth(protocolFee.toString())} ETH</strong></div>
          <div className="erc721-campaign-fact"><span>Before Ethereum gas</span>
            <strong>{safeEth((subtotal+protocolFee).toString())} ETH</strong></div>
        </div>
        <button type="button" className="button wide" disabled>
          {address?'Mint locked until verified sale activation':'Connect wallet using the page header'}
        </button>
        <small>Connected wallet: {address||'Not connected'}. This page is a read-only collector preview;
          it cannot collect ETH, request a signature, or mint NFTs. The exact network gas charge is not included.</small>
        {status?.displayedQuote?.issues?.length? <details>
          <summary>Current availability details</summary>
          <ul>{status.displayedQuote.issues.map(x=><li key={x}>{x}</li>)}</ul>
        </details>:null}
        <Notice>A collection draft or a future launch time never activates a blockchain sale.
          Wallet minting remains unavailable until the exact contract runtime,
          approved permissions, two IPFS folder paths, and transaction pipeline pass acceptance.</Notice>
      </section>
      <section className="panel">
        <span className="eyebrow">COLLECTION CONDITIONS</span>
        <h2>Two sequential rounds</h2>
        <p>Round 1 is reserved for the approved single presale wallet.
          Only after its three NFTs are actually minted can the remaining 27 works move
          into the separately configured public round.</p>
        <div className="erc721-campaign-facts">
          <div className="erc721-campaign-fact"><span>Current contract</span>
            <strong className="mono">{GO_APPROVED_TERMS.collection}</strong></div>
          <div className="erc721-campaign-fact"><span>Royalty and mutable metadata</span>
            <small>Existing ERC721TL token metadata may be updated by authorized roles.
              This collection's artwork descriptions may change after mint.</small></div>
        </div>
        <a className="text-link" href={'https://etherscan.io/address/'+GO_APPROVED_TERMS.collection}
          target="_blank" rel="noopener noreferrer">View collection on Etherscan ↗</a>
      </section>
    </div>
  </section>;
}
