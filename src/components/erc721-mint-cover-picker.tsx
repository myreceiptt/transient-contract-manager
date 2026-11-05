'use client';

import {useEffect,useRef,useState} from 'react';
import {ImagePlus,Images,UploadCloud} from 'lucide-react';
import {api} from '@/lib/api-client';
import {checkArtwork,formatArtworkSize,uploadOriginalArtwork} from '@/lib/direct-ipfs-upload';
import {useSession} from './providers';
import {Artwork} from './safe-media';
import {Notice} from './shell';
import type {SavedErc721Draft} from './erc721-draft-storage';

type Props={
  chainId:number;contract:string;authorized:boolean;
  uri:string;onChange:(uri:string)=>void;
  onUploadingChange?:(uploading:boolean)=>void;
};

/** Mirrors GO1's authenticated direct-to-Pinata original-file upload.
 * Existing ARTWORK drafts can also supply the cover without a second upload.
 * Local blob URLs and File instances are NEVER persisted as mint-page data.
 */
export function Erc721MintCoverPicker({chainId,contract,authorized,uri,onChange,onUploadingChange}:Props){
  const {ensureSession}=useSession();
  const [uploading,setUploading]=useState(false);
  const [loadingArtworks,setLoadingArtworks]=useState(false);
  const [progress,setProgress]=useState<number>();
  const [fileName,setFileName]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [savedArtworks,setSavedArtworks]=useState<SavedErc721Draft[]|null>(null);
  const [localPreview,setLocalPreview]=useState('');
  const previewRef=useRef('');
  function releasePreview(){
    if(previewRef.current)URL.revokeObjectURL(previewRef.current);
    previewRef.current='';
    setLocalPreview('');
  }
  useEffect(()=>()=>{if(previewRef.current)URL.revokeObjectURL(previewRef.current);},[]);
  useEffect(()=>{
    setSavedArtworks(null);setError('');setNotice('');
    if(previewRef.current){URL.revokeObjectURL(previewRef.current);previewRef.current='';}
    setLocalPreview('');
  },[chainId,contract]);
  function chooseUri(next:string){
    releasePreview();setFileName('');setProgress(undefined);
    setError('');setNotice('');
    onChange(next);
  }
  async function upload(file?:File){
    if(!file||!authorized||uploading)return;
    try{checkArtwork(file);}
    catch(e){setError(e instanceof Error?e.message:'Invalid image');return;}
    releasePreview();
    const url=URL.createObjectURL(file);
    previewRef.current=url;setLocalPreview(url);
    setFileName(file.name);setProgress(undefined);setError('');setNotice('');
    // Avoid accidentally persisting the previous CID as if the new file was uploaded.
    onChange('');
    setUploading(true);onUploadingChange?.(true);
    try{
      await ensureSession(chainId);
      const result=await uploadOriginalArtwork({
        file,kind:'banner',chainId,contract,standard:'ERC721TL',onProgress:setProgress,
      });
      releasePreview();
      onChange(result.uri);
      setNotice('Cover image uploaded to public IPFS: '+result.uri+
        '. Save the Mint Page draft to persist this reference.');
    }catch(e){
      setError(e instanceof Error?e.message:'IPFS upload failed');
    }finally{setUploading(false);onUploadingChange?.(false);}
  }
  async function loadArtworks(){
    if(!authorized||loadingArtworks)return;
    setLoadingArtworks(true);setError('');setNotice('');
    try{
      await ensureSession(chainId);
      const rows=await api('erc721_draft_list',{
        chainId,contract,kind:'ARTWORK',
      }) as SavedErc721Draft[];
      setSavedArtworks(rows.filter(row=>
        typeof row.draft?.image==='string'&&row.draft.image.startsWith('ipfs://')));
      if(!rows.some(row=>typeof row.draft?.image==='string'&&row.draft.image.startsWith('ipfs://')))
        setNotice('No saved Artwork draft with a pinned IPFS image was found in this collection.');
    }catch(e){setError(e instanceof Error?e.message:'Could not load saved artwork images.');}
    finally{setLoadingArtworks(false);}
  }
  return <div className="erc721-cover-editor">
    <div className="section-top">
      <div><strong>Artwork / Cover image</strong>
        <p className="fineprint">Use an existing pinned Artwork image, or upload a new original
          as you do in GO1 Mint Pages. A cover is visual content, not an on-chain mint.</p>
      </div>
    </div>
    <label>IPFS cover URI
      <input value={uri} spellCheck={false} disabled={!authorized||uploading}
        onChange={e=>chooseUri(e.target.value)}
        placeholder="ipfs://..."/>
    </label>
    <div className="erc721-cover-options">
      <label className="erc721-cover-file">Upload JPG, PNG or WebP to IPFS
        <input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          disabled={!authorized||uploading} aria-label="Upload ERC721 Mint Page cover to IPFS"
          onChange={e=>{
            const file=e.target.files?.[0];e.target.value='';
            void upload(file);
          }}/>
      </label>
      <button type="button" className="button secondary"
        disabled={!authorized||uploading||loadingArtworks}
        onClick={()=>void loadArtworks()}>
        <Images size={15}/> {loadingArtworks?'Loading…':'Use saved Artwork image'}
      </button>
    </div>
    <p className="fineprint">Original image up to {formatArtworkSize(100*1024*1024)};
      uploaded directly to public IPFS using the existing authenticated media flow.</p>
    {(uploading||fileName)&&<div className="erc721-cover-upload-status" role="status">
      <UploadCloud size={15}/><span>{fileName||'Uploading cover'}
      {uploading?' · Uploading'+(progress!==undefined?' '+progress+'%':'') :
        localPreview?' · Not uploaded yet':' · Upload complete'}</span>
    </div>}
    {localPreview&&<div className="erc721-cover-local">
      <img src={localPreview} alt="Temporary browser preview of selected cover"/>
      <p className="fineprint">Local preview only. This image has NOT been uploaded
        or saved. Retry the same file after fixing the upload error.</p>
    </div>}
    {savedArtworks!==null&&<div className="erc721-cover-library">
      <div className="section-top"><strong>Saved Artwork images</strong>
        <span className="tag">{savedArtworks.length} available</span></div>
      {savedArtworks.length>0&&<div className="erc721-cover-gallery">
        {savedArtworks.map(row=><button type="button" key={row.id}
            className="erc721-cover-choice" disabled={uploading}
            onClick={()=>{
              chooseUri(String(row.draft.image));
              setNotice('Reused the pinned image from '+String(row.draft.title||'Artwork')+
                '. No repeat IPFS upload needed; save your Mint Page draft to keep it.');
            }}>
            <Artwork uri={String(row.draft.image)} alt={String(row.draft.title||'Saved Artwork')}/>
            <span><ImagePlus size={14}/>{String(row.draft.title||'Untitled Artwork')}</span>
          </button>)}
      </div>}
    </div>}
    {error&&<Notice type="error">{error}</Notice>}
    {notice&&<Notice type="success">{notice}</Notice>}
    {!uri&&!localPreview&&<p className="fineprint">No cover selected yet.
      You can save the campaign draft without a cover, but its collector preview
      will display a placeholder.</p>}
  </div>;
}
