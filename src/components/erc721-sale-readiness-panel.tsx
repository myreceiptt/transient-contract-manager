'use client';
import {useState} from 'react';
import {api} from '@/lib/api-client';
import {useSession} from './providers';
import {Notice} from './shell';
import {GO_APPROVED_TERMS,approvedGoTerms,inspectDraftAgainstApprovedTerms} from '@/lib/erc721-sale-terms';
const GO721_APPROVED_PLAN=approvedGoTerms(1,GO_APPROVED_TERMS.collection);

type Snapshot={
  protocol:{reportedVersion:string;address:string;observedRuntimeHash:string;
    paused:boolean;protocolFeeEth:string;protocolFeeReceiver:string};
  creator:{version:string;totalUnburnedSupply:string;supplyLocked:boolean;
    approvedMintContract:boolean;role:string;creatorRuntimeVerified:boolean;
    owner:string;admins:string[];approvedMintRoleHash:string;
    ownerMustGrantApprovedMintContract:boolean};
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
  if(!authorized||chainId!==1||contract.toLowerCase()!==GO721_APPROVED_PLAN.collection.contract.toLowerCase())
    return null;
  const mismatch=inspectDraftAgainstApprovedTerms(draft);
  async function check(){
    if(loading)return;setLoading(true);setError('');setSnapshot(null);
    try{
      await ensureSession(chainId);
      const response=await api('read_erc721_sale_readiness',{chainId,contract});
      setSnapshot(response as Snapshot);
    }catch(e){setError(e instanceof Error?e.message:'Could not inspect the Ethereum sale contract.');}
    finally{setLoading(false);}
  }
  return <section className="panel erc721-sale-readiness">
    <div className="section-top"><div>
      <span className="eyebrow">RELEASE CHECK · ETHEREUM MAINNET</span>
      <h2>Is this collection ready to sell?</h2>
      <p>One check reads the NFT contract and the sales protocol.
        It cannot grant permissions, move funds, publish a page, or create a sale.</p>
    </div><span className="tag">READ-ONLY</span></div>
    {mismatch.length>0&&<Notice type="error">
      The Mint Page editor still contains values different from the approved sale plan:
      <ul>{mismatch.map(m=><li key={m}>{m}</li>)}</ul>
      Review and save the draft before publication. This does not mean a blockchain transaction failed.
    </Notice>}
    <div className="button-row">
      <button className="button secondary" type="button" disabled={loading} onClick={()=>void check()}>
        {loading?'Reading Ethereum state…':'Check Ethereum sale readiness (no transaction)'}
      </button>
    </div>
    {error&&<Notice type="error">{error}</Notice>}
    {snapshot&&<>
      <div className="erc721-campaign-facts">
        <div className="erc721-campaign-fact">
          <span>Sale activation</span>
          <strong>Not enabled by this app</strong>
          <small>Every mainnet contract change requires separate explicit approval</small>
        </div>
        <div className="erc721-campaign-fact">
          <span>TLStacks721 sale contract</span>
          <strong>{snapshot.protocol.reportedVersion} · {snapshot.observedDrop.configured?'Drop exists':'No live drop configured'}</strong>
          <small>Current protocol fee per NFT: {snapshot.protocol.protocolFeeEth} ETH, plus network gas</small>
        </div>
        <div className="erc721-campaign-fact">
          <span>Protocol mint permission</span>
          <strong>{snapshot.creator.approvedMintContract?'Granted':'Not yet granted'}</strong>
          <small>{snapshot.creator.supplyLocked?'New minting is locked':'Creator supply is unlocked'}</small>
        </div>
        <div className="erc721-campaign-fact">
          <span>Current circulating supply</span>
          <strong>{snapshot.creator.totalUnburnedSupply}</strong>
          <small>Historical Token ID verification is still required</small>
        </div>
      </div>
      {snapshot.creator.ownerMustGrantApprovedMintContract&&<div className="erc721-release-next">
        <span className="eyebrow">OWNER ACTION REQUIRED BEFORE THE PRESALE</span>
        <h3>Allow the official TLStacks721 contract to mint GO#|O NFTs</h3>
        <p>On Ethereum Mainnet, the ERC721 collection Owner must grant
          <code> APPROVED_MINT_CONTRACT</code> to the TLStacks721 contract.
          Your connected Admin wallet cannot grant this permission by itself.
          No transaction can be signed through this panel.</p>
        <dl>
          <dt>Owner wallet (must sign)</dt><dd className="mono">{snapshot.creator.owner}</dd>
          <dt>Collection contract</dt><dd className="mono">{GO_APPROVED_TERMS.collection}</dd>
          <dt>Approved mint contract</dt><dd className="mono">{snapshot.protocol.address}</dd>
          <dt>Role hash</dt><dd className="mono">{snapshot.creator.approvedMintRoleHash}</dd>
          <dt>Required contract action</dt><dd><code>setRole(role, [TLStacks721], true)</code></dd>
        </dl>
        <small>Do not sign this transaction until the runtime verification and exact
          wallet transaction review have been completed and separately approved.
          If the Owner grants the permission through an authorized interface,
          return here to recheck the actual on-chain role after confirmation.</small>
      </div>}
      <Notice>Ethereum observation completed. {snapshot.blockers.length} verification or activation
        requirements remain. The public Mint Page and sale signing are still disabled.
        This is expected during preparation, not a failed payment.</Notice>
      <details className="erc721-advanced-checks">
        <summary>View technical contract checks ({snapshot.blockers.length} pending)</summary>
        <p>Block: {snapshot.observedBlock} · TLStacks721: {snapshot.protocol.address}</p>
        <ul>{Object.entries(snapshot.checks).map(([name,ok])=>
          <li key={name}>{name}: {ok?'verified':'pending / not satisfied'}</li>)}</ul>
        <p><small>Reported version and observed bytecode are research observations, not permission
          to send transactions. The historical mint counter must be verified before guaranteeing
          the NFT #1–#30 sequence.</small></p>
      </details>
    </>}
    {!snapshot&&<small>The collection is not yet ready for collector minting.
      This button shows what remains without changing anything.</small>}
  </section>;
}
