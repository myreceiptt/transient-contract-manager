import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {AppError,addressSchema,positive,safeUrl} from '../lib/domain';
import {inspectErc721Candidate,scanErc721Candidates} from './erc721-probe';
import {command,listGo721ArtworkRows} from './db';
import {requireSessionChain,type Session} from './auth';
import {verifyGo721ArtworkSource} from './go721-artwork-source';

/** ERC721 app-only editorial drafts. No blockchain calldata, sale execution,
 * approval, escrow, token transfer or public mint publication here.
 * Schema exists in source; remote migration + explicit enablement are separate.
 */
export const erc721DraftKind=z.enum(['ARTWORK','MINT_PAGE','AUCTION']);
export type Erc721DraftKind=z.infer<typeof erc721DraftKind>;
const GO721='0x99b8ae3c16559b80424a45c92dd530d50d970a46';
function isReservedGoArtwork(kind:Erc721DraftKind,chainId:number,contract:string){
  return kind==='ARTWORK'&&chainId===1&&contract.toLowerCase()===GO721;
}

const decimal=z.string().max(50).regex(/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/);
const optDecimal=z.union([z.literal(''),decimal]);
const optAddress=z.union([z.literal(''),addressSchema]);
const duration=z.string().max(10).regex(/^(?:|0|[1-9][0-9]*)$/);
const plain=z.string().max(6000);
const artData=z.object({
  title:z.string().max(160),
  description:plain,
  image:safeUrl,
  externalUrl:safeUrl,
  metadataUri:safeUrl,
  recipient:optAddress,
}).strict();
const mintData=z.object({
  title:z.string().max(160),
  description:plain,
  artwork:safeUrl,
  price:optDecimal,
  currency:z.literal('ETH'),
  payout:optAddress,
  maxPerWallet:duration,
  // Indexed IPFS directory URIs are app-only; never contract configuration.
  presaleMetadataBaseUri:safeUrl.optional(),
  publicMetadataBaseUri:safeUrl.optional(),
  start:z.string().max(35),
  end:z.string().max(35),
}).strict().superRefine((v,ctx)=>{
  if(v.start&&v.end&&Number.isFinite(Date.parse(v.start))&&
      Number.isFinite(Date.parse(v.end))&&Date.parse(v.end)<=Date.parse(v.start))
    ctx.addIssue({code:'custom',path:['end'],message:'End must be after start'});
});
const auctionData=z.object({
  tokenId:positive.refine(v=>BigInt(v)<=100000000n,'Token ID too large'),
  listingType:z.enum(['SCHEDULED_AUCTION','RESERVE_AUCTION','RESERVE_AUCTION_PLUS_BUY_NOW','BUY_NOW']),
  payoutReceiver:optAddress,
  reserveEth:optDecimal,
  buyNowEth:optDecimal,
  durationHours:duration,
}).strict();
export const draftDataSchemas={
  ARTWORK:artData,MINT_PAGE:mintData,AUCTION:auctionData,
};

