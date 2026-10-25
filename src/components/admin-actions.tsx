'use client';
import { useEffect, useState } from 'react';
import { useSession } from './providers';
import { api } from '@/lib/api-client';
import { Notice } from './shell';
export function AdminActions({
  info,
  onIntent,
  initialAction = 'mintToken',
  prepared,
}: {
  info: any;
  onIntent: (i: any) => void;
  initialAction?: string;
  prepared?: { action: string; uri?: string; tokenId?: string; batch?: string };
}) {
  const [action, setAction] = useState(initialAction);
  const [tokenId, setTokenId] = useState('1');
  const [uri, setUri] = useState('');
  const [recipientText, setRecipientText] = useState('');
  const [royaltyRecipient, setRoyaltyRecipient] = useState(info.royalty?.[0] || info.owner);
  const [bps, setBps] = useState('500');
  const [batch, setBatch] = useState(
    '[\n  {"uri":"ipfs://YOUR_CID/metadata.json","recipients":[{"address":"0x…","amount":"1"}]}\n]',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [simulation, setSimulation] = useState<any>();
  const { ensureSession } = useSession();
  useEffect(() => {
    if (!prepared) return;
    setAction(prepared.action);
    if (prepared.uri) setUri(prepared.uri);
    if (prepared.tokenId) setTokenId(prepared.tokenId);
    if (prepared.batch) setBatch(prepared.batch);
    setSimulation(undefined);
    setError('');
  }, [prepared]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSimulation(undefined);
    try {
      await ensureSession(info.chainId);
      let args: any = { action };
      if (['mintToken', 'setTokenUri', 'setTokenRoyalty'].includes(action)) args.tokenId = tokenId;
      if (['createToken', 'setTokenUri'].includes(action)) args.uri = uri;
      if (['createToken', 'mintToken'].includes(action)) {
        args.recipients = recipientText.trim()
          ? recipientText
              .trim()
              .split('\n')
              .map((line) => {
                const [address, amount] = line.trim().split(/[,\s]+/);
                return { address, amount };
              })
          : action === 'createToken'
            ? [{ address: '0x000000000000000000000000000000000000dEaD', amount: '0' }]
            : [];
      }
      if (action === 'batchCreateToken') args.tokens = JSON.parse(batch);
      if (action.includes('Royalty'))
        args.royalty = { recipient: royaltyRecipient, bps: Number(bps) };
      const result = await api(info.canWrite ? 'prepare_admin' : 'preview_admin', {
        chainId: info.chainId, contract: info.address, action: args,
      });
      if (info.canWrite) onIntent(result);
      else setSimulation(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel" id="collection-action-form">
      <div className="section-top">
        <h2>Prepare a collection action</h2>
        <span className="tag">OWNER / ADMIN</span>
      </div>
      <p>
        Contract actions are validated against the pinned implementation and your on-chain admin
        permission. On mainnet these controls provide simulation only, without sending a transaction.
      </p>
      {!info.canWrite && (
        <Notice>
          Mainnet writes remain locked. Authorized owners/admins may run read-only contract
          simulations here. No wallet transaction signing or blockchain write is requested.
        </Notice>
      )}
      <form onSubmit={submit}>
        <label>
          Action
          <select value={action} onChange={(e) => { setAction(e.target.value); setSimulation(undefined); }}>
            <option value="mintToken">Mint existing token / airdrop</option>
            <option value="createToken">Create token ID</option>
            <option value="batchCreateToken">Create multiple token IDs</option>
            <option value="setTokenUri">Update token metadata URI</option>
            <option value="setDefaultRoyalty">Update default royalty</option>
            <option value="setTokenRoyalty">Update token royalty</option>
            <option value="approveStacks">Approve verified Stacks as a minter</option>
          </select>
        </label>
        {['mintToken', 'setTokenUri', 'setTokenRoyalty'].includes(action) && (
          <label>
            Token ID
            <input
              value={tokenId}
              onChange={(e) => setTokenId(e.target.value)}
              inputMode="numeric"
              required
            />
          </label>
        )}
        {['createToken', 'setTokenUri'].includes(action) && (
          <label>
            Pinned metadata URI
            <input
              value={uri}
              onChange={(e) => setUri(e.target.value)}
              placeholder="ipfs://…/metadata.json"
              required
            />
          </label>
        )}
        {['createToken', 'mintToken'].includes(action) && (
          <label>
            Recipients: one address, amount per line
            <textarea
              rows={4}
              value={recipientText}
              onChange={(e) => setRecipientText(e.target.value)}
              placeholder="0x…, 1"
              required={action === 'mintToken'}
            />
            {action === 'createToken' && (
              <small>
                Leave empty to create an unminted token ID. The contract emits a zero-unit mint to
                the dead address.
              </small>
            )}
          </label>
        )}
        {action === 'batchCreateToken' && (
          <label>
            Token batch (JSON)
            <textarea
              rows={8}
              className="mono"
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
            />
            <small>At most 40 token IDs and 200 total recipients.</small>
          </label>
        )}
        {action.includes('Royalty') && (
          <div className="form-grid">
            <label>
              Royalty receiver
              <input
                value={royaltyRecipient}
                onChange={(e) => setRoyaltyRecipient(e.target.value)}
                required
              />
            </label>
            <label>
              Royalty basis points
              <input
                type="number"
                min="0"
                max="1000"
                value={bps}
                onChange={(e) => setBps(e.target.value)}
                required
              />
              <small>100 basis points = 1%. Contract maximum: 10%.</small>
            </label>
          </div>
        )}
        {action === 'approveStacks' && (
          <Notice>
            This grants mint permission only to the verified Stacks v2.3.1 deployment on this chain.
          </Notice>
        )}
        {error && <Notice type="error">{error}</Notice>}
        <button className="button" disabled={busy || !info.authorized}>
          {busy ? 'Simulating…' : info.canWrite ? 'Simulate & review' : 'Simulate (read-only)'}
        </button>
        {simulation && (
          <div className="notice" role="status" aria-live="polite">
            <strong>Read-only simulation: {simulation.tx.functionName}</strong>
            <p>Result: {simulation.tx.simulation}. Tested against block {simulation.observedBlock} on chain {simulation.chainId}.</p>
            <p>Estimated gas: {simulation.tx.estimatedGas}; estimated network fee: {simulation.tx.estimatedNetworkFee} wei (not charged).</p>
            <small>{simulation.warning}</small>
            <details>
              <summary>Review simulated contract arguments (no transaction sent)</summary>
              <pre>{JSON.stringify(simulation.tx.arguments, null, 2)}</pre>
            </details>
          </div>
        )}
      </form>
    </section>
  );
}
