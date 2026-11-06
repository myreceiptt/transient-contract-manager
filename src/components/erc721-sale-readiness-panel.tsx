'use client';
import {useState} from 'react';
import {api} from '@/lib/api-client';
import {useSession} from './providers';
import {Notice} from './shell';
import {GO721_APPROVED_PLAN,GO721_PRESALE_START_WIB,
 makeGo721DraftReview} from '@/lib/erc721-go721-approved-sale';

type Snapshot={
  protocol:{reportedVersion:string;address:string;observedRuntimeHash:string;
    paused:boolean;protocolFeeEth:string;protocolFeeReceiver:string};
  creator:{version:string;totalUnburnedSupply:string;supplyLocked:boolean;
    approvedMintContract:boolean;role:string;creatorRuntimeVerified:boolean};
  observedBlock:string;observedDrop:{phase:number;round:number;configured:boolean;
    payoutReceiver:string;remainingSupply:string;initialSupply:string;
    publicWalletAllowance:string;publicCostWei:string;baseUri:string};
  blockers:string[];checks:Record<string,boolean>;
  readyForMainnetWrites:false;transactionSigningEnabled:false;
};
export function Erc721SaleReadinessPanel({chainId,contract,authorized,draft}:{
  chainId:number;contract:string;authorized:boolean;
  draft:{price:string;payout:string;maxPerWallet:string;start:string};
}){
  const {ensureSession}=useSession();
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [loading,setLoading]=useState(false),[error,setError]=useState('');
  if(!authorized||chainId!==1||contract.toLowerCase()!==GO721_APPROVED_PLAN.collection.toLowerCase())
    return null;
  const review=makeGo721DraftReview(draft);
  async function check(){
    if(loading)return;setLoading(true);setError('');setSnapshot(null);
    try{
      await ensureSession(chainId);
      const response=await api('read_erc721_sale_readiness',{chainId,contract});
      setSnapshot(response as Snapshot);
    }catch(e){setError(e instanceof Error?e.message:'Read-only on-chain check failed.');}
    finally{setLoading(false);}
  }
  return <section className="panel">
    <div className="section-top"><div>
      <span className="eyebrow">OWNER/ADMIN · ETHEREUM MAINNET · OBSERVATION ONLY</span>
      <h2>Approved sale policy &amp; blockchain readiness</h2>
      <p>Review the approved parameters and current TLStacks721 state without granting permissions
        or creating a sale. Mint remains disabled.</p>
    </div><span className="tag">NO SIGNING</span></div>
    <div className="erc721-campaign-facts">
      <div className="erc721-campaign-fact"><span>Presale begins · Asia/Jakarta</span>
        <strong>10 Nov 2026 · 10:10 WIB</strong><small>{GO721_PRESALE_START_WIB}</small></div>
      <div className="erc721-campaign-fact"><span>Presale · 1 recipient whitelist</span>
        <strong>3 originals · 0 ETH each</strong>
        <small>Max 3 / recipient · nominal price excludes protocol fee and gas</small></div>
      <div className="erc721-campaign-fact"><span>Public sale · second separate round</span>
        <strong>27 originals · 0.025 ETH each</strong>
        <small>Max 10 / recipient · opens only after three presale mints are confirmed</small></div>
      <div className="erc721-campaign-fact"><span>Approved payout</span>
        <strong className="mono">{GO721_APPROVED_PLAN.payoutReceiver}</strong></div>
    </div>
    {!review.matching&&<Notice type="error">
      Saved/editor Mint Page values still differ from the approved sale policy:
      <ul>{review.mismatch.map(m=><li key={m}>{m}</li>)}</ul>
      Confirm and save the correct values through your existing authenticated Mint Page editor.
      No automatic database write occurs.
    </Notice>}
    <div className="button-row">
      <button className="button secondary" type="button" disabled={loading} onClick={()=>void check()}>
        {loading?'Reading Ethereum state…':'Run read-only mainnet readiness audit'}
      </button>
    </div>
    {error&&<Notice type="error">{error}</Notice>}
    {snapshot&&<>
      <div className="erc721-campaign-facts">
        <div className="erc721-campaign-fact"><span>Observed block</span><strong>{snapshot.observedBlock}</strong></div>
        <div className="erc721-campaign-fact"><span>ERC721 unburned supply</span>
          <strong>{snapshot.creator.totalUnburnedSupply}</strong>
          <small>Not proof that the historical minted ID counter starts at zero</small></div>
        <div className="erc721-campaign-fact"><span>TLStacks721 version / configured</span>
          <strong>{snapshot.protocol.reportedVersion} / {snapshot.observedDrop.configured?'YES':'NO'}</strong>
          <small>Round {snapshot.observedDrop.round}; phase {snapshot.observedDrop.phase}</small></div>
        <div className="erc721-campaign-fact"><span>Current protocol fee per mint</span>
          <strong>{snapshot.protocol.protocolFeeEth} ETH</strong>
          <small>Set by protocol; re-read when preparing a real transaction</small></div>
        <div className="erc721-campaign-fact"><span>Creator role for sale contract</span>
          <strong>{snapshot.creator.approvedMintContract?'APPROVED':'NOT APPROVED'}</strong>
          <small>Creator supply {snapshot.creator.supplyLocked?'LOCKED':'UNLOCKED'}</small></div>
      </div>
      <Notice type="error">
        **Not cleared for mainnet sale.** {snapshot.blockers.length} safety gates remain:
        <ul>{snapshot.blockers.map(key=><li key={key}>{key}</li>)}</ul>
        A reported contract version is not an audited bytecode allowlist. Do not publish or sign yet.
      </Notice>
    </>}
    <Notice>Final public Mint Page is not deployed by this audit.
      The collector checkout, pinning of both indexed metadata folders,
      protocol runtime authorization and complete ERC721 mint-event history
      must be implemented and tested separately.</Notice>
  </section>;
}
