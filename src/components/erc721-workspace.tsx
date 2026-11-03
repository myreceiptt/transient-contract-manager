'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, RefreshCw, ShieldCheck, Gavel, Layers3 } from 'lucide-react';
import { useConnection } from './providers';
import { Erc721Inspector } from './erc721-inspector';
import { Erc721CreateDraftStudio } from './erc721-create-draft-studio';
import { Erc721MarketStatus } from './erc721-market-status';
import { api, short } from '@/lib/api-client';
import { getChain, explorer } from '@/lib/chains';
import { Loading, Notice } from './shell';

const tabs=['Overview','Tokens & Editions','Mint Pages','Auctions','Collection Settings','Transactions'] as const;
type Tab=typeof tabs[number];
export function Erc721Workspace(){
  const params=useSearchParams();
  const chainId=Number(params.get('chain')||1);
  const contract=params.get('contract')||'';
  const {address}=useConnection();
  const [info,setInfo]=useState<any>();
  const [tab,setTab]=useState<Tab>('Overview');
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
        ERC721TL v{info.version} is compatible with the official read-only source
        baseline. Exact deployment runtime is not yet verified for signing.
        Create NFT, Mint Pages and Auctions cannot execute transactions from this workspace.
      </Notice>
      <div className="tabs" role="tablist" aria-label="ERC721 collection sections">
        {tabs.map(t=><button key={t} role="tab" className={tab===t?'active':''}
          aria-selected={tab===t} onClick={()=>setTab(t)}>{t}</button>)}
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
          <p>Inspection and ownership lookups are available. Creator minting
            requires a verified codehash, version-specific ABI, owner/admin
            simulation, explicit wallet review and confirmed on-chain results.
            The Tokens &amp; Editions studio can now pin unique metadata and
            run a transaction-free mint simulation. Actual minting remains disabled.</p>
          <button className="button secondary" onClick={()=>setTab('Tokens & Editions')}>
            View 1 of 1 NFTs
          </button>
        </section>
      </>}
      {tab==='Tokens & Editions'&&<>
        <Suspense fallback={<Loading/>}>
          <Erc721Inspector mode="workspace"/>
        </Suspense>
        {isAdmin&&<Erc721CreateDraftStudio
          key={info.contract+'-'+String(info.inspectedWallet)}
          chainId={chainId} contract={info.contract} owner={info.owner} role={role}/>}
      </>}
      {tab==='Mint Pages'&&<section className="panel erc721-coming">
        <div className="section-top"><h2>Primary Mint Pages · TLStacks721</h2><Layers3 size={20}/></div>
        <p>A TLStacks721 drop configures sales at the <strong>collection level</strong>,
          not separately for each existing Token ID. New unique ERC-721 tokens are
          minted only when authorized collector purchases are confirmed.</p>
        <Notice>Configuration, wallet approval, collector payment and closeDrop
          remain unavailable until the exact TLStacks721 runtime and creator
          mint permission are independently verified.</Notice>
        <Erc721MarketStatus chainId={chainId} contract={contract} view="stacks"/>
      </section>}
      {tab==='Auctions'&&<section className="panel erc721-coming">
        <div className="section-top"><h2>Secondary Auctions · TLAuctionHouse</h2><Gavel size={20}/></div>
        <p>Auction permissions follow <strong>ownerOf(tokenId)</strong>, not the
          creator&apos;s ADMIN_ROLE. A seller must own an already-minted NFT,
          approve the verified AuctionHouse and explicitly accept ERC-721 escrow.</p>
        <Notice>Listing, bidding, buy now, delisting and settlement are still
          disabled. No asset transfer or ETH payment is initiated here.</Notice>
        <Erc721MarketStatus chainId={chainId} contract={contract} view="auction"/>
      </section>}
      {tab==='Collection Settings'&&<section className="panel">
        <div className="section-top"><h2>Collection Settings</h2>
          <span className="tag">READ-ONLY</span></div>
        <dl>
          <dt>Contract standard</dt><dd>ERC721TL v{info.version}</dd>
          <dt>Contract owner</dt><dd className="mono">{info.owner}</dd>
          <dt>Admin wallets</dt><dd>{info.admins.length
            ?info.admins.map((a:string)=><div className="mono" key={a}>{a}</div>)
            :'No additional admins'}</dd>
          <dt>Your role</dt><dd>{role.toUpperCase()}</dd>
          <dt>Runtime authorization</dt><dd>Not yet approved for signing</dd>
        </dl>
        <p className="fineprint">{isAdmin?'Your wallet holds creator/admin authority on chain. This does not itself authorize an unverified adapter to write.':
          'Collection creator operations require on-chain owner or ADMIN_ROLE authority.'}</p>
      </section>}
      {tab==='Transactions'&&<section className="panel erc721-coming">
        <h2>ERC-721 transaction history</h2>
        <p>Versioned transaction intents, confirmations, replacement detection
          and auction settlement reconciliation will be added with the verified
          ERC-721 write adapter. No transaction has been submitted by this workspace.</p>
        <Notice>The existing ERC-1155 transaction ledger remains separate and unchanged.</Notice>
      </section>}
    </>}
  </>;
}
