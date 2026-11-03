'use client';
import {useState} from 'react';
import {isAddress} from 'viem';
import {api} from '@/lib/api-client';
import {useSession} from './providers';
import {Artwork} from './safe-media';
import {Notice} from './shell';
import {nftMetadataSchema} from '@/lib/nft-metadata';
import {uploadOriginalArtwork,formatArtworkSize} from '@/lib/direct-ipfs-upload';

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
  const [busy,setBusy]=useState('');
  const [progress,setProgress]=useState<number>();
  const [fileName,setFileName]=useState('');
  const [error,setError]=useState('');
  const [note,setNote]=useState('');
  const admin=role==='owner'||role==='admin';
  function change(setter:(v:string)=>void,value:string){
    setter(value);setPinned('');setSimulation(undefined);setNote('');setError('');
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
    setFileName(file.name);setProgress(undefined);
    await task('upload',async()=>{
      const result=await uploadOriginalArtwork({
        file,kind:'artwork',chainId,contract,standard:'ERC721TL',onProgress:setProgress,
      });
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
      setPinned(result.uri);setSimulation(undefined);
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
  return <section className="panel nft-metadata-studio erc721-draft-studio">
    <div className="section-top">
      <div><span className="eyebrow">CREATE 1 OF 1 · PHASE B PREPARATION</span>
        <h2>Prepare an original NFT</h2></div>
      <span className="tag">NO ON-CHAIN WRITES</span>
    </div>
    <p>Prepare unique ERC-721 artwork and immutable IPFS metadata, then test the
      owner/admin mint call as a dry-run. <strong>There is no Mint or Sign button yet.</strong>
      Simulation does not reserve a Token ID or change ownership.</p>
    {!admin&&<Notice>Connect a wallet with on-chain owner or ADMIN_ROLE permission
      to pin creator metadata or simulate minting. This does not grant contract-write access.</Notice>}
    <div className="form-grid">
      <div className="metadata-form">
        <label>NFT title
          <input value={name} maxLength={160} disabled={!admin||!!busy}
            onChange={e=>change(setName,e.target.value)} placeholder="Original artwork title" />
        </label>
        <label>Description
          <textarea value={description} rows={4} maxLength={6000} disabled={!admin||!!busy}
            onChange={e=>change(setDescription,e.target.value)}/>
        </label>
        <label>Artwork IPFS URI
          <input value={image} disabled={!admin||!!busy} spellCheck={false}
            placeholder="ipfs://..." onChange={e=>change(setImage,e.target.value)}/>
        </label>
        <label>Or upload original artwork
          <input type="file" disabled={!admin||!!busy}
            accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
            onChange={e=>void upload(e.target.files?.[0])}/>
          {fileName&&<small>{fileName}{progress===undefined?'':(' · '+progress+'%')}</small>}
          <small>JPG/PNG/WebP, up to {formatArtworkSize(100*1024*1024)}.
            Original pixels retained on public IPFS.</small>
        </label>
        <label>External URL (optional)
          <input value={externalUrl} disabled={!admin||!!busy} maxLength={2048}
            placeholder="https://..." onChange={e=>change(setExternalUrl,e.target.value)}/>
        </label>
      </div>
      <div className="metadata-preview">
        <Artwork uri={image} alt={name||'Preview of original NFT'}/>
        <h3>{name||'Untitled original'}</h3>
        <p>{description||'Your NFT description will appear here.'}</p>
      </div>
    </div>
    <div className="button-row">
      <button type="button" className="button secondary" disabled={!admin||!!busy}
        onClick={()=>void pinMetadata()}>
        {busy==='pin'?'Pinning immutable JSON…':'Pin metadata JSON to IPFS'}
      </button>
    </div>
    {pinned&&<div className="metadata-pinned">
      <strong>Immutable NFT metadata URI</strong>
      <code>{pinned}</code>
      <div className="form-grid"><label>Recipient wallet
        <input value={recipient} disabled={!admin||!!busy}
          onChange={e=>{setRecipient(e.target.value);setSimulation(undefined);}}/>
        <small>ERC721TL mints a unique Token ID directly to this recipient.</small>
      </label></div>
      <button className="button secondary" type="button" onClick={()=>void runSimulation()}
        disabled={!admin||!!busy}>
        {busy==='simulate'?'Simulating on Ethereum…':'Simulate ERC721TL mint (read-only)'}
      </button>
    </div>}
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
  </section>;
}
