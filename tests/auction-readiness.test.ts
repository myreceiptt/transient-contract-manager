import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {protocolSupport,auctionResearch,LIVE_SUPPORTED_NETWORK_IDS} from '../src/lib/protocol-support';
import {oneOfOneAuctionPlanSchema,reviewAuctionProposalLocally} from '../src/lib/auction-planning';
const collection='0x'+'1'.repeat(40);
const seller='0x'+'2'.repeat(40);
const payout='0x'+'3'.repeat(40);
const currency='0x'+'0'.repeat(40);
const good={chainId:1,nftContract:collection,tokenId:'4',seller,payoutReceiver:payout,
  currencyAddress:currency,listingType:'RESERVE_AUCTION',openTime:'1793520000',
  reservePrice:'10000000000000000',duration:'86400',buyNowPrice:'0'};
describe('No unsupported auction operation can be enabled by docs/registry',()=>{
 it('keeps ERC1155 only in the verified adapter allowlist',()=>{
   expect(protocolSupport.filter(x=>x.level==='verified-live-adapter').map(x=>x.name))
     .toEqual(['ERC1155TL','TLStacks1155']);
   expect(protocolSupport.find(x=>x.name==='TLAuctionHouse')?.level).toBe('research-only');
   expect(protocolSupport.find(x=>x.name==='ERC721TL')?.level).toBe('research-only');
   expect(auctionResearch.verification).toBe('NOT VERIFIED FOR EXECUTION');
   expect(LIVE_SUPPORTED_NETWORK_IDS).toEqual([1,4663,8453,360]);
   const adapter=readFileSync('src/lib/adapters.ts','utf8');
   expect(adapter).not.toContain('erc721tl');
   expect(adapter).toContain('erc1155tl-4.1.2-stacks-2.3.1');
   const api=readFileSync('src/app/api/route.ts','utf8');
   expect(api).not.toContain('prepare_auction');
   expect(api).not.toContain('submit_auction_bid');
 });
 it('creates a purely local proposal with explicit auction custody warning',()=>{
   const result=reviewAuctionProposalLocally(good);
   expect(result.signingEnabled).toBe(false);
   expect(result.integrationState).toBe('RESEARCH_ONLY');
   expect(result.warnings.join(' ')).toContain('escrow');
   expect(result.candidateAuctionHouse).toBe(auctionResearch.auctionCandidate);
 });
 it('rejects invalid planning configurations without forming contract calldata',()=>{
   expect(()=>oneOfOneAuctionPlanSchema.parse({...good,chainId:11155111})).toThrow();
   expect(()=>oneOfOneAuctionPlanSchema.parse({...good,listingType:'PRIVATE_SALE'})).toThrow();
   expect(()=>oneOfOneAuctionPlanSchema.parse({...good,duration:'0'})).toThrow();
   expect(()=>oneOfOneAuctionPlanSchema.parse({...good,reservePrice:'0'})).toThrow();
   expect(()=>oneOfOneAuctionPlanSchema.parse({...good,tokenId:'0'})).toThrow();
   expect(()=>oneOfOneAuctionPlanSchema.parse({...good,buyNowPrice:'5'})).toThrow();
   expect(()=>oneOfOneAuctionPlanSchema.parse({...good,seller:collection})).toThrow();
   expect(oneOfOneAuctionPlanSchema.parse({...good,listingType:'BUY_NOW',
      duration:'0',reservePrice:'0',buyNowPrice:'250'}).listingType).toBe('BUY_NOW');
 });
});
