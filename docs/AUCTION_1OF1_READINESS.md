# ERC721TL 1 of 1 + TLAuctionHouse integration — readiness specification

**Status:** PREPARATION ONLY. No ERC-721/AuctionHouse management, listing, bidding, buy-now, settlement, escrow or transfers are enabled in the deployed Transient Contract Manager. Do not infer support from this document or from `src/lib/auction-planning.ts`.

**Reviewed on:** 2 November 2026. Official references:
- ERC721TL v4.1.2 source at [pinned creator commit](https://github.com/Transient-Labs/tl-creator-contracts/blob/a2ef226db2e6df9d07e002c7c11ddab17c1df3f5/src/erc-721/ERC721TL.sol) (the creator source baseline already used to verify ERC1155TL v4.1.2).
- [Transient Labs Stacks overview](https://github.com/Transient-Labs/tl-stacks) separates `TLStacks721` (mint) and `TLAuctionHouse` (escrowed sale).
- [TLAuctionHouse v2.6.1 source](https://github.com/Transient-Labs/tl-stacks/blob/main/src/TLAuctionHouse.sol). This source is on a mutable default branch and MUST be pinned to a source commit before implementation.
- [Upstream deployments.json](https://github.com/Transient-Labs/tl-stacks/blob/main/deployments.json) currently identifies `TLAuctionHouse` 2.6.1 deployment candidate `0x6f66b95a0c512f3497fb46660e0bc3b94b989f8d`. Do not add this unverified address to any wallet-execution allowlist yet.

## Non-negotiable distinctions

1. **ERC1155TL editions**: fungible quantities per Token ID; `balanceOf(wallet,id)`, `TransferSingle`/`TransferBatch`; app already supports this.
2. **ERC721TL one-of-one**: unique NFT owner per Token ID; `ownerOf(id)`, `tokenURI(id)` and `Transfer` events. Cannot reuse the existing ERC-1155 inventory or balance logic.
3. **TLStacks721 mint**: an independent drop/creator-minter integration; NOT the auction house. No need to support TLStacks721 as a prerequisite for auctioning an already-minted 1/1.
4. **TLAuctionHouse sale**: only for an already-existing ERC-721 that the seller owns. `list` moves the token from seller to auction-house **escrow**. This is a custodial state transition inside the smart contract, not custody by the app.
5. **The Lab page**: private page data is not available through this app unless a documented authorized API is later provided. An auction listing and the app's own future URL identity are distinct.

## Phase A — verified read-only ERC721TL creator adapter

- Freeze exact official Solidity commit, compiled ABI, compiler optimizer settings, deployed implementation address and runtime Keccak256 for each approved target chain.
- Recognize direct and canonical EIP-1167 clone runtimes. Reject unverified implementation and proxy types, fallback delegates, arbitrary ERC-721s or mismatched versions.
- Read pinned `VERSION`, `supportsInterface(0x80ac58cd)`, `name`, `symbol`, `owner`, admin privileges; for chosen Token IDs read `ownerOf`, `tokenURI`, token royalty state as appropriate.
- Handle missing, burned, or nonexistent Token IDs distinctly. Pagination is based on reliable indexed Transfer events/contract enumeration where supported; do not use the ERC-1155 token-type-count assumption.
- Create a separate typed ERC721 adapter and summary cards; no writes until all read-only tests pass.

## Phase B — ERC721TL mint / 1-of-1 studio

- Display 'Create 1 of 1' for verified ERC721TL collections only, with artwork and metadata pinning separate from the on-chain mint.
- Select a verified recipient (potentially creator), optional token royalty, one-owner semantics, and preview new `mint(address,string)` or approved overload.
- On-chain simulation at recent finalized block, fresh owner/admin role and verified runtime, tx intent with immutable arguments, explicit wallet signature, receipt/finality and token owner/URI readback.
- Never fabricate token IDs, treat a pending intent as confirmed, or assume the source version covers deployed contract variations.

## Phase C — read-only TLAuctionHouse adapter

- Record official auction runtime source commit, compiler/source linkage, exact bytecode hash and deployment code state on every target chain before adding execution address. Verify `VERSION` equals allowed version and chain ID matches.
- Inspect `getListing(nft,id)`, `getNextBid(nft,id)`, `getIfPrimarySale`, royalty calculation, paused state, protocol fee settings and clock from chain, all at coherent block.
- Interpret official public listing formats: `SCHEDULED_AUCTION`, `RESERVE_AUCTION`, `RESERVE_AUCTION_PLUS_BUY_NOW`, `BUY_NOW`. Versions/types not verified are rejected.
- Track official events `ListingConfigured`, `AuctionBid`, `ListingCanceled`, `AuctionSettled`, `BuyNowFulfilled` by chain + NFT contract + Token ID + listing ID. A delisted / settled listing is not necessarily deleted from history; do not reuse unique identity without reconciliation.
- No claim that listings created in The Lab are synced at the level of off-chain page metadata.

## Phase D — auction listing with explicit escrow review

- Verify **actual seller's `ownerOf(tokenId)`**; owner/admin of a creator contract cannot list NFTs held by a different wallet.
- Require seller authorization to NFT, explicit operator approval `approve(auctionHouse,tokenId)` or reviewed operator approval; avoid broad unlimited `setApprovalForAll` where a single-token permission suffices.
- Before `list`, display custody warning and explain seller must own the NFT at execution time. The list transaction calls `transferFrom(msg.sender, auctionHouse,tokenId)` and token owner must become AuctionHouse escrow.
- Validate recipient/payout, payment currency, listing type, time boundaries, reserve, duration, buy-now amount, fees, anti-sniping extension. Verify escrow owner and listing readback after receipt.
- A preparation-only validator exists in `src/lib/auction-planning.ts`; it is not connected to RPC, wallet, API or transactions.

## Phase E — bidding, payment, cancellation and settlement

- Use live `getListing` and `getNextBid`; respect start/ending time, minimum 5% bid progression and late-bid extensions (verify at runtime).
- Native currency bids must match `msg.value`, ERC-20 bids require correct token decimals/allowance; refunds to previous highest bidder must be reconciled from receipts, not guessed from UI.
- `delist` is seller-only and allowed only before a bid. A seller cannot cancel an ongoing auction with a valid highest bid.
- `buyNow` exists for permitted types and is not allowed once an auction has started. Verify escrow token transfer, payout, protocol fees and eligible royalty transfers.
- `settleAuction` can be called by any wallet after the auction's final end and at least one bid; verify actual new `ownerOf`, payout, event and status.
- Handle paused state, stale clocks, RPC/indexer gaps, replaced transactions and EIP-1271/Safe differences. Never automatically re-bid, re-list, or resubmit a failed payout transaction.

## Tests and launch criteria

1. Local disposable chain fixture of official pinned ERC721TL 4.1.2 and TLAuctionHouse version; proof of exact source/runtime.
2. Negative tests: wrong chain, wrong implementation, unapproved wallet, seller not owner, active escrow token, prior bid delist, stale listing ID, time boundaries, invalid currency, underpriced bid, auction already ended, reentrant/paused contract.
3. Positive tests: 1/1 mint and new owner, single NFT approval, escrowed listing, scheduled auction, reserve auction, reserve+buy-now, buy now, ERC-20 approval, refunds, anti-sniping, delist prior to bid, settle after end, net proceeds/royalty/protocol fee.
4. Idempotent receipt confirmation and event/readback; public pages must never display partial event history as complete.
5. Chain-by-chain read-only RPC tests of deployment, fees, paused state and auctions. No real-valued mainnet transactions without separate user authorization for exact chain/contract/value.
6. Review security, source code, SIWE authority and service limits, test Vercel protected Preview first. Enable the auction runtime only after explicit sign-off.

**Guardrail:** Nothing in the preparation registry or schema constitutes an allowlist. The live ERC1155TL + TLStacks1155 code path remains unchanged throughout this phase.
