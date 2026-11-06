'use client';
import {useState} from 'react';
import {Download,RefreshCcw} from 'lucide-react';
import {api} from '@/lib/api-client';
import {useSession} from './providers';
import {Notice} from './shell';
import {prepareSequence,verifyApprovedManifest,exportSalePreparation,type Draft,type SequenceItem} from '@/lib/erc721-sale-sequence';
import {prepareOneWalletPresale,verifyOneWalletPresaleFile,type OneWalletPresale} from '@/lib/erc721-sale-allowlist';
import {approvedGoTerms,GO_APPROVED_TERMS} from '@/lib/erc721-sale-terms';

/** Owner/Admin sale preparation. Technical files are optional: the server ZIP
 * endpoint independently re-verifies all 30 metadata CIDs and review hashes.
 * Everything here remains off-chain; no signatures or chain transactions.
 */
export function Erc721SalePreparation({chainId,contract,authorized}:{
  chainId:number;contract:string;authorized:boolean;
}){
  const {ensureSession}=useSession();
  const isApprovedCollection=chainId===1&&contract.toLowerCase()===GO_APPROVED_TERMS.collection.toLowerCase();
  const saleTerms=isApprovedCollection?approvedGoTerms(chainId,contract):null;
  const [items,setItems]=useState<SequenceItem[]>([]);
  const [loaded,setLoaded]=useState(false),[approved,setApproved]=useState(false);
  const [busy,setBusy]=useState(false),[archiveBusy,setArchiveBusy]=useState(false);
  const [error,setError]=useState(''),[note,setNote]=useState('');
  const [pinBusy,setPinBusy]=useState<1|2|null>(null);
  const [folders,setFolders]=useState<Record<number,{cid:string;baseUri:string|null;verified:boolean;saved:boolean}>>({});
  const [walletInput,setWalletInput]=useState(isApprovedCollection?GO_APPROVED_TERMS.presaleRecipient:'');
  const [presale,setPresale]=useState<OneWalletPresale|null>(
    isApprovedCollection?prepareOneWalletPresale(GO_APPROVED_TERMS.presaleRecipient,chainId,contract):null);
  async function load(){
    if(busy||!authorized)return;
    setBusy(true);setLoaded(false);setApproved(false);setItems([]);setError('');setNote('');
    try {
      await ensureSession(chainId);
      const drafts=await api('erc721_draft_list',{chainId,contract,kind:'ARTWORK'}) as Draft[];
      const rows=prepareSequence(drafts);
      setItems(rows);setLoaded(true);
      setNote('Thirty artworks found with unique metadata CIDs. The approved sequence may be checked using the local manifest.');
    }catch(e){setError(e instanceof Error?e.message:'Cannot load artwork order.');}
    finally{setBusy(false);}
  }
  async function verify(file?:File){
    if(!file||!loaded)return;
    setApproved(false);setError('');setNote('');
    try{
      if(file.size>256*1024)throw new Error('Manifest JSON is too large.');
      verifyApprovedManifest(JSON.parse(await file.text()),items,chainId,contract);
      setApproved(true);
      setNote('Official order v1 verified. All 30 draft IDs, creation times and source CIDs match.');
    }catch(e){setError(e instanceof Error?e.message:'Approved manifest validation failed.');}
  }
  function confirmWallet(){
    setPresale(null);setError('');setNote('');
    try{
      const record=prepareOneWalletPresale(walletInput.trim(),chainId,contract);
      setPresale(record);setWalletInput(record.recipient);
      setNote('Whitelist Merkle root calculated locally for the sole approved recipient.');
    }catch(e){setError(e instanceof Error?e.message:'Invalid recipient wallet.');}
  }
  async function importWallet(file?:File){
    if(!file)return;
    setPresale(null);setError('');setNote('');
    try{
      if(file.size>16*1024)throw new Error('Whitelist file exceeds 16 KB.');
      const record=verifyOneWalletPresaleFile(JSON.parse(await file.text()),chainId,contract);
      setPresale(record);setWalletInput(record.recipient);
      setNote('Local whitelist verified: exactly one recipient, allocation 3.');
    }catch(e){setError(e instanceof Error?e.message:'Could not verify whitelist file.');}
  }
  function download(){
    if(!approved||!presale||!saleTerms||presale.recipient!==saleTerms.presale.recipient)return;
    const json=JSON.stringify({...exportSalePreparation(chainId,contract,items),
      presaleWallet:presale.recipient,presaleMerkleRoot:presale.merkleRoot,
      presaleAllowlist:presale,approvedTerms:saleTerms},null,2)+'\n';
    const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));
    try{
      const a=document.createElement('a');a.href=url;a.download='GO_ONE_OF_ONE_SALE_PREPARATION_OFFCHAIN_v1.json';a.click();
    }finally{URL.revokeObjectURL(url);}
  }
  async function downloadVerifiedFolderArchive(){
    // No local manifest upload required: server verifies admin authority,
    // first-save 30-item order, original pinned CIDs and exact review hashes.
    if(archiveBusy||!authorized||!saleTerms)return;
    setArchiveBusy(true);setError('');setNote('');
    try{
      await ensureSession(chainId);
      const result=await api('download_erc721_metadata_archive',{chainId,contract}) as {
        filename:string;base64:string;fileCount:number;sha256:string;pinnedToIpfs:boolean;
      };
      if(result.fileCount!==30||result.pinnedToIpfs!==false||
        !/^[0-9a-f]{64}$/.test(result.sha256))
        throw new Error('Server returned an incomplete or unexpected metadata archive.');
      const bytes=Uint8Array.from(atob(result.base64),c=>c.charCodeAt(0));
      const url=URL.createObjectURL(new Blob([bytes],{type:'application/zip'}));
      try{
        const a=document.createElement('a');a.href=url;a.download=result.filename;a.click();
      }finally{URL.revokeObjectURL(url);}
      setNote('Metadata ZIP downloaded. Extract its two folders and pin each folder separately to IPFS. No NFT was minted or sold.');
    }catch(e){setError(e instanceof Error?e.message:'Metadata ZIP export failed.');}
    finally{setArchiveBusy(false);}
  }
  async function pinRound(round:1|2){
    if(pinBusy||archiveBusy||!authorized||!saleTerms)return;
    setPinBusy(round);setError('');setNote('');
    try {
      await ensureSession(chainId);
      const result=await api('pin_go721_metadata_folder',{chainId,contract,round}) as {
        round:1|2;cid:string;baseUri:string|null;verified:boolean;saved:boolean;message:string;
      };
      setFolders(prev=>({...prev,[round]:result}));
      if(!result.verified)setError(result.message+' CID: '+result.cid);
      else setNote('Round '+round+': '+result.message+' Base URI '+result.baseUri);
    }catch(e){setError(e instanceof Error?e.message:'Could not pin the IPFS folder.');}
    finally{setPinBusy(null);}
  }
  if(!authorized)return <Notice>Only a verified collection Owner/Admin can prepare this private sale.</Notice>;
  return <section className="panel erc721-sale-preparation">
    <div className="section-top"><div>
      <span className="eyebrow">GO#|O · COLLECTION LAUNCH PREPARATION</span>
      <h2>Prepare 30 artworks for sale</h2>
      <p>Your artwork order and sale parameters are approved. This section prepares the metadata package
        used by the future collector Mint Page; it does not publish or sell NFTs.</p>
    </div><span className="tag">NOT LIVE</span></div>
    <div className="erc721-campaign-facts">
      <div className="erc721-campaign-fact"><span>First sale · 10 Nov 2026 10:10 WIB</span>
        <strong>3 reserved NFTs · 0 ETH</strong>
        <small>One approved wallet · maximum 3 NFTs</small></div>
      <div className="erc721-campaign-fact"><span>Second sale · starts after 3 confirmed mints</span>
        <strong>27 public NFTs · 0.025 ETH</strong>
        <small>Maximum 10 NFTs per wallet</small></div>
    </div>
    <div className="erc721-release-next">
      <span className="eyebrow">NEXT PREPARATION STEP</span>
      <h3>Get the two IPFS metadata folders</h3>
      <p>The 30 artworks already have individually pinned metadata. The download below packages
        them into two numbered folders: 3 for the reserved presale and 27 for public sale.
        The server independently checks each source metadata CID before sending the ZIP.</p>
      <div className="button-row">
        <button type="button" className="button" disabled={archiveBusy||!saleTerms}
          onClick={()=>void downloadVerifiedFolderArchive()}>
          <Download size={15}/>{archiveBusy?'Checking 30 metadata files…':'Download verified 3+27 metadata folders ZIP'}
        </button>
      </div>
      <small>You can pin directly using the two actions below. No ZIP extraction, new wallet signature,
        Ethereum transaction or manual Merkle proof entry is required. These actions upload public metadata to Pinata.</small>
      <div className="button-row">
        <button type="button" className="button secondary" disabled={pinBusy!==null||archiveBusy}
          onClick={()=>void pinRound(1)}>
          {pinBusy===1?'Pinning and validating…':'Pin presale folder (3 NFTs) to IPFS'}
        </button>
        <button type="button" className="button secondary" disabled={pinBusy!==null||archiveBusy}
          onClick={()=>void pinRound(2)}>
          {pinBusy===2?'Pinning and validating…':'Pin public folder (27 NFTs) to IPFS'}
        </button>
      </div>
      {[1,2].map(round=>folders[round]&&<div key={round} className="erc721-campaign-fact">
        <span>Round {round} metadata · {folders[round].verified?'IPFS gateway checked':'Awaiting gateway verification'}</span>
        <strong className="mono">{folders[round].baseUri||folders[round].cid}</strong>
        <small>{folders[round].saved?'Saved to the Mint Page draft':'Not yet saved as a verified folder base URI'}</small>
      </div>)}
      <small>For every folder, the app verifies all 30 original source CIDs and checks the
        first and last uploaded paths against the original JSON bytes before saving a base URI.
        Repeating a completed upload reuses an existing verified CID.</small>
    </div>
    {error&&<Notice type="error">{error}</Notice>}
    {note&&<Notice type="success">{note}</Notice>}
    <details className="erc721-advanced-checks">
      <summary>Advanced verification and technical files (optional)</summary>
      <p>This information is for auditing. You do not need to repeat these checks to
        download the verified metadata folder ZIP.</p>
      <div className="erc721-cover-editor">
        <label>One allowlisted recipient wallet
          <input type="text" className="mono" value={walletInput} spellCheck={false}
            onChange={e=>{setWalletInput(e.target.value);setPresale(null);}}
            placeholder="0x…"/>
        </label>
        <div className="button-row">
          <button type="button" className="button secondary" onClick={confirmWallet}
            disabled={!walletInput.trim()}>Validate wallet &amp; calculate Merkle root</button>
        </div>
        <label>Or import a prepared whitelist JSON
          <input type="file" accept=".json,application/json"
            onChange={e=>{const f=e.target.files?.[0];e.target.value='';void importWallet(f);}}/>
        </label>
        {presale&&<small>Recipient: {presale.recipient}; allowance: 3;
          Merkle root: <code>{presale.merkleRoot}</code>.</small>}
        {presale&&saleTerms&&presale.recipient!==saleTerms.presale.recipient&&
          <Notice type="error">The wallet differs from the approved sole whitelist recipient.</Notice>}
      </div>
      <div className="button-row">
        <button type="button" className="button secondary" disabled={busy} onClick={()=>void load()}>
          <RefreshCcw size={15}/>{busy?'Loading…':'Load & validate 30 Artwork drafts'}
        </button>
      </div>
      <div className="erc721-cover-editor">
        <label>Verify Official Artwork Order v1 (local JSON; never uploaded)
          <input type="file" accept=".json,application/json" disabled={!loaded||busy} onChange={e=>{
            const f=e.target.files?.[0];e.target.value='';void verify(f);
          }}/>
        </label>
        {!loaded&&<small>First load the 30 drafts to enable file verification.</small>}
        {loaded&&<small>{items.length} artwork positions loaded. Verify against your local manifest if needed.</small>}
      </div>
      {loaded&&<>
        <div className="button-row">
          <button type="button" className="button secondary"
            disabled={!approved||!presale||!saleTerms||presale.recipient!==saleTerms.presale.recipient}
            onClick={download}>Download off-chain sale preparation</button>
        </div>
        <details className="erc721-sequence-list">
          <summary>{items.length} artwork positions · {approved?'approved snapshot matched':'manifest check optional'}</summary>
          {items.map(a=><div key={a.draftId} className="erc721-sequence-item">
            <strong>#{a.position}</strong>
            <span><strong>{a.titleAtSnapshot}</strong>
              <small>Round {a.round} · file /{a.folderFile} · {a.sourceMetadataUri.slice(0,22)}…</small>
            </span>
          </div>)}
        </details>
      </>}
      <p><small>These positions are target mint order, not existing Token IDs.
        Contract history and protocol permissions require a separate on-chain preflight.
        The metadata folders and sale are not yet published.</small></p>
    </details>
  </section>;
}
