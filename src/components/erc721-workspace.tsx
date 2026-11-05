'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react';
import { useConnection } from './providers';
import { Erc721Inspector } from './erc721-inspector';
import { Erc721CreateDraftStudio } from './erc721-create-draft-studio';
import { Erc721PrimaryStudio } from './erc721-primary-studio';
import { Erc721AuctionStudio } from './erc721-auction-studio';
import { Erc721Settings } from './erc721-settings-dashboard';
import { Erc721Activity } from './erc721-activity';
import { api, short } from '@/lib/api-client';
import { getChain, explorer } from '@/lib/chains';
import { Loading, Notice } from './shell';

const tabs=['Overview','Artworks & Tokens','Mint Pages','Auctions','Collection Settings','Transactions'] as const;
type Tab=typeof tabs[number];
export function Erc721Workspace(){
  const params=useSearchParams();
  const chainId=Number(params.get('chain')||1);
  const contract=params.get('contract')||'';
  const {address}=useConnection();
  const [info,setInfo]=useState<any>();
  const [tab,setTab]=useState<Tab>('Overview');
  const [visited,setVisited]=useState<Tab[]>(['Overview']);
  function navigate(next:Tab){setTab(next);setVisited(prev=>prev.includes(next)?prev:[...prev,next]);}
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  async function refresh(){
    if(!contract)return;
    setBusy(true);setError('');
    try {
      const response=await api('inspect_erc721',{chainId,contract,wallet:address});
      setInfo(response);
    }catch(e){setError((e as Error).message);setInfo(undefined);}
    finally{setBusy(false);}
  }
  useEffect(()=>{setInfo(undefined);void refresh();},
    // Contract or connected wallet changes trigger another authoritative on-chain read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chainId,contract,address]);
  const role=info?.walletRole||'viewer';
  const isAdmin=role==='admin'||role==='owner';
  return <>
    <Link className="text-link back-link" href="/"><ArrowLeft size={15}/> All collections</Link>
    {busy&&!info&&<Loading label="Verifying ERC721TL collection on-chain…"/>}
    {error&&<Notice type="error">{error}</Notice>}
    {info&&<>
      <div className="page-heading compact-heading">
        <div>
          <div className="eyebrow">COLLECTION WORKSPACE · {getChain(chainId).name.toUpperCase()} · ERC-721</div>
          <h1>{info.name}</h1>
          <p className="lead mono">{short(info.contract)}{' '}
            <a href={explorer(chainId,info.contract)} target="_blank"
              rel="noopener noreferrer" aria-label="View collection on explorer"><ExternalLink size={14}/></a>
          </p>
        </div>
        <div className="heading-actions">
          <span className="tag">{String(role).toUpperCase()} · READ-ONLY</span>
          <button className="icon-button" disabled={busy} onClick={()=>void refresh()}
            aria-label="Refresh ERC721 collection"><RefreshCw size={18}/></button>
        </div>
      </div>
      <Notice>
        {info.creatorMintRuntimeVerified
          ? 'ERC721TL v4.1.2 creator mint runtime verified. Prepare an artwork, review its mint, and obtain explicit approval for that exact transaction before signing.'
          : `ERC721TL v${info.version} is available for read-only inspection. This deployment is not verified for creator mint signing.`}
        {' '}Mint Page publication and auctions remain disabled.
      </Notice>
      <div className="tabs" role="tablist" aria-label="ERC721 collection sections">
        {tabs.map(t=><button key={t} role="tab" className={tab===t?'active':''}
          aria-selected={tab===t} onClick={()=>navigate(t)}>{t}</button>)}
      </div>
      {tab==='Overview'&&<>
        <section className="panel">
          <div className="section-top"><h2>Collection identity</h2>
            <span className="tag">ERC721TL v{info.version}</span></div>
          <div className="erc721-overview-hero">
            <div><span className="eyebrow">ONE NFT · ONE OWNER</span>
              <h2>{info.name}</h2><p>{info.symbol} · Ethereum Mainnet</p></div>
            <div><span className="eyebrow">ON-CHAIN SUPPLY</span>
              <strong>{info.totalSupply}</strong>
              <p>{info.totalSupplyMeaning==='MINTED_TOKEN_ID_COUNTER_INCLUDES_BURNED'
                ?'Minted ID counter, includes burned tokens':'Current unburned NFTs'}</p></div>
          </div>
          <div className="erc721-metrics">
            <div><small>Collection standard</small><strong>ERC-721</strong></div>
            <div><small>Token supply</small><strong>{info.totalSupply}</strong></div>
            <div><small>Wallet permission</small><strong>{String(role).toUpperCase()}</strong></div>
            <div><small>Sale & auction signing</small><strong>Disabled</strong></div>
          </div>
          <dl>
            <dt>Contract</dt><dd className="mono">{info.contract}</dd>
            <dt>Implementation</dt><dd className="mono">{info.implementation}
              {info.proxy?' · EIP-1167':' · direct'}</dd>
            <dt>Owner</dt><dd className="mono">{info.owner}</dd>
            <dt>Connected wallet</dt><dd className="mono">{info.inspectedWallet||'Not connected'}</dd>
            <dt>Verified wallet role</dt><dd>{role.toUpperCase()} (read-only)</dd>
            <dt>Observed implementation hash</dt>
              <dd className="mono">{info.implementationCodeHash}</dd>
            <dt>Observed block</dt><dd className="mono">{info.observedBlock}</dd>
          </dl>
        </section>
        <section className="panel">
          <div className="section-top"><h2>Workspace readiness</h2><ShieldCheck size={19}/></div>
          <p>Use Artworks &amp; Tokens to load a saved artwork and review its creator mint.
            Each review checks the runtime, current wallet permission, supply lock, exact IPFS
            metadata, recipient and network fee. Signing requires approval for that exact
            transaction. A confirmed mint records its Token ID, owner and tokenURI.</p>
          <button className="button secondary" onClick={()=>navigate('Artworks & Tokens')}>
            View 1 of 1 NFTs
          </button>
        </section>
      </>}
      {visited.includes('Artworks & Tokens')&&
        <div className="erc721-workflow" style={{display:tab==='Artworks & Tokens'?'grid':'none'}}>
          <section className="panel creator-studio-banner">
            <span className="eyebrow">1 OF 1 ARTWORK STUDIO</span>
            <h2>Where every original begins.</h2>
            <p>Discover individual on-chain ERC721 tokens and prepare new original artworks.
              An artwork draft is not an NFT. A Token ID exists only after an independently
              confirmed on-chain mint.</p>
          </section>
          <Suspense fallback={<Loading/>}>
            <Erc721Inspector mode="workspace"/>
          </Suspense>
          {isAdmin&&<Erc721CreateDraftStudio
            key={info.contract+'-'+String(info.inspectedWallet)}
            chainId={chainId} contract={info.contract} owner={info.owner} role={role}/>}
        </div>}
      {visited.includes('Mint Pages')&&<div style={{display:tab==='Mint Pages'?'block':'none'}}>
        <Erc721PrimaryStudio key={chainId+info.contract+String(address)} chainId={chainId}
          contract={info.contract} authorized={isAdmin}/>
      </div>}
      {visited.includes('Auctions')&&<div style={{display:tab==='Auctions'?'block':'none'}}>
        <Erc721AuctionStudio key={chainId+info.contract+String(address)} chainId={chainId}
          contract={info.contract} wallet={address}/>
      </div>}
      {tab==='Collection Settings'&&
        <Erc721Settings info={info} chainId={chainId} contract={info.contract}/>}
      {tab==='Transactions'&&
        <Erc721Activity chainId={chainId} contract={info.contract}/>}
    </>}
  </>;
}
