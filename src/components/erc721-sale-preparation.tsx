'use client';
import {useState} from 'react';
import {Download,RefreshCcw} from 'lucide-react';
import {api} from '@/lib/api-client';
import {useSession} from './providers';
import {Notice} from './shell';
import {prepareSequence,verifyApprovedManifest,exportSalePreparation,type Draft,type SequenceItem} from '@/lib/erc721-sale-sequence';
import {prepareOneWalletPresale,verifyOneWalletPresaleFile,type OneWalletPresale} from '@/lib/erc721-sale-allowlist';
import {approvedGoTerms,GO_APPROVED_TERMS} from '@/lib/erc721-sale-terms';

/** Private owner/admin preview: the official manifest file stays in the user's browser. */
export function Erc721SalePreparation({chainId,contract,authorized}:{
  chainId:number;contract:string;authorized:boolean;
}){
  const {ensureSession}=useSession();
  const isApprovedCollection=chainId===1&&contract.toLowerCase()===GO_APPROVED_TERMS.collection.toLowerCase();
  const saleTerms=isApprovedCollection?approvedGoTerms(chainId,contract):null;
  const [items,setItems]=useState<SequenceItem[]>([]);
  const [loaded,setLoaded]=useState(false),[approved,setApproved]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState('');
  const [walletInput,setWalletInput]=useState(''),[presale,setPresale]=useState<OneWalletPresale|null>(null);
  async function load(){
    if(busy||!authorized)return;
    setBusy(true);setLoaded(false);setApproved(false);setItems([]);setError('');setNote('');
    try {
      await ensureSession(chainId);
      const drafts=await api('erc721_draft_list',{chainId,contract,kind:'ARTWORK'}) as Draft[];
      const rows=prepareSequence(drafts);
      setItems(rows);setLoaded(true);
      setNote('All 30 source CIDs validated. Check them against the private approved Manifest v1.');
    }catch(e){setError(e instanceof Error?e.message:'Cannot load artwork order.');}
    finally{setBusy(false);}
  }
  async function verify(file?:File){
    if(!file||!loaded)return;
    setApproved(false);setError('');setNote('');
    try{
      if(file.size>256*1024)throw new Error('Manifest JSON is too large.');
      verifyApprovedManifest(JSON.parse(await file.text()),items,chainId,contract);
      setApproved(true);
      setNote('Approved order v1 matches all 30 draft IDs, original timestamps, folder positions and source CIDs.');
    }catch(e){setError(e instanceof Error?e.message:'Approved manifest validation failed.');}
  }
  function confirmWallet(){
    setPresale(null);setError('');setNote('');
    try{
      const record=prepareOneWalletPresale(walletInput.trim(),chainId,contract);
      setPresale(record);
      setWalletInput(record.recipient);
      setNote('One allowlisted recipient validated. Merkle root recomputed locally; no blockchain write.');
    }catch(e){setError(e instanceof Error?e.message:'Invalid recipient wallet.');}
  }
  async function importWallet(file?:File){
    if(!file)return;
    setPresale(null);setError('');setNote('');
    try{
      if(file.size>16*1024)throw new Error('Whitelist file exceeds 16 KB.');
      const record=verifyOneWalletPresaleFile(JSON.parse(await file.text()),chainId,contract);
      setPresale(record);setWalletInput(record.recipient);
      setNote('Local whitelist verified: one recipient, allowance 3, proof [], exact Merkle root.');
    }catch(e){setError(e instanceof Error?e.message:'Could not verify whitelist file.');}
  }
  function download(){
    if(!approved||!presale||!saleTerms||presale.recipient!==saleTerms.presale.recipient)return;
    const json=JSON.stringify({...exportSalePreparation(chainId,contract,items),
      presaleWallet:presale.recipient,presaleMerkleRoot:presale.merkleRoot,
      presaleAllowlist:presale,approvedTerms:saleTerms},null,2)+'\n';
    const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));
    try{
      const a=document.createElement('a');a.href=url;a.download='GO_ONE_OF_ONE_SALE_PREPARATION_OFFCHAIN_v1.json';a.click();
    }finally{URL.revokeObjectURL(url);}
  }
  if(!authorized)return <Notice>Only a verified collection Owner/Admin can prepare the private sale sequence.</Notice>;
  return <section className="panel erc721-sale-preparation">
    <div className="section-top"><div>
      <span className="eyebrow">OFF-CHAIN · GO#|O SEQUENTIAL SALE</span>
      <h2>Artwork order &amp; two-round preparation</h2>
      <p>Read all saved artworks, confirm the original first-save order, and verify your approved Manifest v1.
        No metadata pinning, public URL, wallet approval or blockchain transaction happens here.</p>
    </div><span className="tag">NO CONTRACT WRITES</span></div>
    {saleTerms&&<div className="erc721-campaign-facts">
      <div className="erc721-campaign-fact"><span>Approved presale start (WIB)</span>
        <strong>10 November 2026 · 10.10 WIB</strong>
        <small>UTC: {saleTerms.presale.startIsoUtc} · no automatic on-chain deployment</small></div>
      <div className="erc721-campaign-fact"><span>Approved payout receiver</span>
        <strong className="mono">{saleTerms.payoutReceiver}</strong>
        <small>Public mint: 0.025 ETH/NFT · 10 NFTs per recipient maximum</small></div>
      <div className="erc721-campaign-fact"><span>Confirmed sole whitelist recipient</span>
        <strong className="mono">{saleTerms.presale.recipient}</strong>
        <small>3 free NFTs; protocol fee and gas may apply. Merkle root calculated locally.</small></div>
    </div>}
    <div className="erc721-campaign-facts">
      <div className="erc721-campaign-fact"><span>Round 1 · Whitelist</span><strong>3 NFTs · 0 ETH each</strong>
        <small>Exactly one allowlisted recipient · max 3 · artwork #1–#3</small></div>
      <div className="erc721-campaign-fact"><span>Round 2 · Public</span><strong>27 NFTs · 0.025 ETH each</strong>
        <small>Max 10 per recipient · artwork #4–#30</small></div>
    </div>
    <div className="erc721-cover-editor">
      <label>One allowlisted recipient wallet (Ethereum Mainnet)
        <input type="text" className="mono" value={walletInput} spellCheck={false}
          onChange={e=>{setWalletInput(e.target.value);setPresale(null);}}
          placeholder="0x… (one wallet; max 3 free NFTs)"/>
      </label>
      <div className="button-row">
        <button type="button" className="button secondary" onClick={confirmWallet}
          disabled={!walletInput.trim()}>Validate wallet &amp; calculate Merkle root</button>
      </div>
      <label>Or import a prepared whitelist file (read only in your browser)
        <input type="file" accept=".json,application/json"
          onChange={e=>{const f=e.target.files?.[0];e.target.value='';void importWallet(f);}}/>
      </label>
      {presale&&<div className="erc721-campaign-facts">
        <div className="erc721-campaign-fact"><span>Validated recipient</span>
          <strong className="mono">{presale.recipient}</strong></div>
        <div className="erc721-campaign-fact"><span>Presale Merkle root</span>
          <strong className="mono">{presale.merkleRoot}</strong>
          <small>Merkle proof: [] · one recipient · allowance 3 · no publication</small></div>
      </div>}
      {presale&&saleTerms&&presale.recipient!==saleTerms.presale.recipient&&<Notice type="error">Wallet differs from the sole approved whitelist recipient. Export is blocked.</Notice>}
      <small>Whitelist restricts the NFT recipient, not necessarily the wallet paying gas or protocol fees.
        A zero ETH NFT price is not a guarantee of zero total fees.</small>
    </div>
    <div className="button-row">
      <button type="button" className="button secondary" disabled={busy} onClick={()=>void load()}>
        <RefreshCcw size={15}/>{busy?'Loading…':'Load & validate 30 Artwork drafts'}
      </button>
    </div>
    {loaded&&<>
      <div className="erc721-cover-editor">
        <label>Verify Official Artwork Order v1 (local JSON; never uploaded)
          <input type="file" accept=".json,application/json" onChange={e=>{
            const f=e.target.files?.[0];e.target.value='';void verify(f);
          }}/>
        </label>
        <div className="button-row">
          <button type="button" className="button secondary" disabled={!approved||!presale||!saleTerms||presale.recipient!==saleTerms.presale.recipient} onClick={download}>
            <Download size={15}/> Download off-chain sale preparation
          </button>
        </div>
        <small>Folder CIDs remain unset. The draft file cannot enable a sale.
          {presale?' Whitelist is validated off-chain.':' Validate the one-wallet whitelist to export both rounds.'}</small>
      </div>
      <details className="erc721-sequence-list">
        <summary>{items.length} artwork positions · {approved?'approved snapshot matched':'snapshot verification pending'}</summary>
        {items.map(a=><div key={a.draftId} className="erc721-sequence-item">
          <strong>#{a.position}</strong>
          <span><strong>{a.titleAtSnapshot}</strong>
            <small>Round {a.round} · file /{a.folderFile} · {a.sourceMetadataUri.slice(0,22)}…</small>
          </span>
        </div>)}
      </details>
    </>}
    {error&&<Notice type="error">{error}</Notice>}
    {note&&<Notice type="success">{note}</Notice>}
    <Notice>Artwork positions are conditional targets, not minted Token IDs. A future on-chain
      preflight must prove no prior or interleaved creator mints (including burned IDs).
      TLStacks721 metadata folders, presale allowlist, configured drops and buyer transactions
      are still pending separate verification and approval.</Notice>
  </section>;
}
