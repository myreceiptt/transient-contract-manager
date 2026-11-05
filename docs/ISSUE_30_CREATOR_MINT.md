# Issue #30 — integrated creator-mint release

Scope: make GO#|O ERC721TL v4.1.2 ready for an explicitly approved creator mint while preserving GO1. Production acceptance target: https://transient.endhonesa.com. No mainnet transaction, role approval, ETH/NFT transfer, database migration or signing activation is performed by this release.

## Baseline and one execution plan

1. Inspect latest main, Issue #30, Production and Supabase before editing. Baseline main/Production: `079bfc4efddd9256d6d5c1fd55aa0370b78bbcd7`; active deployment `dpl_F7w2cHFbctrJsq4NwYXTtm7rzTY2`. Accept screenshots 11–15 as completed evidence.
2. Reproduce the exact creator runtime; add isolated review, approval, preflight, wallet and receipt handling. Preserve ERC1155 adapters and all existing database objects.
3. Exercise real local contracts and the deployed collection on an Anvil mainnet fork, plus GO1 regression, unit/security/migration checks, build and browser layouts.
4. Release one integrated PR only after CI passes. Keep ERC721 signing locked; inspect Production and consolidate remaining human-only acceptance.

## Implemented

- Reproducible Solidity standard input, ABI and artifact for ERC721TL 4.1.2. Source commit `a2ef226db2e6df9d07e002c7c11ddab17c1df3f5`; OpenZeppelin contracts 5.6.1 commit `5fd1781b1454fd1ef8e722282f86f9293cacf256`, upgradeable commit `7bf4727aacdbfaa0f36cbd664654d0c9e1dc52bf`. Settings: solc `0.8.30+commit.73712a01`, optimizer 2,000 runs, Osaka, no CBOR/bytecode metadata, viaIR false.
- Exact canonical EIP-1167 clone and implementation codehash checks. Ethereum implementation `0xea573d90cfd624bed1344a7a7eb44785ae1ad540`, full runtime hash `0x3ef32f426fbb9aadd50d894e5c9a8cfea059f7c02106e692e871508da62b05f4`.
- Creator review checks live owner/ADMIN_ROLE, unlocked supply, no rendering override, EOA recipient, raw JSON SHA-256 CID, available gas balance and no pending nonce gap. Reviews expire after five minutes.
- `ERC721_MINT_APPROVAL` is a separate server-only, fail-closed gate. It binds chain, actor, destination, exact calldata/value and nonce, plus expiry and fee ceiling. GO1's write switch alone cannot enable it. No approval value is configured by this release.
- Fresh preflight repeats authorization, runtime, metadata integrity, balance, nonce and simulation. Network fees cannot exceed either the visible reviewed maximum or approved ceiling.
- Existing `publication_records` storage uses isolated `erc721_creator_mint` records with no Mint Page reference. Actor-scoped history, persisted hashes, recovery, cancellation/repricing and finalized canonical receipt checks are available. No Supabase schema changes.
- Token ID comes from exactly one matching zero-address Transfer event, followed by ownerOf/tokenURI readback at the mint block. Supply counters are never used to guess IDs.
- Independent review UI, wallet acknowledgement and explicit send action. Shared wallet transport rechecks the active account/network and preserves reviewed nonce/gas bounds. Artwork upload/pin/save transitions cannot overwrite an in-flight review.

## Verification evidence

| Boundary | Evidence |
|---|---|
| Source → runtime | `npm run contracts:verify` matches ERC721, GO1 and Stacks1155 hashes |
| Exact contracts → API → database → receipt | Seven lifecycle tests via `npm run test:erc721`; SIWE/CSRF, owner/admin, negative roles, burn/next-ID, persisted recovery, nonce/role/runtime/renderer/metadata changes, cancellation |
| Actual GO#|O state | Same lifecycle suite on Ethereum fork block **26350623**, local chain **31337**; [fork evidence](evidence/issue-30/fork-evidence.json) |
| GO1 regression | [Integration log](evidence/issue-30/go1-regression.txt): creation, batch, mint/airdrop, settings, token Mint Pages, publication, closeDrop, ETH/ERC20/presale, replacements and authorization |
| Security | [Dependency audit](evidence/issue-30/dependency-audit.json): zero vulnerabilities; [database verification](evidence/issue-30/database-verification.txt): RLS, grants, isolation, revisions and rollback |
| Browser UI | [Local review desktop](evidence/issue-30/erc721-review-local-desktop.png), [449 CSS-pixel reflow](evidence/issue-30/erc721-review-local-mobile-facts.png). No horizontal overflow; addresses remain readable. Narrow viewport used browser zoom, not a physical phone. |

Fork evidence contains **local fork transaction hashes**, not Ethereum transactions. Original owner/admin were impersonated only on loopback Anvil; a disposable known signer was granted an admin role only in that fork for genuine SIWE/API tests. Public Anvil fixture accounts' existing delegation code was cleared only on the fork. IPFS transport in these lifecycle tests returns fixed test JSON; the production digest check still executes. Existing real pinned metadata was separately fetched and its CID integrity verified read-only. Local browser fixture media transport was unavailable; its screenshot is evidence of layout and the unavailable-media state, not successful IPFS rendering.

Supabase inspection: 15 public tables have RLS; server RPCs are SECURITY INVOKER and deny anon/authenticated EXECUTE. The informational no-policy advisories reflect the existing service-only design. Production service credentials were neither decrypted nor copied.

## Remaining boundaries

- The first real mainnet mint and its gas expenditure require the user's explicit approval and wallet confirmation. The code is deliberately shipped locked. No actual Ethereum NFT is created during acceptance.
- This browser has no authenticated user wallet. Local fixture screenshots and disposable SIWE tests do not establish authenticated Production wallet acceptance. The final human step is connect/sign in with the existing Owner/Admin wallet, review the existing artwork, and approve the exact mint when ready; accepted artwork upload/draft tests need not be repeated.
- TLStacks721 Mint Pages remain collection-wide drafts with no sale publication, collector purchases or protocol role approval. AuctionHouse remains non-executable until a minted token and independent protocol verification exist. Creator minting does not imply sale/auction readiness.
- This first-mint path supports one raw-CID JSON NFT to an EOA, no rendering override. Batch creation, contract recipients, v3.6.0 writes, royalty changes and other ERC721 actions need separate reviewed support.

Release evidence for the exact shipped commit is the integrated PR's successful GitHub Actions run and the final Production verification report. This document does not claim a real-value mainnet acceptance test.
