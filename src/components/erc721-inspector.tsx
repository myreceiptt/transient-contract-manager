'use client';
import { useEffect,useState } from 'react';
import { useSearchParams,useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft,ExternalLink,Search,RefreshCw,LockKeyhole } from 'lucide-react';
import { Artwork } from './safe-media';
import { Loading,Notice } from './shell';
import { api,short } from '@/lib/api-client';
import { useConnection } from './providers';
import { erc721CandidateChains,localChain,explorer } from '@/lib/chains';

type TokenItem={tokenId:string;status:'OWNED'|'UNKNOWN_OR_BURNED';owner?:string;
  tokenUri?:string|null;metadataStatus?:string;message?:string};
export function Erc721Inspector({mode='standalone'}:{mode?:'standalone'|'checker'|'workspace'}={}){
  const router=useRouter(),query=useSearchParams();
  const {address}=useConnection();
  const [chainId,setChainId]=useState(1);
  const [contract,setContract]=useState('');
  const [collection,setCollection]=useState<any>();
  const [tokens,setTokens]=useState<TokenItem[]>([]);
  const [metadata,setMetadata]=useState<Record<string,any>>({});
  const [start,setStart]=useState(1);
  const [busy,setBusy]=useState(false);
  const [scanning,setScanning]=useState(false);
  const [error,setError]=useState('');
  const [diagnosis,setDiagnosis]=useState<any>();
  const [scanError,setScanError]=useState('');
  async function inspect(id:number,contractAddress:string){
    const addressForRole=address;
    setBusy(true);setError('');setDiagnosis(undefined);setCollection(undefined);setTokens([]);setMetadata({});
    try{
      const result=await api('inspect_erc721',{chainId:id,contract:contractAddress,wallet:addressForRole});
      setCollection(result);setChainId(id);setContract(contractAddress);
      const url='/erc721?chain='+id+'&contract='+encodeURIComponent(contractAddress.toLowerCase());
      if(mode==='standalone')router.replace(url,{scroll:false});
    }catch(e){
      setError((e as Error).message);
      try {
        const report=await api('diagnose_erc721',{chainId:id,contract:contractAddress});
        setDiagnosis(report);
      }catch { /* Preserve strict inspect error if diagnostic RPC is unavailable. */ }
    }
    finally{setBusy(false);}
  }
  useEffect(()=>{
    const initial=query.get('contract');
    const selected=Number(query.get('chain')||1);
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
    {mode==='standalone'&&<>
      <Link href="/" className="text-link back-link"><ArrowLeft size={15}/> All collections</Link>
      <div className="page-heading compact-heading"><div>
        <span className="eyebrow">ERC721TL · READ-ONLY INSPECTOR</span>
        <h1>Every original. One owner.</h1>
        <p className="lead">Read-only ERC721TL contract and Token ID exploration on Ethereum Mainnet.
          No mint, approval, listing, bidding or settlement is enabled here.</p>
      </div></div>
    </>}
    {mode!=='workspace'&&<section className="panel">
      <div className="section-top"><h2>{mode==='checker'?'01 — 1 of 1 Collection':'Inspect an ERC-721 collection'}</h2>
        <span className="tag">ERC721TL · READ-ONLY</span></div>
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
      {diagnosis && <section className="erc721-diagnostic" aria-label="Compatibility diagnosis">
        <h3>Read-only compatibility diagnosis</h3>
        <p>These are observations from Ethereum RPC at block {diagnosis.observedBlock},
          not approval of this contract for creation, transfers or auctions.</p>
        <dl>
          <dt>Reported VERSION()</dt><dd className="mono">{diagnosis.version??'Unavailable / reverted'}</dd>
          <dt>Read-only baselines</dt><dd>{diagnosis.inspectorBaseline}</dd>
          <dt>ERC-721 interface (ERC-165)</dt>
          <dd>{diagnosis.erc721Interface===true?'Yes':diagnosis.erc721Interface===false?'No':'Unavailable'}</dd>
          <dt>ERC-1155 interface (ERC-165)</dt>
          <dd>{diagnosis.erc1155Interface===true?'Yes':diagnosis.erc1155Interface===false?'No':'Unavailable'}</dd>
          <dt>Reported collection name</dt><dd>{diagnosis.name??'Unavailable'}</dd>
          <dt>Implementation</dt><dd className="mono">{diagnosis.implementation}
            {' · '+diagnosis.proxyKind}</dd>
          <dt>Observed implementation codehash</dt>
          <dd className="mono">{diagnosis.implementationCodeHash}</dd>
          <dt>On-chain owner()</dt><dd className="mono">{diagnosis.owner??'Unavailable'}</dd>
        </dl>
        <strong>Why strict inspection cannot proceed:</strong>
        <ul>{diagnosis.mismatchReasons.length?
          diagnosis.mismatchReasons.map((reason:string,index:number)=><li key={index}>{reason}</li>):
          <li>Candidate interface matches, but the previous inspection failed.
            Retry or inspect RPC availability. Runtime remains unverified.</li>}
        </ul>
        <p className="fineprint">{diagnosis.notice}</p>
        <a className="text-link" href={explorer(diagnosis.chainId,diagnosis.contract)}
          target="_blank" rel="noopener noreferrer">
          View contract on block explorer <ExternalLink size={13}/>
        </a>
      </section>}
    </section>}
    {mode==='workspace'&&busy&&<Loading label="Reading on-chain ERC721 collection…"/>}
    {mode==='workspace'&&error&&<Notice type="error">{error}</Notice>}
    {collection && <>
      {mode!=='workspace'&&<section className="panel">
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
          <dt>Official source baseline</dt><dd className="mono">
            <a href={'https://github.com/Transient-Labs/tl-creator-contracts/commit/'+collection.sourceCommit}
              target="_blank" rel="noopener noreferrer">{collection.sourceCommit} ↗</a></dd>
          <dt>Code hash (observed)</dt><dd className="mono">{collection.implementationCodeHash}</dd>
          <dt>Owner (collection)</dt><dd className="mono">{collection.owner}</dd>
          <dt>Your connected wallet</dt><dd className="mono">{collection.inspectedWallet||
            'Not connected. Connect a wallet, then inspect again.'}</dd>
          <dt>Your on-chain role (read-only)</dt>
          <dd><strong>{String(collection.walletRole).toUpperCase()}</strong>
            <small>Role checked at the observed block. Execution is still disabled
              until the exact Ethereum Mainnet runtime is verified.</small></dd>
          <dt>Admin wallets</dt><dd>{collection.admins.length?
            collection.admins.map((a:string)=><div className="mono" key={a}>{a}</div>):'No additional admins'}</dd>
          <dt>{collection.totalSupplyMeaning==='MINTED_TOKEN_ID_COUNTER_INCLUDES_BURNED'
            ?'Minted Token ID counter':'Current unburned supply'}</dt><dd>{collection.totalSupply}
            <small>{collection.totalSupplyMeaning==='MINTED_TOKEN_ID_COUNTER_INCLUDES_BURNED'
              ?'In ERC721TL v3.6.0 totalSupply() returns the minted Token ID counter, including burned IDs; it is not the number currently owned.'
              :'ERC721TL v4.1.2 subtracts burned tokens. Neither value is a sale allocation or guaranteed maximum Token ID.'}</small></dd>
          <dt>Read block</dt><dd className="mono">{collection.observedBlock}</dd>
        </dl>
      </section>}
      <section className="panel">
        <div className="section-top">
          <div><h2>{mode==='workspace'?'1 of 1 NFT Catalogue':'Explore Token IDs'}</h2>
          <p className="muted">Scan a bounded 12-ID window, including missing/burned IDs.
            Each owned token is checked with ERC-721 ownerOf and tokenURI.</p></div>
          <LockKeyhole color="#76816c" size={20}/>
        </div>
        {BigInt(collection.totalSupply)===0n&&<div className="erc721-empty-state">
          <strong>No NFT minted yet</strong>
          <p>This collection currently reports zero minted 1 of 1 NFTs.
            Create 1 of 1 remains unavailable until exact runtime and admin-write simulation pass.</p>
        </div>}
        {BigInt(collection.totalSupply)>0n&&<form className="checker-form" onSubmit={e=>{e.preventDefault();void scan(start);}}>
          <label>First Token ID
            <input type="number" min="1" max="100000000" step="1" value={start}
              onChange={e=>setStart(Number(e.target.value))}/>
          </label>
          <button className="button secondary" disabled={scanning}>
            <RefreshCw size={15}/> {scanning?'Reading…':'Read 12 Token IDs'}
          </button>
        </form>}
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
      {mode!=='workspace'&&<Notice>TLStacks721 primary Mint Pages and TLAuctionHouse collector auctions
        remain disabled until their exact chain runtimes and test transactions are verified.</Notice>}
    </>}
  </div>;
}
