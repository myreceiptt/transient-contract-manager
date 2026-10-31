'use client';
import { useEffect, useState } from 'react';
import { useSession } from './providers';
import { api } from '@/lib/api-client';
import { type Draft, type PageRecord, mediaUrl } from '@/lib/domain';
import { zeroAddress, formatUnits, parseUnits, formatEther } from 'viem';
import { Monitor, Smartphone, Plus, ExternalLink, Save, History, RefreshCw, Archive, Copy, ArrowLeft } from 'lucide-react';
import { canonicalMintPages } from '@/lib/canonical-mint-pages';
import { txExplorer } from '@/lib/chains';
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
  const [inventory, setInventory] = useState<any>();
  const [inventoryStart, setInventoryStart] = useState(1);
  const [tokenMetadata, setTokenMetadata] = useState<Record<string, any>>({});
  const [tokenMetadataErrors, setTokenMetadataErrors] = useState<Record<string,string>>({});
  const [metadataRetry, setMetadataRetry] = useState(0);
  const [closePreview, setClosePreview] = useState<any>();
  const [morePages, setMorePages] = useState(false);
  const [moreRevisions, setMoreRevisions] = useState(false);
  const [page, setPage] = useState<PageRecord>();
  const [draft, setDraft] = useState<Draft>();
  const [slugEditOpen, setSlugEditOpen] = useState(false);
  const [slugCandidate, setSlugCandidate] = useState('');
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
  const [roundHistory, setRoundHistory] = useState<any[]>([]);
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
  const identityEditable = !page || (page.state === 'DRAFT' && page.published_revision === null);
  const identityChanged = !!page && !!draft &&
    (draft.tokenId !== page.token_id || draft.slug !== page.slug);
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
  async function loadInventory(start = inventoryStart) {
    const data=await api('mint_inventory',{chainId:info.chainId,contract:info.address,start});
    setInventory(data);
    setInventoryStart(start);
  }
  function publicUrl(slug: string) {
    return window.location.origin + '/mint/' + encodeURIComponent(slug);
  }
  async function copyPublicUrl(slug: string) {
    try {
      await navigator.clipboard.writeText(publicUrl(slug));
      setNotice('Mint Page URL copied.');
      setError('');
    } catch {
      setError('Could not copy automatically. Open the URL and copy it from your browser.');
    }
  }
  function backToEditions() {
    if(busy || uploading) return;
    if(draft && dirty && !window.confirm(
      'Return to NFT Editions? Unsaved Mint Page changes will be lost. Save revision first to keep them.'
    )) return;
    setClosePreview(undefined);
    setPage(undefined);setDraft(undefined);
    setError('');setNotice('');
    setSnapshot(undefined);setContentReview(undefined);setReadiness(undefined);
    setCollectorQuote(undefined);setSlugEditOpen(false);
    void run(()=>loadInventory());
  }
  async function chooseToken(token:any) {
    setClosePreview(undefined);
    if(token.page?.archived){
      if(!window.confirm('Restore the existing canonical Mint Page for Token #'+token.id+
        '? Its original URL and history will be preserved.'))return;
      await run(async()=>{
        const p=await api('page',{id:token.page.id});
        await api('page_lifecycle',{id:token.page.id,expectedVersion:p.page.version,action:'restore'});
        await list(); await loadInventory(); await open(token.page.id);
      });
      return;
    }
    if(token.page){await open(token.page.id);return;}
    if(token.eligibility!=='AVAILABLE')return;
    const official=canonicalMintPages.find(p=>p.chainId===info.chainId &&
      p.contract===info.address.toLowerCase() && p.tokenId===String(token.id));
    const base=fresh(info);
    const d={...base,tokenId:String(token.id),slug:official?.slug||'',
      sale:{...base.sale,payoutReceiver:official?.payoutReceiver||base.sale.payoutReceiver}};
    select(undefined,d);
  }
  async function closeToken(token:any) {
    if(token.dropType===0 || token.dropType===null)return;
    await run(async()=>{
      const r=await api('preview_admin',{chainId:info.chainId,contract:info.address,
        action:{action:'closeDrop',tokenId:String(token.id)}});
      setClosePreview({tokenId:String(token.id),review:r});
      setDraft(undefined);setPage(undefined);
    });
  }
  async function prepareClose() {
    if(!closePreview || !window.confirm('Close the configured Stacks drop for Token #'+closePreview.tokenId+
      '? This submits an irreversible mainnet transaction after your wallet approval. Existing NFT balances remain.'))return;
    await run(async()=>{
      const result=await api('prepare_admin',{chainId:info.chainId,contract:info.address,
        action:{action:'closeDrop',tokenId:closePreview.tokenId}});
      setClosePreview(undefined);
      onIntent(result);
    });
  }
  async function archiveSelected() {
    if(!page || !window.confirm('Archive /mint/'+page.slug+
      '? This hides the public page. Published identity and transaction history remain reserved.'))return;
    await run(async()=>{
      await api('page_lifecycle',{id:page.id,expectedVersion:page.version,action:'archive'});
      setPage(undefined);setDraft(undefined);
      await list();await loadInventory();
      setNotice('Mint Page archived. Its history is preserved.');
    });
  }
  function select(p: PageRecord | undefined, d: Draft) {
    setSlugEditOpen(false);
    setSlugCandidate(p?.slug || d.slug);
    setPage(p);
    setDraft(d);
    setSaved(p ? JSON.stringify(d) : '');
    setSnapshot(undefined);
    setReadiness(undefined);
    setCollectorQuote(undefined);
    setRevisions([]);
    setAudit([]);
    setRoundHistory([]);
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
      await Promise.all([list(),loadInventory(1)]);
      if (page) await open(page.id);
    });
  }, [revisionKey, info.address, info.chainId]);
  // Match the artwork-first Tokens & Editions catalogue. Metadata is read
  // separately from authoritative token/drop eligibility; a failed URI must
  // never make an otherwise valid NFT appear available or unavailable.
  useEffect(() => {
    if(!inventory?.tokens?.length) return;
    let alive=true;
    const items=inventory.tokens as {id:string;uri?:string}[];
    (async()=>{
      const found:Record<string,any>={},failed:Record<string,string>={};
      for(let i=0;i<items.length && alive;i+=4){
        const batch=items.slice(i,i+4);
        const outcomes=await Promise.allSettled(batch.map(
          t=>t.uri?api('metadata',{uri:t.uri}):Promise.resolve(null)
        ));
        for(let j=0;j<batch.length;j++){
          const result=outcomes[j],id=String(batch[j].id);
          if(result.status==='fulfilled' && result.value)found[id]=result.value;
          else if(result.status==='rejected')failed[id]=
            result.reason instanceof Error?result.reason.message:'Metadata unavailable';
        }
      }
      if(alive){setTokenMetadata(found);setTokenMetadataErrors(failed);}
    })();
    return()=>{alive=false;};
  },[inventory,metadataRetry]);
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
    if (identityChanged && !window.confirm(
      'Change the NFT Token ID or Mint Page URL for this unpublished draft? ' +
      'This changes which NFT the page targets or its link. ' +
      'It does not modify the blockchain. Any approved publication policy may still restrict publishing.'
    )) return;
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
      await Promise.all([list(),loadInventory()]);
    });
  }
  async function renamePublishedSlug() {
    if(!page || page.published_revision===null || !draft || dirty) return;
    if(!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(slugCandidate) ||
       slugCandidate.length<3 || slugCandidate.length>80){
      setError('Use a 3–80 character lowercase slug (letters, numbers and hyphens).');
      return;
    }
    if(slugCandidate===page.slug){
      setSlugEditOpen(false); return;
    }
    if(!window.confirm('Change the public Mint Page URL from /mint/'+page.slug+
       ' to /mint/'+slugCandidate+'? Old published URLs will permanently redirect. '+
       'The NFT Token ID, on-chain drop and published content will not change.')) return;
    await run(async()=>{
      const oldSlug=page.slug;
      const updated=await api('page_slug_edit',{
        id:page.id,expectedVersion:page.version,
        expectedSlug:oldSlug,slug:slugCandidate
      }) as PageRecord;
      setPage(updated);
      setDraft(updated.draft);
      setSaved(JSON.stringify(updated.draft));
      setSlugEditOpen(false);
      setSnapshot(undefined);
      setContentReview(undefined);
      setReadiness(undefined);
      setNotice('URL updated: /mint/'+updated.slug+
        '. Old /mint/'+oldSlug+' permanently redirects to the new URL.');
      await Promise.all([list(),loadInventory()]);
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
    <div className="mint-studio-layout">
      <section className="mint-studio-banner panel" aria-label="Mint Pages introduction">
        <span className="eyebrow">INDEPENDENT MINT PAGES</span>
        <h2>A home for every edition.</h2>
        <p>Manage your collection&apos;s verified NFT editions, create independent Mint Pages
          and review on-chain TLStacks1155 drops.</p>
      </section>
     <div className="studio-main">
        {error && <Notice type="error">{error}</Notice>}
        {notice && <Notice type="success">{notice}</Notice>}
        {(draft || closePreview) && (
          <nav className="mint-detail-navigation" aria-label="Mint Pages navigation">
            <button type="button" className="button secondary compact"
              disabled={busy || !!uploading} onClick={backToEditions}>
              <ArrowLeft size={16}/> Back to NFT Editions
            </button>
            <span className="muted">{closePreview
              ? 'Review closeDrop · Token #'+closePreview.tokenId
              : (page?'Manage Mint Page':'Create Mint Page')+' · Token #'+draft?.tokenId}
            </span>
          </nav>
        )}
        {!draft && !closePreview && (
          <section className="mint-catalogue" aria-label="NFT Editions">
            <div className="section-top mint-catalogue-heading">
              <div>
                <h3>NFT Editions</h3>
                <p className="muted">Select a verified token to create, manage or restore its canonical Mint Page.</p>
              </div>
              <button className="button secondary compact" disabled={busy}
                onClick={()=>run(()=>loadInventory())}>
                <RefreshCw size={16}/> Refresh on-chain status
              </button>
            </div>
            <p className="fineprint">Drop status comes from TLStacks1155, not The Lab&apos;s private Mint Page database.
              A sale that has Ended may still require an on-chain Close Drop transaction.</p>
            {!inventory && <Loading label="Reading NFT editions and TLStacks1155 status…" />}
            {inventory?.tokens?.length===0 &&
              <section className="panel mint-catalogue-empty">No verified NFT Token IDs in this range.</section>}
            <div className="token-grid mint-edition-grid">
              {inventory?.tokens?.map((token:any)=>{
                const data=tokenMetadata[String(token.id)];
                const phaseLabel=({1:'Scheduled',2:'Presale',3:'Public sale',4:'Ended'} as Record<number,string>)[token.phase] || 'Unknown';
                const eligibilityLabel=token.eligibility==='AVAILABLE'?'Available for Mint Page':
                  token.eligibility==='RESTORE_CANONICAL'?'Archived · Restore existing page':
                  token.eligibility==='MANAGE_PAGE'?'Existing canonical Mint Page':
                  token.eligibility==='EXTERNAL_DROP'?'External on-chain drop · close first':
                  token.eligibility==='TOKEN_LOCKED'?'NFT minting permanently locked':
                  token.eligibility==='NOT_CREATED'?'NFT token not created':'Verification required';
                return <article className="token-card mint-edition-card" key={token.id}>
                  <Artwork uri={data?.image} alt={data?.name || 'Token '+token.id}/>
                  <div className="mint-edition-content">
                    <span className="eyebrow">TOKEN #{token.id}</span>
                    <h3>{data?.name || token.page?.title || 'Edition #'+token.id}</h3>
                    {data?.description && <p className="mint-edition-description">
                      {String(data.description).slice(0,180)}
                    </p>}
                    {tokenMetadataErrors[String(token.id)] && <p className="fineprint">
                      Token metadata unavailable; on-chain status remains authoritative.
                    </p>}
                    <div className="mint-edition-status">
                      <div>
                        <span>Mint Page</span>
                        <strong>{token.page ? token.page.archived?'Archived':
                          token.page.published?'Published':String(token.page.state).replaceAll('_',' ')
                          :'Not created'}</strong>
                      </div>
                      <div>
                        <span>On-chain drop</span>
                        <strong>{token.dropType===null?'Not verified':
                          token.dropType===0?'Not configured':phaseLabel}</strong>
                      </div>
                    </div>
                    {token.page && <small className="mint-edition-slug">/mint/{token.page.slug}</small>}
                    <p className="mint-edition-eligibility">{eligibilityLabel}
                      {token.round!==null?' · Round '+token.round:''}
                    </p>
                    <div className="button-row mint-edition-actions">
                      {['AVAILABLE','RESTORE_CANONICAL','MANAGE_PAGE'].includes(token.eligibility) &&
                        <button className="button secondary compact" disabled={busy}
                          onClick={()=>void chooseToken(token)}>
                          {token.eligibility==='AVAILABLE'?'Create':
                            token.eligibility==='RESTORE_CANONICAL'?'Restore':'Manage'}
                        </button>}
                      {token.page?.published && !token.page.archived && <>
                        <a className="button secondary compact" target="_blank"
                          rel="noopener noreferrer" href={'/mint/'+encodeURIComponent(token.page.slug)}>
                          <ExternalLink size={14}/> View Mint Page
                        </a>
                        <button type="button" className="button secondary compact"
                          onClick={()=>void copyPublicUrl(token.page.slug)}>
                          <Copy size={14}/> Copy URL
                        </button>
                      </>}
                    </div>
                    {token.dropType!==null && token.dropType!==0 &&
                      <div className="mint-edition-close">
                        <button type="button" className="button secondary compact" disabled={busy}
                          onClick={()=>void closeToken(token)}>Review closeDrop</button>
                      </div>}
                  </div>
                </article>;
              })}
            </div>
            {inventory && <div className="mint-catalogue-footer">
              <div className="button-row">
                <button className="button secondary compact" disabled={busy||inventoryStart<=1}
                  onClick={()=>run(()=>loadInventory(Math.max(1,inventoryStart-20)))}>Previous</button>
                <button className="button secondary compact"
                  disabled={busy||BigInt(inventoryStart+19)>=BigInt(inventory.total||'0')}
                  onClick={()=>run(()=>loadInventory(inventoryStart+20))}>Next</button>
              </div>
              <small className="muted">Verified at block {inventory.observedBlock}.
                Refresh before signing any transaction.</small>
            </div>}
          </section>
        )}
        {closePreview && <section className="panel">
          <h2>Review closeDrop — Token #{closePreview.tokenId}</h2>
          <p>This is a read-only simulation of closing the current on-chain Stacks drop.
            Closing does not delete the NFT or automatically unpublish a page on The Lab.</p>
          <p>Simulation: <strong>{closePreview.review.tx?.simulation}</strong></p>
          <p>Estimated gas: {closePreview.review.tx?.estimatedGas}</p>
          <details><summary>Review transaction arguments and estimated network fee</summary>
            <pre>{JSON.stringify(closePreview.review.tx,null,2)}</pre></details>
          <button className="button" disabled={busy||!info.canWrite} onClick={prepareClose}>
            {info.canWrite?'Prepare closeDrop wallet review':'Mainnet writes disabled'}
          </button>
        </section>}
        {draft && (
          <>
            <div className="section-top">
              <div>
                <span className="eyebrow">MINT PAGE STUDIO</span>
                <h2>{page ? 'Edit your drop' : 'Create your drop'}</h2>
              </div>
              <div className="button-row">
                <span className="tag">
                  {dirty ? 'UNSAVED CHANGES' : page?.state.replaceAll('_', ' ') || 'NEW DRAFT'}
                </span>
                {page && <button className="button secondary compact" disabled={busy||dirty}
                  onClick={archiveSelected}><Archive size={15}/> Archive</button>}
              </div>
            </div>
            <section className="panel">
              <h3>01 · Page content</h3>
              <div className="form-grid">
                <label>
                  Token ID
                  <input
                    value={draft.tokenId}
                    disabled={!identityEditable}
                    onChange={(e) => setDraft({ ...draft, tokenId: e.target.value })}
                    inputMode="numeric"
                  />
                  <small>Selects an existing NFT edition in this contract.
                    Changing it requires admin rights for the new token.</small>
                </label>
                <label>
                  Page slug
                  <input
                    value={draft.slug}
                    disabled={!identityEditable}
                    onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                    placeholder="your-edition"
                  />
                  <small>/mint/{draft.slug || 'your-edition'} · Changing the slug changes the public URL.</small>
                </label>
              </div>
              {identityChanged && (
                <Notice>
                  Changing the Token ID selects a different NFT; changing the slug
                  changes the page URL. The change will be saved only after confirmation
                  and a new on-chain permission check. It does not alter token metadata.
                </Notice>
              )}
              {page && !identityEditable && (
                <Notice>
                  The NFT Token ID and Mint Page ID are permanent. The public URL
                  can be renamed below without changing the blockchain, minting round,
                  or the currently published content.
                </Notice>
              )}
              {page?.published_revision !== null && page?.published_revision !== undefined && (
                <div className="panel" style={{marginTop:'0.75rem'}}>
                  <div className="section-top">
                    <div>
                      <strong>Public Mint Page URL</strong>
                      <p className="muted">Current: /mint/{page.slug}</p>
                      <div className="button-row" style={{marginTop:'0.65rem'}}>
                        <a className="button secondary compact"
                          href={'/mint/'+encodeURIComponent(page.slug)}
                          target="_blank" rel="noopener noreferrer">
                          <ExternalLink size={15}/> View Mint Page
                        </a>
                        <button className="button secondary compact"
                          onClick={()=>void copyPublicUrl(page.slug)}>
                          <Copy size={15}/> Copy URL
                        </button>
                      </div>
                    </div>
                    <button className="button secondary compact"
                      disabled={busy || dirty || page.archived_at != null}
                      onClick={()=>{setSlugCandidate(page.slug);setSlugEditOpen(!slugEditOpen);}}>
                      {slugEditOpen?'Cancel':'Edit URL'}
                    </button>
                  </div>
                  {slugEditOpen && (
                    <>
                      <label htmlFor="published-page-slug">New page slug</label>
                      <input id="published-page-slug" maxLength={80}
                        value={slugCandidate}
                        onChange={e=>setSlugCandidate(e.target.value)}
                        spellCheck={false}
                        autoComplete="off"
                        placeholder="your-edition-slug"/>
                      <small>Preview: /mint/{slugCandidate || 'your-edition-slug'}</small>
                      <p className="muted">
                        The previous URL remains reserved and redirects permanently
                        to this page. No on-chain transaction or gas is required.
                        Do not change Token ID, contract address or Mint Page identity.
                      </p>
                      <button className="button" disabled={busy || dirty ||
                        !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(slugCandidate) ||
                        slugCandidate.length<3 || slugCandidate.length>80 ||
                        slugCandidate===page.slug}
                        onClick={renamePublishedSlug}>Save new URL</button>
                    </>
                  )}
                  {dirty && <small>Save your pending content edits before editing the URL.</small>}
                </div>
              )}
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
              <h3>04 · Save and publish</h3>
              <p>
                <strong>Save revision</strong> stores edits privately in the shared workspace.
                <strong> Check sale readiness</strong> compares your saved settings to the live
                Stacks contract without charging gas. <strong>Prepare publication</strong>
                reviews the necessary blockchain update and requests a wallet signature only
                after your explicit approval. The public page updates after confirmation.
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
                      const [r, a, h] = await Promise.all([
                        api('revisions', { id: page.id }),
                        api('audit', { id: page.id }),
                        api('page_history', { id: page.id }),
                      ]);
                      setRoundHistory(h);
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
                {showHistory && (<>
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
                  <div className="panel">
                    <h4>Sale rounds and transaction evidence</h4>
                    <p className="muted">Publication intents and receipts are historical records.
                      The current on-chain round remains authoritative.</p>
                    {roundHistory.length===0 && <p className="muted">No publication transactions recorded.</p>}
                    {roundHistory.map((entry:any)=><div className="history-row" key={entry.id}>
                      <span>Round {entry.payload?.expectedRound ?? 'not yet known'} · {entry.status}
                        <small>{new Date(entry.created_at).toLocaleString()}</small>
                        {entry.tx_hash && <a className="text-link"
                          href={txExplorer(info.chainId,entry.tx_hash)}
                          target="_blank" rel="noreferrer">Inspect transaction</a>}
                      </span>
                    </div>)}
                  </div>
                </>)}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
