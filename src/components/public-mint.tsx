'use client';
import { useEffect, useState } from 'react';
import { useConnection } from './providers';
import { formatEther, formatUnits, zeroAddress } from 'viem';
import { api } from '@/lib/api-client';
import { getChain, explorer } from '@/lib/chains';
import { phases, isSafeUrl } from '@/lib/domain';
import { Notice, Loading } from './shell';
import { useSession } from './providers';
import { TransactionReview } from './transaction-review';
import { Artwork } from './safe-media';
import { ShieldCheck, RefreshCw, ArrowUpRight } from 'lucide-react';
export function PublicMint({ slug }: { slug: string }) {
  const [page, setPage] = useState<any>();
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