export function parseErc721Draft(kind:Erc721DraftKind,raw:unknown){
  const result=draftDataSchemas[kind].parse(raw);
  if(Buffer.byteLength(JSON.stringify(result),'utf8')>19000)
    throw new AppError('DRAFT_TOO_LARGE','Draft exceeds size limit.',413);
  return result;
}
function draftStorageEnabled(){
  if(process.env.ERC721_DRAFTS_ENABLED!=='true')
    throw new AppError('DRAFTS_NOT_ENABLED',
      'ERC721 draft persistence is staged but is not enabled in this environment.',503);
}
async function scope(kind:Erc721DraftKind,chainId:number,contract:string,s:Session,action:'list'|'get'|'create'|'save'|'archive',
  data?:unknown){
  requireSessionChain(s,chainId);
  const info=await inspectErc721Candidate(chainId,contract as `0x${string}`,s.wallet as `0x${string}`);
  const admin=info.walletRole==='admin'||info.walletRole==='owner';
  if(kind!=='AUCTION'&&!admin)
    throw new AppError('ADMIN_REQUIRED','Only a verified collection owner/admin can manage collection drafts.',403);
  if(kind==='AUCTION'&&(action==='create'||action==='save')){
    const tokenId=(data as {tokenId?:string}|undefined)?.tokenId;
    if(!tokenId)throw new AppError('TOKEN_REQUIRED','Auction draft requires a Token ID.');
    if(chainId!==1)throw new AppError('AUCTION_CHAIN','Auction preparation currently supports Ethereum Mainnet only.');
    const ownership=await scanErc721Candidates(chainId,contract as `0x${string}`,Number(tokenId),1);
    const nft=ownership.tokens[0];
    if(nft?.status!=='OWNED'||nft.owner?.toLowerCase()!==s.wallet.toLowerCase())
      throw new AppError('SELLER_NOT_OWNER','The connected wallet must currently own this NFT.',403);
  }
  return {allowCollection:admin&&kind!=='AUCTION',actor:s.wallet.toLowerCase()};
}
export async function listErc721Drafts(kind:Erc721DraftKind,chainId:number,contract:string,s:Session){
  draftStorageEnabled();
  const allowed=await scope(kind,chainId,contract,s,'list');
  // The generic storage RPC is capped at 25. GO#|O has 30 canonical artworks.
  // Keep that shared RPC unchanged; read only the approved collection's full,
  // 31-row-bounded index after verified Owner/Admin + SIWE authorization.
  if(kind==='ARTWORK' && chainId===1 &&
     contract.toLowerCase()==='0x99b8ae3c16559b80424a45c92dd530d50d970a46')
    return listGo721ArtworkRows(chainId,contract);
  return command('erc721_draft',{action:'list',kind,chainId,contract:contract.toLowerCase(),...allowed});
}
export async function getErc721Draft(kind:Erc721DraftKind,chainId:number,contract:string,id:string,s:Session){
  draftStorageEnabled();
  const allowed=await scope(kind,chainId,contract,s,'get');
  return command('erc721_draft',{action:'get',kind,chainId,contract:contract.toLowerCase(),id,...allowed});
}
export async function createErc721Draft(kind:Erc721DraftKind,chainId:number,contract:string,raw:unknown,s:Session){
  draftStorageEnabled();
  const data=parseErc721Draft(kind,raw);
  const allowed=await scope(kind,chainId,contract,s,'create',data);
  if(isReservedGoArtwork(kind,chainId,contract))
    throw new AppError('GO721_FIXED_ARTWORK_SET',
      'All 30 original GO#|O artwork drafts already exist. Load and revise an existing artwork; never create a replacement.',409);
  const identity=kind==='MINT_PAGE'?'collection':
    kind==='AUCTION'?(data as {tokenId:string}).tokenId+':'+s.wallet.toLowerCase():randomUUID();
  return command('erc721_draft',{action:'create',kind,chainId,contract:contract.toLowerCase(),identity,data,...allowed});
}
export async function saveErc721Draft(kind:Erc721DraftKind,chainId:number,contract:string,
 id:string,expectedVersion:number,raw:unknown,s:Session){
  draftStorageEnabled();
  const data=parseErc721Draft(kind,raw);
  const allowed=await scope(kind,chainId,contract,s,'save',data);
  if(isReservedGoArtwork(kind,chainId,contract))
    await verifyGo721ArtworkSource(data as z.infer<typeof artData>);
  return command('erc721_draft',{action:'save',kind,chainId,contract:contract.toLowerCase(),
    id,expectedVersion,data,...allowed});
}
export async function archiveErc721Draft(kind:Erc721DraftKind,chainId:number,contract:string,
 id:string,expectedVersion:number,s:Session){
  draftStorageEnabled();
  if(isReservedGoArtwork(kind,chainId,contract))
    throw new AppError('GO721_FIXED_ARTWORK_SET',
      'The original 30 artworks cannot be archived during sale preparation.',409);
  if(kind==='MINT_PAGE')
    throw new AppError('MINT_PAGE_CANONICAL',
      'The one collection-wide primary Mint Page draft has a permanent identity. Edit it instead of archiving.',409);
  const allowed=await scope(kind,chainId,contract,s,'archive');
  return command('erc721_draft',{action:'archive',kind,chainId,contract:contract.toLowerCase(),
    id,expectedVersion,...allowed});
}
export function erc721DraftAvailability(){
  return {enabled:process.env.ERC721_DRAFTS_ENABLED==='true',
    note:process.env.ERC721_DRAFTS_ENABLED==='true'?
      'Server persistence enabled; owner/admin and NFT owner checks apply.' :
      'Drafts remain in the browser session until the isolated SQL migration is verified and persistence explicitly enabled.'};
}
