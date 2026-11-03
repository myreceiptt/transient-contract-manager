# Transient Contract Manager — Creator Guide and Contract Compatibility

Last reviewed: 2 November 2026. This is an independent product operated by ENDHONESA, **not** Transient Labs / The Lab. The in-app [Guide & network status](https://transient.endhonesa.com/guide) is the interactive companion to this handbook.

## 1. Exactly which smart contracts work?

**Supported by the production application's verified allowlist**

| Contract | Version | Supported workflows |
|---|---|---|
| **ERC1155TL** | **4.1.2** | Contract inspection, owner/admin access, NFT Token ID inventory, new Token IDs (including batches), mint/airdrop, metadata URI updates, royalty settings and wallet balance lookups |
| **TLStacks1155** | **2.3.1** | ERC-1155 **fixed-price** drops, scheduled/public windows, presale allowlists, contract-level closeDrop, public Mint Pages and collector minting |

The exact Solidity runtime implementation and Stacks bytecode are checked on each supported chain. For directly deployed creator contracts and canonical EIP-1167 clones, compatibility is determined by verified implementation runtime, not by the name or ABI alone.

**Not supported in the live app yet**

| Contract family | Why it matters | State |
|---|---|---|
| ERC721TL **3.6.0 and 4.1.2 read-only** | Unique ERC-721 Token IDs, 1 of 1 artworks and ownerOf/tokenURI | Read-only inspection available; **transactions not enabled** |
| TLStacks721 | Minting new ERC-721s through a Stacks drop | Planned as a separate integration, **not enabled** |
| TLAuctionHouse **2.6.1 candidate** | Escrowed auctions and Buy Now for existing ERC-721 tokens | Research and typed preparation only, **no listing/bid/settle actions** |
| ERC7160TL | ERC-721 with multiple metadata choices | Unsupported |
| ERC7160TLEditions | ERC-721 editions with a shared multi-metadata pool | Unsupported |
| TRACE | Specialized creator contract | Unsupported |

Upstream creator contract families: [Transient-Labs/tl-creator-contracts](https://github.com/Transient-Labs/tl-creator-contracts). Mint/sale/auction contracts: [Transient-Labs/tl-stacks](https://github.com/Transient-Labs/tl-stacks). **Contract presence in The Lab or official source code does not authorize this app to manage it.** Runtime verification and a supported, tested adapter are required.

Supported target networks for the **ERC1155TL + TLStacks1155** adapter are Ethereum (1), Robinhood Chain (4663), Base (8453), and Shape (360). This is a configured compatibility list, not an assertion of uninterrupted RPC uptime or enabled live writes. Local chain 31337 is restricted to opt-in development.

Pinned creator implementation: `0x079e23352721084561fb241593d16a4e6f548a97`. Pinned TLStacks1155: `0x32953d7ae37b05075b88c34e800ae80c1cb1b794`. Neither address is a user's NFT collection address.

## 2. Enter a collection and authenticate

1. Open **Collections → Open a collection** and select its actual chain.
2. Paste an existing **ERC1155TL or ERC721TL creator collection contract address**, not an owner wallet, shared Stacks deployment or AuctionHouse contract.
3. Select **Open collection**. The server detects ERC-721 versus ERC-1155 using ERC-165 and verifies the relevant version/implementation. **ERC1155TL** opens the existing verified management workspace. **ERC721TL 3.6.0 or 4.1.2** opens its dedicated **read-only** collection workspace; no mint or auction transaction is available until runtime verification is complete.
4. Connect an injected EVM wallet on the same chain. Read-only inspection needs no wallet signature; editing requires the contract owner or an on-chain ADMIN_ROLE wallet.
5. Complete the app's gasless SIWE sign-in when prompted. This is not an approval of a contract transaction. The server rechecks owner/admin authority for changes.
6. Keep enough native network currency for any explicitly signed blockchain operation; IPFS service availability and fees are distinct from gas.

## 3. Understand the collection workspaces

- **Overview:** verified name, symbol, owner/admin, token type count, contract adapter, and the optional **app-managed Collection Profile** visual.
- **Tokens & Editions:** **Where every edition begins.** NFT-card catalogue with **Create Token**, **Create Batch**, and contextual **Manage Token** (metadata, mint/airdrop, royalty, current ownership balance).
- **Mint Pages:** **A home for every edition.** NFT-card catalogue with independent page creation, management, restoration and on-chain `closeDrop` review.
- **Collection Settings:** **The foundation of every edition.** Cards for **Collection Profile**, **Collection Identity**, **Ownership & Access** (read-only), **Collection Royalties**, **Stacks Mint Permission**, and **Advanced On-chain Information**.
- **Transactions:** saved transaction reviews, tx hashes, replacement/cancellation handling and finality confirmation.

The tabs share verified collection identity, but **saving an off-chain document is not the same as signing an on-chain transaction**. ERC721TL uses a separate workspace with **Overview, Tokens & Editions, Mint Pages, Auctions, Collection Settings and Transactions**. Its 1 of 1 inventory is currently read-only: Mint Pages and Auctions explain pending authorizations without enabling signatures. The **Contract Checker** provides two vertically stacked forms: **01 — 1 of 1 Collection (ERC721TL)** and **02 — Editions Collection (ERC1155TL)**.

## 4. Create and manage ERC-1155 token editions

1. Open **Tokens & Editions → Create Token**. Provide name, description, artwork (JPG/PNG/WebP originals up to 100 MiB), optional external URL and NFT traits.
2. Optionally import an existing approved IPFS metadata URI. Upload artwork if necessary, then choose **Pin metadata JSON to IPFS**. This creates an immutable JSON pointer, **not** an NFT.
3. Choose **Prepare new token**. Specify recipient wallets and counts or leave recipients blank to create a Token ID with zero issued editions.
4. Review the exact `createToken` action, chain, recipient quantities, gas, permissions and simulation; only then approve in the wallet and **Check confirmation**.
5. Return to the catalogue and refresh. For multiple tokens choose **Create Batch** instead, pin each metadata JSON, add up to 40 entries to the queue, select recipient / units, prepare, review and sign. The action has a 40-token / 200-recipient maximum.
6. Choose **Manage Token** on an existing NFT card for **Mint / Airdrop**, **Edit metadata URI**, **Token royalty**, holder balance or navigation to Mint Pages. Its Token ID is fixed to the selected card.
7. Use **Back to NFT Editions** to return to the catalogue. Unsaved metadata changes prompt for confirmation before discarding them.

Minting additional units is a creator/admin operation; it does **not** represent a collector sale. An ERC-1155 `totalSupply()` value in this adapter is **Token ID type count**, not the circulating number of units.

## 5. Collection Settings and Collection Profile

1. Open **Collection Settings**. **Collection Identity** lists verified contract facts. **Ownership & Access** shows owner/admin and wallet authority but does not grant or revoke roles.
2. **Collection Royalties** reads the contract's `getDefaultRoyaltyRecipientAndPercentage()` separately from individual token royalties. The managed update requires simulation and wallet review; the ERC1155TL 4.1.2 royalty maximum is 1,000 bps (10%).
3. **Stacks Mint Permission** tells you whether the exact verified TLStacks1155 deployment has minting privileges. If not, an authorized wallet may review the narrow grant for that specific contract; avoid approving arbitrary external contracts.
4. **Collection Profile** is distinct from NFT metadata. Enter description, logo, banner, website and social links. Upload approved artwork or use supported IPFS image URIs, then **Save Collection Profile**. The app writes versioned data with audit history; this does not alter the creator contract.
5. Optionally select **Pin Collection Profile to IPFS** for immutable public JSON, then **Save** again to associate the returned URI with the app profile. **ERC1155TL 4.1.2 does not expose `contractURI()`**; this does not automatically synchronize The Lab or marketplaces.
6. Refresh **Overview** to see a saved profile visual. If another admin saved a newer revision, reload and reconcile rather than overwriting.

## 6. Create a fixed-price ERC-1155 Mint Page

**Every chain + NFT collection + Token ID has one canonical Mint Page identity inside this app.** A subsequently reopened sale round uses that same page. A published page can be archived/restored, and its public slug can be edited without changing the NFT identity. Previous published slugs remain reserved and redirect with HTTP 308.

1. Open **Mint Pages**, inspect the Token ID card, its separate Mint Page and on-chain drop statuses.
2. If another application configured that token's TLStacks1155 drop, even if **Ended**, close the existing configuration **only if you intend to end that sale**. Ended is not Closed; the app checks the on-chain state, not the origin website.
3. For an **Available** token select **Create**; for an existing canonical page select **Manage** or **Restore**. Do not create a duplicate page identity.
4. In **01 Page content**, set title, description, artwork/banner, external link, unique slug.
5. In **02 Sale configuration**, enter payout wallet, allocation (new units to mint), maximum per recipient per round, currency (native or approved ERC-20), price per unit, UTC sale start, public duration and optional presale duration/price/Merkle allowlist.
6. Use **03 Content preview** for desktop/mobile. It does not publish or mint.
7. In **04 Save and publish**, **Save revision**, run **Check sale readiness (read-only)** and optionally **Calculate draft collector quote**. Resolve configuration and permissions errors.
8. Select **Prepare publication**. Verify the wallet, chain, TLStacks1155, beneficiary, price, supply, time, gas and function call. Approve one transaction in the wallet, then **Check confirmation** to verify receipt/finality and on-chain readback.
9. Once published, open `https://transient.endhonesa.com/mint/<slug>` or choose **View Mint Page** (new tab) / **Copy URL** from its token card. A scheduled page can be viewable before its mint window opens.

There are no single-click exact equivalents of The Lab's Limited, Timed and Inclusive Edition labels in this editor. The supported contract path is a fixed-price drop with explicit finite parameters. Velocity/Marathon modes are unsupported.

## 7. Drop management and handoff with The Lab

- **In The Lab → this app:** with appropriate authority, deliberately close an externally configured TLStacks1155 drop if you no longer want it active; confirm on-chain `dropType=0` / NOT_CONFIGURED before creating a first canonical page here. The Lab's private page content is not imported.
- **This app → The Lab:** use **Review closeDrop** on the relevant token; inspect the simulated `closeDrop` and **Prepare closeDrop wallet review**, explicitly confirm in your wallet, run **Check confirmation**, and refresh status.
- **Ended is not Closed.** A sale duration ending or allocation selling out does not by itself call `closeDrop()`. Closing advances `getDropRound`, but **does not burn** NFTs or delete their ownership history.
- A published page's next round stays on the **same identity**. Archiving/restoring affects this app's URL and page visibility, not The Lab's private records.
- **Edit URL** can rename the canonical public slug; previously published URLs redirect. Draft text must still be published to become visible.

**Do not close a sale that still has intended or pending collector purchases.** Check transaction finality and current chain state rather than assuming a UI status is authoritative.

## 8. Collectors, activity and recovery

Collectors open the published Mint Page, connect the correct network, check phase/price/quantity and choose **Review payment & mint**. A presale requires compatible allowance and Merkle proof. Native ETH pays edition price and TLStacks protocol fee (plus gas). For ERC-20 price sales, an ERC-20 approval may be needed and the protocol fee is still paid in native ETH.

Public Mint Pages show **Your Editions** via ERC-1155 `balanceOf`; the **Activity** history distinguishes purchases, mints and transfers; **Collectors** are wallet addresses with balances verified on-chain. During incremental indexing the directory may be partial, and must not claim a full unique collector total. Use **Sync older on-chain history** to advance backfill.

If a wallet confirms but the app still shows PUBLISHING/SUBMITTED, go to **Transactions → Load history → Check confirmation** for the existing hash. If replaced, choose **Verify same action** or **Verify cancellation / changed action**. Do not resubmit automatically.

## 9. 1 of 1 creation and TLAuctionHouse auctions — preparation only

**Mainnet-first deployment workflow:** The collection owner creates an ERC721TL contract
through The Lab on **Ethereum Mainnet (chain ID 1)** and grants another wallet
**ADMIN_ROLE**. The owner retains ownership. The ENDHONESA web app must manage
this **existing** contract as an admin, similar to ERC1155TL GO1. The admin wallet
is verified on-chain and never assumes collection ownership. The owner/admin
may later configure TLStacks721 as a separate **approved minting contract**
for collection-wide primary sales; a collector with `ownerOf(tokenId)` may
later create a TLAuctionHouse listing for the **NFT they actually own**.

A disposable local test chain may validate behavior before risking ETH, but
a Base Sepolia collection deployment is **not a prerequisite**. ERC721TL
transactions cannot be enabled merely because a candidate contract reports
VERSION 3.6.0 or 4.1.2; its bytecode, roles, permissions and sale contracts must be
verified. User-facing mainnet actions require simulation, explicit signatures,
receipts and readback. No secret keys are ever requested.

The universal homepage opens recognized ERC721TL collections in `/manage-721`, and a **read-only ERC721TL Compatibility Inspector** remains available at `/erc721` and within Contract Checker. It checks the official v3.6.0 and v4.1.2 VERSION baselines, ERC-165/ERC-721 interface, and allows bounded 12-Token-ID windows for `ownerOf` and `tokenURI` reads. Source v3.6.0 uses `totalSupply()` as a minted-ID counter (including burns), while v4.1.2 subtracts burned tokens. Both remain **runtime-unverified for transactions**. It deliberately reports **RUNTIME UNVERIFIED** until the exact deployed implementation's codehash is independently pinned. It does not authorize mint, transfer, listing, bidding or settlement.

**None of these actions can yet be performed in this app.** The future ERC-721 track requires its own allowlisted creator adapter and auction runtime.

The official pinned creator source contains **ERC721TL v4.1.2** at commit `a2ef226db2e6df9d07e002c7c11ddab17c1df3f5`. The upstream Stacks deployment manifest identifies a **TLAuctionHouse v2.6.1 candidate** address `0x6f66b95a0c512f3497fb46660e0bc3b94b989f8d`. **Neither is a verified execution target in this app today.**

The auction formats documented by the public TLAuctionHouse source: **Scheduled Auction**, **Reserve Auction**, **Reserve Auction + Buy Now** and **Buy Now**. The seller must *actually own the minted ERC-721*; the `list()` method transfers the NFT into **AuctionHouse escrow**. Merely having creator ADMIN_ROLE does not grant ownership of the token. Cancellation with `delist()` is possible only before there is a bid. Bidding extends time for late bids. After a winning bid and expiry, `settleAuction()` completes the separate asset/payout transfer. Listing, bidding, cancellation, purchase and settlement all require a rigorously verified adapter and transaction receipts.

Before enabling any action, implement exact-runtime checks for creator and AuctionHouse on each target chain; test approved ERC-721 operators, token ownership, escrow, payout, royalties, ERC-20 approvals, protocol fee behavior, reserve/next-bid rules, anti-sniping extension, refunds, cancellation, paused state, finality and settlement through disposable local-chain tests followed by explicitly authorized staged acceptance tests. The app must not reuse the ERC-1155 `balanceOf(owner,tokenId)` / Token ID supply assumptions for ERC-721.

Full technical plan: [1 of 1 Auction Integration Readiness](AUCTION_1OF1_READINESS.md).

## 10. Troubleshooting and safety

- **Unsupported implementation:** only the exact verified ERC1155TL v4.1.2 adapter is accepted by Contract Checker. ERC721TL and auction contracts are not yet supported management targets.
- **Wrong wallet or chain:** use the collection owner/ADMIN_ROLE wallet and correct network; SIWE sign-in is gasless, blockchain approvals are not.
- **Mint Page inaccessible:** verify it was published, not archived, and the transaction receipt is final. A future start date blocks minting, normally not an already published page.
- **Ended but Create unavailable:** TLStacks1155 still has a configured drop. Close only when intentionally retiring that sale and recheck on-chain.
- **New title not visible:** Save revision is private; publish the content revision. Changing slug does not automatically publish other edits.
- **Collection Profile not visible in The Lab:** app-managed collection profiles are not automatically written to The Lab and do not create a native `contractURI()`.
- **Wallet replacement/cancellation:** use the transaction recovery controls, never assume a SUBMITTED status means finality.
- **API and private keys:** never share a seed phrase, signing key or secret credential with the app or support. This application does not need them.

The source of truth for live contract eligibility is **the application's verified adapter + an on-chain read**, not a screenshot, promotional description, or this planning document.
