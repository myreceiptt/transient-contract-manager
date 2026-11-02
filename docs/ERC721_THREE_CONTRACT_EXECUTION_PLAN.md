# ERC-721 / TLStacks721 / TLAuctionHouse Implementation and Acceptance Plan

**Date:** 2026-11-02
**State:** Phase 0 verified-source inventory and executable implementation plan. This document alone enables **no blockchain transactions**.
**Project:** Transient Contract Manager by ENDHONESA. Preserve all existing ERC1155TL / TLStacks1155 / Mint Page features and data.

## Verified initial source baselines

| Family | Source baseline | Version under investigation | Contract semantics |
| --- | --- | --- | --- |
| ERC721TL | `Transient-Labs/tl-creator-contracts@a2ef226db2e6df9d07e002c7c11ddab17c1df3f5`, `src/erc-721/ERC721TL.sol` | **4.1.2**, confirmed from pinned source | ERC-721 unique ownership, `mint`, `externalMint`, `tokenURI`, `ownerOf`; creator/ADMIN_ROLE rights |
| TLStacks721 | `Transient-Labs/tl-stacks@de281be1f161a56742dfd7c69344eb5b2fb721c9`, `src/TLStacks721.sol` | **2.3.1**, confirmed from pinned source | **Drop is collection-wide:** `getDrop(nftAddress)` and `configureDrop(nftAddress, drop)`, not per token. The `purchase` mints new ERC-721s and derives metadata URIs from `baseUri` and mint order |
| TLAuctionHouse | `Transient-Labs/tl-stacks`, source commit **to be pinned** before an executable adapter | **2.6.1 candidate**, not yet verified on every network | A separately minted token owned by seller, individually listed by `(nftContract,tokenId)`. `list` escrows ERC-721; `bid`, `delist`, `buyNow`, `settleAuction` have separate execution conditions |

**Upstream mutable main differs:** creator `ERC721TL.sol` presently declares 4.1.0; `TLStacks721.sol` on main declares 2.7.0, while its deployment manifest enumerates 2.3.0, 2.3.1 and 2.4.0. **Never mix main's ABI/source with the pinned runtime**. Select a single verified deployed version of each contract before enabling execution.

- AuctionHouse deployment manifest's 2.6.1 candidate: `0x6f66b95a0c512f3497fb46660e0bc3b94b989f8d`.
- TLStacks721 manifest 2.3.1 candidate: `0x384092784cfaa91efaa77870c04d958e20840242`.
- Both are research-only addresses until chain-specific `eth_getCode`/bytecode hash and VERSION verified; no guarantee of deployment on a selected testnet.
- Running app's live adapter remains `erc1155tl-4.1.2-stacks-2.3.1` only.

## First development environment and sequencing

Use disposable **Anvil local chain** first; verify compatibility on an official **Base Sepolia** test deployment if available, otherwise a specifically deployed local fixture / authorized testnet fixture. Do not assume official code is present on any testnet without checking. Keep the existing Vercel protected Preview and its current production traffic unaffected.

### Phase A — read-only ERC721TL

- [ ] Freeze exact compiler profile, source commit, implementation runtime hashes (direct + canonical EIP-1167 proxy) and ABI; check EIP-165 ERC-721 support and reported version.
- [ ] Read name, symbol, owner, admin roles, metadata, `ownerOf(tokenId)`, `tokenURI(tokenId)`, royalty, effective permissions.
- [ ] Build an ERC-721 inventory via verified Transfer events; support burned tokens and pagination without treating token count as ERC-1155 units.
- [ ] UI: Collection Overview, 1 of 1 token cards, Collection Settings/Collection Profile, role-separated admin and collector views.
- [ ] Negative tests: wrong network, wrong bytecode, 1155 masquerading as 721, nonexistent/burned token, partial index.

### Phase B — Create 1 of 1

- [ ] Extend metadata/image/IPFS studio for unique ERC-721 mint, recipient wallet and optional token royalty.
- [ ] Simulate pinned creator `mint` overload, verify gas/arguments, preserve explicit wallet review and no automatic signatures.
- [ ] Receipt reconciliation and readbacks: `ownerOf` and `tokenURI`; avoid fabricating a Token ID while transaction is pending.
- [ ] Respect creator/admin authorization and token supply lock.
- [ ] Existing ERC-1155 create, batch, royalty, profiles, and Mint Pages regression.

### Phase C — TLStacks721 collection-wide primary mint

- [ ] Freeze exact deployment/runtime (start with pinned v2.3.1 candidate) and `Drop` struct/source.
- [ ] **Different Mint Page identity from 1155:** one primary Mint Page per `chain + collection + sale round` (or explicit canonical per collection with round history), not `chain+collection+tokenId`.
- [ ] Pre-pin per-edition unique metadata; validate `baseUri/<ordinal>` mapping, supply and initialSupply.
- [ ] Verified approved minter role, owner/admin, prices, currency, cap, presale proof, timestamps and sale phases.
- [ ] Prepare/confirm `configureDrop`, public `purchase`, close/reconfigure; verify minted ERC-721 Token IDs, recipients and URI events; don't mistake a 100-token planned drop for 100 already minted tokens.
- [ ] Protect legacy TLStacks1155 Token-ID-scoped Mint Pages and lifecycle.

### Phase D — TLAuctionHouse read-only + wallet owner flows

