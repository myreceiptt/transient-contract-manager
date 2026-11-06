import {createHash} from 'node:crypto';
import {getAddress,type Address} from 'viem';
import {AppError} from '../lib/domain';
import {GO_APPROVED_TERMS} from '../lib/erc721-sale-terms';
import type {Session} from './auth';
import {listErc721Drafts} from './erc721-drafts';
import {verifiedGo721MetadataItems} from './erc721-metadata-archive';
import {fetchMediaWithFallback} from './media';
import {validUploadCid} from './upload-cid';

type Round=1|2;
export type NumberedMetadata={round:Round;file:string;json:Buffer};
export type ReadMetadata=(uri:string,maxBytes:number)=>Promise<Buffer>;
/** Checks every numbered file, not just first/last gateway samples. The
 * caller must supply canonical source JSON, verified against the individual
 * original pinned CID and creator-review SHA-256 by the archive service.
 * This helper cannot publish folders or touch the blockchain.
 */
export async function verifyAllGo721Paths(
  baseUri:string,round:Round,allItems:readonly NumberedMetadata[],
  fetcher:ReadMetadata=fetchMediaWithFallback,
){
  const expected=round===1?3:round===2?27:0;
  if(!expected)throw new AppError('INVALID_ROUND','Unsupported sale round.',422);
  const m=baseUri.match(/^ipfs:\/\/([^/]+)(?:\/([a-z0-9-]+))?$/);
  if(!m||!validUploadCid(m[1]))
    throw new AppError('FOLDER_URI','Expected a valid, saved IPFS folder base URI.',422);
  const subset=allItems.filter(x=>x.round===round)
    .slice().sort((a,b)=>Number(a.file)-Number(b.file));
  if(subset.length!==expected)
    throw new AppError('FOLDER_COUNT','The expected 3 or 27 source JSON files are missing.',409);
  for(let i=0;i<subset.length;i++){
    if(subset[i].file!==String(i)||subset[i].json.length<2||subset[i].json.length>24576)
      throw new AppError('FOLDER_ORDER','The original JSON sequence is incomplete.',409);
  }
  let cursor=0,failed:Error|null=null;
  // Six bounded workers avoid dozens of simultaneous remote gateway requests
  // and keep the server within a small deterministic resource budget.
  const workers=Array.from({length:Math.min(6,expected)},async()=>{
    while(cursor<subset.length&&!failed){
      const index=cursor++;
      const item=subset[index];
      try{
        const uri=baseUri+'/'+item.file;
        const received=await fetcher(uri,24576);
        const originalHash=createHash('sha256').update(item.json).digest('hex');
        const gatewayHash=createHash('sha256').update(received).digest('hex');
        if(originalHash!==gatewayHash)
          throw new AppError('FOLDER_CONTENT_MISMATCH',
            'Public IPFS file /'+item.file+' differs from approved original metadata.',409);
      }catch(error){
        failed=error instanceof Error?error:new Error('IPFS gateway verification failed');
      }
    }
  });
  await Promise.all(workers);
  if(failed)throw failed;
  const fingerprint=createHash('sha256');
  for(const item of subset){
    fingerprint.update(item.file+'\0');
    fingerprint.update(createHash('sha256').update(item.json).digest());
  }
  return {round,baseUri,verifiedPaths:expected,expectedPaths:expected,
    sourceSha256:fingerprint.digest('hex'),
    verifiedAt:new Date().toISOString(),allGatewayBytesMatched:true,
    ethereumTransactionPerformed:false} as const;
}
/** Private Owner/Admin request, read-only. Never trusts a browser-supplied URI:
 * always reads the canonical saved Mint Page folder base URI.
 */
export async function auditSavedGo721Folder(round:Round,chainId:number,
  contract:Address,s:Session){
  if(chainId!==1||getAddress(contract).toLowerCase()!==GO_APPROVED_TERMS.collection.toLowerCase())
    throw new AppError('FOLDER_SCOPE','Only GO#|O on Ethereum Mainnet is supported.',403);
  const {items}=await verifiedGo721MetadataItems(chainId,contract,s);
  const saved=await listErc721Drafts('MINT_PAGE',chainId,contract,s) as Array<{
    id:string;draft:Record<string,unknown>;
  }>;
  if(!Array.isArray(saved)||saved.length!==1)
    throw new AppError('FOLDER_DRAFT_MISSING','The canonical Mint Page draft is required.',409);
  const key=round===1?'presaleMetadataBaseUri':round===2?'publicMetadataBaseUri':'';
  if(!key)throw new AppError('INVALID_ROUND','Only two sale rounds are permitted.',422);
  const baseUri=saved[0].draft[key];
  if(typeof baseUri!=='string'||!baseUri)
    throw new AppError('FOLDER_NOT_PINNED','First pin the numbered metadata folder for this round.',409);
  return verifyAllGo721Paths(baseUri,round,items);
}
