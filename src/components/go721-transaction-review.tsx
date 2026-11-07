'use client';
import { useEffect, useRef, useState } from 'react';
import { formatEther, type Hex } from 'viem';
import { useConnection, useWalletClient, usePublicClient, useSession } from './providers';
import { api } from '@/lib/api-client';
import { txExplorer } from '@/lib/chains';
import { GO721_COLLECTION } from '@/lib/go721-sale-engine';
import { Notice } from './shell';

export function Go721TransactionReview({
  intent,
  onClose,
  onConfirmed,
}: {
  intent: any;
  onClose: () => void;
  onConfirmed?: () => void;
}) {
  const { address, chainId } = useConnection();
  const { data: wallet } = useWalletClient();
  const { ensureSession } = useSession();
  const publicClient = usePublicClient({ chainId: Number(intent.chain_id) });
  const [record, setRecord] = useState(intent);
  const [hash, setHash] = useState<Hex | undefined>(intent.tx_hash || undefined);
  const [replacement, setReplacement] = useState('');
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLElement>(null);
  const inFlight = useRef(false);
  const tx = record.payload.tx,
    action = record.payload.action;
  const storageKey = 'tcm-go721-tx-' + intent.id;
  const finished = ['CONFIRMED', 'REPLACED', 'REVERTED'].includes(record.status);
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved && /^0x[0-9a-fA-F]{64}$/.test(saved)) setHash(saved as Hex);
    const previous = document.activeElement as HTMLElement;
    dialog.current?.focus();
    return () => previous?.focus();
  }, [storageKey]);
  async function task(fn: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await ensureSession(Number(intent.chain_id));
      await fn();
    } catch (e) {
      setError((e as any)?.shortMessage || (e as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  function acceptResult(result: any) {
    setRecord((old: any) => (result.payload ? result : { ...old, status: result.status }));
    if (['CONFIRMED', 'REPLACED', 'REVERTED'].includes(result.status))
      localStorage.removeItem(storageKey);
    if (result.status === 'CONFIRMED') onConfirmed?.();
  }
  async function reconcile(h: Hex) {
    await api('attach_go721', { id: intent.id, txHash: h });
    acceptResult(await api('confirm_go721', { id: intent.id }));
  }
  async function send() {
    if (!checked || busy || hash || finished || !record.signingEnabled) return;
    await task(async () => {
      if (
        !wallet ||
        !address ||
        address.toLowerCase() !== record.actor ||
        chainId !== Number(record.chain_id)
      )
        throw new Error('Connect the executing wallet on the reviewed network.');
      const fresh = await api('preflight_go721', { id: intent.id });
      const h = await wallet.sendTransaction({
        account: address,
        chain: wallet.chain,
        to: fresh.to,
        data: fresh.data,
        value: BigInt(fresh.value),
        nonce: fresh.nonce,
        gas: BigInt(fresh.gas),
        maxFeePerGas: BigInt(fresh.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(fresh.maxPriorityFeePerGas),
      });
      setHash(h);
      localStorage.setItem(storageKey, h);
      setRecord((old: any) => ({ ...old, status: 'SUBMITTED' }));
      try {
        await api('attach_go721', { id: intent.id, txHash: h });
      } catch {
        /* Recover using the saved hash. */
      }
      let latest = h,
        replaced = false;
      await publicClient?.waitForTransactionReceipt({
        hash: h,
        timeout: 60000,
        onReplaced: async (r) => {
          if (r.reason === 'repriced') {
            latest = r.transaction.hash;
            setHash(latest);
            localStorage.setItem(storageKey, latest);
          } else {
            replaced = true;
            setReplacement(r.transaction.hash);
            acceptResult(
              await api('cancel_go721', { id: intent.id, txHash: r.transaction.hash }),
            );
          }
        },
      });
      if (!replaced) await reconcile(latest);
    });
  }
  const link = hash ? txExplorer(Number(record.chain_id), hash) : undefined;
  return (
    <div className="modal-backdrop">
      <section
        className="review-modal erc721-creator-review"
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="go721-review-title"
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !busy) onClose();
          if (e.key !== 'Tab') return;
          const nodes = dialog.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),a[href],summary',
          );
          if (!nodes?.length) return;
          if (
            e.shiftKey &&
            (document.activeElement === nodes[0] || document.activeElement === dialog.current)
          ) {
            e.preventDefault();
            nodes[nodes.length - 1].focus();
          } else if (!e.shiftKey && document.activeElement === nodes[nodes.length - 1]) {
            e.preventDefault();
            nodes[0].focus();
          }
        }}
      >
        <div className="section-top">
          <span className="eyebrow">GO#|O · GUARDED TRANSACTION</span>
          <button className="button secondary compact" disabled={busy} onClick={onClose}>
            Close review
          </button>
        </div>
        <h2 id="go721-review-title">{action.type === 'grant' ? 'Authorize TLStacks721 as minter' :
          action.type === 'configure' ? 'Configure sale round ' + record.payload.round : 'Review NFT purchase'}</h2>
        <p>{action.type === 'grant' ? 'Only the collection Owner can grant or revoke this permission. This transaction does not mint an NFT or configure the sale.' :
          action.type === 'configure' ? 'This configures the collection sale on Ethereum. An open sale can be called directly on-chain. App checkout requires separate approval.' :
          'NFTs follow the approved artwork order. Availability may fall before mining; TLStacks721 can mint fewer NFTs and refund excess ETH. Receipt quantities are authoritative.'}</p>
        <dl className="review-data">
          <dt>Network</dt><dd>{Number(record.chain_id) === 1 ? 'Ethereum Mainnet · 1' : 'Isolated local fork · 31337'}</dd>
          <dt>Executing wallet / NFT recipient</dt><dd className="mono">{tx.account}</dd>
          <dt>Collection</dt><dd className="mono">{GO721_COLLECTION}</dd>
          <dt>Transaction destination</dt><dd className="mono">{tx.to}</dd>
          {action.type === 'purchase' && <>
            <dt>Reviewed quantity</dt><dd>{record.payload.quantity} of {action.quantity} requested</dd>
            <dt>Artwork price</dt><dd>{formatEther(BigInt(record.payload.mintPriceWei))} ETH</dd>
            <dt>Protocol fee</dt><dd>{formatEther(BigInt(record.payload.protocolFeeWei) * BigInt(record.payload.quantity))} ETH</dd>
          </>}
          <dt>ETH sent to contract</dt><dd>{formatEther(BigInt(tx.value))} ETH</dd>
          <dt>Maximum estimated network fee</dt><dd>{formatEther(BigInt(tx.maximumNetworkFee))} ETH</dd>
          <dt>Wallet nonce</dt><dd>{tx.nonce}</dd>
          <dt>Review expires</dt><dd>{tx.expiresAt}</dd>
          <dt>Status</dt><dd role="status">{record.status.replaceAll('_', ' ')}</dd>
        </dl>
        {record.payload.drop && <dl className="review-data">
          <dt>Start (WIB)</dt><dd>{new Intl.DateTimeFormat('en-GB', {dateStyle:'medium',timeStyle:'long',timeZone:'Asia/Jakarta'}).format(new Date(Number(record.payload.drop.startTime)*1000))}</dd>
          <dt>Round supply</dt><dd>{record.payload.drop.initialSupply}</dd>
          <dt>Payout</dt><dd className="mono">{record.payload.drop.payoutReceiver}</dd>
          <dt>Metadata directory</dt><dd className="mono">{record.payload.drop.baseUri}</dd>
          <dt>Presale / public duration</dt><dd>{record.payload.drop.presaleDuration} / {record.payload.drop.publicDuration} seconds</dd>
          <dt>Presale / public price</dt><dd>{formatEther(BigInt(record.payload.drop.presaleCost))} / {formatEther(BigInt(record.payload.drop.publicCost))} ETH</dd>
        </dl>}
        <Notice>Verified creator and sale runtimes. Current role, audited folder identities, historical counter, round, payment, nonce and fees are checked again before signing.</Notice>
        {!record.signingEnabled && !hash && <Notice>Awaiting explicit approval. This review cannot open a transaction request in your wallet.</Notice>}
        {record.status === 'AWAITING_FINALITY' && <Notice>The transaction is mined. Waiting for Ethereum finality before completing this action.</Notice>}
        <details><summary>Exact calldata and verification evidence</summary><pre>{JSON.stringify({
          transaction:tx, approvalKey:record.payload.approvalKey,campaignKey:record.payload.campaignKey,
          attestation:record.payload.attestation,drop:record.payload.drop,presaleEvidence:record.payload.presaleEvidence,
        },null,2)}</pre></details>
        {error && <Notice type="error">{error}</Notice>}
        {!hash && !finished && (
          <>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={checked}
                disabled={busy || !record.signingEnabled}
                onChange={(e) => setChecked(e.target.checked)}
              />
              I reviewed the action, collection, recipient, payment and maximum gas fee.
            </label>
            <div className="button-row">
              <button
                className="button"
                disabled={busy || !checked || !record.signingEnabled}
                onClick={() => void send()}
              >
                {busy ? 'Checking…' : 'Confirm in wallet'}
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  void task(async () => {
                    setRecord(await api('intent_go721', { id: intent.id }));
                  })
                }
              >
                Refresh approval status
              </button>
            </div>
          </>
        )}
        {hash && (
          <>
            <p className="mono">{hash}</p>
            {link && (
              <a href={link} target="_blank" rel="noreferrer">
                View transaction ↗
              </a>
            )}
            {!finished && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void task(() => reconcile(hash))}
              >
                Check transaction receipt
              </button>
            )}
          </>
        )}
        {!finished && (
          <details>
            <summary>Recover a submitted or replacement transaction</summary>
            <label>
              Transaction hash
              <input
                value={replacement}
                disabled={busy}
                onChange={(e) => setReplacement(e.target.value)}
              />
            </label>
            <div className="button-row">
              <button
                className="button secondary"
                disabled={busy || !/^0x[0-9a-fA-F]{64}$/.test(replacement)}
                onClick={() =>
                  void task(async () => {
                    await reconcile(replacement as Hex);
                    setHash(replacement as Hex);
                  })
                }
              >
                Recover matching transaction
              </button>
              {hash && (
                <button
                  className="button secondary"
                  disabled={busy || !/^0x[0-9a-fA-F]{64}$/.test(replacement)}
                  onClick={() =>
                    void task(async () =>
                      acceptResult(
                        await api('cancel_go721', { id: intent.id, txHash: replacement }),
                      ),
                    )
                  }
                >
                  Check cancellation or replacement
                </button>
              )}
            </div>
          </details>
        )}
        {record.payload.receipt && (
          <section aria-label="Verified ERC721 receipt">
            {record.status === 'CONFIRMED' && (
              <Notice type="success">
                Action confirmed. {record.payload.receipt.tokens?.length > 0 && 'NFT IDs: ' + record.payload.receipt.tokens.map((t: any) => '#' + t.tokenId).join(', ')}
              </Notice>
            )}
            <details open>
              <summary>Verified receipt</summary>
              <pre>{JSON.stringify(record.payload.receipt, null, 2)}</pre>
            </details>
          </section>
        )}
      </section>
    </div>
  );
}

