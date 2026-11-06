'use client';
import {useState} from 'react';
import {Layers3,Eye,FilePenLine,ShieldAlert} from 'lucide-react';
import {Erc721MarketStatus} from './erc721-market-status';
import {Notice} from './shell';
import {Artwork} from './safe-media';
import {Erc721MintCoverPicker} from './erc721-mint-cover-picker';
import {Erc721SalePreparation} from './erc721-sale-preparation';
import {Erc721SaleReadinessPanel} from './erc721-sale-readiness-panel';
import {useErc721Drafts,type SavedErc721Draft} from './erc721-draft-storage';

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
  const [unsavedEdits,setUnsavedEdits]=useState(0);
  const [coverUploading,setCoverUploading]=useState(false);
  const storage=useErc721Drafts('MINT_PAGE',chainId,contract,authorized);
  function useSaved(row:SavedErc721Draft){
    if(coverUploading)return;
    storage.setActive(row);const d=row.draft;
    setTitle(String(d.title||''));setDescription(String(d.description||''));
    setArtwork(String(d.artwork||''));setPrice(String(d.price||''));
    setCurrency(String(d.currency||'ETH'));setPayout(String(d.payout||''));
    setMaxPerWallet(String(d.maxPerWallet||''));setStart(String(d.start||''));
    setEnd(String(d.end||''));setUnsavedEdits(0);setStep('edit');
  }
  function data(){return {title,description,artwork,price,currency,payout,maxPerWallet,start,end};}
  async function saveDraft(){if(coverUploading)return;
    const saved=await storage.save(data());if(saved)setUnsavedEdits(0);}
  function newDraft(){if(coverUploading)return;
    storage.setActive(null);setTitle('');setDescription('');setArtwork('');
    setPrice('');setCurrency('ETH');setPayout('');setMaxPerWallet('');
    setStart('');setEnd('');setUnsavedEdits(0);setStep('edit');}
  function change(setter:(value:string)=>void,value:string){setter(value);setUnsavedEdits(v=>v+1);setStep('edit');}
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
        <span className="tag">{storage.enabled?"PRIVATE APP DRAFT":"SESSION PREVIEW ONLY"}</span>
      </div>
      <div className="erc721-metrics">
        <div><small>Campaign identity</small><strong>{title||'Untitled draft'}</strong></div>
        <div><small>Saved draft revision</small>
          <strong>{storage.active?storage.active.version:'Not saved yet'}</strong></div>
        <div><small>Unsaved field changes</small><strong>{unsavedEdits}</strong></div>
        <div><small>Publish status</small><strong>Not published</strong></div>
      </div>
      <Notice>{storage.statusNote} There is no collector-facing page, configured sale,
        approval, payment, or mint transaction in this release.</Notice>
      <div className="erc721-draft-storage">
        <div className="button-row">
          <button type="button" className="button secondary" disabled={!authorized||!storage.enabled||storage.busy||coverUploading}
            onClick={async()=>{
              await storage.load();
            }}>Load Mint Page draft</button>
          <button type="button" className="button secondary" disabled={!authorized||storage.busy||coverUploading}
            onClick={newDraft}>Clear editor</button>
          <button type="button" className="button" disabled={!authorized||!storage.enabled||storage.busy||coverUploading}
            onClick={()=>void saveDraft()}>Save Mint Page draft</button>
        </div>
        {storage.records.length>0&&<div className="erc721-saved-index">
          {storage.records.map(row=><button type="button" className="button secondary compact" disabled={coverUploading}
            key={row.id} onClick={()=>useSaved(row)}>
            {String(row.draft.title||'Collection primary Mint Page')} · Revision {row.version}
          </button>)}
        </div>}
        {storage.error&&<Notice type="error">{storage.error}</Notice>}
        {storage.message&&<Notice type="success">{storage.message}</Notice>}
      </div>
    </section>
    <section className="panel">
      <div className="section-top"><h2>Campaign preparation</h2>
        <span className="tag">NO CONTRACT WRITES</span></div>
      <div className="creator-steps erc721-steps">
        <button type="button" className={step==='edit'?'active':''} onClick={()=>setStep('edit')}>
          <FilePenLine size={15}/> 01 · Page content
        </button>
        <button type="button" className={step==='preview'?'active':''} disabled={coverUploading} onClick={()=>setStep('preview')}>
          <Eye size={15}/> 02 · Collector preview
        </button>
        <button type="button" className={step==='review'?'active':''} disabled={coverUploading} onClick={()=>setStep('review')}>
          <ShieldAlert size={15}/> 03 · Safety review
        </button>
      </div>
      {step==='edit'&&<div className="erc721-editor-grid">
        <div className="metadata-form">
          <label>Campaign title<input value={title} maxLength={160}
            onChange={e=>change(setTitle,e.target.value)} placeholder="One of One — Collection Drop"/></label>
          <label>Description<textarea rows={5} maxLength={6000} value={description}
            onChange={e=>change(setDescription,e.target.value)} placeholder="Introduce this collection to collectors"/></label>
          <Erc721MintCoverPicker chainId={chainId} contract={contract} authorized={authorized}
            uri={artwork} onChange={uri=>change(setArtwork,uri)}
            onUploadingChange={setCoverUploading}/>
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
      {step==='preview'&&<div className="erc721-collector-page">
        <div className="erc721-collector-hero">
          <div className="erc721-collector-art">
            {artwork?<Artwork uri={artwork} alt={title||'Collection Mint Page cover'}/>:
              <div className="erc721-no-cover"><Layers3 size={34}/>
                <span>No cover selected</span></div>}
          </div>
          <div className="erc721-collector-copy">
            <span className="eyebrow">UNPUBLISHED · INTERNAL COLLECTOR PREVIEW</span>
            <h2>{title||'Untitled primary mint campaign'}</h2>
            <p>{description||'Add the collection story in Page content to preview it here.'}</p>
            <div className="erc721-collector-price">
              <small>Proposed mint price · illustrative</small>
              <strong>{price?price+' '+currency:'Not configured'}</strong>
              <small>Payment unavailable; no collector-facing page has been published.</small>
            </div>
            <button className="button" type="button" disabled>Mint unavailable · Draft only</button>
          </div>
        </div>
        <div className="erc721-collector-details">
          <h3>Campaign details</h3>
          <div className="erc721-campaign-facts">
            {fields.map(([label,value])=><div className="erc721-campaign-fact" key={label}>
              <span>{label}</span>
              <strong className={label==='Payout receiver'?'mono':''}>{value}</strong>
            </div>)}
          </div>
        </div>
      </div>}
      {step==='review'&&<div className="erc721-safety-review">
        <div className="erc721-safety-heading">
          <ShieldAlert size={24}/>
          <div><span className="eyebrow">READ-ONLY · NO WALLET SIGNATURE</span>
            <h2>Safety & publication readiness</h2>
            <p>Review the proposed campaign and the remaining prerequisites.
              This is not a sale simulation, contract approval, or transaction quote.</p>
          </div>
        </div>
        <div className="erc721-safety-states">
          <div><small>Draft</small><strong>{storage.active?'Saved revision '+storage.active.version:'Unsaved'}</strong></div>
          <div><small>Cover</small><strong>{artwork.startsWith('ipfs://')?'IPFS URI present':'Not configured'}</strong></div>
          <div><small>Publication</small><strong>Blocked</strong></div>
        </div>
        <h3>Proposed sale parameters</h3>
        <div className="erc721-campaign-facts">
          {fields.map(([label,value])=><div className="erc721-campaign-fact" key={label}>
            <span>{label}</span>
            <strong className={label==='Payout receiver'?'mono':''}>{value}</strong>
          </div>)}
        </div>
        <div className="erc721-safety-gates">
          <h3>Requirements before a real primary mint</h3>
          {[
            'Exact TLStacks721 bytecode and method allowlist',
            'Verified creator mint permission and admin authorization',
            'Sale currency, payout, price and allowance validation',
            'Collector-facing page publication and revision persistence',
            'Transaction simulation, explicit wallet approval and receipt reconciliation',
          ].map(gate=><div key={gate} className="erc721-safety-gate">
            <ShieldAlert size={15}/><span>{gate}</span><span>Pending</span>
          </div>)}
        </div>
        <Notice>Not ready for on-chain transactions. Your saved Mint Page draft
          and pinned cover are reusable, but they do not configure TLStacks721 or
          authorize NFT minting. ERC721 signing remains disabled.</Notice>
        <button className="button secondary" disabled>Publish transaction disabled</button>
      </div>}
      <div className="button-row">
        {step==='edit'&&<button type="button" className="button secondary" disabled={coverUploading} onClick={()=>setStep('preview')}>Preview collector page</button>}
        {step==='preview'&&<button type="button" className="button secondary" onClick={()=>setStep('review')}>Review readiness</button>}
        {step!=='edit'&&<button type="button" className="button secondary" onClick={()=>setStep('edit')}>Edit draft</button>}
      </div>
    </section>
    <Erc721SalePreparation chainId={chainId} contract={contract} authorized={authorized}/>
    <Erc721SaleReadinessPanel chainId={chainId} contract={contract} authorized={authorized}
      draft={{price,payout,maxPerWallet,start}}/>
    <section className="panel">
      <div className="section-top"><h2>Verified chain observations</h2><span className="tag">READ-ONLY</span></div>
      <p>Official deployment candidates are inspected as untrusted read targets,
        not preapproved execution addresses. Connected creator authority:
        {authorized?' owner/admin observed':' viewer or unconnected'}.</p>
      <Erc721MarketStatus chainId={chainId} contract={contract} view="stacks"/>
    </section>
  </div>;
}
