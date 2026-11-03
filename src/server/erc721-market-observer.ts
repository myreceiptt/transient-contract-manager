import { getAddress,keccak256,parseAbi,type Address } from 'viem';
import { AppError, serializable } from '../lib/domain';
import { client,exactChain } from './chain';
import { inspectErc721Candidate } from './erc721-probe';

/**
 * Read-only protocol observations. Official upstream deployment candidates
 * are not signing allowlists. Listing and drop states are scoped to the
 * creator collection/token, and observed at one Ethereum mainnet block.
 */
export const TLSTACKS721_V231='0x384092784cfaa91efaa77870c04d958e20840242' as Address;
export const TLAUCTIONHOUSE_V261='0x6f66b95a0c512f3497fb46660e0bc3b94b989f8d' as Address;
export const stacks721ReadAbi=parseAbi([
  'function VERSION() view returns (string)',
  'function getDropPhase(address nftAddress) view returns (uint8)',
  'function getDropRound(address nftAddress) view returns (uint256)',
]);
export const auctionReadAbi=parseAbi([
  'function VERSION() view returns (string)',
  'function getListing(address nftAddress,uint256 tokenId) view returns ((uint8 type_,bool zeroProtocolFee,address seller,address payoutReceiver,address currencyAddress,uint256 openTime,uint256 reservePrice,uint256 buyNowPrice,uint256 startTime,uint256 duration,address recipient,address highestBidder,uint256 highestBid,uint256 id))',
  'function getNextBid(address nftAddress,uint256 tokenId) view returns (uint256)',
]);
export const listingNames=[
  'Not configured','Scheduled auction','Reserve auction',
  'Reserve auction + Buy Now','Buy Now','Private sale',
] as const;
export const dropPhaseNames=['Not configured','Scheduled','Presale','Public sale','Ended'] as const;

export async function readErc721MarketStatus(chainId:number,collection:Address,tokenId?:bigint){
  if(chainId!==1)throw new AppError('MARKET_CHAIN_UNSUPPORTED',
    'Read-only sale and auction observations currently support Ethereum Mainnet only');
  if(tokenId!==undefined&&(tokenId<1n||tokenId>1000000000000n))
    throw new AppError('MARKET_TOKEN_ID','Specify a positive existing Token ID in range');
  const c=client(chainId);
  await exactChain(c,chainId);
  const creator=await inspectErc721Candidate(chainId,getAddress(collection));
  const at=BigInt(creator.observedBlock);
  async function observeSale(){
    const address=TLSTACKS721_V231;
    const code=await c.getCode({address,blockNumber:at});
    if(!code||code==='0x')return {status:'NO_CODE',address,version:null,
      message:'No Stacks721 contract code at the proposed official deployment on this chain'};
    const version=await c.readContract({address,abi:stacks721ReadAbi,functionName:'VERSION',blockNumber:at});
    if(version!=='2.3.1')return {status:'VERSION_MISMATCH',address,version,
      message:'Candidate deployment version differs from the pinned 2.3.1 read-only ABI'};
    const [phase,round]=await Promise.all([
      c.readContract({address,abi:stacks721ReadAbi,functionName:'getDropPhase',args:[getAddress(collection)],blockNumber:at}),
      c.readContract({address,abi:stacks721ReadAbi,functionName:'getDropRound',args:[getAddress(collection)],blockNumber:at}),
    ]);
    return {status:'READ_OK',address,version,phase:Number(phase),phaseLabel:dropPhaseNames[Number(phase)]??'Unknown',
      round:String(round),codeHash:keccak256(code),
      scope:'ONE_DROP_PER_COLLECTION',transactionsEnabled:false};
  }
  async function observeAuction(){
    const address=TLAUCTIONHOUSE_V261;
    const code=await c.getCode({address,blockNumber:at});
    if(!code||code==='0x')return {status:'NO_CODE',address,version:null,
      message:'No AuctionHouse code at the proposed official deployment on this chain'};
    const version=await c.readContract({address,abi:auctionReadAbi,functionName:'VERSION',blockNumber:at});
    if(version!=='2.6.1')return {status:'VERSION_MISMATCH',address,version,
      message:'Candidate deployment version differs from the pinned 2.6.1 read-only ABI'};
    const base={status:'READ_OK',address,version,codeHash:keccak256(code),scope:'ONE_LISTING_PER_NFT',
      transactionsEnabled:false};
    if(tokenId===undefined)return {...base,tokenId:null,listing:null,
      message:'Enter an existing Token ID to check its on-chain listing'};
    // The official getListing() result is a 14-field struct. No default
    // empty listing may be described as an active auction.
    const listing=await c.readContract({address,abi:auctionReadAbi,
      functionName:'getListing',args:[getAddress(collection),tokenId],blockNumber:at});
    const type=Number(listing.type_);
    if(type===0)return {...base,tokenId:String(tokenId),listing:{configured:false,type:0},
      message:'No AuctionHouse listing configured for this Token ID'};
    const nextBid=await c.readContract({address,abi:auctionReadAbi,
      functionName:'getNextBid',args:[getAddress(collection),tokenId],blockNumber:at});
    return {...base,tokenId:String(tokenId),listing:{
      configured:true,type,typeLabel:listingNames[type]??'Unknown type',
      seller:listing.seller,payoutReceiver:listing.payoutReceiver,
      currencyAddress:listing.currencyAddress,openTime:String(listing.openTime),
      reservePrice:String(listing.reservePrice),buyNowPrice:String(listing.buyNowPrice),
      startTime:String(listing.startTime),duration:String(listing.duration),
      highestBidder:listing.highestBidder,highestBid:String(listing.highestBid),
      nextBid:String(nextBid),recipient:listing.recipient,id:String(listing.id),
    }};
  }
  const [sale,auction]=await Promise.allSettled([observeSale(),observeAuction()]);
  const result=(v:PromiseSettledResult<any>,name:string)=>v.status==='fulfilled'?v.value:{
    status:'READ_FAILED',message:name+' on-chain read failed; no assumption about live sale or custody is safe',
    transactionsEnabled:false};
  return serializable({chainId,collection:getAddress(collection),observedBlock:creator.observedBlock,
    creatorVersion:creator.version,creatorRuntimeVerified:false,
    sale:result(sale,'TLStacks721'),auction:result(auction,'TLAuctionHouse'),
    transactionSigningEnabled:false,
    notice:'Contract versions, listing states, protocol address and code hashes are observations only. No sale, bid, escrow or settlement transaction is enabled.'});
}
