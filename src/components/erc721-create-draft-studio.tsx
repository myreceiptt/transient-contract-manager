'use client';
import {useEffect,useRef,useState} from 'react';
import {useErc721Drafts,type SavedErc721Draft} from './erc721-draft-storage';
import {isAddress} from 'viem';
import {api} from '@/lib/api-client';
import {useSession} from './providers';
import {Artwork} from './safe-media';
import {Notice} from './shell';
import {nftMetadataSchema} from '@/lib/nft-metadata';
import {uploadOriginalArtwork,formatArtworkSize,checkArtwork} from '@/lib/direct-ipfs-upload';
import {Erc721MintReview,Erc721MintLedger} from './erc721-mint-review';

type Props={chainId:number;contract:string;owner:string;role:string};
export function Erc721CreateDraftStudio({chainId,contract,owner,role}:Props){
  const {ensureSession}=useSession();
  const [name,setName]=useState('');
  const [description,setDescription]=useState('');
  const [image,setImage]=useState('');
  const [externalUrl,setExternalUrl]=useState('');
  const [recipient,setRecipient]=useState(owner);
  const [pinned,setPinned]=useState('');
  const [simulation,setSimulation]=useState<any>();
  const [mintReview,setMintReview]=useState<any>();
  const [busy,setBusy]=useState('');
  const [progress,setProgress]=useState<number>();
  const [fileName,setFileName]=useState('');
  // A local blob URL is display-only. Never store it in Supabase or metadata JSON.
  const [localPreview,setLocalPreview]=useState('');
  const localPreviewRef=useRef('');
  useEffect(()=>()=>{if(localPreviewRef.current) URL.revokeObjectURL(localPreviewRef.current);},[]);
  function clearLocalPreview(){
    if(localPreviewRef.current) URL.revokeObjectURL(localPreviewRef.current);
    localPreviewRef.current='';setLocalPreview('');setFileName('');setProgress(undefined);
  }
  const [error,setError]=useState('');
  const [note,setNote]=useState('');
  const [dirty,setDirty]=useState(false);
  const admin=role==='owner'||role==='admin';
  const go721=chainId===1&&contract.toLowerCase()==='0x99b8ae3c16559b80424a45c92dd530d50d970a46';
  const storage=useErc721Drafts('ARTWORK',chainId,contract,admin);
  const locked=!!busy||storage.busy||!!mintReview;
  // Official Artwork Order v1 is the first-save order, NEVER the last-update order.
  const ordered=go721?[...storage.records].sort((a,b)=>
    String(a.created_at||'').localeCompare(String(b.created_at||''))||a.id.localeCompare(b.id)):storage.records;
  const selectedPosition=go721&&storage.active?ordered.findIndex(x=>x.id===storage.active?.id)+1:0;
  function useSaved(row:SavedErc721Draft){
    clearLocalPreview();
    storage.setActive(row);
    setName(String(row.draft.title||''));setDescription(String(row.draft.description||''));
    setImage(String(row.draft.image||''));setExternalUrl(String(row.draft.externalUrl||''));
    setPinned(String(row.draft.metadataUri||''));setRecipient(String(row.draft.recipient||owner));
    setSimulation(undefined);setDirty(false);
    setNote('Loaded saved artwork draft revision '+row.version+'.');
    setError('');
  }
  function clearDraft(){
    clearLocalPreview();
    storage.setActive(null);setName('');setDescription('');setImage('');
    setExternalUrl('');setPinned('');setRecipient(owner);setSimulation(undefined);
    setNote('New unsaved artwork draft.');setError('');setDirty(false);
  }
  async function saveDraft(){
    if(go721 && (!storage.active || !pinned)){
      setError('Select an existing GO#|O artwork and pin its latest JSON before saving.');return;
    }
    const saved=await storage.save({title:name,description,image,externalUrl,metadataUri:pinned,recipient});
    if(saved){setDirty(false);setNote('Saved metadata revision '+saved.version+' for the original artwork. No NFT was minted.');}
  }
  function change(setter:(v:string)=>void,value:string){
    setter(value);setPinned('');setSimulation(undefined);setDirty(true);setNote('');setError('');
  }
  async function task(label:string,fn:()=>Promise<void>){
    if(!admin){setError('Only a verified owner or ADMIN_ROLE wallet can prepare a creator mint.');return;}
    setBusy(label);setError('');setNote('');
    try{await ensureSession(chainId);await fn();}
    catch(e){setError(e instanceof Error?e.message:'Unexpected failure');}
    finally{setBusy('');}
  }
  async function upload(file?:File){
    if(!file)return;
    try{checkArtwork(file);}
    catch(e){setError(e instanceof Error?e.message:'Unsupported artwork file.');return;}
    // Selecting a new file invalidates any previously saved image/metadata URI.
    // If the IPFS upload fails, the file remains local and will not appear in a saved draft.
    clearLocalPreview();
    const localUrl=URL.createObjectURL(file);
    localPreviewRef.current=localUrl;
    setLocalPreview(localUrl);setFileName(file.name);setProgress(undefined);
    setImage('');setPinned('');setSimulation(undefined);setDirty(true);setError('');setNote('');
    await task('upload',async()=>{
      const result=await uploadOriginalArtwork({
        file,kind:'artwork',chainId,contract,standard:'ERC721TL',onProgress:setProgress,
      });
      clearLocalPreview();
      change(setImage,result.uri);
      setNote('Original image uploaded to public IPFS. Pin metadata JSON separately; no NFT was minted.');
    });
  }
  async function pinMetadata(){
    await task('pin',async()=>{
      const metadata=nftMetadataSchema.parse({
        name,description,image,external_url:externalUrl,attributes:[],
      });
      const result=await api('metadata_pin_erc721',{chainId,contract,metadata});
      setPinned(result.uri);setSimulation(undefined);setDirty(true);
      setNote('Metadata JSON pinned to immutable public IPFS: '+result.uri+'. No NFT was created.');
    });
  }
  async function runSimulation(){
    if(!pinned){setError('Pin metadata JSON before simulating.');return;}
    if(!isAddress(recipient,{strict:false})){setError('Enter a valid recipient wallet address.');return;}
    await task('simulate',async()=>{
      const result=await api('preview_erc721_mint',{
        chainId,contract,recipient,uri:pinned,
      });
      setSimulation(result);
      setNote('Read-only simulation completed. No transaction or Token ID has been created.');
    });
  }
  async function reviewMint(){
    await task('review',async()=>{
      setMintReview(await api('prepare_erc721_mint',{chainId,contract,recipient,uri:pinned}));
    });
  }
  return <section className="panel nft-metadata-studio erc721-draft-studio">
    <div className="section-top">
      <div><span className="eyebrow">{go721?'GO#|O · FINAL METADATA REVIEW':'CREATE 1 OF 1 · CREATOR MINT'}</span>
        <h2>{go721?'Review original artwork metadata':'Prepare an original NFT'}</h2></div>
      <span className="tag">EXPLICIT APPROVAL REQUIRED</span>
    </div>
    {go721?<Notice>Review the existing 30 artworks in first-save order. For each changed artwork:
      edit fields, pin the new JSON, then Save artwork draft. Unchanged artworks keep their original CID.
      The server checks the pinned JSON against the saved fields. This does not change the sale folders,
      Mint Page v10, or Ethereum contract. Do not use direct creator mint for GO#|O.</Notice>:
      <p>Prepare unique artwork and immutable IPFS metadata, then review one creator mint.
        The review checks the exact runtime, current owner/admin permission, metadata integrity
        and network fee. Wallet signing remains locked until this exact transaction is approved.</p>}
    {!admin&&<Notice>Connect a wallet with on-chain owner or ADMIN_ROLE permission
      to pin creator metadata or simulate minting. This does not grant contract-write access.</Notice>}
    <div className="erc721-draft-storage panel">
      <div className="section-top"><div><h3>Saved artwork drafts</h3>
        <p>Versioned off-chain preparation. Artwork drafts never reserve Token IDs.</p></div>
        <span className="tag">{storage.enabled?'SERVER DRAFTS':'PERSISTENCE STAGED'}</span>
      </div>
      <p className="fineprint">{storage.statusNote}</p>
      <div className="button-row">
        <button type="button" className="button secondary" disabled={!admin||!storage.enabled||locked}
          onClick={()=>void storage.load()}>Load saved artworks</button>
        {!go721&&<button type="button" className="button secondary" disabled={!admin||locked}
          onClick={clearDraft}>New artwork draft</button>}
        <button type="button" className="button" disabled={!admin||!storage.enabled||locked||(go721&&(!storage.active||!pinned))}
          onClick={()=>void saveDraft()}>{storage.busy?'Saving…':'Save artwork draft'}</button>
      </div>
      {storage.records.length>0&&<label>{go721?'Official artwork order · select position #1–#30':'Saved versions'}
        <select disabled={locked} value={storage.active?.id||''} onChange={e=>{
          if(dirty){setError('There are unsaved edits. Save and pin the revised JSON first, or reload this page to discard changes.');return;}
          const row=storage.records.find(r=>r.id===e.target.value);if(row)useSaved(row);
        }}>
          <option value="">Choose a saved artwork</option>
          {ordered.map((row,i)=><option key={row.id} value={row.id}>
            {go721?'#'+String(i+1).padStart(2,'0')+' · ':''}{String(row.draft.title||'Untitled')} · rev {row.version}{go721?' · ID '+row.id.slice(0,8):''}
          </option>)}
        </select>
      </label>}
      {go721&&storage.active&&<p className="fineprint">Review position #{selectedPosition} of 30 · original draft ID {storage.active.id} ·
        first saved {storage.active.created_at}. Saving revisions keeps this ID and its first-save order.</p>}
      {dirty&&<Notice type="error">Unsaved artwork edits. Pin the updated metadata JSON, then save this existing draft before selecting another artwork.</Notice>}
      {!go721&&storage.active&&<button type="button" className="button secondary compact"
        disabled={!storage.enabled||locked} onClick={()=>void storage.archive(storage.active!)}>
        Archive selected draft
      </button>}
      {storage.error&&<Notice type="error">{storage.error}</Notice>}
      {storage.message&&<Notice type="success">{storage.message}</Notice>}
    </div>
    <div className="form-grid">
      <div className="metadata-form">
        <label>NFT title
          <input value={name} maxLength={160} disabled={!admin||locked}
            onChange={e=>change(setName,e.target.value)} placeholder="Original artwork title" />
        </label>
        <label>Description
          <textarea value={description} rows={4} maxLength={6000} disabled={!admin||locked}
            onChange={e=>change(setDescription,e.target.value)}/>
        </label>
        <label>Artwork IPFS URI
          <input value={image} disabled={!admin||locked} spellCheck={false}
            placeholder="ipfs://..." onChange={e=>{clearLocalPreview();change(setImage,e.target.value);}}/>
        </label>
        <label>Or upload original artwork
          <input type="file" disabled={!admin||locked}
            accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
            onChange={e=>{
              const file=e.target.files?.[0];
              e.target.value=''; // Allow selecting the same image again after a failed upload.
              void upload(file);
            }}/>
          {fileName&&<small>{fileName}{progress===undefined?'':(' · '+progress+'%')}</small>}
          {localPreview&&<small role="status">Local preview only. This file is NOT saved to the
            draft, database, or IPFS. Fix the upload and obtain an IPFS URI before expecting
            the image to reappear after reloading.</small>}
          <small>JPG/PNG/WebP, up to {formatArtworkSize(100*1024*1024)}.
            Original pixels retained on public IPFS.</small>
        </label>
        <label>External URL (optional)
          <input value={externalUrl} disabled={!admin||locked} maxLength={2048}
            placeholder="https://..." onChange={e=>change(setExternalUrl,e.target.value)}/>
        </label>
      </div>
      <div className="metadata-preview">
        {localPreview?<img className="artwork" src={localPreview}
          alt={name||'Locally selected original artwork'}/>:
          <Artwork uri={image} alt={name||'Preview of original NFT'}/>}
        {localPreview&&<small className="fineprint">Temporary browser preview — IPFS upload incomplete</small>}
        <h3>{name||'Untitled original'}</h3>
        <p>{description||'Your NFT description will appear here.'}</p>
      </div>
    </div>
    <div className="button-row">
      <button type="button" className="button secondary" disabled={!admin||locked}
        onClick={()=>void pinMetadata()}>
        {busy==='pin'?'Pinning immutable JSON…':'Pin metadata JSON to IPFS'}
      </button>
    </div>
    {pinned&&<div className="metadata-pinned">
      <strong>Immutable NFT metadata URI</strong>
      <code>{pinned}</code>
      {!go721&&<div className="form-grid"><label>Recipient wallet
        <input value={recipient} disabled={!admin||locked}
          onChange={e=>{setRecipient(e.target.value);setSimulation(undefined);}}/>
        <small>ERC721TL mints a unique Token ID directly to this recipient.</small>
      </label></div>}
      {!go721&&<button className="button secondary" type="button" onClick={()=>void runSimulation()}
        disabled={!admin||locked}>
        {busy==='simulate'?'Simulating on Ethereum…':'Simulate ERC721TL mint (read-only)'}
      </button>}
      {!go721&&<button className="button" type="button" onClick={()=>void reviewMint()} disabled={!admin||locked}>
        {busy==='review'?'Checking creator mint…':'Review creator mint'}
      </button>}
    </div>}
    {localPreview&&<Notice>Only the text and URI fields are included when you save
      an Artwork draft. The selected local image is not stored in your draft.
      After fixing the IPFS configuration, select the file again and upload it.</Notice>}
    {error&&<Notice type="error">{error}</Notice>}
    {note&&<Notice>{note}</Notice>}
    {simulation&&<section className="erc721-diagnostic">
      <h3>Mint dry-run result</h3>
      <dl>
        <dt>Simulation</dt><dd>{simulation.simulation}</dd>
        <dt>Caller role</dt><dd>{simulation.role}</dd>
        <dt>Recipient</dt><dd className="mono">{simulation.recipient}</dd>
        <dt>Observed block</dt><dd>{simulation.observedBlock}</dd>
        <dt>Transaction signing</dt><dd>DISABLED</dd>
      </dl>
      <Notice>{simulation.warning}</Notice>
    </section>}
    {!go721&&<Erc721MintLedger chainId={chainId} contract={contract}/>} 
    {mintReview&&<Erc721MintReview key={mintReview.id} intent={mintReview}
      onClose={()=>setMintReview(undefined)} onConfirmed={()=>setNote('Mint confirmed. The verified Token ID and tokenURI are recorded in your creator mint review.')}/>}
  </section>;
}
