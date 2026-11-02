# ERC-721 / TLStacks721 / TLAuctionHouse Implementation and Acceptance Plan

**Date:** 2026-11-02
**State:** Phase 0 source inventory done; **Phase A ERC721TL interface-only read-only Compatibility Inspector implemented** in the feature branch. This is not a verified runtime adapter and enables **no blockchain transactions**. Complete exact codehash pinning before advancing creator writes.
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

## Canonical project goal: Transient Lab → Ethereum Mainnet → ENDHONESA manager

**Customer workflow is mainnet-first and owner/admin separated, exactly like ERC1155TL Ganti Oli #1 (GO1).** The collection is deployed externally by its legitimate owner using Transient Lab / The Lab on **Ethereum Mainnet, chain ID 1**. The user's wallet is granted the on-chain **ADMIN_ROLE**, without transferring collection ownership. The user opens the existing deployed collection by address at `transient.endhonesa.com` and manages all **contract-authorized** creation, metadata, sale, and Mint Page operations through the independent ENDHONESA application.

This manager **must not redeploy, recreate, migrate, or take ownership of the customer's ERC721TL creator contract**. Keep the actual owner authoritative. The owner/admin wallet grant is performed through the deployed contract by an authorized wallet, outside this app if role management is not supported; the app must read back `owner()`, `getRoleMembers(ADMIN_ROLE)` and `hasRole(ADMIN_ROLE,user)` before authorizing actions. In pinned ERC721TL v4.1.2, `mint(...)` is `onlyRoleOrOwner(ADMIN_ROLE)`, and `externalMint(...)` requires a separate **APPROVED_MINT_CONTRACT** role. The ability to manage a collection does not imply a right to list NFTs no longer held by the admin.

**Local Anvil or forked-chain fixtures are internal automated regression/simulation tools only. They are not a customer prerequisite and do not require the owner to deploy on Base Sepolia.** The app's production execution target for this release is **Ethereum Mainnet first**. A protected Preview may perform safe mainnet **reads**; actual on-chain writes require verified exact implementation/ABI, correct chain and permissions, explicit signed wallet review, receipt verification, and independently authorized real-value acceptance.

**Compatibility regression captured from owner-provided screenshots (2026-11-03):** Ethereum contract `0xa874efcafb3fc3a17dfbd9f33701fe1a9c2c83ee` returned the generic "does not match expected ERC721TL 4.1.2 public interface", while the separate `0xf3e8ca36a231618953826939309f3344677d6c36` (NYLVIQUE N) reported ERC721TL 4.1.2 and yielded 37 extant NFT records plus owner/metadata observations. **The first contract's actual VERSION has not yet been verified; do not assume 4.1.0/4.1.1.** The strict manager remains unchanged, while a separate `diagnose_erc721` read-only RPC fingerprint now reports VERSION, ERC-165 interface responses, clone implementation address, hash and the exact reason strict inspection cannot proceed. After the first contract is fingerprinted, compare official source, runtime, ABI and creator permissions to decide whether an independently pinned version adapter is appropriate. Never replace a codehash allowlist with a VERSION-only check.

**Current implementation:** ERC721TL inspector accepts Ethereum chain ID 1 for interface-only read-only research. It does **not yet prove runtime compatibility** until its codehash is checked against the pinned official deployment. After the collection owner deploys through The Lab, use its **public** mainnet contract address and tx hash to verify that real contract and owner/admin roles. Keep existing Vercel Production and ERC1155TL fully functional while completing the 721 adapter.

### First real onboarding sequence

