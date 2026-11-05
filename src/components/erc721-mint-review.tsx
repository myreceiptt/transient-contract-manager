'use client';
import { useEffect, useRef, useState } from 'react';
import { formatEther, type Hex } from 'viem';
import { useConnection, useWalletClient, usePublicClient, useSession } from './providers';
import { api } from '@/lib/api-client';
import { txExplorer } from '@/lib/chains';
import { Artwork } from './safe-media';
import { Notice } from './shell';

export function Erc721MintReview({
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
  const tx = record.payload.tx,
    action = record.payload.action;
  const storageKey = 'tcm-erc721-tx-' + intent.id;
  const finished = ['CONFIRMED', 'REPLACED', 'REVERTED'].includes(record.status);
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved && /^0x[0-9a-fA-F]{64}$/.test(saved)) setHash(saved as Hex);
    const previous = document.activeElement as HTMLElement;
    dialog.current?.focus();
    return () => previous?.focus();
  }, [storageKey]);
  async function task(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await ensureSession(Number(intent.chain_id));
      await fn();
    } catch (e) {
      setError((e as any)?.shortMessage || (e as Error).message);
    } finally {
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
    await api('attach_erc721_mint', { id: intent.id, txHash: h });
    acceptResult(await api('confirm_erc721_mint', { id: intent.id }));
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
      const fresh = await api('preflight_erc721_mint', { id: intent.id });
      const h = await wallet.sendTransaction({
        account: address,
        chain: wallet.chain,
        to: fresh.to,
        data: fresh.data,
        value: 0n,
        nonce: fresh.nonce,
        gas: BigInt(fresh.gas),
        maxFeePerGas: BigInt(fresh.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(fresh.maxPriorityFeePerGas),
      });
      setHash(h);
      localStorage.setItem(storageKey, h);
      setRecord((old: any) => ({ ...old, status: 'SUBMITTED' }));
      try {
        await api('attach_erc721_mint', { id: intent.id, txHash: h });
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
              await api('cancel_erc721_mint', { id: intent.id, txHash: r.transaction.hash }),
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
        aria-labelledby="erc721-review-title"
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
          <span className="eyebrow">CREATOR MINT · ERC721TL 4.1.2</span>
          <button className="button secondary compact" disabled={busy} onClick={onClose}>
            Close mint review
          </button>
        </div>
        <h2 id="erc721-review-title">Review your original NFT</h2>
        <Artwork
          uri={record.payload.metadata.metadata.image}
          alt={record.payload.metadata.metadata.name}
        />
        <h3>{record.payload.metadata.metadata.name}</h3>
        <p>
          Creates one unique NFT directly in the recipient wallet. Its Token ID comes from the
          confirmed mint event. This does not publish a sale or list an auction.
        </p>
        <dl className="review-data">
          <dt>Network</dt>
          <dd>
            {Number(record.chain_id) === 1
              ? 'Ethereum Mainnet · 1'
              : 'Isolated local chain · 31337'}
          </dd>
          <dt>Executing wallet</dt>
          <dd className="mono">{tx.account}</dd>
          <dt>Role at review</dt>
          <dd>{record.payload.attestation.role}</dd>
          <dt>Collection</dt>
          <dd className="mono">{tx.to}</dd>
          <dt>NFT recipient</dt>
          <dd className="mono">{action.recipient}</dd>
          <dt>Metadata URI</dt>
          <dd className="mono">{action.uri}</dd>
          <dt>ETH sent to contract</dt>
          <dd>0 ETH</dd>
          <dt>Maximum network fee at review</dt>
          <dd>{formatEther(BigInt(tx.maximumNetworkFee))} ETH</dd>
          <dt>Wallet nonce</dt>
          <dd>{tx.nonce}</dd>
          <dt>Review expires</dt>
          <dd>{tx.expiresAt}</dd>
          <dt>Status</dt>
          <dd>{record.status.replaceAll('_', ' ')}</dd>
        </dl>
        <Notice>
          Exact creator runtime matched. Metadata bytes match their IPFS CID. Current role, supply
          lock, recipient, wallet nonce and fees are checked again before signing.
        </Notice>
        {!record.signingEnabled && !hash && (
          <Notice>
            Awaiting explicit approval for this exact creator mint. Preparing this review does not
            open your wallet or create an NFT.
          </Notice>
        )}
        <details>
          <summary>Runtime and exact transaction</summary>
          <pre>
            {JSON.stringify(
              {
                implementation: record.payload.attestation.implementation,
                runtimeHash: record.payload.attestation.runtimeHash,
                metadataSha256: record.payload.metadata.sha256,
                approvalKey: record.payload.approvalKey,
                method: 'mint(address,string)',
                data: tx.data,
              },
              null,
              2,
            )}
          </pre>
        </details>
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
              I reviewed the collection, recipient, metadata and network fee.
            </label>
            <div className="button-row">
              <button
                className="button"
                disabled={busy || !checked || !record.signingEnabled}
                onClick={() => void send()}
              >
                {busy ? 'Checking…' : 'Confirm creator mint in wallet'}
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  void task(async () => {
                    setRecord(await api('intent_erc721_mint', { id: intent.id }));
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
                Check mint receipt
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
                Recover matching mint
              </button>
              {hash && (
                <button
                  className="button secondary"
                  disabled={busy || !/^0x[0-9a-fA-F]{64}$/.test(replacement)}
                  onClick={() =>
                    void task(async () =>
                      acceptResult(
                        await api('cancel_erc721_mint', { id: intent.id, txHash: replacement }),
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
                Mint confirmed · Token #{record.payload.receipt.tokenId}. Ownership and tokenURI
                verified at the mint block.
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

export function Erc721MintLedger({ chainId, contract }: { chainId: number; contract: string }) {
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
      setRows(await api('history_erc721_mint', { chainId, contract }));
      setLoaded(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h3>Creator mint reviews</h3>
      <p>
        Recover your wallet's recent creator reviews and submitted transactions. Saved artwork
        drafts are separate.
      </p>
      <button className="button secondary" disabled={!address || busy} onClick={() => void load()}>
        {busy ? 'Loading…' : 'Load my mint reviews'}
      </button>
      {error && <Notice type="error">{error}</Notice>}
      {loaded && !rows.length && (
        <p>No creator mint reviews for this wallet in the latest 25 collection records.</p>
      )}
      {rows.map((row) => (
        <div className="section-top" key={row.id}>
          <div>
            <strong>{row.payload.metadata.metadata.name}</strong>
            <p>
              {row.status} · {row.created_at}
            </p>
          </div>
          <button className="button secondary compact" onClick={() => setSelected(row)}>
            Open mint review
          </button>
        </div>
      ))}
      {selected && (
        <Erc721MintReview
          key={selected.id}
          intent={selected}
          onClose={() => setSelected(undefined)}
          onConfirmed={() => void load()}
        />
      )}
    </section>
  );
}
