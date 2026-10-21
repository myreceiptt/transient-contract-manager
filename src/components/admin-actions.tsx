'use client';
import { useState } from 'react';
import { useSession } from './providers';
import { api } from '@/lib/api-client';
import { Notice } from './shell';
export function AdminActions({
  info,
  onIntent,
  initialAction = 'mintToken',
}: {
  info: any;
  onIntent: (i: any) => void;
  initialAction?: string;
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
  const { ensureSession } = useSession();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
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
      onIntent(
        await api('prepare_admin', { chainId: info.chainId, contract: info.address, action: args }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <div className="section-top">
        <h2>Prepare a collection action</h2>
        <span className="tag">OWNER / ADMIN</span>
      </div>
      <p>
        Every operation is checked against the pinned contract, simulated, then reviewed before your
        wallet opens.
      </p>
      {!info.canWrite && (
        <Notice>
          Mainnet writes are locked in this development release. These controls operate on the
          configured local test chain.
        </Notice>
      )}
      <form onSubmit={submit}>
        <label>
          Action
          <select value={action} onChange={(e) => setAction(e.target.value)}>
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
        <button className="button" disabled={busy || !info.authorized || !info.canWrite}>
          {busy ? 'Simulating…' : 'Simulate & review'}
        </button>
      </form>
    </section>
  );
}