- [ ] Pin 2.6.1 source, ABI, deployed bytecode and list currency/fee settings chain by chain.
- [ ] Read `ownerOf(tokenId)` and active `getListing`, current/highest bid, next bid, escrow custody, auction time, fees and royalty resolution.
- [ ] **Collector can sell** any compatible ERC-721 they currently own; do not require contract creator/admin role. Creator/admin cannot sell a token owned by somebody else.
- [ ] List with narrow ERC-721 `approve(auctionHouse,tokenId)`, explicit warning that `list()` transfers NFT to escrow; verify owner is AuctionHouse after listing.
- [ ] Public auction page by `chain + collection + tokenId + listing-id`; preserve earlier auction history on relisting. Show seller, provenance, price and block-observed status.
- [ ] Four listing styles if supported by pinned runtime: scheduled auction, reserve, reserve + buy-now, buy-now.
- [ ] Bid with exact native value / ERC-20 allowance, 5% increment and anti-sniping timing as verified; previous bidder refund and changes; never auto-bid.
- [ ] Delist only before a valid bid; settle only after end + qualifying bid; verify NFT owner and money/royalty outcomes.
- [ ] Negative cases: stale ownership, double listing, insufficient approval, wrong payment, auction started/ended, blocked transfers, incorrect chain, sanctions/paused state, griefing/refund failures.

### Phase E — hardening and deployment

- [ ] Reuse current SIWE and transaction intent engine; server revalidates role/ownership and exact codehash for every write.
- [ ] Store immutable audit/transaction history with separate model for ERC-721 auction listing vs 721 primary Mint Page vs 1155 per-token Mint Page.
- [ ] Schema migration (if needed) with RLS, service-only mutation grants, rollback/compatibility verification and local tests before staging changes.
- [ ] Document unsupported runtimes/chain exclusions transparently in Guide; require CI, E2E and protected Vercel Preview acceptance.
- [ ] Production promotion only after reviewed green CI, on-chain verification, and explicit authorization; keep production contract writes policy unchanged until separately approved.

## Information the owner can provide (optional until staged tests)

1. **First target network**: default **Base Sepolia** for wallet testing after disposable local chain. For later production: select Ethereum, Base, Shape or Robinhood explicitly; each needs its own deployed-contract/runtime check.
2. **ERC721TL 1-of-1 collection**: if already owned, provide **public chain ID + creator contract address + known Token ID** (no seed/private key). If none exists, use disposable local fixture and later create a fresh test collection only with explicit user authorization for testnet transaction and gas.
3. **Roles**: a wallet with owner/admin role for test creator actions, a different buyer wallet, and a third bidder/secondary owner wallet; **public addresses only** may be shared. Actual SIWE/approvals/signatures remain in user's wallet.
4. **Sample creative assets**: 1-3 original/authorized test images + descriptions; for a 100-NFT primary mint scenario, provide a metadata directory containing 100 unique entries or permit generated original placeholder test artwork.
5. **Test sale preferences**: small testnet reserve/buy-now amounts, auction duration, payout receiver, royalty rate, and whether ERC-20 payments must be included in first acceptance; defaults can be chosen for local tests.
6. **Wallet gas**: no gas needed for docs, read-only work, unit tests or local simulations; small testnet native token for later signed test transactions. Mainnet funds are neither required nor requested.

Never provide mnemonic, wallet private key, Pinata JWT, Supabase service key, Vercel token, or raw unrestricted RPC credential in chat. Configure needed credentials only in trusted service dashboards.

## Owner acceptance checklist (to run only after corresponding features are delivered)

These are **future acceptance tests**, not claims that buttons are currently available.

| # | Wallet / role | Acceptance step | Required evidence |
| --- | --- | --- | --- |
| T01 | Any | Load ERC721TL collection and its 1-of-1 NFT cards | Correct contract version, owner, supply, `ownerOf`, `tokenURI` |
| T02 | Creator/admin | Create a 1-of-1 NFT with original metadata | Simulated mint → wallet approval → receipt → ownership and IPFS URI |
| T03 | Creator/admin | Create NFT assigned directly to collector wallet | Collector becomes actual `ownerOf`; creator cannot list it |
| T04 | Creator/admin | Configure 100-item collection-wide primary mint on TLStacks721 | Verified baseUri index mapping, supply, fee, sale phase; separate from per-token 1155 page |
| T05 | Buyer A | Purchase 1 NFT via 721 Mint Page | New Token ID, tokenURI, owner, transaction/fee match |
| T06 | Buyer B | Purchase 2 NFTs (within allowance) | Two unique Token IDs, distinct metadata, correct owner |
| T07 | Collector A | Start Scheduled or Reserve auction with owned token | token-specific approval, escrowed `ownerOf`, listing ID |
| T08 | Collector B | Place bid; another wallet raises it | Next minimum bid, funds and prior refund reconciled |
| T09 | Any | Settle after auction ends | NFT ownership transferred and seller proceeds / fee / royalties verified |
| T10 | New owner | Re-list same Token ID in a new auction | New owner authorized; original creator/admin cannot list it |
| T11 | Seller | Create Buy Now and complete purchase | Sale finalized, token transferred, payout and royalty verified |
| T12 | Seller | Delist before bid, attempt delist after bid | First returns NFT; second is blocked |
| T13 | Unauthorized | Attempt sale/create/admin action from wrong wallet/network | Rejected before any unsafe signature |
| T14 | Existing ERC1155 user | Open existing 1155 collection and Mint Pages | No regression, published links and collector balances unchanged |
| T15 | All roles | Follow transaction recovery after rejection/replacement | Clear error/reconciliation; no duplicate mint or bid |
| T16 | All roles | Test mobile public Auction Page / Mint Page | Correct details, no misleading status or cached owner |

Definition of ready: verified codehash + green CI + staging browser acceptance + user-confirmed test transaction results, never merely a successful build.
