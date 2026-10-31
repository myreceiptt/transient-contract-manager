'use client';
import { useEffect, useState } from 'react';
import { useConnection } from './providers';
import { formatEther, formatUnits, zeroAddress } from 'viem';
import { api } from '@/lib/api-client';
import { getChain, explorer, txExplorer } from '@/lib/chains';
import { phases, isSafeUrl } from '@/lib/domain';
import { Notice, Loading } from './shell';
import { useSession } from './providers';
import { TransactionReview } from './transaction-review';
import { Artwork } from './safe-media';
import { ShieldCheck, RefreshCw, ArrowUpRight, Users, Wallet, Activity } from 'lucide-react';
export function PublicMint({ slug }: { slug: string }) {
  const [page, setPage] = useState<any>();
  const [collectors, setCollectors] = useState<any>();
  const [collectorError, setCollectorError] = useState('');
  const [collectorBusy, setCollectorBusy] = useState(false);
  const [activityOffset, setActivityOffset] = useState(0);
  const [holderOffset, setHolderOffset] = useState(0);
  const [expandedActivity, setExpandedActivity] = useState<any[]>([]);
  const [expandedHolders, setExpandedHolders] = useState<any[]>([]);

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [qty, setQty] = useState('1');
  const [allowance, setAllowance] = useState('0');
  const [proof, setProof] = useState('[]');
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState<any>();
  const [resumeId, setResumeId] = useState('');
  const { address } = useConnection();
  const { ensureSession } = useSession();
  async function refresh() {
    try {
      setPage(await api('public', { slug }));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function refreshCollectors(nextActivityOffset=0,nextHolderOffset=0,append=false){
    setCollectorBusy(true);
    try {
      const result=await api('public_collectors',{
        slug,holder:address || undefined,
        activityOffset:nextActivityOffset,holderOffset:nextHolderOffset
      });
      setCollectors(result);
      setCollectorError('');
      if(append){
        if(nextActivityOffset>0) setExpandedActivity(prev=>[...prev,...result.activity]);
        if(nextHolderOffset>0) setExpandedHolders(prev=>[...prev,...result.holders]);
      }else{
        setExpandedActivity(result.activity || []);
        setExpandedHolders(result.holders || []);
        setActivityOffset(0);setHolderOffset(0);
      }
    }catch(e){setCollectorError((e as Error).message);}
    finally{setCollectorBusy(false);}
  }
  useEffect(()=>{
    setCollectors(undefined);setExpandedActivity([]);setExpandedHolders([]);
    void refreshCollectors();
    const timer=setInterval(()=>{void refreshCollectors();},60000);
    return ()=>clearInterval(timer);
  },[slug,address]);
  const deduplicatedActivity = expandedActivity.filter((event:any)=>{
    // A Purchase is also an ERC-1155 mint TransferSingle; show it once.
    if(event.kind!=='TRANSFER' || event.fromWallet!==zeroAddress.toLowerCase())return true;
    return !expandedActivity.some((other:any)=>other.kind==='PURCHASE' && other.txHash===event.txHash);
  });
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 20000);
    const saved = localStorage.getItem('tcm-mint-' + slug);
    if (saved) setResumeId(saved);
    return () => clearInterval(timer);
  }, [slug]);
  async function prepare() {
    setBusy(true);
    setError('');
    try {
      await ensureSession(page.chainId);
      const i = await api('prepare_mint', {
        slug,
        quantity: qty,
        presaleAllowance: allowance,
        proof: JSON.parse(proof),
      });
      setIntent(i);
      setResumeId(i.id);
      localStorage.setItem('tcm-mint-' + slug, i.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const d = page?.onchain.sale?.drop,
    phase = page?.onchain.sale?.phase;
  const count = /^[1-9][0-9]{0,8}$/.test(qty) ? BigInt(qty) : 0n;
  const cost = d ? BigInt(phase === 2 ? d.presaleCost : d.publicCost) * count : 0n,
    fee = page?.onchain.sale ? BigInt(page.onchain.sale.fee) * count : 0n;
  return (
    <>
      {error && <Notice type="error">{error}</Notice>}
      {!page ? (
        !error && <Loading label="Reading this edition and live mint conditions…" />
      ) : (
        <>
          <div className="mint-header">
            <span className="eyebrow">
              {page.onchain.name} · EDITION {page.tokenId}
            </span>
            <span className="tag">{getChain(page.chainId).name}</span>
          </div>
          {page.content.banner && (
            <Artwork uri={page.content.banner} alt="Collection banner" className="public-banner" />
          )}
          <div className="public-mint-grid">
            <div>
              <Artwork
                uri={page.content.artwork}
                alt={page.content.title}
                className="mint-artwork"
              />
              <div className="artwork-credit">
                <span>ERC-1155 · {page.onchain.symbol}</span>
                <a href={explorer(page.chainId, page.contract)} target="_blank" rel="noreferrer">
                  View contract ↗
                </a>
              </div>
            </div>
            <section className="mint-details">
              <span className="sale-status">
                <span className={'online-dot ' + (![2, 3].includes(phase) ? 'inactive' : '')} />
                {page.state === 'PUBLISHED' ? phases[phase as 0] : page.state.replaceAll('_', ' ')}
              </span>
              <h1>{page.content.title}</h1>
              <p className="description">{page.content.description}</p>
              {page.content.externalUrl && isSafeUrl(page.content.externalUrl) && (
                <a
                  className="text-link"
                  href={
                    page.content.externalUrl.startsWith('https://')
                      ? page.content.externalUrl
                      : undefined
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  More about this work <ArrowUpRight size={15} />
                </a>
              )}
              {d && (
                <>
                  <div className="sale-stats">
                    <div>
                      <span>Live unit price</span>
                      <strong>
                        {formatUnits(
                          BigInt(phase === 2 ? d.presaleCost : d.publicCost),
                          page.currency.decimals,
                        )}{' '}
                        {page.currency.symbol}
                      </strong>
                    </div>
                    <div>
                      <span>Remaining allocation</span>
                      <strong>
                        {d.supply} <small>/ {d.initialSupply}</small>
                      </strong>
                    </div>
                  </div>
                  <div className="mint-purchase panel">
                    <div className="section-top">
                      <strong>Mint this edition</strong>
                      <button
                        className="icon-button"
                        aria-label="Refresh mint conditions"
                        onClick={refresh}
                      >
                        <RefreshCw size={16} />
                      </button>
                    </div>
                    <label>
                      Quantity
                      <input
                        type="number"
                        min="1"
                        max={d.supply}
                        value={qty}
                        onChange={(e) => setQty(e.target.value)}
                      />
                    </label>
                    {phase === 2 && (
                      <details open>
                        <summary>Presale eligibility</summary>
                        <label>
                          Your allowlist allowance
                          <input
                            value={allowance}
                            onChange={(e) => setAllowance(e.target.value)}
                            inputMode="numeric"
                          />
                        </label>
                        <label>
                          Your Merkle proof (JSON array)
                          <textarea
                            rows={3}
                            value={proof}
                            onChange={(e) => setProof(e.target.value)}
                          />
                        </label>
                      </details>
                    )}
                    <dl className="cost-breakdown">
                      <dt>Edition price × {qty}</dt>
                      <dd>
                        {formatUnits(cost, page.currency.decimals)} {page.currency.symbol}
                      </dd>
                      <dt>Protocol fee × {qty}</dt>
                      <dd>{formatEther(fee)} ETH</dd>
                      <dt>Payment before network gas</dt>
                      <dd>
                        <strong>
                          {d.currencyAddress.toLowerCase() === zeroAddress
                            ? formatEther(cost + fee) + ' ETH'
                            : formatUnits(cost, page.currency.decimals) +
                              ' ' +
                              page.currency.symbol +
                              ' + ' +
                              formatEther(fee) +
                              ' ETH'}
                        </strong>
                      </dd>
                    </dl>
                    <button
                      className="button wide"
                      onClick={prepare}
                      disabled={
                        busy ||
                        !address ||
                        count === 0n ||
                        ![2, 3].includes(phase) ||
                        page.state !== 'PUBLISHED' ||
                        !page.onchain.canWrite
                      }
                    >
                      {busy
                        ? 'Checking balance & simulating…'
                        : !address
                          ? 'Connect wallet to mint'
                          : 'Review payment & mint'}
                      <ArrowUpRight size={17} />
                    </button>
                    {!page.onchain.canWrite && (
                      <small className="fineprint">
                        Live minting is currently unavailable for this chain or contract. Check with the collection admin.
                      </small>
                    )}
                    <small className="fineprint">
                      Maximum {d.allowance} per recipient across this drop round. ERC-20 purchases
                      may first require an exact-amount approval. Every transaction is reviewed
                      separately. Other purchases can reduce availability before confirmation; the
                      receipt shows the actual minted quantity.
                    </small>
                  </div>
                  <dl className="mint-schedule">
                    <dt>Starts</dt>
                    <dd>{new Date(Number(d.startTime) * 1000).toLocaleString()}</dd>
                    <dt>Public sale ends</dt>
                    <dd>
                      {new Date(
                        (Number(d.startTime) +
                          Number(d.presaleDuration) +
                          Number(d.publicDuration)) *
                          1000,
                      ).toLocaleString()}
                    </dd>
                    <dt>Payout receiver</dt>
                    <dd className="mono">{d.payoutReceiver}</dd>
                    <dt>Observed block</dt>
                    <dd>{page.onchain.blockNumber}</dd>
                  </dl>
                </>
              )}
              <section className="collector-intelligence" aria-label="NFT collector intelligence">
                <div className="collector-balance panel">
                  <div className="section-top">
                    <h3><Wallet size={17}/> Your editions</h3>
                    <button type="button" className="icon-button" aria-label="Refresh on-chain edition balance"
                      disabled={collectorBusy} onClick={()=>void refreshCollectors()}>
                      <RefreshCw size={16}/>
                    </button>
                  </div>
                  {!address ? <p className="muted">Connect your wallet to see the number of editions you currently own.</p>
                    : collectors?.yourBalance !== null && collectors?.yourBalance !== undefined ?
                      <><strong className="collector-balance-number">{collectors.yourBalance} <small>owned now</small></strong>
                        <p className="mono muted">{address}</p></> :
                      <p className="muted">Verifying your ERC-1155 balance on-chain…</p>}
                  <p className="fineprint">Your current balance may differ from the quantity you minted if editions were transferred.</p>
                </div>
                <div className="collector-section panel">
                  <div className="section-top">
                    <h3><Activity size={17}/> Activity</h3>
                    <small>On-chain mint &amp; transfers</small>
                  </div>
                  {collectorError && <Notice type="error">{collectorError}</Notice>}
                  {collectors?.scanWarning && <Notice>{collectors.scanWarning}</Notice>}
                  {!collectors && !collectorError && <p className="muted">Reading token transfer events…</p>}
                  {collectors && !collectors.historyComplete && <p className="fineprint">
                    Historical indexing in progress. This is a partial list; older transactions
                    may appear after synchronization. Backfill currently reaches block {collectors.historicalBackfillTo}.
                  </p>}
                  {deduplicatedActivity.length===0 && collectors &&
                    <p className="muted">No indexed mint or transfer activity yet.</p>}
                  {deduplicatedActivity.map((e:any)=>(
                    <div key={e.txHash+'-'+e.logIndex+'-'+e.kind} className="collector-activity-row">
                      <strong>{e.kind==='PURCHASE'?'Purchased':
                        e.fromWallet===zeroAddress.toLowerCase()?'Minted / airdropped':
                        e.toWallet===zeroAddress.toLowerCase()?'Burned':'Transferred'} {e.amount} edition(s)</strong>
                      <span className="mono">{e.fromWallet && e.fromWallet!==zeroAddress.toLowerCase()
                        ?e.fromWallet.slice(0,8)+'…'+e.fromWallet.slice(-6)+' → ':''}
                        {e.toWallet && e.toWallet!==zeroAddress.toLowerCase()
                          ?e.toWallet.slice(0,8)+'…'+e.toWallet.slice(-6):''}</span>
                      <a href={txExplorer(page.chainId,e.txHash)} target="_blank" rel="noopener noreferrer">
                        Block {e.block} · View transaction ↗
                      </a>
                    </div>
                  ))}
                  {collectors && !collectors.historyComplete &&
                    <button type="button" className="button secondary compact"
                      disabled={collectorBusy}
                      onClick={()=>void refreshCollectors()}>
                      {collectorBusy?'Syncing…':'Sync older on-chain history'}
                    </button>}
                  {collectors?.moreActivity && <button type="button" className="button secondary compact"
                    disabled={collectorBusy} onClick={()=>{
                      const n=activityOffset+25;setActivityOffset(n);
                      void refreshCollectors(n,0,true);
                    }}>Load older activity</button>}
                </div>
                <div className="collector-section panel">
                  <div className="section-top">
                    <h3><Users size={17}/> Collectors</h3>
                    <small>Current ERC-1155 holders</small>
                  </div>
                  <p className="fineprint">Balances are checked live on-chain. This list includes
                    wallet addresses discovered from indexed transfer events.
                    {collectors?.historyComplete?' Historical backfill complete.':
                      ' The holder directory is incomplete until historical backfill finishes.'}</p>
                  {expandedHolders.length===0 && collectors &&
                    <p className="muted">No holders found in the indexed history yet.</p>}
                  {expandedHolders.map((h:any)=>(
                    <div className="collector-holder-row" key={h.address}>
                      <a href={explorer(page.chainId,h.address)} target="_blank" rel="noopener noreferrer"
                        className="mono">{h.address.slice(0,9)}…{h.address.slice(-6)} ↗</a>
                      <strong>{h.quantity}</strong>
                    </div>
                  ))}
                  {collectors?.hasMoreWalletCandidates && <button type="button" className="button secondary compact"
                    disabled={collectorBusy} onClick={()=>{
                      const n=holderOffset+25;setHolderOffset(n);
                      void refreshCollectors(0,n,true);
                    }}>Load more wallet addresses</button>}
                  <small className="fineprint">Observed chain block: {collectors?.observedBlock ?? '—'}.
                    Holder identities are wallet addresses, not verified personal profiles.</small>
                </div>
              </section>
              {notice && <Notice type="success">{notice}</Notice>}
              {resumeId && (
                <button
                  className="text-link"
                  onClick={async () => {
                    try {
                      await ensureSession(page.chainId);
                      setIntent(await api('intent', { id: resumeId }));
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Resume last transaction review
                </button>
              )}
              <p className="verified-caption">
                <ShieldCheck size={16} />
                Contract bytecode verified · live conditions rechecked before signing
              </p>
            </section>
          </div>
        </>
      )}
      {intent && (
        <TransactionReview
          intent={intent}
          onClose={() => setIntent(undefined)}
          onComplete={() => {
            setNotice(
              intent.payload.kind === 'approval'
                ? 'Payment approval confirmed. Review the mint transaction next.'
                : 'Transaction finalized. Your edition balance has been updated on-chain.',
            );
            refresh();
          }}
        />
      )}
    </>
  );
}
