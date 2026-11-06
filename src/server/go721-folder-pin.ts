import {createHash} from 'node:crypto';
import {getAddress,type Address} from 'viem';
import {AppError} from '../lib/domain';
import {GO_APPROVED_TERMS} from '../lib/erc721-sale-terms';
import {validUploadCid} from './upload-cid';
import {fetchMediaWithFallback} from './media';
import {verifiedGo721MetadataItems} from './erc721-metadata-archive';
import {listErc721Drafts,saveErc721Draft} from './erc721-drafts';
import type {Session} from './auth';

const GO=getAddress(GO_APPROVED_TERMS.collection);
const MAX_DIRECTORY_BYTES=1024*1024;
const folderNames={1:'go-one-of-one-presale-3',2:'go-one-of-one-public-27'} as const;
type Round=1|2;

export function pinataFolderUploadForm(round:Round,items:readonly {round:1|2;file:string;json:Buffer}[]){
  if(round!==1&&round!==2)throw new AppError('INVALID_ROUND','Only presale or public sale folders are supported.',422);
  const subset=items.filter(x=>x.round===round).sort((a,b)=>Number(a.file)-Number(b.file));
  const expected=round===1?3:27;
  if(subset.length!==expected)throw new AppError('FOLDER_COUNT','Incorrect metadata file count.',422);
  const total=subset.reduce((n,x)=>n+x.json.length,0);
  if(total<expected*2||total>MAX_DIRECTORY_BYTES)
    throw new AppError('FOLDER_SIZE','Metadata directory size is invalid.',413);
  const form=new FormData();
  const folder=folderNames[round];
  subset.forEach((item,i)=>{
    if(item.file!==String(i)||item.json.length<2||item.json.length>24576)
      throw new AppError('FOLDER_ORDER','Metadata folder sequence is not contiguous.',422);
    form.append('file',new File([new Uint8Array(item.json)],item.file,
      {type:'application/json'}),folder+'/'+item.file);
  });
  form.append('pinataOptions',JSON.stringify({cidVersion:1}));
  form.append('pinataMetadata',JSON.stringify({name:folder}));
  return {form,folder,subset};
}
export async function verifyPinnedFolderPath(
  cid:string,folder:string,items:readonly {file:string;json:Buffer}[],
  fetcher=fetchMediaWithFallback,
){
  if(!validUploadCid(cid))throw new AppError('FOLDER_CID','IPFS provider returned invalid CID.',502);
  const last=items.length-1;
  // Legacy Pinata folder uploads can return a root directory with or without
  // the submitted folder name as its first DAG link. Never assume the path:
  // verify actual bytes using a gateway before saving a usable base URI.
  for(const prefix of ['ipfs://'+cid,'ipfs://'+cid+'/'+folder]){
    try {
      const samples=[items[0],items[last]];
      let ok=true;
      for(const item of samples){
        const bytes=await fetcher(prefix+'/'+item.file,24576);
        if(!createHash('sha256').update(bytes).digest().equals(
          createHash('sha256').update(item.json).digest())){ok=false;break;}
      }
      if(ok)return prefix;
    }catch {
      // Newly pinned content can take time to propagate. Do not misrepresent
      // a pending CID as a verified, ready-to-mint metadata base URI.
    }
  }
  return null;
}
/** Called ONLY on an explicit Owner/Admin click. Publishes immutable IPFS
 * metadata directories, not NFTs, and does NOT sign any Ethereum transaction.
 * Use existing Pinata server secret; never relay it to the browser.
 */
