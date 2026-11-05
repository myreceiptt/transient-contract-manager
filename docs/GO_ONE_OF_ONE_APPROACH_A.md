# GO#|O ERC721TL — Approach A implementation design review

**Date:** 4 November 2026  
**Source review:** user-supplied screenshots 1, 2, 3A–3C, 4, 5A–5C, 6A–6B, 7–10.  
**Base:** PR #27 `feat/erc721-three-contract-phase0-20261102` (no verified ERC721 signing adapter).

## Decision

Build the full six-area GO#|O experience **now** while keeping all ERC721TL, TLStacks721 and TLAuctionHouse transactions disabled. The existing ERC1155TL GO1 functionality and canonical one-Token-ID–one-mint-page policy are **not** copied into ERC721.

| Screenshot | Finding | Approach A implementation |
| --- | --- | --- |
| 1 vs 2 Overview | GO1 shows featured artwork and actionable metrics; GO#|O displayed mostly raw on-chain facts and readiness. | Preserve raw facts in an identity/diagnostics section; add readable operational metrics and a clear transaction lock state. **Never infer holder counts or active auctions from supply.** |
| 3A vs 4 catalogue | GO1 has image-led ERC1155 cards and 10 existing Token IDs; GO#|O has a 12-ID, non-indexed ERC721 inspector that reports zero current supply. | Retain bounded chain inspection and isolated metadata pin + dry-run; label page **Artworks & Tokens** and distinguish drafts from minted tokens. |
| 3B vs 4 batch | GO1 creates batches of edition Token IDs; ERC721 is unique and not edition supply. | Do not reuse GO1's batch unit quantity or token-type counter. Future ERC721 batch workflows require separate verified adapter. |
| 3C vs 4 token detail | GO1 supports holder balances, royalties and URI changes on edition IDs; ERC721 needs a unique current owner. | Keep ownerOf/tokenURI inspection; metadata draft does not imply Token ID creation or transfer. |
| 5A vs 6A Mint Pages | GO1 has 10 distinct Token ID mint-page cards; GO#|O only reports TLStacks721 candidate protocol status. | Add a collection-wide primary mint editor, internal preview and review. **Session-only**, not public URL, not persisted and not deployed. Live Stacks721 observation remains independent. |
| 5B vs 6A mint editor | GO1 has page title, slug, images, price, allowance, preview and publication actions. | Use comparable layout, but avoid pretending GO1 sale parameters or on-chain ABI apply unchanged to ERC721TL. New fields are draft design inputs only. |
| 5C vs 6A closeDrop | GO1 displays a simulated closeDrop transaction review. | Reserve the review pattern for future verified ERC721 actions. No closeDrop, configured sale or approvals are enabled today. |
| 6B Auctions | GO#|O currently only reads individual AuctionHouse protocol or listing status by Token ID. | Add an auction proposal studio with ownerOf-gated local review. The seller must actually own the NFT; ADMIN_ROLE is not seller authorization. No approve, escrow, bid, buy now, cancel or settle operations. |
| 7 vs 8 Settings | GO1 has six navigable settings cards; GO#|O one facts table. | Add six ERC721-specific Settings sections; all on-chain admin writes disabled, royalty fields unverified if no reader. |
| 9 vs 10 Transactions | GO1 shows stored confirmed/prepared/expired reviews; GO#|O has only a generic placeholder. | Add a separate tabbed empty ledger and explicit **not indexed** status. Never treat missing index data as no on-chain activity. |

## Source of authority

- ERC721TL creator: `inspect_erc721` / `scan_erc721`, read-only compatibility; neither approves signing.
- Primary sale: `read_erc721_market` TLStacks721 observations; candidate deployment is not a trusted execution endpoint.
- Secondary sale: `read_erc721_market` AuctionHouse observations; ownerOf checked through bounded scan for **local draft review only**.
- GO1 ERC1155TL: existing independently verified adapter remains untouched.

## State classification

