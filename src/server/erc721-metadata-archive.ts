import {type Address} from 'viem';
import {AppError} from '../lib/domain';
import {listErc721Drafts} from './erc721-drafts';
import {type Session} from './auth';
import {prepareSequence} from '../lib/erc721-sale-sequence';
import {verifyGo721ArtworkSource} from './go721-artwork-source';
import {buildGo721MetadataZip} from '../lib/erc721-metadata-zip';
import {GO_APPROVED_TERMS} from '../lib/erc721-sale-terms';
const GO721_COLLECTION=GO_APPROVED_TERMS.collection;

/**
 * Each of the 30 immutable source CIDs is verified against the live saved draft.
 * Earlier creator-mint reviews are NOT needed: GO#|O direct creator mint review
 * is intentionally blocked to preserve mint order, and a legitimate later edit
 * may have a different metadata CID.
 *
 * Only the existing owner/admin-authorized draft-list endpoint invokes this.
 * This creates bytes for the archive but never publishes or signs anything.
 */
export async function verifiedGo721MetadataItems(chainId:number,contract:Address,s:Session){
  if(chainId!==1||contract.toLowerCase()!==GO721_COLLECTION.toLowerCase())
    throw new AppError('ARCHIVE_SCOPE','Only the approved GO#|O collection can export metadata.',403);
  const raw=await listErc721Drafts('ARTWORK',chainId,contract,s);
  if(!Array.isArray(raw))throw new AppError('ARCHIVE_DRAFTS','Draft storage is unavailable.',503);
  const sequence=prepareSequence(raw);
  const byId=new Map(raw.map(row=>[row.id,row]));
  const items: Array<{round:1|2;file:string;json:Buffer}> = new Array(sequence.length);
  let cursor=0;
  // Bounded concurrency protects gateways; no creator mint review is created.
  const workers=Array.from({length:6},async()=>{
    while(cursor<sequence.length){
      const i=cursor++;
      const a=sequence[i],row=byId.get(a.draftId);
      if(!row)throw new AppError('ARCHIVE_DRAFT_MISSING','Artwork position '+a.position+' is missing.',409);
      const draft=row.draft;
      const checked=await verifyGo721ArtworkSource({
        title:String(draft.title??''),description:String(draft.description??''),
        image:String(draft.image??''),externalUrl:String(draft.externalUrl??''),
        metadataUri:a.sourceMetadataUri,
      });
      items[i]={round:a.round,file:a.folderFile,json:checked.json};
    }
  });
  await Promise.all(workers);
  return {items,sequence};
}

export async function downloadGo721MetadataArchive(chainId:number,contract:Address,s:Session){
  const {items}=await verifiedGo721MetadataItems(chainId,contract,s);
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
