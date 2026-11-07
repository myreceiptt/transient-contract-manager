'use client';
import { useState } from 'react';
import { formatEther } from 'viem';
import { useSession } from './providers';
import { api, short } from '@/lib/api-client';
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
      <li><strong>Owner or Admin: configure presale.</strong> 3 NFTs for the allowlisted wallet, artwork price 0 ETH,
        starting 10 Nov 2026 at 10:10 WIB. Proposed presale window: 24 hours; no automatic public phase.</li>
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
        <div className="erc721-campaign-fact"><span>Authenticated wallet role</span><strong>{String(state.role).toUpperCase()}</strong>
          <small>Session: {short(state.authenticatedWallet)} · Contract Owner: {short(state.owner)}</small></div>
        <div className="erc721-campaign-fact"><span>On-chain sale</span><strong>Round {state.round} · {state.phase}</strong></div>
        <div className="erc721-campaign-fact"><span>Protocol fee per NFT</span><strong>{formatEther(BigInt(state.protocolFeeWei))} ETH + gas</strong></div>
      </div>
      {state.reason && <Notice>{state.reason}</Notice>}
      {!state.approvedMinter && state.role !== 'owner' && <Notice type="error">
        The minter authorization review is locked because this authenticated session has {String(state.role).toUpperCase()} permission,
        not OWNER. The collection Owner is {state.owner}. Confirm the connected account in the wallet menu,
        switch to that Owner account, then select Read launch readiness again. This is not a failed transaction.
      </Notice>}
      <div className="button-row">
        <button className="button secondary" disabled={busy || state.approvedMinter || state.role !== 'owner'}
          title={state.role !== 'owner' ? 'Only the collection Owner can review the minter role grant' : undefined}
          onClick={() => void run({ type: 'grant' })}>Review Owner minter authorization</button>
        <button className="button" disabled={busy || !state.approvedMinter || state.phaseCode !== 0 || state.counter !== '0'}
          onClick={() => void run({ type: 'configure', round: 1 })}>Review presale configuration</button>
        <button className="button" disabled={busy || !state.publicRoundReady}
          onClick={() => void run({ type: 'configure', round: 2, startTime: Number(state.blockTimestamp) + 300 })}>
          Review public round configuration</button>
      </div>
      <small>Public review proposes a start five minutes after this Ethereum observation.
        Refresh readiness before preparing it. Ethereum finality usually takes several minutes.</small>
    </>}
    <Go721TransactionLedger chainId={chainId} contract={GO721_COLLECTION}/>
    {intent && <Go721TransactionReview key={intent.id} intent={intent} onClose={() => setIntent(undefined)} onConfirmed={() => void run()}/>}
  </section>;
}
