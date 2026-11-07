'use client';
import { useEffect, useRef, useState } from 'react';
import { formatEther } from 'viem';
import { useConnection, useSession } from './providers';
import { api } from '@/lib/api-client';
import { Notice } from './shell';
import { Artwork } from './safe-media';
import { GO_APPROVED_TERMS } from '@/lib/erc721-sale-terms';
import { GO721_COLLECTION } from '@/lib/go721-sale-engine';
import { Go721TransactionReview, Go721TransactionLedger } from './go721-transaction-review';

type Status = {
  phase: number; phaseLabel: string; round: number; saleConfigured: boolean;
  remainingSupply: string; historicalMintedCount: string; burnedCount: string;
  protocolFeeWei: string; checkoutApproved: boolean; transactionExecutionEnabled: boolean;
  displayedQuote: { allowed: boolean; issues: string[]; mintableQuantity: number;
    reduced: boolean; mintPriceWei: string; protocolFeeWei: string; totalBeforeGasWei: string };
};
const eth = (value?: string) => value === undefined ? '—' : formatEther(BigInt(value));
export function Go721PublicMint() {
  const { address, chainId: walletChain } = useConnection();
  const { ensureSession } = useSession();
  const chainId = process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_LOCAL_CHAIN_ENABLED === 'true' && walletChain === 31337 ? 31337 : 1;
  const [status, setStatus] = useState<Status | null>(null), [qty, setQty] = useState(1);
  const [error, setError] = useState(''), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState<any>();
  const sequence = useRef(0), preparing = useRef(false);
  async function refresh() {
    const request = ++sequence.current;
    setLoading(true); setError('');
    try {
      const next = await api('public_go721_status', { chainId, quantity: qty, ...(address ? { recipient: address } : {}) });
      if (request === sequence.current) setStatus(next);
    } catch (e) {
      if (request === sequence.current) { setStatus(null); setError((e as Error).message); }
    } finally { if (request === sequence.current) setLoading(false); }
  }
  useEffect(() => {
    setStatus(null);
    const initial = setTimeout(() => void refresh(), 300);
    const timer = setInterval(() => void refresh(), 30000);
    return () => { sequence.current++; clearTimeout(initial); clearInterval(timer); };
    // Each observation belongs to this wallet and quantity; ignore superseded responses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, qty, chainId]);
  async function prepare() {
    if (preparing.current || !status?.transactionExecutionEnabled) return;
    preparing.current = true; setBusy(true); setError('');
    try {
      await ensureSession(chainId);
      setIntent(await api('prepare_go721', { chainId, action: { type: 'purchase', quantity: qty } }));
    } catch (e) { setError((e as Error).message); }
    finally { preparing.current = false; setBusy(false); }
  }
  const q = status?.displayedQuote;
  return <section className="go721-public">
    <div className="creator-studio-banner panel">
      <span className="eyebrow">ENDHONESA · ERC721TL · ONE OF ONE</span>
      <h1>Ganti Oli #1 | One of One</h1>
      <p>Thirty original NFTs. Each artwork is assigned in the approved collection order when its first collector mints.</p>
      <span className="tag">ETHEREUM · {status?.checkoutApproved ? status.phaseLabel.toUpperCase() : 'CHECKOUT AWAITS APPROVAL'}</span>
    </div>
    <div className="go721-collector-layout">
      <section className="panel">
        <Artwork uri="ipfs://bafybeicrfkcsgbcxbkk6ica3al4k4ykxivdccw3issjqjipw3aepit5bhm" alt="Ganti Oli collection cover"/>
        <h2>Thirty originals, two rounds</h2>
        <p>Ganti Oli brings Indonesian artists together to respond to injustice, nepotism and the distance between public ideals and lived reality.</p>
        <div className="erc721-campaign-facts">
          <div className="erc721-campaign-fact"><span>First sale</span><strong>3 NFTs · 0 ETH artwork price</strong>
            <small>Allowlisted wallet only · 10 Nov 2026, 10:10 WIB</small></div>
          <div className="erc721-campaign-fact"><span>Second sale</span><strong>27 NFTs · 0.025 ETH each</strong>
            <small>Maximum 10 per recipient · after three finalized first-sale mints and public-round activation</small></div>
        </div>
        <p>Protocol fees and Ethereum gas are additional, including during the free artwork presale.</p>
        <a className="text-link" href={'https://etherscan.io/address/' + GO_APPROVED_TERMS.collection}
          target="_blank" rel="noopener noreferrer">View collection on Etherscan ↗</a>
      </section>
      <section className="panel">
        <div className="section-top"><h2>Collect an original</h2>
          <button className="button secondary compact" disabled={loading} onClick={() => void refresh()}>
            {loading ? 'Reading Ethereum…' : 'Refresh status'}</button></div>
        {error && <Notice type="error">{error}</Notice>}
        <div className="erc721-campaign-facts">
          <div className="erc721-campaign-fact"><span>Current sale</span><strong>{status ? status.phaseLabel : loading ? 'Reading Ethereum…' : 'Unavailable'}</strong></div>
          <div className="erc721-campaign-fact"><span>Minted in this collection</span><strong>{status ? status.historicalMintedCount + ' / 30' : '—'}</strong></div>
          <div className="erc721-campaign-fact"><span>Round supply remaining</span><strong>{status?.saleConfigured ? status.remainingSupply : 'Not configured'}</strong></div>
          <div className="erc721-campaign-fact"><span>Protocol fee per NFT</span><strong>{eth(status?.protocolFeeWei)} ETH</strong></div>
        </div>
        <label>Desired quantity<input type="number" min="1" max="10" value={qty}
          onChange={e => setQty(Math.max(1, Math.min(10, Math.trunc(Number(e.target.value)) || 1)))}/></label>
        <div className="erc721-campaign-facts">
          <div className="erc721-campaign-fact"><span>Eligible quantity now</span><strong>{q?.allowed ? q.mintableQuantity : '—'}</strong></div>
          <div className="erc721-campaign-fact"><span>Artwork price</span><strong>{q?.allowed ? eth(q.mintPriceWei) + ' ETH' : '—'}</strong></div>
          <div className="erc721-campaign-fact"><span>Protocol fee</span><strong>{q?.allowed ? eth(q.protocolFeeWei) + ' ETH' : '—'}</strong></div>
          <div className="erc721-campaign-fact"><span>Total before gas</span><strong>{q?.allowed ? eth(q.totalBeforeGasWei) + ' ETH' : '—'}</strong></div>
        </div>
        {q?.allowed && q.reduced && <Notice>Only {q.mintableQuantity} of the requested {qty} can currently mint. Review this quantity before paying.</Notice>}
        <button className="button wide" disabled={busy || loading || !status?.transactionExecutionEnabled || !address}
          onClick={() => void prepare()}>{busy ? 'Preparing review…' : !address ? 'Connect wallet using the page header' :
            !status?.checkoutApproved ? 'Mint awaits operator approval' : !q?.allowed ? 'Mint unavailable for this wallet' : 'Review NFT purchase'}</button>
        <p className="mono">Recipient: {address || 'Connect an Ethereum wallet'}</p>
        {!status?.checkoutApproved && <Notice>Mainnet checkout is locked pending explicit approval. Connecting a wallet does not activate minting.</Notice>}
        {!!q?.issues.length && <details><summary>Eligibility and availability</summary><ul>{q.issues.map((v, i) => <li key={i}>{v}</li>)}</ul></details>}
        <p>Each NFT has one owner. Metadata can be updated by authorized collection roles. Final Token IDs and metadata links appear in your verified transaction receipt.</p>
      </section>
    </div>
    <Go721TransactionLedger chainId={chainId} contract={GO721_COLLECTION}/>
    {intent && <Go721TransactionReview key={intent.id} intent={intent} onClose={() => setIntent(undefined)} onConfirmed={() => void refresh()}/>}
  </section>;
}
