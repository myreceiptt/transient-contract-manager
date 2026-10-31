'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useConnection } from './providers';
import { api, short } from '@/lib/api-client';
import { getChain, explorer } from '@/lib/chains';
import { Notice, Loading } from './shell';
import { ContractFacts } from './checker';
import { TokenStudio } from './token-studio';
import { CollectionSettings } from './collection-settings';
import { MintStudio } from './mint-studio';
import { TransactionReview } from './transaction-review';
import { useSession } from './providers';
import { Artwork } from './safe-media';
import { ArrowLeft, ArrowUpRight, RefreshCw } from 'lucide-react';
import Link from 'next/link';
export function Manager() {
  const query = useSearchParams();
  const id = Number(query.get('chain') || 1),
    contract = query.get('contract') || '';
  const { address } = useConnection();
  const { ensureSession } = useSession();
  const [info, setInfo] = useState<any>();
  const [tab, setTab] = useState('Overview');
  const [tokenDraftDirty,setTokenDraftDirty]=useState(false);
  const [tokenWorkflowActive,setTokenWorkflowActive]=useState(false);
  function changeTab(target:string){
    if(tab==='Tokens & Editions'&&target!==tab&&tokenWorkflowActive&&tokenDraftDirty &&
       !window.confirm('Leave Tokens & Editions? Unsaved metadata or batch changes will be lost.'))return;
    setTab(target);setTokenDraftDirty(false);setTokenWorkflowActive(false);
  }
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState<any>();
  const [revisionKey, setRevisionKey] = useState(0);
  const [history, setHistory] = useState<any[]>([]);
  const [featured, setFeatured] = useState<any>();
  const [featuredError, setFeaturedError] = useState('');
  const [collectionProfile,setCollectionProfile]=useState<any>();
  async function refresh() {
    setBusy(true);
    setError('');
    try {
      setInfo(await api('inspect', { chainId: id, contract, wallet: address }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    setInfo(undefined);
    setFeatured(undefined);
    setFeaturedError('');
    refresh();
  }, [id, contract, address]);
  useEffect(() => {
    if (!info?.token?.uri) return;
    let active = true;
    api('metadata', { uri: info.token.uri }).then((data) => {
      if (active) setFeatured(data);
    }).catch((e) => { if (active) setFeaturedError((e as Error).message); });
    return () => { active = false; };
  }, [info?.token?.uri]);
  useEffect(()=>{
    let alive=true;
    api('collection_profile_read',{chainId:id,contract})
      .then(doc=>{if(alive)setCollectionProfile(doc);})
      .catch(()=>{if(alive)setCollectionProfile(undefined);});
    return()=>{alive=false;};
  },[id,contract]);
  async function loadHistory() {
    setError('');
    try {
      await ensureSession(id);
      setHistory(await api('history', { chainId: id, contract }));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <Link className="text-link back-link" href="/">
        <ArrowLeft size={15} />
        All collections
      </Link>
      {error && <Notice type="error">{error}</Notice>}
      {!info ? (
        busy ? (
          <Loading />
        ) : (
          <p>Open a supported contract to begin.</p>
        )
      ) : (
        <>
          <div className="page-heading compact-heading">
            <div>
              <div className="eyebrow">
                COLLECTION WORKSPACE · {getChain(id).name.toUpperCase()}
              </div>
              <h1>{info.name}</h1>
              <p className="lead mono">
                {short(info.address)}{' '}
                <a
                  href={explorer(id, info.address)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="View collection on block explorer"
                >
                  ↗
                </a>
              </p>
            </div>
            <div className="heading-actions">
              <span className={'tag ' + (info.authorized ? 'success' : '')}>
                {info.role.toUpperCase()}
              </span>
              <button
                className="icon-button"
                onClick={refresh}
                disabled={busy}
                aria-label="Refresh collection"
              >
                <RefreshCw size={18} />
              </button>
            </div>
          </div>
          {!info.authorized && (
            <Notice>
              Read-only view. Connect an on-chain owner or admin wallet to access the shared
              workspace. No signature is needed to inspect public collection data.
            </Notice>
          )}
          <div className="tabs" role="tablist">
            {[
              'Overview',
              'Tokens & Editions',
              'Mint Pages',
              'Collection Settings',
              'Transactions',
            ].map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={t === tab}
                className={t === tab ? 'active' : ''}
                onClick={() => changeTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          {tab === 'Overview' && (
            <>
              <section className="panel">
                <div className="section-top"><h2>Collection artwork & metadata</h2><span className="tag">FEATURED TOKEN</span></div>
                <div className="collection-metadata">
                  <Artwork uri={collectionProfile?.data?.banner||collectionProfile?.data?.logo||featured?.image} alt={info.name} />
                  <div><h3>{featured?.name || info.name}</h3>
                    {(collectionProfile?.data?.description||featured?.description) &&
                      <p>{collectionProfile?.data?.description||featured.description}</p>}
                    <small>{collectionProfile?.version?
                      'Collection Profile is app-managed; on-chain verified name and symbol remain authoritative.' :
                      'Featured artwork from token #'+String(info.tokenId)+'; not verified collection-level metadata.'}</small>
                    {featuredError && <Notice type="error">Metadata unavailable: {featuredError}</Notice>}
                    {featured?.attributes?.length > 0 && <dl>{featured.attributes.map((a: any, i: number) => <div key={i}><dt>{a.trait_type}</dt><dd>{a.value}</dd></div>)}</dl>}
                    {info.token?.uri && <details><summary>Token metadata URI</summary><code>{info.token.uri}</code></details>}
                  </div>
                </div>
              </section>
              <div className="stat-row">
                <div>
                  <span>Token types</span>
                  <strong>{info.tokenTypes}</strong>
                  <small>IDs created, not unit supply</small>
                </div>
                <div>
                  <span>Contract adapter</span>
                  <strong>ERC-1155</strong>
                  <small>TL v{info.version} · bytecode matched</small>
                </div>
                <div>
                  <span>Your authority</span>
                  <strong className="capitalize">{info.role}</strong>
                  <small>Checked at block {info.blockNumber}</small>
                </div>
              </div>
              <section className="panel">
                <ContractFacts info={info} />
              </section>
            </>
          )}
          {tab === 'Tokens & Editions' && (
            <TokenStudio key={id+contract} info={info} onIntent={setIntent}
              onOpenMintPages={()=>changeTab('Mint Pages')}
              onDirtyChange={setTokenDraftDirty}
              onActiveChange={setTokenWorkflowActive}/>
          )}
          {tab === 'Mint Pages' &&
            (info.authorized ? (
              <MintStudio
                key={address + contract}
                info={info}
                onIntent={setIntent}
                revisionKey={revisionKey}
              />
            ) : (
              <Notice>Mint drafts are private to current collection owner/admin wallets.</Notice>
            ))}
          {tab === 'Collection Settings' && (
            <CollectionSettings key={id+contract} info={info} onIntent={setIntent} onProfileSaved={setCollectionProfile}/>
          )}
          {tab === 'Transactions' && (
            <section className="panel">
              <div className="section-top">
                <h2>Saved transaction reviews</h2>
                <button
                  className="button secondary"
                  disabled={!info.authorized}
                  onClick={loadHistory}
                >
                  Load history
                </button>
              </div>
              <p>
                Resume a pending transaction by its saved hash. Transactions are never automatically
                resubmitted.
              </p>
              {history.map((i) => (
                <button key={i.id} className="transaction-row" onClick={() => setIntent(i)}>
                  <span>
                    <strong>{i.payload.tx.functionName}</strong>
                    <small className="mono">
                      {short(i.actor)} · {new Date(i.created_at).toLocaleString()}
                    </small>
                  </span>
                  <span className="tag">{i.status}</span>
                  <ArrowUpRight size={16} />
                </button>
              ))}
              {!history.length && (
                <p className="muted">
                  Sign in and load the collection history to recover a saved review.
                </p>
              )}
            </section>
          )}
        </>
      )}
      {intent && (
        <TransactionReview
          intent={intent}
          onClose={() => {
            setIntent(undefined);
            refresh();
            setRevisionKey((x) => x + 1);
          }}
          onComplete={() => {
            refresh();
            setRevisionKey((x) => x + 1);
            loadHistory();
          }}
        />
      )}
    </>
  );
}