1. **On-chain confirmed observation:** chain, block, implementation, token owner, tokenURI, drop phase or auction listing with a verified read. This is a point-in-time snapshot, not a signing permit.
2. **Local session draft:** input in UI used for visual preview or a typed auction proposal. It is neither a persisted record nor a published page.
3. **Future persisted app record:** not implemented in this branch for ERC721. Requires separate data design, authorization, optimistic concurrency and migration approval.
4. **Future on-chain transaction:** not implemented. Requires independently pinned creator/stacks/auction runtimes, permission checks, simulation, wallet review, receipt validation, replacement/finality handling and action-scoped activation.

## Security invariants

- Keep `MAINNET_WRITES_ENABLED=false`, and do not add any ERC721 write API or executable calldata to this branch.
- Never grant auction-listing rights solely from collection ADMIN_ROLE.
- ERC721 owner and seller can change between read and later execution; recheck at execution.
- No automatic ERC721 approval, escrow, payment, mint, bid, cancel or settlement.
- No GO1 database or persistent Mint Page records are reused for ERC721.
- No production deploy, mainnet operation, on-chain role modification, DNS or Supabase schema mutation as part of this redesign.

## Acceptance and remaining gates

**Implementable within current non-transaction scope:** full six-area navigation; responsive design; draft and review UIs; bounded reads using existing endpoints; no unsafe action controls; unit/build/CI and browser visual acceptance.

**Still outstanding:** durable authorized ERC721 draft persistence, complete collection token and Transfer indexer, live independent royalties/minter queries, exact runtime allowlist on all target networks, real collector-facing TLStacks721 page, seller listing and escrow transaction adapter, and accurate ERC721 receipt history.

A passing CI test does **not** prove hosted wallet behavior. A browser / mobile and SIWE / persistence acceptance pass is still required before merging or releasing.


## 5 November 2026 — implementation continuation (staged)

- Added a separate ERC721 RLS-protected draft storage migration `20261105110000_erc721_workspace_drafts.sql`. It is **in source only** and has not been applied to a remote database.
- Typed, SIWE+CSRF authenticated CRUD endpoints for ARTWORK, MINT_PAGE, and AUCTION drafts, with optimistic revision numbers. All collection draft operations check the user's current on-chain owner/admin role. Auction creation and update independently check current `ownerOf(tokenId)` against the session wallet. Auction drafts are private per seller; creator ADMIN_ROLE is not seller authority.
- Mint Page draft has identity `collection`, never a fabricated per-Token-ID sale. A database uniqueness constraint prevents duplicate canonical collection-drop drafts.
- UI load/save/archive controls are provided for artwork, Mint Page, and seller auction drafts, but **disabled** until `ERC721_DRAFTS_ENABLED=true` after migration acceptance. Local editor previews remain available.
- Added a bounded Ethereum read-only ERC721 Transfer event reader (1,000 blocks per manual request, at most 100 displayed events, explicit truncation warning). This does **not** reconstruct complete collection history, full owner index, royalties, payments, or auction settlements.
- No changes to the GO1 ERC1155TL tables, migration history, admin transaction adapter, existing public mint pages, or token inventory code.

### Preconditions to activate private draft persistence

1. Review the isolated schema and PostgreSQL permissions and compare the exact pending SQL with current database migration history.
2. Approve applying **only** migration `20261105110000_erc721_workspace_drafts.sql` to the isolated Preview Supabase project, with verified rollback/backup plan and RLS postchecks. Do not apply it to Production without a separate decision.
3. After successful migration verification, set `ERC721_DRAFTS_ENABLED=true` for Preview only; verify wallet admin versus non-admin and seller ownership restrictions with authenticated API tests.
4. Keep `MAINNET_WRITES_ENABLED=false` for Preview. Public mint transactions, ERC721 direct mint, approvals, bids, and AuctionHouse escrow/settlement remain blocked.

### Known outstanding capabilities

A full authenticated collector-facing TLStacks721 page is not implemented. On-chain royalty reads require version-pinned ABI and read semantics. Event history remains a bounded scan rather than a durable block index. Draft revision history is retained server-side; a read-only revision viewer is future work. Preview real-wallet/browser acceptance should be rerun after persistence is enabled.
