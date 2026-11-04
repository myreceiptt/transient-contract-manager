'use client';
import {useState} from 'react';
import {ArrowLeft,ArrowUpRight,ImagePlus,ShieldCheck,Users,Percent,Link2,ScanLine} from 'lucide-react';
import {Notice} from './shell';
import {Erc721MarketStatus} from './erc721-market-status';
import {explorer} from '@/lib/chains';

type Panel='dashboard'|'profile'|'identity'|'access'|'royalties'|'minters'|'advanced';
const cards=[
  {id:'profile',title:'Collection Profile',description:'Off-chain visual identity and public presentation',icon:ImagePlus},
  {id:'identity',title:'Collection Identity',description:'Verified creator, chain, standard and runtime facts',icon:ShieldCheck},
  {id:'access',title:'Ownership & Access',description:'Owner, administrators and wallet permissions',icon:Users},
  {id:'royalties',title:'Collection Royalties',description:'Effective royalties require verified reads',icon:Percent},
  {id:'minters',title:'Stacks Mint Permission',description:'Read-only Stacks721 observation and pending role checks',icon:Link2},
  {id:'advanced',title:'Advanced On-chain Information',description:'Block, implementation, source and compatibility diagnostics',icon:ScanLine},
] as const;

export function Erc721Settings({info,chainId,contract}:{
  info:any;chainId:number;contract:string;
}){
  const [panel,setPanel]=useState<Panel>('dashboard');
  const role=info.walletRole||'not-connected';
  return <div className="creator-settings erc721-workflow">
    <section className="panel creator-studio-banner">
      <span className="eyebrow">COLLECTION CONTROL CENTER · ERC721TL</span>
      <h2>The foundation of every original.</h2>
      <p>Inspect collection ownership, permissions, metadata and sale integrations.
        Read-only chain evidence is never mistaken for signing authorization.</p>
    </section>
    {panel!=='dashboard'&&<div className="creator-studio-back">
      <button className="button secondary compact" onClick={()=>setPanel('dashboard')}>
        <ArrowLeft size={15}/> Back to settings
      </button>
      <span>{cards.find(c=>c.id===panel)?.title}</span>
    </div>}
    {panel==='dashboard'&&<div className="creator-settings-grid">
      {cards.map(c=><button type="button" key={c.id}
        className="panel creator-settings-card" onClick={()=>setPanel(c.id)}>
        <c.icon size={24} aria-hidden="true"/>
        <strong>{c.title}</strong><span>{c.description}</span>
        <small>{c.id==='profile'?'Not configured by ERC721 adapter':
          c.id==='identity'?'Verified read-only snapshot':
          c.id==='access'?'Connected role: '+String(role).toUpperCase():
          c.id==='royalties'?'Read adapter pending':
          c.id==='minters'?'Candidate protocol read available':'Runtime not approved for signing'}</small>
        <span className="creator-settings-card-link">Open <ArrowUpRight size={14}/></span>
      </button>)}
    </div>}
    {panel==='profile'&&<section className="panel">
      <h2>Collection Profile</h2>
      <Notice>ERC721 collection profile persistence is not yet connected.
        The GO1 ERC1155 profile and mint page records are deliberately not reused.</Notice>
      <div className="erc721-preview-panel">
        <span className="eyebrow">PUBLIC PROFILE · NOT CONFIGURED</span>
        <h3>{info.name}</h3>
        <p>{info.symbol} · contract name and symbol are verified reads.</p>
        <p>Banner, logo, description, website and social fields will be independent
          versioned application records, not assumed to be contractURI metadata.</p>
        <button className="button secondary" disabled>Edit profile disabled</button>
      </div>
    </section>}
    {panel==='identity'&&<section className="panel">
      <h2>Collection Identity</h2>
      <dl className="erc721-facts">
        <dt>Contract</dt><dd className="mono">{info.contract}</dd>
        <dt>Name</dt><dd>{info.name}</dd>
        <dt>Symbol</dt><dd>{info.symbol}</dd>
        <dt>Standard</dt><dd>ERC721TL v{info.version}</dd>
        <dt>Source commit</dt><dd className="mono">{info.sourceCommit}</dd>
        <dt>Network</dt><dd>Chain ID {chainId}</dd>
        <dt>Contract explorer</dt><dd><a target="_blank" rel="noopener noreferrer"
          href={explorer(chainId,contract)}>Open explorer <ArrowUpRight size={13}/></a></dd>
      </dl>
      <Notice>These are read-only observations. The exact deployed runtime
        is not approved for signing.</Notice>
    </section>}
    {panel==='access'&&<section className="panel">
      <h2>Ownership & Access</h2>
      <dl className="erc721-facts">
        <dt>Collection owner</dt><dd className="mono">{info.owner}</dd>
        <dt>Administrators</dt><dd>{(info.admins||[]).length?
          info.admins.map((v:string)=><div className="mono" key={v}>{v}</div>):
          'No additional admins reported'}</dd>
        <dt>Connected wallet</dt><dd className="mono">{info.inspectedWallet||'Not connected'}</dd>
        <dt>Verified role</dt><dd>{String(role).toUpperCase()} · read only</dd>
        <dt>Observed block</dt><dd>{info.observedBlock}</dd>
      </dl>
      <Notice>Creator roles do not convey seller rights over someone else's NFT.
        Auction listing authorization depends on ownerOf(tokenId) at execution time.</Notice>
      <button className="button secondary" disabled>Change roles disabled</button>
    </section>}
    {panel==='royalties'&&<section className="panel">
      <h2>Collection Royalties</h2>
      <Notice>Royalty recipient, basis points and token-level overrides have not
        been read using an independently verified ERC721 royalty adapter.
        No default rate is assumed.</Notice>
      <div className="erc721-metrics">
        <div><small>Current collection royalty</small><strong>Not verified</strong></div>
        <div><small>Token overrides</small><strong>Not indexed</strong></div>
      </div>
      <button className="button secondary" disabled>Modify royalties disabled</button>
    </section>}
    {panel==='minters'&&<section className="panel">
      <h2>Stacks Mint Permission</h2>
      <p>Reading TLStacks721 version or drop phase is not equivalent to proving
        that the creator has granted its minter role. Approval must be checked
        independently against the specific creator deployment.</p>
      <Erc721MarketStatus chainId={chainId} contract={contract} view="stacks"/>
      <button className="button secondary" disabled>Approve Stacks disabled</button>
    </section>}
    {panel==='advanced'&&<section className="panel">
      <h2>Advanced On-chain Information</h2>
      <dl className="erc721-facts">
        <dt>Creator implementation</dt><dd className="mono">{info.implementation}</dd>
        <dt>Proxy type</dt><dd>{info.proxy?'Canonical EIP-1167':'Direct / no canonical clone observed'}</dd>
        <dt>Observed implementation hash</dt>
        <dd className="mono">{info.implementationCodeHash}</dd>
        <dt>Observed block</dt><dd>{info.observedBlock}</dd>
        <dt>Runtime verification</dt><dd>{info.runtimeVerification}</dd>
        <dt>Transaction signing</dt><dd>DISABLED</dd>
      </dl>
      <Notice>Source-baseline compatibility is not an execution allowlist.
        Changes to bytecode, network or permissions require a new verification.</Notice>
    </section>}
  </div>;
}
