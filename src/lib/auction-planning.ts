import { z } from 'zod';
import { addressSchema, positive, uint } from './domain';
import { auctionResearch } from './protocol-support';

/**
 * Preparation-only model for an eventual ERC-721 AuctionHouse adapter.
 * This file does not inspect RPC, sign, simulate, construct calldata,
 * generate transaction requests, or authorize an auction. Fail closed
 * until separately pinned runtime hashes and tested adapters exist.
 */
export const auctionListingTypeSchema=z.enum([
  'SCHEDULED_AUCTION',
  'RESERVE_AUCTION',
  'RESERVE_AUCTION_PLUS_BUY_NOW',
  'BUY_NOW',
]);

export const oneOfOneAuctionPlanSchema=z.object({
  chainId:z.union([z.literal(1),z.literal(4663),z.literal(8453),z.literal(360)]),
  nftContract:addressSchema,
  tokenId:positive,
  seller:addressSchema,
  payoutReceiver:addressSchema,
  currencyAddress:addressSchema,
  listingType:auctionListingTypeSchema,
  openTime:uint,
  reservePrice:uint,
  duration:uint,
  buyNowPrice:uint,
}).strict().superRefine((v,ctx)=>{
  const auction=v.listingType!=='BUY_NOW';
  const reserve=v.listingType!=='BUY_NOW';
  const buyNow=v.listingType==='BUY_NOW'||v.listingType==='RESERVE_AUCTION_PLUS_BUY_NOW';
  if(auction && BigInt(v.duration)===0n)
    ctx.addIssue({code:'custom',path:['duration'],message:'Auction duration must be positive'});
  if(reserve && BigInt(v.reservePrice)===0n)
    ctx.addIssue({code:'custom',path:['reservePrice'],message:'Specify a positive reserve for this proposed workflow'});
  if(buyNow && BigInt(v.buyNowPrice)===0n)
    ctx.addIssue({code:'custom',path:['buyNowPrice'],message:'Buy-now amount must be positive'});
  if(!buyNow && BigInt(v.buyNowPrice)!==0n)
    ctx.addIssue({code:'custom',path:['buyNowPrice'],message:'No buy-now price for this listing type'});
  if(!reserve && BigInt(v.reservePrice)!==0n)
    ctx.addIssue({code:'custom',path:['reservePrice'],message:'A Buy Now listing has no auction reserve'});
  if(v.listingType==='BUY_NOW' && BigInt(v.duration)!==0n)
    ctx.addIssue({code:'custom',path:['duration'],message:'A pure Buy Now listing has no auction duration'});
  if(v.nftContract.toLowerCase()===v.seller.toLowerCase())
    ctx.addIssue({code:'custom',path:['seller'],message:'Seller must be a wallet, not the NFT collection contract'});
});
export type OneOfOneAuctionPlan=z.infer<typeof oneOfOneAuctionPlanSchema>;

export function reviewAuctionProposalLocally(raw:unknown){
  const data=oneOfOneAuctionPlanSchema.parse(raw);
  return {
    data,
    integrationState:'RESEARCH_ONLY' as const,
    signingEnabled:false as const,
    candidateAuctionHouse:auctionResearch.auctionCandidate,
    warnings:[
      'The candidate AuctionHouse runtime has NOT been verified on this chain.',
      'Only ownerOf(tokenId) may list: creator admin roles do not imply NFT ownership.',
      'Listing transfers the ERC-721 into AuctionHouse escrow, not a mint or edition sale.',
      'Allowance/approval, contract pause, fees, bid constraints, receipt and readback require a dedicated adapter.',
      'This plan is not an on-chain quote or transaction; no wallet action is available.',
    ],
  };
}