export async function pinGo721Folder(round:Round,chainId:number,contract:Address,s:Session){
  if(chainId!==1||getAddress(contract)!==GO)
    throw new AppError('FOLDER_SCOPE','Folder pinning is available only for GO#|O on Ethereum Mainnet.',403);
  const {items}=await verifiedGo721MetadataItems(chainId,contract,s);
  const {form,folder,subset}=pinataFolderUploadForm(round,items);
  const saved=await listErc721Drafts('MINT_PAGE',chainId,contract,s) as {
    id:string;version:number;draft:Record<string,unknown>;
  }[];
  if(!Array.isArray(saved)||saved.length!==1)
    throw new AppError('FOLDER_DRAFT_MISSING','No single canonical collection Mint Page draft found.',409);
  const key=round===1?'presaleMetadataBaseUri':'publicMetadataBaseUri';
  const existing=saved[0].draft[key];
  if(typeof existing==='string' && /^ipfs:\/\//.test(existing)){
    const raw=existing.slice('ipfs://'.length).split('/')[0];
    const verified=await verifyPinnedFolderPath(raw,folder,subset);
    if(verified===existing)return {round,fileCount:subset.length,cid:raw,baseUri:existing,
      verified:true,saved:true,reused:true,message:'Already pinned and re-verified. No new upload or blockchain transaction.'};
    throw new AppError('FOLDER_SAVED_UNVERIFIED',
      'Saved metadata base URI could not be independently revalidated. Do not repin automatically.',409);
  }
  const jwt=process.env.PINATA_JWT;
  if(!jwt)throw new AppError('PINATA_DISABLED','Server IPFS pinning is not configured.',503);
  const response=await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS',{
    method:'POST',
    headers:{Authorization:'Bearer '+jwt},
    body:form,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(45000),
  }).catch(()=>{throw new AppError('PINATA_CONNECTION','Pinata could not be reached.',502);});
  if(!response.ok)throw new AppError('PINATA_REJECTED','Pinata rejected the folder upload.',502);
  const result=await response.json() as {IpfsHash?:unknown};
  if(!validUploadCid(result?.IpfsHash))
    throw new AppError('PINATA_CID','Pinata did not provide a valid directory CID.',502);
  const cid=result.IpfsHash;
  const baseUri=await verifyPinnedFolderPath(cid,folder,subset);
  if(!baseUri)return {
    round,fileCount:subset.length,cid,baseUri:null,verified:false,saved:false,
    message:'IPFS folder upload accepted but gateway validation is pending. Preserve this CID; do not use it for a sale until independently verified.'
  };
  if(existing&&existing!==baseUri)
    throw new AppError('FOLDER_CONFLICT','A different metadata base URI was saved. Do not silently overwrite.',409);
  if(existing!==baseUri){
    await saveErc721Draft('MINT_PAGE',chainId,contract,
      saved[0].id,saved[0].version,{...saved[0].draft,[key]:baseUri},s);
  }
  return {round,fileCount:subset.length,cid,baseUri,verified:true,saved:true,
    message:'The numbered metadata files were verified on IPFS and saved into the Mint Page draft. No Ethereum transaction occurred.'};
}


/** Retry a CID already returned by Pinata without submitting a second upload.
 * This is a user-initiated, Owner/Admin-only verification request. A successful
 * hash check on all 3/27 JSON paths is mandatory before saving to a draft.
 */
export async function verifyGo721UploadedFolder(round:Round,rawCid:string,
  chainId:number,contract:Address,s:Session){
  if(chainId!==1||getAddress(contract)!==GO)
    throw new AppError('FOLDER_SCOPE','Folder checks are only for GO#|O on Ethereum Mainnet.',403);
  if(round!==1&&round!==2)throw new AppError('INVALID_ROUND','Expected presale or public round.',422);
  if(!validUploadCid(rawCid))
    throw new AppError('FOLDER_CID','Enter the exact IPFS directory CID returned by Pinata.',422);
  const {items}=await verifiedGo721MetadataItems(chainId,contract,s);
  const {folder,subset}=pinataFolderUploadForm(round,items);
  const baseUri=await verifyPinnedFolderPath(rawCid,folder,subset);
  if(!baseUri)return {
    round,cid:rawCid,baseUri:null,fileCount:subset.length,verified:false,saved:false,
    message:'The existing CID has not reached a trusted gateway yet. It was NOT re-uploaded; check this same CID again.'
  };
  const saved=await listErc721Drafts('MINT_PAGE',chainId,contract,s) as {
    id:string;version:number;draft:Record<string,unknown>;
  }[];
  if(!Array.isArray(saved)||saved.length!==1)
    throw new AppError('FOLDER_DRAFT_MISSING','One canonical Mint Page draft is required.',409);
  const key=round===1?'presaleMetadataBaseUri':'publicMetadataBaseUri';
  const existing=saved[0].draft[key];
  if(existing&&existing!==baseUri)
    throw new AppError('FOLDER_CONFLICT','An alternate folder URI is already saved. Do not replace it automatically.',409);
  if(existing!==baseUri)
    await saveErc721Draft('MINT_PAGE',chainId,contract,
      saved[0].id,saved[0].version,{...saved[0].draft,[key]:baseUri},s);
  return {round,cid:rawCid,baseUri,fileCount:subset.length,verified:true,saved:true,
    message:'Verified existing CID and saved its indexed folder URI without another upload or Ethereum transaction.'};
}
