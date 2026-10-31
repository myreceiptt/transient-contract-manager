'use client';
import { useEffect,useRef,useState } from 'react';
import { Artwork } from './safe-media';
import { NftMetadataStudio } from './nft-metadata-studio';
import { AdminActions } from './admin-actions';
import { Notice,Loading } from './shell';
import { api } from '@/lib/api-client';
import { ArrowLeft,ArrowUpRight,Plus,Layers,RefreshCw } from 'lucide-react';
type View='catalogue'|'create'|'batch'|'manage';
type Prepared={action:string;uri?:string;tokenId?:string;batch?:string};
export function TokenStudio({info,onIntent,onOpenMintPages}:{
  info:any;onIntent:(intent:any)=>void;onOpenMintPages:()=>void
}){
  const [view,setView]=useState<View>('catalogue');
  const [step,setStep]=useState<'metadata'|'review'>('metadata');
  const [selected,setSelected]=useState<any>();
  const [operation,setOperation]=useState<'mintToken'|'setTokenUri'|'setTokenRoyalty'>('mintToken');
  const [prepared,setPrepared]=useState<Prepared>();
  const [dirty,setDirty]=useState(false);
  const [tokens,setTokens]=useState<any[]>([]);
  const [metadata,setMetadata]=useState<Record<string,any>>({});
  const cache=useRef<Record<string,{uri:string;data:any}>>({});
  const [errors,setErrors]=useState<Record<string,string>>({});
  const [start,setStart]=useState(1);
  const [retry,setRetry]=useState(0);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [holder,setHolder]=useState('');
  const [balance,setBalance]=useState<string>();
  const [balancing,setBalancing]=useState(false);
  const [detailsOpen,setDetailsOpen]=useState(false);
  useEffect(()=>{
    let live=true;setLoading(true);setError('');
    api('inventory',{chainId:info.chainId,contract:info.address,start})
      .then(async r=>{
        if(!live)return;setTokens(r.tokens||[]);
        const found:Record<string,any>={},fails:Record<string,string>={};
        for(let i=0;i<(r.tokens||[]).length && live;i+=4){
          const batch=r.tokens.slice(i,i+4);
          const data=await Promise.allSettled(batch.map(async(t:any)=>{
            const prev=cache.current[String(t.id)];
            return prev?.uri===t.uri?prev.data:await api('metadata',{uri:t.uri});
          }));
          for(let j=0;j<batch.length;j++){
            const id=String(batch[j].id),value=data[j];
            if(value.status==='fulfilled'){
              found[id]=value.value;
              cache.current[id]={uri:batch[j].uri,data:value.value};
            }else fails[id]=value.reason instanceof Error?value.reason.message:'Metadata unavailable';
          }
        }
        if(live){setMetadata(found);setErrors(fails);}
      }).catch(e=>{if(live)setError((e as Error).message);})
      .finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;};
  },[info.address,info.chainId,info.tokenTypes,start,retry]);
  function open(next:View,token?:any){
    setView(next);setSelected(token);setStep('metadata');setPrepared(undefined);
    setDirty(false);setBalance(undefined);setHolder('');setDetailsOpen(false);
    setOperation('mintToken');setError('');
  }
  function back(){
    if(dirty && !window.confirm('Leave this studio? Unsaved metadata or batch changes will be lost.'))return;
    open('catalogue');
    setRetry(n=>n+1);
  }
  function preparedAction(next:Prepared){
    setPrepared(next);setStep('review');setDirty(false);
  }
  async function lookupBalance(){
    if(!selected || !holder.trim())return;
    setBalancing(true);setError('');setBalance(undefined);
    try{
      const r=await api('balance',{chainId:info.chainId,contract:info.address,
        holder:holder.trim(),tokenId:String(selected.id)});
      setBalance(r.balance);
    }catch(e){setError((e as Error).message);}
    finally{setBalancing(false);}
  }
  const tokenId=selected?String(selected.id):undefined;
  return <div className="creator-studio">
    <section className="panel creator-studio-banner">
      <span className="eyebrow">NFT COLLECTION STUDIO</span>
      <h2>Where every edition begins.</h2>
      <p>Create, discover and manage on-chain ERC-1155 editions. Metadata preparation
        and contract transactions are always separate actions.</p>
    </section>
    {view!=='catalogue' && <nav className="creator-studio-back" aria-label="Tokens and Editions navigation">
      <button className="button secondary compact" type="button" onClick={back}>
        <ArrowLeft size={16}/> Back to NFT Editions
      </button>
      <span className="muted">{view==='create'?'Create Token Studio':
        view==='batch'?'Create Batch Studio':'Manage Token #'+tokenId}</span>
    </nav>}
    {view==='catalogue' && <section className="creator-studio-catalogue">
      <div className="section-top">
        <div><h2>NFT Editions</h2><p className="muted">Select a token card to manage its on-chain identity.</p></div>
        <span className="tag">{info.tokenTypes} TOKEN TYPES</span>
      </div>
      <div className="button-row creator-studio-catalogue-actions">
        {info.authorized && <>
          <button className="button" onClick={()=>open('create')}><Plus size={16}/> Create Token</button>
          <button className="button secondary" onClick={()=>open('batch')}><Layers size={16}/> Create Batch</button>
        </>}
        <button className="button secondary" onClick={()=>setRetry(n=>n+1)}>
          <RefreshCw size={16}/> Refresh tokens
        </button>
      </div>
      {error && <Notice type="error">{error}</Notice>}
      {loading && <Loading label="Reading NFT metadata and token inventory…"/>}
      <div className="token-grid creator-studio-grid">
        {tokens.map(t=><article className="token-card creator-studio-card" key={String(t.id)}>
          <Artwork uri={metadata[String(t.id)]?.image} alt={metadata[String(t.id)]?.name||'NFT artwork'}/>
          <div className="creator-studio-card-body">
            <span className="eyebrow">TOKEN #{String(t.id)} · {t.locked?'MINT LOCKED':'MINTABLE'}</span>
            <h3>{metadata[String(t.id)]?.name||'Edition #'+t.id}</h3>
            {metadata[String(t.id)]?.description &&
              <p>{String(metadata[String(t.id)].description).slice(0,220)}</p>}
            {errors[String(t.id)] && <small>Metadata unavailable. Token validity is verified on-chain.</small>}
            <details><summary>Metadata URI</summary><code>{t.uri}</code></details>
            <button className="button secondary compact" onClick={()=>open('manage',t)}>
              {info.authorized?'Manage Token':'View Token'} <ArrowUpRight size={14}/>
            </button>
          </div>
        </article>)}
      </div>
      <div className="button-row">
        <button className="button secondary compact" disabled={start<=1}
          onClick={()=>setStart(v=>Math.max(1,v-20))}>Previous</button>
        <button className="button secondary compact"
          disabled={BigInt(start+19)>=BigInt(info.tokenTypes)}
          onClick={()=>setStart(v=>v+20)}>Next</button>
      </div>
      <p className="fineprint">Token types are not circulating unit supply.
        The current holder balance is verified for a specific wallet and Token ID.</p>
    </section>}
    {(view==='create'||view==='batch') && <>
      <section className="panel">
        <h2>{view==='batch'?'Create multiple Token IDs':'Create a new NFT Token ID'}</h2>
        <p>Prepare immutable IPFS metadata first. Pinning JSON is not an NFT mint.
          Any contract creation requires a separate, simulated wallet transaction.</p>
        <div className="creator-steps">
          {['Artwork & information','Metadata & IPFS','Edition distribution','Simulate & review'].map((v,i)=>
            <span key={v} className={(step==='metadata'&&i<2)||(step==='review'&&i>=2)?'active':''}>
              {i+1}. {v}
            </span>)}
        </div>
        {step==='review' && <button className="button secondary compact" onClick={()=>setStep('metadata')}>
          Edit metadata or batch
        </button>}
      </section>
      <div style={{display:step==='metadata'?'block':'none'}}>
        <NftMetadataStudio key={view} info={info} mode={view==='batch'?'batch':'create'}
          onDirtyChange={setDirty} onPrepared={preparedAction}/>
      </div>
      {step==='review' && prepared && <AdminActions
        key={view+prepared.action+prepared.uri}
        info={info} onIntent={onIntent} fixedAction={view==='batch'?'batchCreateToken':'createToken'}
        prepared={prepared}
        heading={view==='batch'?'Review batch token creation':'Review new token creation'}/>}
    </>}
    {view==='manage' && selected && <>
      <section className="panel">
        <div className="section-top"><div>
          <span className="eyebrow">TOKEN #{tokenId}</span>
          <h2>{metadata[tokenId!]?.name||'Edition #'+tokenId}</h2>
          <p className="muted">{selected.locked?'Minting permanently locked':'Minting allowed by token lock state'}</p>
        </div><button className="button secondary compact" onClick={onOpenMintPages}>
          Open Mint Pages <ArrowUpRight size={14}/>
        </button></div>
        <div className="collection-metadata">
          <Artwork uri={metadata[tokenId!]?.image} alt={metadata[tokenId!]?.name||'Token artwork'}/>
          <div><h3>01 · Token identity & metadata</h3>
            <p>{metadata[tokenId!]?.description||'NFT metadata description not available.'}</p>
            <p className="fineprint">Token ID and collection contract are immutable identities in this studio.</p>
            <details><summary>Current on-chain metadata URI</summary><code>{selected.uri}</code></details>
            <button className="button secondary compact" onClick={()=>setDetailsOpen(v=>!v)}>
              {detailsOpen?'Hide metadata attributes':'View metadata attributes'}
            </button>
            {detailsOpen && <pre>{JSON.stringify(metadata[tokenId!]?.attributes||[],null,2)}</pre>}
          </div>
        </div>
      </section>
      <section className="panel">
        <h3>02 · Minting & distribution</h3>
        <p>Issue additional editions or airdrop to specified wallets. This is distinct
          from public TLStacks1155 sales and requires authorized wallet review.</p>
        <h3>03 · Token royalties</h3>
        <p>Token-specific royalties may differ from the collection-wide default.</p>
        <h3>04 · Ownership & balances</h3>
        <form className="checker-form" onSubmit={e=>{e.preventDefault();void lookupBalance();}}>
          <label>Holder wallet address
            <input value={holder} onChange={e=>setHolder(e.target.value)}
              placeholder="0x…" required/></label>
          <button className="button secondary" disabled={balancing}>
            {balancing?'Reading…':'Check holder balance'}</button>
        </form>
        {balance!==undefined && <p><strong>{balance}</strong> editions held now by this wallet.</p>}
        {error && <Notice type="error">{error}</Notice>}
      </section>
      {info.authorized && <section className="panel">
        <h3>Manage this token</h3>
        <div className="button-row">
          {(['mintToken','setTokenUri','setTokenRoyalty'] as const).map(a=>
            <button key={a} className={'button '+(operation===a?'':'secondary')}
              onClick={()=>{
                if(dirty && !window.confirm('Switch action and discard unsaved metadata changes?'))return;
                setOperation(a);setPrepared(undefined);setDirty(false);
              }}>{a==='mintToken'?'Mint / Airdrop':a==='setTokenUri'?'Edit metadata URI':'Token royalty'}</button>)}
        </div>
      </section>}
      {info.authorized && operation==='setTokenUri' && <div>
        <NftMetadataStudio key={'update-'+tokenId} info={info} mode="update"
          selectedTokenId={tokenId} initialUri={selected.uri}
          onPrepared={preparedAction} onDirtyChange={setDirty}/>
      </div>}
      {info.authorized && <AdminActions
        key={operation+'-'+tokenId}
        info={info} onIntent={onIntent} initialAction={operation} fixedAction={operation}
        lockedTokenId={tokenId}
        prepared={operation==='setTokenUri'?prepared:undefined}
        heading={operation==='mintToken'?'Mint / Airdrop Token #'+tokenId:
          operation==='setTokenUri'?'Review metadata update · Token #'+tokenId:
            'Review token royalty · Token #'+tokenId}/>}
    </>}
  </div>;
}
