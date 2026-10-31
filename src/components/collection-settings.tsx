'use client';
import { useEffect,useState } from 'react';
import { Artwork } from './safe-media';
import { ContractFacts } from './checker';
import { AdminActions } from './admin-actions';
import { Notice,Loading } from './shell';
import { api } from '@/lib/api-client';
import { uploadOriginalArtwork } from '@/lib/direct-ipfs-upload';
import { useSession } from './providers';
import { ArrowLeft,ShieldCheck,Users,Percent,Link2,ImagePlus,ScanSearch,ArrowUpRight } from 'lucide-react';
type Panel='dashboard'|'identity'|'access'|'profile'|'royalty'|'stacks'|'advanced';
type Profile={description:string;logo:string;banner:string;website:string;x:string;instagram:string;profileUri:string};
const blank=():Profile=>({description:'',logo:'',banner:'',website:'',x:'',instagram:'',profileUri:''});
const cards=[
 {id:'profile',title:'Collection Profile',description:'Banner, logo, description and public identity',icon:ImagePlus},
 {id:'identity',title:'Collection Identity',description:'Verified address, chain, symbol and implementation',icon:ShieldCheck},
 {id:'access',title:'Ownership & Access',description:'Owner, administrators and wallet authority',icon:Users},
 {id:'royalty',title:'Collection Royalties',description:'Contract-wide default royalty recipient and rate',icon:Percent},
 {id:'stacks',title:'Stacks Mint Permission',description:'Verified on-chain authorization for Stacks v2.3.1',icon:Link2},
 {id:'advanced',title:'Advanced On-chain Information',description:'Block numbers, technical contract facts and diagnostics',icon:ScanSearch},
] as const;
export function CollectionSettings({info,onIntent,onProfileSaved}:{
  info:any;onIntent:(intent:any)=>void;onProfileSaved?:(doc:any)=>void
}){
  const [panel,setPanel]=useState<Panel>('dashboard');
  const [doc,setDoc]=useState<any>();
  const [data,setData]=useState<Profile>(blank);
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState('');
  const [dirty,setDirty]=useState(false);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const {ensureSession}=useSession();
  useEffect(()=>{
    let alive=true;setLoading(true);
    api('collection_profile_read',{chainId:info.chainId,contract:info.address})
    .then(r=>{if(alive){setDoc(r);setData({...blank(),...(r.data||{})});setDirty(false);}})
    .catch(e=>{if(alive)setError((e as Error).message);})
    .finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[info.chainId,info.address]);
  function navigate(target:Panel){
    if(busy)return;
    if(panel==='profile'&&dirty&&!window.confirm(
      'You have unsaved Collection Profile changes. Leave without saving?'))return;
    setPanel(target);setDirty(false);setError('');setNotice('');
    if(target==='profile')setData({...blank(),...(doc?.data||{})});
  }
  function change(k:keyof Profile,v:string){
    setData(d=>({...d,[k]:v,profileUri:k==='profileUri'?v:''}));
    setDirty(true);
  }
  async function run(task:string,fn:()=>Promise<void>){
    setBusy(task);setError('');setNotice('');
    try{await fn();}catch(e){setError((e as Error).message);}
    finally{setBusy('');}
  }
  async function save(){
    await run('save',async()=>{
      await ensureSession(info.chainId);
      const result=await api('collection_profile_write',{
        chainId:info.chainId,contract:info.address,
        expectedVersion:Number(doc?.version||0),data
      });
      setDoc(result);setData({...blank(),...result.data});onProfileSaved?.(result);
      setDirty(false);setNotice('Collection Profile saved. This is not an on-chain transaction.');
    });
  }
  async function pin(){
    await run('pin',async()=>{
      await ensureSession(info.chainId);
      const r=await api('collection_profile_pin',{
        chainId:info.chainId,contract:info.address,data
      });
      setData(d=>({...d,profileUri:r.uri}));
      setDirty(true);
      setNotice('Immutable public profile JSON pinned to '+r.uri+
        '. Save the profile to associate this URI with the collection in the app.');
    });
  }
  async function upload(k:'logo'|'banner',file?:File){
    if(!file)return;
    await run(k,async()=>{
      await ensureSession(info.chainId);
      const r=await uploadOriginalArtwork({
        file,kind:k==='logo'?'artwork':'banner',
        chainId:info.chainId,contract:info.address
      });
      setData(d=>({...d,[k]:r.uri,profileUri:''}));
      setDirty(true);
      setNotice('Image pinned to IPFS. Save the Collection Profile to keep it.');
    });
  }
  const defaultRoyalty=info.defaultRoyalty;
  return <div className="creator-settings">
    <section className="panel creator-studio-banner">
      <span className="eyebrow">COLLECTION CONTROL CENTER</span>
      <h2>The foundation of every edition.</h2>
      <p>Verify on-chain ownership, manage collection-wide royalty settings,
        grant Stacks mint permission and build an independent collection profile.</p>
    </section>
    {panel!=='dashboard' && <nav className="creator-studio-back" aria-label="Collection Settings navigation">
      <button className="button secondary compact" onClick={()=>navigate('dashboard')} disabled={!!busy}>
        <ArrowLeft size={16}/> Back to Collection Settings
      </button>
      <span className="muted">{cards.find(c=>c.id===panel)?.title}</span>
    </nav>}
    {panel==='dashboard' && <div className="creator-settings-grid">
      {cards.map(c=><button className="panel creator-settings-card" key={c.id}
        onClick={()=>navigate(c.id)}>
        <c.icon size={24} aria-hidden="true"/>
        <strong>{c.title}</strong>
        <span>{c.description}</span>
        {c.id==='stacks' && <small>{!info.sale?'Verification unavailable':
          info.sale.approved?'Approved':'Not approved'}</small>}
        {c.id==='profile' && <small>{loading?'Loading…':
          doc?.version?'Profile revision '+doc.version:'Profile not configured'}</small>}
        <span className="creator-settings-card-link">Open <ArrowUpRight size={14}/></span>
      </button>)}
    </div>}
    {panel==='identity'&&<section className="panel">
      <h2>Collection Identity</h2>
      <p>On-chain verified collection name, symbol, implementation and source network.
        The ERC1155TL v4.1.2 adapter does not expose a contractURI() or native collection image.</p>
      <ContractFacts info={info}/>
    </section>}
    {panel==='access'&&<section className="panel">
      <h2>Ownership & Access</h2>
      <p>These are read-only facts. This version does not expose grant/revoke admin
        or contract ownership transfer actions.</p>
      <dl className="facts">
        <dt>Collection owner</dt><dd className="mono">{info.owner}</dd>
        <dt>Administrators</dt><dd>{info.admins?.length?
          info.admins.map((a:string)=><p className="mono" key={a}>{a}</p>):'No additional admins'}</dd>
        <dt>Connected wallet authority</dt><dd>{info.role}</dd>
        <dt>Verified at block</dt><dd>{info.blockNumber}</dd>
      </dl>
    </section>}
    {panel==='royalty'&&<>
      <section className="panel">
        <h2>Collection Royalties</h2>
        <p>Default royalty is independently read from the collection contract.
          Token-specific royalty overrides may produce different effective rates.</p>
        <div className="creator-setting-current">
          <strong>Current default royalty</strong>
          <p className="mono">{defaultRoyalty?.[0]||'Not verified'}</p>
          <strong>{defaultRoyalty?Number(defaultRoyalty[1])/100+'%':'—'}</strong>
          <small>Percentage shown in basis points; maximum 1,000 bps (10%).</small>
        </div>
      </section>
      {info.authorized && <AdminActions key={'default-'+info.blockNumber}
        info={info} onIntent={onIntent} fixedAction="setDefaultRoyalty"
        initialRoyalty={defaultRoyalty?
          [String(defaultRoyalty[0]),String(defaultRoyalty[1])]:undefined}
        heading="Review default collection royalty update"/>}
    </>}
    {panel==='stacks'&&<section className="panel">
      <h2>Stacks Mint Permission</h2>
      <p>This grants the verified TLStacks1155 v2.3.1 contract permission
        to mint approved editions. It does not publish a Mint Page or start a sale.</p>
      <div className="creator-setting-current">
        <strong>Status: {!info.sale?'Verification unavailable':
          info.sale.approved?'Approved':'Not approved'}</strong>
        <p className="mono">Verified Stacks: {info.sale?.address||'Unavailable'}</p>
      </div>
      {info.saleError && <Notice type="error">{info.saleError}</Notice>}
      {info.sale?.approved && <Notice>Stacks is already an approved minter.
        No new permission transaction is necessary.</Notice>}
      {info.authorized && info.sale && !info.sale.approved &&
        <AdminActions info={info} onIntent={onIntent} fixedAction="approveStacks"
          heading="Review Stacks mint permission"/>}
    </section>}
    {panel==='advanced'&&<section className="panel">
      <h2>Advanced On-chain Information</h2>
      <p>The information below is based on a verified RPC read at one block.</p>
      <ContractFacts info={info}/>
      {info.saleError && <Notice type="error">{info.saleError}</Notice>}
    </section>}
    {panel==='profile'&&<section className="panel creator-profile">
      <div className="section-top"><div>
        <h2>Collection Profile</h2>
        <p>App-managed descriptions and visual identity. Contract name and symbol
          remain on-chain verified and cannot be overwritten here.</p>
      </div><span className="tag">OFF-CHAIN · VERSIONED</span></div>
      {loading && <Loading label="Loading Collection Profile…"/>}
      <div className="creator-profile-banner">
        <Artwork uri={data.banner} alt="Collection banner"/>
      </div>
      <div className="creator-profile-heading">
        <div className="creator-profile-logo"><Artwork uri={data.logo} alt="Collection logo"/></div>
        <div><h3>{info.name}</h3><p className="muted">{info.symbol} · On-chain verified</p></div>
      </div>
      <p className="fineprint">Images and text are stored as an authenticated app profile.
        IPFS pinning is optional; the ERC1155TL contract does not link these fields on-chain.</p>
      <div className="form-grid">
        <label>Description
          <textarea rows={6} maxLength={6000} disabled={!info.authorized||!!busy}
            value={data.description} onChange={e=>change('description',e.target.value)}/>
        </label>
        <label>Website
          <input placeholder="https://…" disabled={!info.authorized||!!busy}
            value={data.website} onChange={e=>change('website',e.target.value)}/>
        </label>
        {(['logo','banner'] as const).map(kind=><label key={kind}>
          {kind==='logo'?'Collection logo URI':'Collection banner URI'}
          <input value={data[kind]} placeholder="ipfs://…"
            disabled={!info.authorized||!!busy}
            onChange={e=>change(kind,e.target.value)}/>
          {info.authorized && <input type="file" accept=".jpg,.jpeg,.png,.webp"
            disabled={!!busy} onChange={e=>void upload(kind,e.target.files?.[0])}/>}
          <small>Public JPG, PNG or WebP pinned unchanged to IPFS, up to 100 MiB.</small>
        </label>)}
        <label>X (Twitter)
          <input placeholder="https://x.com/…" value={data.x}
            disabled={!info.authorized||!!busy}
            onChange={e=>change('x',e.target.value)}/>
        </label>
        <label>Instagram
          <input placeholder="https://instagram.com/…" value={data.instagram}
            disabled={!info.authorized||!!busy}
            onChange={e=>change('instagram',e.target.value)}/>
        </label>
      </div>
      <div className="creator-setting-current">
        <strong>Profile JSON pinned URI</strong>
        <p className="mono">{data.profileUri||'Not pinned'}</p>
        <small>Pinning creates an immutable public JSON document, not an on-chain contractURI().</small>
      </div>
      {error && <Notice type="error">{error}</Notice>}
      {notice && <Notice type="success">{notice}</Notice>}
      {info.authorized && <div className="button-row">
        <button className="button" disabled={!!busy||loading||!dirty} onClick={()=>void save()}>
          {busy==='save'?'Saving…':'Save Collection Profile'}</button>
        <button className="button secondary" disabled={!!busy||loading} onClick={()=>void pin()}>
          {busy==='pin'?'Pinning…':'Pin Collection Profile to IPFS'}</button>
      </div>}
      <small>Revision {doc?.version||0}.
        Profile edits do not modify the NFT collection contract, mint supply or royalties.</small>
    </section>}
  </div>;
}
