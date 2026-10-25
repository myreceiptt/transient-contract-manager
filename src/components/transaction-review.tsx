'use client';
import { useEffect, useRef, useState } from 'react';
import { useConnection, useWalletClient, usePublicClient } from './providers';
import { formatEther, type Hex } from 'viem';
import { X, ShieldCheck, ArrowUpRight } from 'lucide-react';
import { api } from '@/lib/api-client';
import { getChain, txExplorer } from '@/lib/chains';
import { Notice } from './shell';
export function TransactionReview({
  intent,
  onClose,
  onComplete,
}: {
  intent: any;
  onClose: () => void;
  onComplete: () => void;
}) {
  const { address, chainId } = useConnection();
  const { data: wallet } = useWalletClient();
  const publicClient = usePublicClient({ chainId: Number(intent.chain_id) });
  const [checked, setChecked] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [hash, setHash] = useState<Hex | undefined>(intent.tx_hash || undefined),
    [status, setStatus] = useState(intent.status),
    [replacement, setReplacement] = useState(''),
    [receipt, setReceipt] = useState(intent.payload.receipt);
  const dialog = useRef<HTMLElement>(null);
  const tx = intent.payload.tx;
  useEffect(() => {
    const saved = localStorage.getItem('tcm-tx-' + intent.id);
    if (saved) setHash(saved as Hex);
    const previous = document.activeElement as HTMLElement;
    dialog.current?.focus();
    return () => previous?.focus();
  }, [intent.id]);
  async function reconcile(h: Hex) {
    await api('attach', { id: intent.id, txHash: h });
    const result = await api('confirm', { id: intent.id });
    setStatus(result.status);
    setReceipt(result.payload?.receipt);
    if (result.status === 'CONFIRMED') {
      localStorage.removeItem('tcm-tx-' + intent.id);
      onComplete();
    }
    return result;
  }
  async function check() {
    if (!hash) return;
    setBusy(true);
    setError('');
    try {
      await reconcile(hash);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    setBusy(true);
    setError('');
    try {
      if (!wallet || !address) throw new Error('Connect the executing wallet');
      if (chainId !== Number(intent.chain_id))
        throw new Error('Switch to the reviewed network first');
      if (address.toLowerCase() !== intent.actor)
        throw new Error('Connect the wallet that prepared this review');
      const fresh = await api('preflight', { id: intent.id });
      const h = await wallet.sendTransaction({
        account: address,
        chain: wallet.chain,
        to: fresh.to,
        data: fresh.data,
        value: BigInt(fresh.value),
      });
      setHash(h);
      localStorage.setItem('tcm-tx-' + intent.id, h);
      setStatus('SUBMITTED');
      try {
        await api('attach', { id: intent.id, txHash: h });
      } catch {
        /* Hash is durably retained in this browser for recovery. */
      }
      let cancelled = false;
      let latest = h;
      await publicClient?.waitForTransactionReceipt({
        hash: h,
        timeout: 60000,
        onReplaced: async (r) => {
          const next = r.transaction.hash;
          if (r.reason !== 'repriced') {
            cancelled = true;
            setReplacement(next);
            const result = await api('cancel_replacement', { id: intent.id, txHash: next });
            setStatus(result.status);
            setError(
              'The original transaction was replaced. Review its replacement before preparing any new action.',
            );
            return;
          }
          latest = next;
          setHash(next);
          localStorage.setItem('tcm-tx-' + intent.id, next);
          await api('attach', { id: intent.id, txHash: next });
        },
      });
      if (!cancelled) await reconcile(latest);
    } catch (e) {
      setError((e as any)?.shortMessage || (e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function recover(cancel: boolean) {
    setBusy(true);
    setError('');
    try {
      if (!/^0x[0-9a-fA-F]{64}$/.test(replacement))
        throw new Error('Enter a valid transaction hash');
      if (cancel) {
        const r = await api('cancel_replacement', { id: intent.id, txHash: replacement });
        setStatus(r.status);
        if (r.status === 'REPLACED') localStorage.removeItem('tcm-tx-' + intent.id);
      } else {
        await reconcile(replacement as Hex);
        setHash(replacement as Hex);
        localStorage.setItem('tcm-tx-' + intent.id, replacement);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const link = hash ? txExplorer(Number(intent.chain_id), hash) : undefined;
  const finished = ['CONFIRMED', 'REPLACED', 'REVERTED'].includes(status);
  return (
    <div className="modal-backdrop">
      <section
        ref={dialog}
        tabIndex={-1}
        className="review-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-title"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          if (e.key === 'Tab') {
            const nodes = dialog.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled),input:not(:disabled),a[href],summary',
            );
            if (!nodes?.length) return;
            const first = nodes[0],
              last = nodes[nodes.length - 1];
            if (
              e.shiftKey &&
              (document.activeElement === first || document.activeElement === dialog.current)
            ) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <div className="section-top">
          <span className="eyebrow">WALLET TRANSACTION</span>
          <button className="icon-button" onClick={onClose} aria-label="Close transaction review">
            <X size={19} />
          </button>
        </div>
        <h2 id="review-title">Review before you sign.</h2>
        <p className="muted">
          {tx.functionName} · {getChain(Number(intent.chain_id)).name}
        </p>
        <div className="simulation-pass">
          <ShieldCheck size={18} />
          Simulation passed · reviewed conditions may change
        </div>
        <dl className="review-data">
          <dt>Executing wallet</dt>
          <dd className="mono">{tx.account}</dd>
          <dt>Target contract</dt>
          <dd className="mono">{tx.to}</dd>
          <dt>ETH value</dt>
          <dd>{formatEther(BigInt(tx.value))} ETH</dd>
          <dt>Estimated network fee</dt>
          <dd>≈ {formatEther(BigInt(tx.estimatedNetworkFee))} ETH</dd>
          {intent.payload.costs && (
            <>
              <dt>Protocol fee included</dt>
              <dd>{formatEther(BigInt(intent.payload.costs.protocolFee))} ETH</dd>
            </>
          )}
        </dl>
        <details open>
          <summary>Exact operation and arguments</summary>
          <pre>{JSON.stringify(tx.arguments, null, 2)}</pre>
        </details>
        <details>
          <summary>Encoded transaction data</summary>
          <pre>{tx.data}</pre>
        </details>
        {error && <Notice type="error">{error}</Notice>}
        {hash ? (
          <>
            <Notice type={status === 'CONFIRMED' ? 'success' : 'info'}>
              {status.replaceAll('_', ' ')}
              {link && (
                <>
                  {' '}
                  ·{' '}
                  <a href={link} target="_blank" rel="noreferrer">
                    View transaction ↗
                  </a>
                </>
              )}
            </Notice>
            <p className="mono">{hash}</p>
            {!finished && (
              <>
                <button className="button wide" onClick={check} disabled={busy}>
                  {busy ? 'Checking…' : 'Check confirmation'}
                </button>
                <details>
                  <summary>Wallet speed-up, cancellation or replacement</summary>
                  <label>
                    Replacement transaction hash
                    <input
                      value={replacement}
                      onChange={(e) => setReplacement(e.target.value)}
                      placeholder="0x…"
                    />
                  </label>
                  <div className="button-row">
                    <button
                      className="button secondary compact"
                      disabled={busy}
                      onClick={() => recover(false)}
                    >
                      Verify same action
                    </button>
                    <button
                      className="button secondary compact"
                      disabled={busy}
                      onClick={() => recover(true)}
                    >
                      Verify cancellation / changed action
                    </button>
                  </div>
                  <small>
                    The server verifies the sender, nonce and finalized receipt. A replacement never
                    triggers another wallet submission.
                  </small>
                </details>
              </>
            )}
            {receipt && (
              <details open>
                <summary>Verified receipt</summary>
                <pre>{JSON.stringify(receipt, null, 2)}</pre>
              </details>
            )}
            {finished && (
              <button className="button wide" onClick={onClose}>
                Close review
              </button>
            )}
          </>
        ) : (
          <>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
              />
              I reviewed the network, operation, recipient or payout address, amounts and fees. I
              approve this specific transaction.
            </label>
            <button
              className="button wide"
              disabled={!checked || busy || intent.status !== 'PREPARED'}
              onClick={send}
            >
              {busy ? 'Waiting for wallet…' : 'Approve in wallet'}
              <ArrowUpRight size={17} />
            </button>
          </>
        )}
        <small className="fineprint">
          No automatic transaction retries. Closing this review does not cancel a submitted
          transaction.
        </small>
      </section>
    </div>
  );
}
