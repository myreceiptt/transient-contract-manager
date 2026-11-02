'use client';
import { useEffect,useState } from 'react';
import { useSearchParams,useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft,ExternalLink,Search,RefreshCw,LockKeyhole } from 'lucide-react';
import { Artwork } from './safe-media';
import { Loading,Notice } from './shell';
import { api,short } from '@/lib/api-client';
import { erc721CandidateChains,localChain,explorer } from '@/lib/chains';

type TokenItem={tokenId:string;status:'OWNED'|'UNKNOWN_OR_BURNED';owner?:string;
  tokenUri?:string|null;metadataStatus?:string;message?:string};
export function Erc721Inspector(){
  const router=useRouter(),query=useSearchParams();
  const [chainId,setChainId]=useState(8453);
  const [contract,setContract]=useState('');
  const [collection,setCollection]=useState<any>();
  const [tokens,setTokens]=useState<TokenItem[]>([]);
  const [metadata,setMetadata]=useState<Record<string,any>>({});
  const [start,setStart]=useState(1);
  const [busy,setBusy]=useState(false);
  const [scanning,setScanning]=useState(false);
  const [error,setError]=useState('');
  const [scanError,setScanError]=useState('');
  async function inspect(id:number,address:string){
    setBusy(true);setError('');setCollection(undefined);setTokens([]);setMetadata({});
    try{
      const result=await api('inspect_erc721',{chainId:id,contract:address});
      setCollection(result);setChainId(id);setContract(address);
      const url='/erc721?chain='+id+'&contract='+encodeURIComponent(address.toLowerCase());
      router.replace(url,{scroll:false});
    }catch(e){setError((e as Error).message);}
    finally{setBusy(false);}
  }
  useEffect(()=>{
    const initial=query.get('contract');
    const selected=Number(query.get('chain')||8453);
    if(initial && [1,4663,8453,360,84532,31337].includes(selected)){
      setContract(initial);setChainId(selected);
      void inspect(selected,initial);
    }
    // Only initial URL request; form submits control all later reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  async function scan(from:number){
    if(!collection)return;
    setScanning(true);setScanError('');setTokens([]);setMetadata({});
    try {
      const response=await api('scan_erc721',{
        chainId:collection.chainId,contract:collection.contract,start:from,count:12
      });
      setStart(from);setTokens(response.tokens);
      const good=response.tokens.filter((t:TokenItem)=>t.status==='OWNED'&&t.tokenUri);
      const found:Record<string,any>={};
      for(let i=0;i<good.length;i+=3){
        const subset=good.slice(i,i+3);
        const results=await Promise.allSettled(subset.map((t:TokenItem)=>
          api('metadata',{uri:t.tokenUri})
        ));
        results.forEach((item,j)=>{
          if(item.status==='fulfilled')found[subset[j].tokenId]=item.value;
        });
      }
      setMetadata(found);
    }catch(e){setScanError((e as Error).message);}
    finally{setScanning(false);}
  }
  const chains=[...erc721CandidateChains,...(process.env.NEXT_PUBLIC_LOCAL_CHAIN_ENABLED==='true'?[localChain]:[])];
  return <div className="erc721-inspector">
    <Link href="/" className="text-link back-link"><ArrowLeft size={15}/> All collections</Link>
    <div className="page-heading compact-heading">
      <div>
        <span className="eyebrow">ERC721TL · PHASE A COMPATIBILITY INSPECTOR</span>
        <h1>Every original. One owner.</h1>
        <p className="lead">Read-only ERC721TL v4.1.2 contract and Token ID exploration.
          No mint, approval, listing, bidding or settlement is enabled here.</p>
      </div>
    </div>
    <section className="panel">
      <div className="section-top"><h2>Inspect an ERC-721 collection</h2>
        <span className="tag">READ-ONLY</span></div>
      <form className="checker-form" onSubmit={e=>{e.preventDefault();void inspect(chainId,contract);}}>
        <label>Network
          <select value={chainId} onChange={e=>setChainId(Number(e.target.value))}>
            {chains.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>ERC721TL collection address
          <input value={contract} required spellCheck={false} placeholder="0x..."
            onChange={e=>setContract(e.target.value)}/>
        </label>
        <button className="button" disabled={busy}>
          <Search size={16}/> {busy?'Inspecting…':'Inspect contract'}
        </button>
      </form>
      {busy && <Loading label="Reading owner, version, interface and code…"/>}
      {error && <Notice type="error">{error}</Notice>}
    </section>
    {collection && <>
      <section className="panel">
        <div className="section-top"><div>
          <span className="eyebrow">ERC-721 · SOURCE INTERFACE CANDIDATE</span>
          <h2>{collection.name} <span className="muted">{collection.symbol}</span></h2>
        </div><span className="tag">RUNTIME UNVERIFIED</span></div>
        <Notice>{collection.notice}</Notice>
        <dl>
          <dt>Collection</dt><dd><a className="mono" href={explorer(collection.chainId,collection.contract)}
            target="_blank" rel="noopener noreferrer">{collection.contract} <ExternalLink size={12}/></a></dd>
          <dt>Implementation</dt><dd className="mono">{collection.implementation}
            {collection.proxy?' · EIP-1167 clone':' · Direct'}</dd>
          <dt>Interface version</dt><dd>{collection.version} · ERC-721 (ERC-165)</dd>
          <dt>Code hash (observed)</dt><dd className="mono">{collection.implementationCodeHash}</dd>
          <dt>Owner (collection)</dt><dd className="mono">{collection.owner}</dd>
          <dt>Admin wallets</dt><dd>{collection.admins.length?
            collection.admins.map((a:string)=><div className="mono" key={a}>{a}</div>):'No additional admins'}</dd>
          <dt>Current total supply</dt><dd>{collection.totalSupply}
            <small>Existing tokens; not maximum Token ID or planned drop supply</small></dd>
          <dt>Read block</dt><dd className="mono">{collection.observedBlock}</dd>
        </dl>
      </section>
      <section className="panel">
        <div className="section-top">
          <div><h2>Explore Token IDs</h2>
          <p className="muted">Scan a bounded 12-ID window, including missing/burned IDs.
            Each owned token is checked with ERC-721 ownerOf and tokenURI.</p></div>
          <LockKeyhole color="#76816c" size={20}/>
        </div>
        <form className="checker-form" onSubmit={e=>{e.preventDefault();void scan(start);}}>
          <label>First Token ID
            <input type="number" min="1" max="100000000" step="1" value={start}
              onChange={e=>setStart(Number(e.target.value))}/>
          </label>
          <button className="button secondary" disabled={scanning}>
            <RefreshCw size={15}/> {scanning?'Reading…':'Read 12 Token IDs'}
          </button>
        </form>
        {scanError && <Notice type="error">{scanError}</Notice>}
        {scanning && <Loading label="Inspecting ownership and metadata at a consistent block…"/>}
        {tokens.length>0 && <div className="token-grid">
          {tokens.map(t=><article className="token-card erc721-candidate-card" key={t.tokenId}>
            <Artwork uri={metadata[t.tokenId]?.image} alt={metadata[t.tokenId]?.name||'NFT #'+t.tokenId}/>
            <div className="erc721-candidate-body">
              <span className="eyebrow">TOKEN #{t.tokenId}</span>
              <h3>{metadata[t.tokenId]?.name||'ERC-721 #'+t.tokenId}</h3>
              <p>{t.status==='OWNED'?'Owned at block '+collection.observedBlock:
                'Not found / burned / ownership unavailable'}</p>
              {t.owner && <div><small>Current token owner</small><p className="mono">
                <a href={explorer(collection.chainId,t.owner)} target="_blank"
                  rel="noopener noreferrer">{short(t.owner)} ↗</a>
              </p></div>}
              {t.tokenUri && <details><summary>tokenURI()</summary>
                <code>{t.tokenUri}</code></details>}
              {t.metadataStatus==='UNAVAILABLE' && <small>tokenURI read unavailable</small>}
              {t.message && <small>{t.message}</small>}
            </div>
          </article>)}
        </div>}
        {tokens.length>0 && <div className="button-row">
          <button className="button secondary compact" disabled={scanning||start<=1}
            onClick={()=>void scan(Math.max(1,start-12))}>Previous 12 IDs</button>
          <button className="button secondary compact" disabled={scanning||start>=99999989}
            onClick={()=>void scan(start+12)}>Next 12 IDs</button>
        </div>}
        <p className="fineprint">For large collections this is an inspection window,
          not an exhaustive holder index. A reverted ownerOf call is never treated as a zero balance.
          Full Transfer-event indexing and codehash allowlisting are pending.</p>
      </section>
      <Notice>TLStacks721 primary Mint Pages and TLAuctionHouse collector auctions
        remain disabled until their exact chain runtimes and test transactions are verified.</Notice>
    </>}
  </div>;
}
