import {createHash} from 'node:crypto';
import {type Address} from 'viem';
import {AppError} from '../lib/domain';
import {listErc721Drafts} from './erc721-drafts';
import {listRecords} from './db';
import {type Session} from './auth';
import {prepareSequence} from '../lib/erc721-sale-sequence';
import {validatedMetadata} from '../lib/nft-metadata';
import {verifyCreatorMetadata} from './erc721-creator-mint';
import {buildGo721MetadataZip} from '../lib/erc721-metadata-zip';
import {GO_APPROVED_TERMS} from '../lib/erc721-sale-terms';
const GO721_COLLECTION=GO_APPROVED_TERMS.collection;

/**
 * Zero public exposure. Owner/Admin access comes from verified on-chain role in
 * listErc721Drafts(), not an actor supplied by the caller. Source review records
 * must match the pinned CID cryptographically for all 30 artworks; fail closed.
 *
 * This creates a ZIP in memory but NEVER pins, publishes or creates a drop.
 */
export async function downloadGo721MetadataArchive(chainId:number,contract:Address,s:Session){
  if(chainId!==1||contract.toLowerCase()!==GO721_COLLECTION.toLowerCase())
    throw new AppError('ARCHIVE_SCOPE','Only the approved GO#|O collection can export metadata.',403);
  const raw=await listErc721Drafts('ARTWORK',chainId,contract,s);
  if(!Array.isArray(raw))throw new AppError('ARCHIVE_DRAFTS','Draft storage is unavailable.',503);
  const sequence=prepareSequence(raw);
  // Existing history endpoint has a capped page size; repeat until exhausted.
  // These database reads have no write effects and use server-side service-role only.
  const latest=new Map<string,any>();
  let complete=false;
  for(let offset=0;offset<200;offset+=25){
    const rows=await listRecords('history',{chainId,contract,limit:25,offset});
    if(!Array.isArray(rows))throw new AppError('ARCHIVE_HISTORY','Review history unavailable.',503);
    for(const item of rows){
      const p=item?.payload;
      if(p?.kind!=='erc721_creator_mint'||p?.action?.uri===undefined)continue;
      const uri=String(p.action.uri);
      if(!latest.has(uri))latest.set(uri,p.metadata);
    }
    if(rows.length<25){complete=true;break;}
  }
  if(!complete)throw new AppError('ARCHIVE_HISTORY_LIMIT','Review history exceeds bounded scan.',409);
  const items=sequence.map((a)=>{
    const reviewed=latest.get(a.sourceMetadataUri);
    if(!reviewed||typeof reviewed.sha256!=='string'||!reviewed.metadata)
      throw new AppError('ARCHIVE_REVIEW_MISSING','No matching review for artwork position '+a.position,409);
    // parse & reserialize in the same field order as the original Pin Metadata
    const canonical=validatedMetadata(reviewed.metadata);
    const bytes=Buffer.from(canonical.bytes);
    const verified=verifyCreatorMetadata(a.sourceMetadataUri,bytes);
    const actualSha=createHash('sha256').update(bytes).digest('hex');
    if(verified.sha256!==reviewed.sha256||actualSha!==reviewed.sha256||
      verified.metadata.image!==a.imageUri||
      verified.metadata.name!==a.titleAtSnapshot)
      throw new AppError('ARCHIVE_INTEGRITY','Metadata, image or title changed at position '+a.position,409);
    return {round:a.round,file:a.folderFile,json:bytes};
  });
  const built=buildGo721MetadataZip(items);
  return {
    schema:'prof-nota-go721-verified-metadata-folders/v1',
    filename:'GO_ONE_OF_ONE_VERIFIED_METADATA_FOLDERS_3_PLUS_27.zip',
    base64:built.zip.toString('base64'),
    sha256:built.sha256,
    fileCount:built.count,
    positions:built.paths,
    archiveFormat:'ZIP_UNCOMPRESSED',
    pinnedToIpfs:false,configuredOnChain:false,
    notice:'Off-chain, owner-only bundle from existing pinned metadata bytes. Extract both folders, then pin each as an IPFS directory in a separately approved step.',
  };
}
