'use client';
import { useEffect, useState } from 'react';
import { useSession } from './providers';
import { api } from '@/lib/api-client';
import { type Draft, type PageRecord, mediaUrl } from '@/lib/domain';
import { zeroAddress, formatUnits, parseUnits, formatEther } from 'viem';
import { Monitor, Smartphone, Plus, ExternalLink, Save, History } from 'lucide-react';
import { Notice, Loading } from './shell';
import { Artwork } from './safe-media';
import { uploadOriginalArtwork, formatArtworkSize } from '@/lib/direct-ipfs-upload';
function fresh(info: any): Draft {
  return {
    chainId: info.chainId,
    contract: info.address,
    tokenId: '1',
    slug: '',
    content: { title: '', description: '', artwork: '', banner: '', externalUrl: '' },
    sale: {
      payoutReceiver: info.owner,
      initialSupply: '100',
      allowance: '5',
      currencyAddress: zeroAddress,
      publicCost: '0',
      startTime: String(Math.floor(Date.now() / 1000) + 3600),
      publicDuration: '86400',
      presaleDuration: '0',
      presaleCost: '0',
      presaleMerkleRoot: '0x' + '0'.repeat(64),
    },
  };
}
export function MintStudio({
  info,
  onIntent,
  revisionKey,
}: {
  info: any;
  onIntent: (i: any) => void;
  revisionKey: number;
}) {
  const { ensureSession } = useSession();
  const [pages, setPages] = useState<PageRecord[]>([]);
  const [morePages, setMorePages] = useState(false);
  const [moreRevisions, setMoreRevisions] = useState(false);
  const [page, setPage] = useState<PageRecord>();
  const [draft, setDraft] = useState<Draft>();
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<'artwork' | 'banner' | ''>('');
  const [selectedMedia, setSelectedMedia] = useState<Partial<Record<'artwork' | 'banner', File>>>({});
  const [uploadProgress, setUploadProgress] = useState<number>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [snapshot, setSnapshot] = useState<any>();
  const [revisions, setRevisions] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [currency, setCurrency] = useState({ symbol: 'ETH', decimals: 18 });
  const [price, setPrice] = useState('0');
  const [presalePrice, setPresalePrice] = useState('0');
  const [contentReview, setContentReview] = useState<any>();
  const [readiness, setReadiness] = useState<any>();
  const [quoteQty, setQuoteQty] = useState('1');
  const [collectorQuote, setCollectorQuote] = useState<any>();
  const priceValid = [price, presalePrice].every(
    (p) => /^([0-9]+)(\.[0-9]*)?$/.test(p) && (p.split('.')[1] || '').length <= currency.decimals,
  );
  const dirty = !!draft && (JSON.stringify(draft) !== saved || !page);
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await ensureSession(info.chainId);
      await task();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function list(append = false) {
    const batch = await api('pages', {
      chainId: info.chainId,
      contract: info.address,
      offset: append ? pages.length : 0,
    });
    setPages((previous) => (append ? [...previous, ...batch] : batch));
    setMorePages(batch.length === 25);
  }
  function select(p: PageRecord | undefined, d: Draft) {
    setPage(p);
    setDraft(d);
    setSaved(p ? JSON.stringify(d) : '');
    setSnapshot(undefined);
    setReadiness(undefined);
    setCollectorQuote(undefined);
    setRevisions([]);
    setAudit([]);
    setContentReview(undefined);
    setPrice(
      formatUnits(
        BigInt(d.sale.publicCost),
        d.sale.currencyAddress.toLowerCase() === zeroAddress ? 18 : 0,
      ),
    );
    setPresalePrice(
      formatUnits(
        BigInt(d.sale.presaleCost),
        d.sale.currencyAddress.toLowerCase() === zeroAddress ? 18 : 0,
      ),
    );
    setCurrency({
      symbol: d.sale.currencyAddress.toLowerCase() === zeroAddress ? 'ETH' : 'base units',
      decimals: d.sale.currencyAddress.toLowerCase() === zeroAddress ? 18 : 0,
    });
  }
  async function open(id: string) {
    await run(async () => {
      const data = await api('page', { id });
      select(data.page, data.page.draft);
      setSnapshot(data);
      const c = await api('currency', {
        chainId: info.chainId,
        address: data.page.draft.sale.currencyAddress,
      });
      setCurrency(c);
      setPrice(formatUnits(BigInt(data.page.draft.sale.publicCost), c.decimals));
      setPresalePrice(formatUnits(BigInt(data.page.draft.sale.presaleCost), c.decimals));
    });
  }
  useEffect(() => {
    run(async () => {
      await list();
      if (page) await open(page.id);
    });
  }, [revisionKey, info.address, info.chainId]);
  function content(k: keyof Draft['content'], v: string) {
    setDraft((d) => (d ? { ...d, content: { ...d.content, [k]: v } } : d));
    setContentReview(undefined);
  }
  function sale(k: keyof Draft['sale'], v: string) {
    setDraft((d) => (d ? { ...d, sale: { ...d.sale, [k]: v } } : d));
    setContentReview(undefined);
  }
  async function upload(kind: 'artwork' | 'banner', file?: File) {
    if (!file || !draft) return;
    setSelectedMedia(v => ({ ...v, [kind]: file }));
    setUploadProgress(undefined);
    setError('');
    setNotice('');
    setUploading(kind);
    try {
      await ensureSession(info.chainId);
      const result = await uploadOriginalArtwork({
        file, kind, chainId: info.chainId, contract: info.address,
        onProgress: setUploadProgress,
      });
      content(kind, result.uri);
      setNotice('Original ' + kind + ' pinned to IPFS: ' + result.cid +
        '. Save revision to persist this media.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading('');
    }
  }
  async function save() {
    if (!draft) return;
    if (!priceValid) {
      setError('Enter a valid price with no more than ' + currency.decimals + ' decimal places.');
      return;
    }
    await run(async () => {
      const next = {
        ...draft,
        sale: {
          ...draft.sale,
          publicCost: parseUnits(price, currency.decimals).toString(),
          presaleCost: parseUnits(presalePrice, currency.decimals).toString(),
        },
      };
      const p = await api(
        page ? 'page_save' : 'page_create',
        page ? { id: page.id, expectedVersion: page.version, draft: next } : { draft: next },
      );
      setPage(p);
      setDraft(p.draft);
      setSaved(JSON.stringify(p.draft));
      setNotice(
        'Revision ' + p.version + ' saved. Authorized collection admins can continue editing.',
      );
      await list();
    });
  }
  async function checkReadiness() {
    if (!page) return;
    await run(async () => {
      if (dirty) throw new Error('Save the current revision before checking sale readiness.');
      const data = await api('preview_publication', { id: page.id, expectedVersion: page.version });
      setReadiness(data);
    });
  }
  async function checkQuote() {
    if (!page) return;
    await run(async () => {
      if (dirty) throw new Error('Save the current revision before checking collector pricing.');
      setCollectorQuote(await api('preview_collector_quote', {
        id: page.id, expectedVersion: page.version, quantity: quoteQty,
      }));
    });
  }
  async function prepare() {
    if (!page) return;
    await run(async () => {
      const r = await api('prepare_publication', { id: page.id, expectedVersion: page.version });
      if (r.contentOnly) setContentReview(r);
      else onIntent(r);
    });
  }
  return (
    <div className="studio-layout">
      <aside className="page-list panel">
        <div className="section-top">
          <h3>Mint pages</h3>
          <button
            className="icon-button"
            title="New mint page"
            onClick={() => select(undefined, fresh(info))}
          >
            <Plus size={18} />
          </button>
        </div>
        <button
          className="button secondary compact wide"
          disabled={busy}
          onClick={() => run(() => list())}
        >
          Refresh shared drafts
        </button>
        {pages.length === 0 && <p className="muted">Create the first home for your drop.</p>}
        {pages.map((p) => (
          <button
            key={p.id}
            className={'page-list-item ' + (page?.id === p.id ? 'selected' : '')}
            onClick={() => open(p.id)}
          >
            <strong>{p.draft.content.title}</strong>
            <span>/mint/{p.slug}</span>
            <small>
              {p.state.replaceAll('_', ' ')} · v{p.version}
            </small>
          </button>
        ))}
        {morePages && (
          <button
            className="button secondary compact wide"
            disabled={busy}
            onClick={() => run(() => list(true))}
          >
            Load more drafts
          </button>
        )}
      </aside>
      <div className="studio-main">
        {error && <Notice type="error">{error}</Notice>}
        {notice && <Notice type="success">{notice}</Notice>}
        {!draft ? (
          <section className="empty-state panel">
            <span className="eyebrow">INDEPENDENT MINT PAGES</span>
            <h2>A home for every edition.</h2>
            <p>
              Save content and sale settings in a shared draft.
              <br />
              Publish after reviewing the verified on-chain configuration.
            </p>
            <button className="button" onClick={() => select(undefined, fresh(info))}>
              Create mint page <Plus size={17} />
            </button>
          </section>
        ) : (
          <>
            <div className="section-top">
              <div>
                <span className="eyebrow">MINT PAGE STUDIO</span>
                <h2>{page ? 'Edit your drop' : 'Create your drop'}</h2>
              </div>
              <span className="tag">
                {dirty ? 'UNSAVED CHANGES' : page?.state.replaceAll('_', ' ') || 'NEW DRAFT'}
              </span>
            </div>
            <section className="panel">
              <h3>01 · Page content</h3>
              <div className="form-grid">
                <label>
                  Token ID
                  <input
                    value={draft.tokenId}
                    disabled={!!page}
                    onChange={(e) => setDraft({ ...draft, tokenId: e.target.value })}
                    inputMode="numeric"
                  />
                </label>
                <label>
                  Page slug
                  <input
                    value={draft.slug}
                    disabled={!!page}
                    onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                    placeholder="your-edition"
                  />
                  <small>/mint/{draft.slug || 'your-edition'}</small>
                </label>
              </div>
              <label>
                Title
                <input
                  maxLength={100}
                  value={draft.content.title}
                  onChange={(e) => content('title', e.target.value)}
                />
              </label>
              <label>
                Description
                <textarea
                  rows={4}
                  maxLength={6000}
                  value={draft.content.description}
                  onChange={(e) => content('description', e.target.value)}
                />
              </label>
              <div className="form-grid">
                <label>
                  Artwork URL
                  <input
                    value={draft.content.artwork}
                    onChange={(e) => content('artwork', e.target.value)}
                    placeholder="ipfs://…"
                  />
                  <small>JPG, PNG or WebP · original image up to 100 MiB · no automatic recompression.</small>
                  <input type="file" accept="image/jpeg,image/png,image/webp"
                    aria-label="Upload artwork to IPFS" disabled={!!uploading || busy}
                    onChange={(e) => { void upload('artwork', e.target.files?.[0]); }} />
                  {selectedMedia.artwork && <span className="artwork-upload-status" role="status">
                    <strong>{selectedMedia.artwork.name}</strong>
                    <small>{formatArtworkSize(selectedMedia.artwork.size)}</small>
                    {uploading === 'artwork' ? <span className="artwork-upload-indicator">
                      Uploading to IPFS<span className="upload-dots" aria-hidden="true" />
                      {uploadProgress !== undefined && <span> {uploadProgress}%</span>}
                    </span> : notice.startsWith('Original artwork pinned') ? <span>Upload complete</span>
                      : error ? <span>Upload failed · choose a file to retry</span> : null}
                  </span>}
                </label>
                <label>
                  Banner URL
                  <input
                    value={draft.content.banner}
                    onChange={(e) => content('banner', e.target.value)}
                    placeholder="ipfs://…"
                  />
                  <small>JPG, PNG or WebP · original image up to 100 MiB · no automatic recompression.</small>
                  <input type="file" accept="image/jpeg,image/png,image/webp"
                    aria-label="Upload banner to IPFS" disabled={!!uploading || busy}
                    onChange={(e) => { void upload('banner', e.target.files?.[0]); }} />
                  {selectedMedia.banner && <span className="artwork-upload-status" role="status">
                    <strong>{selectedMedia.banner.name}</strong>
                    <small>{formatArtworkSize(selectedMedia.banner.size)}</small>
                    {uploading === 'banner' ? <span className="artwork-upload-indicator">
                      Uploading to IPFS<span className="upload-dots" aria-hidden="true" />
                      {uploadProgress !== undefined && <span> {uploadProgress}%</span>}
                    </span> : notice.startsWith('Original banner pinned') ? <span>Upload complete</span>
                      : error ? <span>Upload failed · choose a file to retry</span> : null}
                  </span>}
                </label>
              </div>
              <label>
                External link
                <input
                  value={draft.content.externalUrl}
                  onChange={(e) => content('externalUrl', e.target.value)}
                  placeholder="https://…"
                />
              </label>
              <small>
                Use pinned IPFS media or an approved HTTPS media host. Raster images only. Draft
                content is independent of token metadata.
              </small>
            </section>
            <section className="panel">
              <h3>02 · Sale configuration</h3>
              <label>
                Payout receiver
                <input
                  value={draft.sale.payoutReceiver}
                  onChange={(e) => sale('payoutReceiver', e.target.value)}
                  spellCheck={false}
                />
              </label>
              <div className="form-grid">
                <label>
                  Allocation (units)
                  <input
                    value={draft.sale.initialSupply}
                    onChange={(e) => sale('initialSupply', e.target.value)}
                    inputMode="numeric"
                  />
                  <small>Cannot change during an active drop.</small>
                </label>
                <label>
                  Maximum per recipient / round
                  <input
                    value={draft.sale.allowance}
                    onChange={(e) => sale('allowance', e.target.value)}
                    inputMode="numeric"
                  />
                  <small>Includes presale and public purchases.</small>
                </label>
              </div>
              <label>
                Payment currency
                <select
                  value={draft.sale.currencyAddress.toLowerCase() === zeroAddress ? 'ETH' : 'ERC20'}
                  onChange={(e) => {
                    sale('currencyAddress', e.target.value === 'ETH' ? zeroAddress : '');
                    setCurrency({
                      symbol: e.target.value === 'ETH' ? 'ETH' : 'unverified',
                      decimals: 18,
                    });
                    setPrice('0');
                    setPresalePrice('0');
                    sale('publicCost', '0');
                    sale('presaleCost', '0');
                  }}
                >
                  <option>ETH</option>
                  <option>ERC20</option>
                </select>
              </label>
              {draft.sale.currencyAddress.toLowerCase() !== zeroAddress && (
                <div className="inline-field">
                  <label>
                    ERC-20 contract
                    <input
                      value={draft.sale.currencyAddress}
                      onChange={(e) => {
                        sale('currencyAddress', e.target.value);
                        setCurrency({ symbol: 'unverified', decimals: 18 });
                      }}
                    />
                  </label>
                  <button
                    className="button secondary"
                    onClick={() =>
                      run(async () => {
                        const c = await api('currency', {
                          chainId: info.chainId,
                          address: draft.sale.currencyAddress,
                        });
                        setCurrency(c);
                        setPrice(formatUnits(BigInt(draft.sale.publicCost), c.decimals));
                        setPresalePrice(formatUnits(BigInt(draft.sale.presaleCost), c.decimals));
                      })
                    }
                  >
                    Read decimals
                  </button>
                </div>
              )}
              <label>
                Public price per unit ({currency.symbol})
                <input
                  value={price}
                  onChange={(e) => {
                    setPrice(e.target.value);
                    try {
                      sale('publicCost', parseUnits(e.target.value, currency.decimals).toString());
                    } catch {}
                  }}
                  inputMode="decimal"
                />
                <small>
                  Protocol fee is added in ETH per unit, including ERC-20 sales. Maximum{' '}
                  {currency.decimals} decimal places.
                </small>
                {!priceValid && (
                  <small className="error">
                    Use a valid decimal price within the currency precision.
                  </small>
                )}
              </label>
              <div className="form-grid">
                <label>
                  Start (UTC)
                  <input
                    type="datetime-local"
                    value={(() => {
                      const n = Number(draft.sale.startTime);
                      return Number.isFinite(n) && n > 0 && n < 253402300800
                        ? new Date(n * 1000).toISOString().slice(0, 16)
                        : '';
                    })()}
                    onChange={(e) =>
                      sale(
                        'startTime',
                        String(Math.floor(new Date(e.target.value + 'Z').getTime() / 1000)),
                      )
                    }
                  />
                </label>
                <label>
                  Public duration (seconds)
                  <input
                    value={draft.sale.publicDuration}
                    onChange={(e) => sale('publicDuration', e.target.value)}
                    inputMode="numeric"
                  />
                  <small>86400 = 24 hours, after presale ends.</small>
                </label>
              </div>
              <details>
                <summary>Presale and allowlist</summary>
                <label>
                  Presale duration (seconds; 0 to disable)
                  <input
                    value={draft.sale.presaleDuration}
                    onChange={(e) => sale('presaleDuration', e.target.value)}
                  />
                </label>
                <label>
                  Presale price ({currency.symbol})
                  <input
                    value={presalePrice}
                    onChange={(e) => {
                      setPresalePrice(e.target.value);
                      try {
                        sale(
                          'presaleCost',
                          parseUnits(e.target.value, currency.decimals).toString(),
                        );
                      } catch {}
                    }}
                  />
                </label>
                <label>
                  Merkle root
                  <input
                    className="mono"
                    value={draft.sale.presaleMerkleRoot}
                    onChange={(e) => sale('presaleMerkleRoot', e.target.value)}
                  />
                </label>
                <small>
                  Use the Stacks double-hashed leaf format documented in the administrator guide.
                  Each collector needs their own proof and allowance.
                </small>
              </details>
            </section>
            <section className="panel">
              <div className="section-top">
                <h3>03 · Content preview</h3>
                <div className="segmented">
                  <button
                    className={!mobile ? 'active' : ''}
                    onClick={() => setMobile(false)}
                    aria-label="Desktop preview"
                  >
                    <Monitor size={17} />
                  </button>
                  <button
                    className={mobile ? 'active' : ''}
                    onClick={() => setMobile(true)}
                    aria-label="Mobile preview"
                  >
                    <Smartphone size={17} />
                  </button>
                </div>
              </div>
              <div className={'mint-preview ' + (mobile ? 'mobile' : '')}>
                {draft.content.banner && (
                  <Artwork
                    uri={draft.content.banner}
                    alt="Banner preview"
                    className="preview-banner"
                  />
                )}
                <Artwork uri={draft.content.artwork} alt="Edition artwork preview" />
                <div>
                  <span className="eyebrow">
                    {info.name} · EDITION {draft.tokenId}
                  </span>
                  <h2>{draft.content.title || 'Your edition title'}</h2>
                  <p className="description">
                    {draft.content.description || 'Your story belongs here.'}
                  </p>
                  <strong>
                    {price} {currency.symbol} / unit
                  </strong>
                  <p className="muted">Draft preview · minting is not active here</p>
                </div>
              </div>
            </section>
            <section className="panel publish-panel">
              <h3>04 · Save, synchronize, publish</h3>
              <p>
                Publishing sale changes may require several wallet transactions. Review each step.
                The public revision changes only after final confirmation and readback.
              </p>
              <div className="button-row">
                <button
                  className="button secondary"
                  onClick={save}
                  disabled={busy || !priceValid || currency.symbol === 'unverified'}
                >
                  <Save size={16} />
                  {busy ? 'Working…' : 'Save revision'}
                </button>
                <button
                  className="button"
                  disabled={busy || !page || dirty || !priceValid || !info.canWrite}
                  onClick={prepare}
                >
                  {info.canWrite ? 'Prepare publication ↗' : 'Mainnet publication locked'}
                </button>
                <button className="button secondary" disabled={busy || !page || dirty || !priceValid}
                  onClick={checkReadiness}>
                  Check sale readiness (read-only)
                </button>
                {page && (
                  <button
                    className="button secondary"
                    onClick={() =>
                      run(async () => {
                        const d = await api('page', { id: page.id });
                        setSnapshot(d);
                        setNotice('Latest on-chain configuration loaded below.');
                      })
                    }
                  >
                    Inspect current state
                  </button>
                )}
              </div>
              {page && (
                <div className="collector-quote-panel">
                  <h3>Collector payment preview (saved draft)</h3>
                  <p>Estimate the NFT price and Stacks protocol fee before any public sale exists.
                    This never initiates minting or requests a collector signature.</p>
                  <div className="button-row">
                    <label>Test quantity
                      <input type="number" min="1" max="20" step="1"
                        value={quoteQty} onChange={e => setQuoteQty(e.target.value)} />
                    </label>
                    <button className="button secondary" disabled={busy || dirty || !priceValid}
                      onClick={checkQuote}>Calculate draft collector quote</button>
                  </div>
                  {collectorQuote && (
                    <div className="collector-quote-result" role="status">
                      <p>For <strong>{collectorQuote.quantity}</strong> NFT unit(s):</p>
                      <p>NFT price: <strong>{formatUnits(BigInt(collectorQuote.paymentAmount),
                        collectorQuote.currency.decimals)} {collectorQuote.currency.symbol}</strong></p>
                      <p>Protocol fee: <strong>{formatEther(BigInt(collectorQuote.protocolFeeWei))} ETH</strong></p>
                      <p>ETH payable with transaction: <strong>{formatEther(BigInt(collectorQuote.totalNativeWei))} ETH</strong></p>
                      <small>{collectorQuote.warning}</small>
                    </div>
                  )}
                </div>
              )}
              {readiness && (
                <div className="sale-readiness" role="status">
                  <div className="section-top">
                    <h3>On-chain sale readiness · {readiness.status.replaceAll('_', ' ')}</h3>
                    <span className="tag">READ-ONLY</span>
                  </div>
                  <p>Block {readiness.observedBlock} · draft revision {readiness.revision}.
                    No wallet transaction will be submitted.</p>
                  {readiness.checks?.map((item: any, index: number) => (
                    <div key={index} className={'readiness-item readiness-' + item.status.toLowerCase()}>
                      <strong>{item.status}</strong>
                      <span>{item.detail}</span>
                    </div>
                  ))}
                  {readiness.relatedPages?.length > 0 && (
                    <details className="related-mint-pages">
                      <summary>Other Mint Pages targeting Token ID {page?.token_id}</summary>
                      <p>All these pages refer to the same Stacks token-level sale configuration.
                        They are separate page drafts, not separate token supplies or sale rounds.</p>
                      <ul>
                        {readiness.relatedPages.map((other: any) => (
                          <li key={other.slug}>
                            <strong>{other.slug}</strong> · {other.state}
                            {!other.sameSaleConfig && ' · different sale settings'}
                            {!other.samePayoutReceiver && ' · different payout receiver'}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {readiness.nextAction && <p>
                    Next contract operation: <strong>{readiness.nextAction}</strong>
                  </p>}
                  {readiness.tx?.simulation === 'passed' && (
                    <details>
                      <summary>View simulated Stacks call, arguments and gas estimate</summary>
                      <p>Estimated gas: {readiness.tx.estimatedGas}; no gas charged.</p>
                      <pre>{JSON.stringify(readiness.tx.arguments, null, 2)}</pre>
                    </details>
                  )}
                  <small>{readiness.note}</small>
                </div>
              )}
              {snapshot && (
                <details open>
                  <summary>
                    On-chain synchronization{' '}
                    {snapshot.changed
                      ? '· changed since draft baseline'
                      : '· matches accepted baseline'}
                  </summary>
                  <pre>{JSON.stringify(snapshot.onchain.sale?.drop, null, 2)}</pre>
                  {snapshot.changed && (
                    <>
                      <Notice>
                        Review these current settings before accepting the new baseline. Your draft
                        remains unchanged.
                      </Notice>
                      <button
                        className="button secondary"
                        disabled={busy || dirty}
                        onClick={() =>
                          run(async () => {
                            const p = await api('page_rebase', {
                              id: page!.id,
                              expectedVersion: page!.version,
                              accepted: snapshot.currentBaseline,
                            });
                            setPage(p);
                            setSnapshot({ ...snapshot, changed: false });
                            setNotice(
                              'Baseline accepted. Prepare publication again to review the difference.',
                            );
                          })
                        }
                      >
                        Accept this on-chain snapshot
                      </button>
                    </>
                  )}
                </details>
              )}
              {contentReview && (
                <div className="content-review">
                  <Notice>
                    Sale settings already match. This action publishes revision {page?.version} of
                    the page content without a blockchain transaction.
                  </Notice>
                  <pre>{JSON.stringify(contentReview.review, null, 2)}</pre>
                  <button
                    className="button"
                    disabled={busy || dirty}
                    onClick={() =>
                      run(async () => {
                        const p = await api('publish_content', {
                          id: page!.id,
                          expectedVersion: page!.version,
                          expectedBaseline: contentReview.expectedBaseline,
                        });
                        setPage(p);
                        setContentReview(undefined);
                        setNotice('Content published.');
                        await list();
                      })
                    }
                  >
                    Confirm content publication
                  </button>
                </div>
              )}
              {page?.published_revision && (
                <a
                  className="text-link"
                  href={'/mint/' + page.slug}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open published page · revision {page.published_revision}{' '}
                  <ExternalLink size={14} />
                </a>
              )}
            </section>
            {page && (
              <section className="panel">
                <button
                  className="text-link"
                  onClick={() =>
                    run(async () => {
                      const [r, a] = await Promise.all([
                        api('revisions', { id: page.id }),
                        api('audit', { id: page.id }),
                      ]);
                      setRevisions(r);
                      setMoreRevisions(r.length === 25);
                      setAudit(a);
                      setShowHistory(!showHistory);
                    })
                  }
                >
                  <History size={17} />
                  Revision history & audit trail
                </button>
                {showHistory && (
                  <div className="history-grid">
                    <div>
                      <h4>Saved revisions</h4>
                      {revisions.map((r) => (
                        <div className="history-row" key={r.version}>
                          <span>
                            v{r.version} · {new Date(r.created_at).toLocaleString()}
                            <small className="mono">{r.editor}</small>
                          </span>
                          <button
                            className="button secondary compact"
                            onClick={() => {
                              setDraft(r.draft);
                              setPrice(
                                formatUnits(BigInt(r.draft.sale.publicCost), currency.decimals),
                              );
                              setPresalePrice(
                                formatUnits(BigInt(r.draft.sale.presaleCost), currency.decimals),
                              );
                              setNotice(
                                'Revision restored in the editor. Save to create a new revision.',
                              );
                            }}
                          >
                            Restore
                          </button>
                        </div>
                      ))}
                      {moreRevisions && (
                        <button
                          className="button secondary compact"
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              const batch = await api('revisions', {
                                id: page.id,
                                offset: revisions.length,
                              });
                              setRevisions((previous) => [...previous, ...batch]);
                              setMoreRevisions(batch.length === 25);
                            })
                          }
                        >
                          Load older revisions
                        </button>
                      )}
                    </div>
                    <div>
                      <h4>Latest audit entries</h4>
                      {audit.map((a) => (
                        <div className="history-row" key={a.id}>
                          <span>
                            {a.action.replaceAll('_', ' ')}
                            <small>{new Date(a.created_at).toLocaleString()}</small>
                            <small className="mono">{a.actor}</small>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
