'use client';
import { useEffect, useState } from 'react';
import { useSession } from './providers';
import { api } from '@/lib/api-client';
import { type Draft, type PageRecord, mediaUrl } from '@/lib/domain';
import { zeroAddress, formatUnits, parseUnits, formatEther } from 'viem';
import { Monitor, Smartphone, Plus, ExternalLink, Save, History } from 'lucide-react';
import { Notice, Loading } from './shell';
import { Artwork } from './safe-media';
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
  const [page, setPage] = useState<PageRecord>();
  const [draft, setDraft] = useState<Draft>();
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
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
  async function list() {
    setPages(await api('pages', { chainId: info.chainId, contract: info.address }));
  }
  function select(p: PageRecord | undefined, d: Draft) {
    setPage(p);
    setDraft(d);
    setSaved(p ? JSON.stringify(d) : '');
    setSnapshot(undefined);
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
        <button className="button secondary compact wide" disabled={busy} onClick={() => run(list)}>
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
                </label>
                <label>
                  Banner URL
                  <input
                    value={draft.content.banner}
                    onChange={(e) => content('banner', e.target.value)}
                    placeholder="ipfs://…"
                  />
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
                  disabled={busy || !page || dirty || !priceValid}
                  onClick={prepare}
                >
                  Prepare publication ↗
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
                    </div>
                    <div>
                      <h4>Audit log</h4>
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
