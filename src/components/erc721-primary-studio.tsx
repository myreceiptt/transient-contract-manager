'use client';
import {useState} from 'react';
import {Layers3,Eye,FilePenLine,ShieldAlert} from 'lucide-react';
import {Erc721MarketStatus} from './erc721-market-status';
import {Notice} from './shell';
import {Artwork} from './safe-media';

type Step='edit'|'preview'|'review';
export function Erc721PrimaryStudio({chainId,contract,authorized}:{
  chainId:number;contract:string;authorized:boolean;
}){
  const [step,setStep]=useState<Step>('edit');
  const [title,setTitle]=useState('');
  const [description,setDescription]=useState('');
  const [artwork,setArtwork]=useState('');
  const [price,setPrice]=useState('');
  const [currency,setCurrency]=useState('ETH');
  const [payout,setPayout]=useState('');
  const [maxPerWallet,setMaxPerWallet]=useState('');
  const [start,setStart]=useState('');
  const [end,setEnd]=useState('');
  const [revision,setRevision]=useState(0);
  function change(setter:(value:string)=>void,value:string){setter(value);setRevision(v=>v+1);setStep('edit');}
  const fields=[
    ['Payment currency',currency],['Price per NFT',price?price+' '+currency:'Not specified'],
    ['Payout receiver',payout||'Not specified'],['Per-wallet limit',maxPerWallet||'Not specified'],
    ['Proposed start',start||'Not specified'],['Proposed end',end||'Not specified'],
  ];
  return <div className="erc721-workflow">
    <section className="panel creator-studio-banner">
      <span className="eyebrow">PRIMARY MINT · TLSTACKS721</span>
      <h2>A home for every original.</h2>
      <p>Design a collection-wide primary mint campaign. Unlike GO1 editions,
        TLStacks721 creates new unique Token IDs when successful purchases mint NFTs.
        This preparation does not configure a sale or publish a public URL.</p>
    </section>
    <section className="panel">
      <div className="section-top"><div><h2>Primary Mint Pages</h2>
        <p>One collection-level drop identity. Multiple draft revisions here
          do not create multiple independent on-chain drops.</p></div>
        <span className="tag">SESSION PREVIEW ONLY</span>
      </div>
      <div className="erc721-metrics">
        <div><small>Campaign identity</small><strong>{title||'Untitled draft'}</strong></div>
        <div><small>Local draft revision</small><strong>{revision}</strong></div>
        <div><small>Publish status</small><strong>Not published</strong></div>
      </div>
      <Notice>Not saved to a server. Leaving or reloading this page discards the
        current form. There is no collector-facing page, drop configuration, approval,
        payment, or mint transaction in this release.</Notice>
    </section>
    <section className="panel">
      <div className="section-top"><h2>Campaign preparation</h2>
        <span className="tag">NO CONTRACT WRITES</span></div>
      <div className="creator-steps erc721-steps">
        <button type="button" className={step==='edit'?'active':''} onClick={()=>setStep('edit')}>
          <FilePenLine size={15}/> 01 · Page content
        </button>
        <button type="button" className={step==='preview'?'active':''} onClick={()=>setStep('preview')}>
          <Eye size={15}/> 02 · Collector preview
        </button>
        <button type="button" className={step==='review'?'active':''} onClick={()=>setStep('review')}>
          <ShieldAlert size={15}/> 03 · Safety review
        </button>
      </div>
      {step==='edit'&&<div className="erc721-editor-grid">
        <div className="metadata-form">
          <label>Campaign title<input value={title} maxLength={160}
            onChange={e=>change(setTitle,e.target.value)} placeholder="One of One — Collection Drop"/></label>
          <label>Description<textarea rows={5} maxLength={6000} value={description}
            onChange={e=>change(setDescription,e.target.value)} placeholder="Introduce this collection to collectors"/></label>
          <label>Artwork / cover URI<input value={artwork} onChange={e=>change(setArtwork,e.target.value)}
            placeholder="ipfs://... (draft reference only)"/></label>
          <div className="form-grid">
            <label>Payment currency
              <select value={currency} onChange={e=>change(setCurrency,e.target.value)}>
                <option value="ETH">ETH (illustrative)</option>
              </select>
            </label>
            <label>Price per NFT (draft)
              <input inputMode="decimal" value={price} onChange={e=>change(setPrice,e.target.value)}
                placeholder="e.g. 0.01"/></label>
            <label>Payout address (draft)
              <input value={payout} onChange={e=>change(setPayout,e.target.value)} placeholder="0x..."/></label>
            <label>Per-wallet limit (draft)
              <input inputMode="numeric" value={maxPerWallet}
                onChange={e=>change(setMaxPerWallet,e.target.value)} placeholder="e.g. 1"/></label>
            <label>Proposed start (local)
              <input type="datetime-local" value={start} onChange={e=>change(setStart,e.target.value)}/></label>
            <label>Proposed end (local)
              <input type="datetime-local" value={end} onChange={e=>change(setEnd,e.target.value)}/></label>
          </div>
        </div>
        <aside className="erc721-preview-panel">
          {artwork&&<Artwork uri={artwork} alt={title||'Mint campaign cover preview'}/>}
          <Layers3 size={23}/><span className="eyebrow">CAMPAIGN DRAFT</span>
          <h3>{title||'Untitled collection drop'}</h3>
          <p>{description||'Campaign description will appear here.'}</p>
          <small>Artwork URI: {artwork||'Not specified'}</small>
          <small>No collector mint enabled</small>
        </aside>
      </div>}
      {step==='preview'&&<div className="erc721-preview-panel">
        {artwork&&<Artwork uri={artwork} alt={title||'Campaign image'}/>}
        <span className="eyebrow">UNPUBLISHED · INTERNAL PREVIEW</span>
        <h2>{title||'Untitled primary mint campaign'}</h2>
        <p>{description||'No campaign description yet.'}</p>
        <dl>{fields.map(([label,value])=><div key={label} className="erc721-detail-row">
          <dt>{label}</dt><dd>{value}</dd>
        </div>)}</dl>
        <button className="button" type="button" disabled>Mint unavailable</button>
      </div>}
      {step==='review'&&<div className="erc721-review">
        <h3>Current state vs proposed campaign</h3>
        <p>This is a local presentation only, not an ABI simulation, pricing quote,
          mint allowance check or guarantee that the settings map to the deployed TLStacks721 version.</p>
        <dl>{fields.map(([label,value])=><div key={label} className="erc721-detail-row">
          <dt>{label}</dt><dd>{value}</dd>
        </div>)}</dl>
        <Notice>Blocked: runtime hash allowlisting, Stacks721 mint permission,
          sale ABI, payouts, currency validation, publication persistence,
          wallet authorization, preflight, receipt reconciliation and dedicated approval.</Notice>
        <button className="button secondary" disabled>Publish transaction disabled</button>
      </div>}
      <div className="button-row">
        {step==='edit'&&<button type="button" className="button secondary" onClick={()=>setStep('preview')}>Preview collector page</button>}
        {step==='preview'&&<button type="button" className="button secondary" onClick={()=>setStep('review')}>Review readiness</button>}
        {step!=='edit'&&<button type="button" className="button secondary" onClick={()=>setStep('edit')}>Edit draft</button>}
      </div>
    </section>
    <section className="panel">
      <div className="section-top"><h2>Verified chain observations</h2><span className="tag">READ-ONLY</span></div>
      <p>Official deployment candidates are inspected as untrusted read targets,
        not preapproved execution addresses. Connected creator authority:
        {authorized?' owner/admin observed':' viewer or unconnected'}.</p>
      <Erc721MarketStatus chainId={chainId} contract={contract} view="stacks"/>
    </section>
  </div>;
}
