/**
 * User-facing protocol support plan. This is a DOCUMENTATION / PREPARATION registry:
 * it must never authorize on-chain reads or writes. Only findAdapter() and
 * verifyCreator()/verifyStacks() are authoritative for live compatibility.
 *
 * Adding a candidate here cannot enable 721, 7160 or auction transactions.
 */
export type SupportLevel='verified-live-adapter'|'research-only';
export type ProtocolFamily='creator'|'sale'|'auction';

export const protocolSupport = [
  {
    key:'erc1155tl-4.1.2',
    name:'ERC1155TL',
    version:'4.1.2',
    family:'creator',
    level:'verified-live-adapter',
    capability:'ERC-1155 token types and editions: create, batch, mint/airdrop, metadata, royalty, balances',
  },
  {
    key:'tlstacks1155-2.3.1',
    name:'TLStacks1155',
    version:'2.3.1',
    family:'sale',
    level:'verified-live-adapter',
    capability:'Fixed-price ERC-1155 drops: schedule, presale, publish, close and collector mint',
  },
  {
    key:'erc721tl-4.1.2',
    name:'ERC721TL',
    version:'4.1.2',
    family:'creator',
    level:'research-only',
    capability:'ERC-721 unique Token IDs, mint one-of-one artworks and read per-token ownership',
  },
  {
    key:'tlstacks721',
    name:'TLStacks721',
    version:'not pinned',
    family:'sale',
    level:'research-only',
    capability:'Minting new ERC-721 tokens via Stacks (separate from auction)',
  },
  {
    key:'tlauctionhouse',
    name:'TLAuctionHouse',
    version:'2.6.1 candidate',
    family:'auction',
    level:'research-only',
    capability:'Escrowed minted ERC-721 listings: scheduled/reserve auction, reserve + buy now, buy now',
  },
  {
    key:'erc7160tl',
    name:'ERC7160TL',
    version:'not pinned',
    family:'creator',
    level:'research-only',
    capability:'ERC-721 NFT with multiple selectable metadata entries',
  },
  {
    key:'erc7160tleditions',
    name:'ERC7160TLEditions',
    version:'not pinned',
    family:'creator',
    level:'research-only',
    capability:'ERC-721 editions with a shared multi-metadata collection',
  },
  {
    key:'trace',
    name:'TRACE',
    version:'not pinned',
    family:'creator',
    level:'research-only',
    capability:'Specialized creator contract, not handled by this app',
  },
] as const satisfies ReadonlyArray<{
  key:string;name:string;version:string;family:ProtocolFamily;
  level:SupportLevel;capability:string;
}>;

/** Official deployment index candidate, NOT a trusted execution target.
 * Never add to a signing or allowlist module without runtime/source verification.
 */
export const auctionResearch = Object.freeze({
  nftStandard:'ERC-721',
  creatorSourceCommit:'a2ef226db2e6df9d07e002c7c11ddab17c1df3f5',
  creatorVersion:'4.1.2',
  auctionSourceRepository:'Transient-Labs/tl-stacks',
  auctionSourceVersion:'2.6.1',
  auctionCandidate:'0x6f66b95a0c512f3497fb46660e0bc3b94b989f8d',
  verification:'NOT VERIFIED FOR EXECUTION',
  listingTypes:[
    'SCHEDULED_AUCTION',
    'RESERVE_AUCTION',
    'RESERVE_AUCTION_PLUS_BUY_NOW',
    'BUY_NOW',
  ],
  risk:'Listing transfers an already-minted ERC-721 into AuctionHouse escrow. Only the actual token owner can list; an admin role by itself is insufficient. Delist before bids only. Settlement is a separate operation.',
} as const);

export const LIVE_SUPPORTED_NETWORK_IDS=[1,4663,8453,360] as const;
