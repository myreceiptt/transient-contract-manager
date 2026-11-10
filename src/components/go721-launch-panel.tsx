'use client';
import { useState } from 'react';
import { formatEther } from 'viem';
import { useSession } from './providers';
import { api } from '@/lib/api-client';
import { GO721_COLLECTION } from '@/lib/go721-sale-engine';
import { Go721TransactionReview, Go721TransactionLedger } from './go721-transaction-review';
import { Notice } from './shell';

export function Go721LaunchPanel({ chainId, authorized }: { chainId: number; authorized: boolean }) {
  const { ensureSession } = useSession();
  const [state, setState] = useState<any>(), [intent, setIntent] = useState<any>();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function run(action?: object) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await ensureSession(chainId);
      if (action) setIntent(await api('prepare_go721', { chainId, action }));
      else setState(await api('go721_readiness', { chainId }));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="panel go721-launch-panel">
    <span className="eyebrow">GO#|O · LAUNCH CONTROL</span>
    <div className="section-top"><h2>Launch the 3 + 27 sale</h2>
      <a className="button secondary" href="/mint/go-one-of-one">Open public Mint Page ↗</a></div>
    <p>The 30 originals and both IPFS directories are already verified and saved.
      Launch checks use those identities without uploading or auditing the files again.</p>
    <ol>
      <li><strong>Owner: authorize TLStacks721.</strong> Grant the official sale contract its minting role.</li>
      <li><strong>Owner or Admin: configure presale.</strong> 3 NFTs for the allowlisted wallet, artwork price 0 ETH.
        The original 10 Nov 2026 10:10 WIB target has passed. A new start is explicitly reviewed for later
        the same day, 15 minutes after the latest observed Ethereum block. Presale lasts 24 hours,
        with no automatic public phase.</li>
      <li><strong>Collectors: mint through the public page.</strong> Each review separates artwork price, protocol fee and gas.</li>
      <li><strong>After three finalized mints: configure public sale.</strong> 27 NFTs at 0.025 ETH; limit 10 per recipient.
        Round 2 needs its own configuration transaction and checkout approval.</li>
    </ol>
    <Notice>Preparing a review does not send a transaction. Mainnet signing and checkout remain locked until explicit approval.
      Direct creator minting is reserved to protect Token IDs #1–#30.</Notice>
    <button className="button secondary" disabled={!authorized || busy} onClick={() => void run()}>
      {busy ? 'Checking Ethereum…' : 'Read launch readiness'}</button>
    {!authorized && <p>Connect the collection Owner/Admin wallet to prepare launch reviews.</p>}
    {error && <Notice type="error">{error}</Notice>}
    {state && <>
      <div className="erc721-campaign-facts">
        <div className="erc721-campaign-fact"><span>Verified runtime / saved revision</span><strong>Matched · v{state.draftVersion}</strong></div>
        <div className="erc721-campaign-fact"><span>Historical minted / burned</span><strong>{state.counter} / {state.burned}</strong></div>
        <div className="erc721-campaign-fact"><span>Minter permission</span><strong>{state.approvedMinter ? 'Granted' : 'Owner grant required'}</strong></div>
        <div className="erc721-campaign-fact"><span>On-chain sale</span><strong>Round {state.round} · {state.phase}</strong></div>
        <div className="erc721-campaign-fact"><span>Protocol fee per NFT</span><strong>{formatEther(BigInt(state.protocolFeeWei))} ETH + gas</strong></div>
        <div className="erc721-campaign-fact"><span>Proposed presale start (WIB)</span>
          <strong>{state.proposedPresaleStart
            ? new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'long',timeZone:'Asia/Jakarta'})
              .format(new Date(Number(state.proposedPresaleStart)*1000))
            : 'No valid same-day start remains'}</strong></div>
      </div>
      {state.reason && <Notice>{state.reason}</Notice>}
      <div className="button-row">
        <button className="button secondary" disabled={busy || state.approvedMinter || state.role !== 'owner'}
          onClick={() => void run({ type: 'grant' })}>Review Owner minter authorization</button>
        <button className="button" disabled={busy || !state.approvedMinter || state.phaseCode !== 0 ||
            state.counter !== '0' || !state.proposedPresaleStart}
          onClick={() => void run({ type: 'configure', round: 1, startTime: Number(state.proposedPresaleStart) })}>
          Review presale configuration</button>
        <button className="button" disabled={busy || !state.publicRoundReady}
          onClick={() => void run({ type: 'configure', round: 2, startTime: Number(state.blockTimestamp) + 300 })}>
          Review public round configuration</button>
      </div>
      <small>Presale proposals use a specific timestamp 15 minutes after the last Ethereum observation,
        valid only if still at least 5 minutes in the future at signing. Refresh readiness if delayed.
        Both this start and the later public-round start are visible in transaction review before wallet approval.
        This action does not enable Mainnet signing. Public review proposes five minutes after its Ethereum observation.</small>
    </>}
    <Go721TransactionLedger chainId={chainId} contract={GO721_COLLECTION}/>
    {intent && <Go721TransactionReview key={intent.id} intent={intent} onClose={() => setIntent(undefined)} onConfirmed={() => void run()}/>}
  </section>;
}