1. Owner deploys an **ERC721TL 1 of 1 collection through The Lab on Ethereum Mainnet**. Do not redeploy from this application.
2. Owner adds the user's admin wallet during initialization if The Lab permits it, or performs the owner-only ERC721TL v4.1.2 contract call `setRole(ADMIN_ROLE, [userAdminWallet], true)` after deployment (through an authorized interface). **Only the owner can call `setRole`** in this source version; the admin cannot appoint itself. Verify the resulting receipt and `hasRole(ADMIN_ROLE, userAdminWallet) === true` on Ethereum Mainnet.
3. The owner/user supplies only the **public collection contract address (chain 1)**, deployed implementation/version, and optionally owner/admin public wallet addresses and transaction hashes. Never transmit private keys, seed phrases or service credentials.
4. Run compatibility read, verify EIP-1167 implementation (if cloned), source-compiled deployed runtime codehash, ERC721 interface, name, symbol, owner, admins and expected `VERSION`. If The Lab deploys a different version, identify and explicitly support it rather than making the owner redeploy to fit an arbitrary pinned version.
5. On successful **exact-runtime verification**, open the same collection-centric Overview / Tokens & Editions / Mint Pages / Collection Settings / Transactions experience, specialized for ERC-721: per-NFT unique owners rather than edition balances.
6. Test read-only ownership first; then run individual creator/admin mint, official TLStacks721 collection-wide primary sale and separate owner-driven TLAuctionHouse auction under explicit real-value wallet confirmation. Every Ethereum transaction costs real gas and may move ETH/NFT. Never automatically submit.

**No new deploy on a testnet is necessary for the user.** Internal contract tests may use a local chain to avoid risking mainnet ETH while validating source-level behavior.

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

1. **Target network is already chosen: Ethereum Mainnet (chain ID 1)**. We can run local/forked contract simulations internally, but the user does not need a Base Sepolia deployment. Other chains are not prerequisites or enabled by implication.
2. **ERC721TL collection**: the owner will deploy through Transient Lab on Ethereum mainnet and give the user ADMIN_ROLE. **Once deployed**, provide the public collection address, owner/admin public wallet addresses (if helpful), deployment and admin-grant transaction hashes. There may be **no NFT Token ID until creator/admin mints**; do not require one for initial compatibility verification.
3. **Roles**: legitimate collection **owner/deployer wallet** distinct from the user's **authorized ADMIN_ROLE wallet**, plus buyer and bidder/secondary seller wallets. **Public addresses only** may be shared. Owner need not hand over credentials; only the user signs admin operations from their own wallet after on-chain grant.
4. **Sample creative assets**: 1-3 original/authorized test images + descriptions; for a 100-NFT primary mint scenario, provide a metadata directory containing 100 unique entries or permit generated original placeholder test artwork.
5. **Sale preferences**: choose low-risk explicit Ethereum mainnet prices, buy-now/reserve, auction duration, payout wallet and royalty rate with the real owner before signing. Use illustrative numbers only in local simulations; never prefill irreversible mainnet purchases from dummy assumptions.
6. **Wallet gas**: no gas for docs, read-only checks, unit tests or local simulations. The owner pays Ethereum gas to deploy/grant roles; the user/admin pays Ethereum gas for approved creator actions, and sellers/bidders/collectors may pay gas plus actual ETH prices. Do not transfer any ETH to the assistant. No mainnet transaction is sent without wallet confirmation.

Never provide mnemonic, wallet private key, Pinata JWT, Supabase service key, Vercel token, or raw unrestricted RPC credential in chat. Configure needed credentials only in trusted service dashboards.

## Owner acceptance checklist (to run only after corresponding features are delivered)

These are **future acceptance tests**, not claims that buttons are currently available.

| # | Wallet / role | Acceptance step | Required evidence |
| --- | --- | --- | --- |
| T01 | Owner/admin (Ethereum chain 1) | Open owner-deployed ERC721TL; check owner remains separate from ADMIN_ROLE wallet; inspect 1-of-1 NFTs when minted | Verified mainnet contract runtime/version, owner/admin roles, supply, `ownerOf`, `tokenURI` and observed block |
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
| T13 | Unauthorized | Attempt sale/create/admin action from wrong wallet/network; check unprivileged collector cannot mint while approved admin can | Rejected before unsafe signature; verify `hasRole(ADMIN_ROLE,wallet)` and individual `ownerOf` for auction listing |
| T14 | Existing ERC1155 user | Open existing 1155 collection and Mint Pages | No regression, published links and collector balances unchanged |
| T15 | All roles | Follow transaction recovery after rejection/replacement | Clear error/reconciliation; no duplicate mint or bid |
| T16 | All roles | Test mobile public Auction Page / Mint Page | Correct details, no misleading status or cached owner |

Definition of ready for **Ethereum mainnet**: verified real deployed codehash + role checks + green CI + protected Preview read-only acceptance + explicitly authorized signed mainnet transactions with receipts/finality/ownership and payment readback + no ERC1155TL regressions. A successful local build or empty testnet fixture is never enough.