export function Go721TransactionLedger({ chainId, contract }: { chainId: number; contract: string }) {
  const { ensureSession } = useSession();
  const { address } = useConnection();
  const [rows, setRows] = useState<any[]>([]),
    [selected, setSelected] = useState<any>();
  const [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    setRows([]);
    setSelected(undefined);
    setLoaded(false);
    setError('');
  }, [chainId, contract, address]);
  async function load() {
    setBusy(true);
    setError('');
    try {
      await ensureSession(chainId);
      setRows(await api('history_go721', { chainId, contract }));
      setLoaded(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h3>My GO#|O transactions</h3>
      <p>
        Recover this wallet's recent launch reviews, purchases and submitted transactions.
      </p>
      <button className="button secondary" disabled={!address || busy} onClick={() => void load()}>
        {busy ? 'Loading…' : 'Load my transaction reviews'}
      </button>
      {error && <Notice type="error">{error}</Notice>}
      {loaded && !rows.length && (
        <p>No launch reviews for this wallet in the latest 25 collection records.</p>
      )}
      {rows.map((row) => (
        <div className="section-top" key={row.id}>
          <div>
            <strong>{row.payload.action.type + (row.payload.round ? ' · Round ' + row.payload.round : '')}</strong>
            <p>
              {row.status} · {row.created_at}
            </p>
          </div>
          <button className="button secondary compact" onClick={() => setSelected(row)}>
            Open review
          </button>
        </div>
      ))}
      {selected && (
        <Go721TransactionReview
          key={selected.id}
          intent={selected}
          onClose={() => setSelected(undefined)}
          onConfirmed={() => void load()}
        />
      )}
    </section>
  );
}
