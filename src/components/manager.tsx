'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useConnection } from './providers';
import { api, short } from '@/lib/api-client';
import { getChain, explorer } from '@/lib/chains';
import { Notice, Loading } from './shell';
import { ContractFacts } from './checker';
import { AdminActions } from './admin-actions';
import { NftMetadataStudio } from './nft-metadata-studio';
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
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState<any>();
  const [preparedMetadataAction, setPreparedMetadataAction] = useState<any>();
  const [revisionKey, setRevisionKey] = useState(0);
  const [history, setHistory] = useState<any[]>([]);
  const [featured, setFeatured] = useState<any>();
  const [featuredError, setFeaturedError] = useState('');
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
                onClick={() => setTab(t)}
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
                  <Artwork uri={featured?.image} alt={featured?.name || info.name} />
                  <div><h3>{featured?.name || info.name}</h3>
                    {featured?.description && <p>{featured.description}</p>}
                    <small>Featured artwork from token #{String(info.tokenId)}; not verified contract-level metadata.</small>
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
            <>
              <Tokens info={info} />
              {info.authorized && <>
                 <NftMetadataStudio info={info} onPrepared={setPreparedMetadataAction} />
                 <AdminActions info={info} onIntent={setIntent} prepared={preparedMetadataAction} />
               </>}
            </>
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
            <>
              <section className="panel">
                <ContractFacts info={info} />
              </section>
              {info.authorized && (
                <AdminActions
                  key="settings"
                  info={info}
                  initialAction="setDefaultRoyalty"
                  onIntent={setIntent}
                />
              )}
            </>
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
function Tokens({ info }: { info: any }) {
  const [tokens, setTokens] = useState<any[]>([]);
  const [metadata, setMetadata] = useState<Record<string, any>>({});
  const [metadataErrors, setMetadataErrors] = useState<Record<string, string>>({});
  const [retry, setRetry] = useState(0);
  const [start, setStart] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [holder, setHolder] = useState('');
  const [tokenId, setTokenId] = useState('1');
  const [balance, setBalance] = useState<string>();
  useEffect(() => {
    let live = true;
    setLoading(true);
    api('inventory', { chainId: info.chainId, contract: info.address, start })
      .then(async (r) => {
        if (!live) return;
        setTokens(r.tokens);
        const results: PromiseSettledResult<any>[] = [];
        const tokenIds: string[] = [];
        for (let i = 0; i < r.tokens.length && live; i += 4) {
          tokenIds.push(...r.tokens.slice(i, i + 4).map((t: any) => String(t.id)));
          results.push(
            ...(await Promise.allSettled(
              r.tokens
                .slice(i, i + 4)
                .map(async (t: any) => [t.id, await api('metadata', { uri: t.uri })]),
            )),
          );
        }
        if (live) {
          setMetadataErrors(Object.fromEntries(results.flatMap((result, i) => result.status === 'rejected' ? [[tokenIds[i], result.reason instanceof Error ? result.reason.message : 'Metadata request failed']] : [])));
          setMetadata(
            Object.fromEntries(
              results
                .filter((r) => r.status === 'fulfilled')
                .map((r) => (r as PromiseFulfilledResult<any>).value),
            ),
          );
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [info.address, info.blockNumber, start, retry]);
  return (
    <section className="panel">
      <div className="section-top">
        <h2>Tokens & editions</h2>
        <span className="tag">{info.tokenTypes} TOKEN TYPES</span>
      </div>
      {error && <Notice type="error">{error}</Notice>}
      {loading && <Loading label="Loading token inventory…" />}
      <div className="token-grid">
        {tokens.map((t) => (
          <article className="token-card" key={t.id}>
            <Artwork uri={metadata[t.id]?.image} alt={metadata[t.id]?.name || 'Token ' + t.id} />
            <div>
              <span className="eyebrow">
                TOKEN {t.id} · {t.locked ? 'MINT LOCKED' : 'MINTABLE'}
              </span>
              <h3>{metadata[t.id]?.name || 'Edition #' + t.id}</h3>
              <p>{metadata[t.id]?.description?.slice(0, 600)}</p>
              {metadataErrors[String(t.id)] && <div role="alert"><small>Metadata failed: {metadataErrors[String(t.id)]}</small><button className="button secondary compact" onClick={() => setRetry((v) => v + 1)}>Retry metadata</button></div>}
              {metadata[t.id]?.attributes?.length > 0 && <dl>{metadata[t.id].attributes.map((a: any, i: number) => <div key={i}><dt>{a.trait_type}</dt><dd>{a.value}</dd></div>)}</dl>}
              <details>
                <summary>Metadata URI</summary>
                <code>{t.uri}</code>
              </details>
            </div>
          </article>
        ))}
      </div>
      <div className="button-row">
        <button
          className="button secondary compact"
          disabled={start === 1}
          onClick={() => setStart(Math.max(1, start - 20))}
        >
          Previous
        </button>
        <button
          className="button secondary compact"
          disabled={BigInt(start + 19) >= BigInt(info.tokenTypes)}
          onClick={() => setStart(start + 20)}
        >
          Next
        </button>
      </div>
      <div className="balance-check">
        <h3>Check a holder’s balance</h3>
        <form
          className="checker-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setError('');
            try {
              const r = await api('balance', {
                chainId: info.chainId,
                contract: info.address,
                tokenId,
                holder,
              });
              setBalance(r.balance);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <label>
            Token ID
            <input value={tokenId} onChange={(e) => setTokenId(e.target.value)} />
          </label>
          <label>
            Holder address
            <input
              value={holder}
              onChange={(e) => setHolder(e.target.value)}
              placeholder="0x…"
              required
            />
          </label>
          <button className="button secondary">Read balance</button>
        </form>
        {balance !== undefined && (
          <p>
            <strong>{balance}</strong> units held
          </p>
        )}
      </div>
      <small>
        ERC1155TL totalSupply counts token types. Unit supply requires complete
        TransferSingle/TransferBatch history; it is not inferred from token count.
      </small>
    </section>
  );
}
