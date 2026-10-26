'use client';

import { useState } from 'react';
import { api } from '@/lib/api-client';
import { useSession } from './providers';
import { Artwork } from './safe-media';
import { Notice } from './shell';
import { nftMetadataSchema, type NftMetadata } from '@/lib/nft-metadata';
import { isAddress } from 'viem';
import { uploadOriginalArtwork, formatArtworkSize } from '@/lib/direct-ipfs-upload';

type Pending = { uri: string; name: string };
type Prepared = {
  action: 'createToken' | 'setTokenUri' | 'batchCreateToken';
  uri?: string;
  tokenId?: string;
  batch?: string;
};
const blank = (): NftMetadata => ({
  name: '', description: '', image: '', external_url: '', attributes: [],
});
const DEAD = '0x000000000000000000000000000000000000dEaD';

export function NftMetadataStudio({
  info, onPrepared,
}: { info: any; onPrepared: (prepared: Prepared) => void }) {
  const { ensureSession } = useSession();
  const [meta, setMeta] = useState<NftMetadata>(blank);
  const [tokenId, setTokenId] = useState('1');
  const [importUri, setImportUri] = useState('');
  const [pinned, setPinned] = useState<Pending>();
  const [queue, setQueue] = useState<Pending[]>([]);
  const [receiver, setReceiver] = useState(info.owner as string);
  const [amount, setAmount] = useState('0');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [chosenFile, setChosenFile] = useState<File>();
  const [uploadProgress, setUploadProgress] = useState<number>();
  const update = (value: Partial<NftMetadata>) => {
    setMeta(m => ({ ...m, ...value }));
    setPinned(undefined);
  };
  const attrs = meta.attributes || [];
  async function perform(task: string, callback: () => Promise<void>) {
    setBusy(task); setError(''); setNotice('');
    try { await callback(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Unexpected error'); }
    finally { setBusy(''); }
  }
  async function upload(file?: File) {
    if (!file) return;
    setChosenFile(file);
    setUploadProgress(undefined);
    await perform('image', async () => {
      await ensureSession(info.chainId);
      const result = await uploadOriginalArtwork({
        file, kind: 'artwork', chainId: info.chainId, contract: info.address,
        onProgress: setUploadProgress,
      });
      update({ image: result.uri });
      setNotice('Original artwork pinned to IPFS: ' + result.cid +
        '. Complete the NFT metadata and pin JSON next.');
    });
  }
  async function importPinned() {
    await perform('import', async () => {
      const result = await api('metadata', { uri: importUri.trim() });
      const validated = nftMetadataSchema.parse({
        name: result.name, description: result.description ?? '',
        image: result.image, external_url: result.external_url ?? '',
        attributes: result.attributes ?? [],
      });
      setMeta(validated);
      setPinned(undefined);
      setNotice('Metadata loaded for editing. Existing token metadata was not changed.');
    });
  }
  async function pinJson() {
    await perform('pin', async () => {
      const metadata = nftMetadataSchema.parse(meta);
      await ensureSession(info.chainId);
      const result = await api('metadata_pin', {
        chainId: info.chainId, contract: info.address, metadata,
      });
      setPinned({ uri: result.uri, name: metadata.name });
      setNotice('Immutable metadata JSON pinned: ' + result.uri +
        '. No token has been created or updated on-chain.');
    });
  }
  function useAction(action: Prepared['action']) {
    if (!pinned) return;
    onPrepared({ action, uri: pinned.uri, tokenId });
    setNotice('URI passed to the collection action form. You can now simulate it read-only.');
  }
  function toBatch() {
    if (!queue.length) return;
    if (!isAddress(receiver, { strict: false }) ||
        !/^(0|[1-9][0-9]*)$/.test(amount)) {
      setError('Enter a valid EVM recipient address and a nonnegative whole-number amount.');
      return;
    }
    if (receiver.toLowerCase() === String(info.address).toLowerCase()) {
      setError('Do not mint to the collection contract itself. Choose a wallet address.');
      return;
    }
    onPrepared({
      action: 'batchCreateToken',
      batch: JSON.stringify(queue.map(item => ({
        uri: item.uri,
        recipients: [{ address: receiver, amount }],
      })), null, 2),
    });
    setNotice(queue.length + ' prepared token(s) sent to the batch simulation form. Nothing was minted.');
  }
  return (
    <section className="panel nft-metadata-studio" aria-labelledby="metadata-studio-title">
      <div className="section-top">
        <h2 id="metadata-studio-title">NFT Metadata &amp; Edition Studio</h2>
        <span className="tag">IPFS · DRAFT FIRST</span>
      </div>
      <p>Create metadata visually, pin it to IPFS and prepare your next ERC-1155 action.
        Nothing here submits an on-chain transaction or changes a token automatically.</p>
      <div className="form-grid">
        <label>
          Import an existing IPFS metadata URI
          <input value={importUri} onChange={e => setImportUri(e.target.value)}
            placeholder="ipfs://CID/metadata.json" />
        </label>
        <div className="metadata-inline-actions">
          <button type="button" className="button secondary" onClick={importPinned}
            disabled={!!busy || !importUri.trim()}>Load metadata</button>
          <button type="button" className="button secondary" onClick={() => {
            setMeta(blank()); setPinned(undefined); setError(''); setNotice('');
          }} disabled={!!busy}>New metadata</button>
        </div>
      </div>
      <div className="form-grid">
        <div className="metadata-form">
          <label>NFT name
            <input value={meta.name} maxLength={160} onChange={e => update({ name: e.target.value })}
              placeholder="Artwork or edition title" />
          </label>
          <label>Description
            <textarea rows={5} value={meta.description} maxLength={6000}
              onChange={e => update({ description: e.target.value })}
              placeholder="Describe this NFT, its creator and the work" />
          </label>
          <label>Artwork IPFS URI
            <input value={meta.image} onChange={e => update({ image: e.target.value })}
              placeholder="ipfs://..." />
          </label>
          <label>Or upload artwork
            <input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              disabled={!!busy} onChange={e => {
                void upload(e.target.files?.[0]);
              }} />
            {chosenFile && (
              <span className="artwork-upload-status" role="status" aria-live="polite">
                <strong>{chosenFile.name}</strong>
                <small>{formatArtworkSize(chosenFile.size)}</small>
                {busy === 'image' ? (
                  <span className="artwork-upload-indicator">
                    Uploading original file to IPFS<span className="upload-dots" aria-hidden="true" />
                    {uploadProgress !== undefined && <span> {uploadProgress}%</span>}
                  </span>
                ) : meta.image && notice.startsWith('Original artwork pinned') ? (
                  <span>Upload complete · pinned to IPFS</span>
                ) : error ? <span>Upload failed · select a file to retry</span> : null}
              </span>
            )}
            <small>JPG, PNG or WebP · up to 100 MiB · original file pinned unchanged on public IPFS.</small>
          </label>
          <label>External URL (optional)
            <input type="url" value={meta.external_url || ''}
              onChange={e => update({ external_url: e.target.value })}
              placeholder="https://..." />
          </label>
        </div>
        <div className="metadata-preview">
          <Artwork uri={meta.image} alt={meta.name || 'NFT artwork preview'} />
          <h3>{meta.name || 'Untitled NFT'}</h3>
          <p>{meta.description || 'Enter a description to preview your token.'}</p>
          <small>{attrs.length} metadata attributes</small>
        </div>
      </div>
      <div className="metadata-attributes">
        <div className="section-top">
          <h3>Attributes</h3>
          <button type="button" className="button secondary compact"
            disabled={!!busy || attrs.length >= 40}
            onClick={() => update({ attributes: [...attrs, { trait_type: '', value: '' }] })}>
            Add attribute +
          </button>
        </div>
        {attrs.map((attribute, index) => (
          <div className="metadata-attribute-row" key={index}>
            <label>Trait
              <input value={attribute.trait_type} maxLength={100}
                onChange={e => update({ attributes: attrs.map((a, i) =>
                  i === index ? { ...a, trait_type: e.target.value } : a) })} />
            </label>
            <label>Value
              <input value={String(attribute.value)} maxLength={250}
                onChange={e => update({ attributes: attrs.map((a, i) =>
                  i === index ? { ...a, value: e.target.value } : a) })} />
            </label>
            <button type="button" className="button secondary compact"
              aria-label={'Remove attribute ' + (index + 1)}
              onClick={() => update({ attributes: attrs.filter((_, i) => i !== index) })}>Remove</button>
          </div>
        ))}
      </div>
      {error && <Notice type="error">{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      <div className="button-row">
        <button type="button" className="button" onClick={pinJson} disabled={!!busy}>
          {busy === 'pin' ? 'Pinning JSON…' : 'Pin metadata JSON to IPFS'}
        </button>
      </div>
      {pinned && (
        <div className="metadata-pinned">
          <strong>Metadata pinned and ready</strong>
          <code>{pinned.uri}</code>
          <label>Existing token ID (for metadata updates only)
            <input value={tokenId} inputMode="numeric" onChange={e => setTokenId(e.target.value)} />
          </label>
          <div className="button-row">
            <button type="button" className="button secondary"
              onClick={() => useAction('createToken')}>Prepare new token</button>
            <button type="button" className="button secondary"
              disabled={!/^[1-9][0-9]*$/.test(tokenId)}
              onClick={() => useAction('setTokenUri')}>Prepare metadata update</button>
            <button type="button" className="button secondary"
              disabled={queue.length >= 40}
              onClick={() => {
                if (!queue.some(item => item.uri === pinned.uri)) setQueue(q => [...q, pinned]);
                setNotice('Pinned metadata added to local batch queue. No on-chain changes.');
              }}>Add to batch queue</button>
          </div>
        </div>
      )}
      <details>
        <summary>Batch token builder ({queue.length}/40 pinned metadata entries)</summary>
        <p>Only pinned JSON URIs can be queued. Queue is local to this browser tab.</p>
        {queue.map((item, i) =>
          <div className="metadata-queue-item" key={item.uri}>
            <strong>{i + 1}. {item.name}</strong>
            <code>{item.uri}</code>
            <button className="button secondary compact" type="button"
              onClick={() => setQueue(q => q.filter(x => x.uri !== item.uri))}>Remove</button>
          </div>)}
        <div className="form-grid">
          <label>Wallet recipient
            <input value={receiver} onChange={e => setReceiver(e.target.value)} />
          </label>
          <label>Units per newly created token
            <input inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} />
            <small>Use 0 to create unminted token IDs. Wallet address required.</small>
          </label>
        </div>
        <button type="button" className="button secondary" disabled={!queue.length}
          onClick={toBatch}>Prepare batch for read-only simulation</button>
      </details>
    </section>
  );
}
