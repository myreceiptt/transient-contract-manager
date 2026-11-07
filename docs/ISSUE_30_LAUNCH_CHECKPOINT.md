# Issue #30 — GO#|O launch checkpoint, 7 November 2026

This checkpoint preserves the interrupted implementation. It is NOT Production acceptance and does NOT authorize Mainnet transactions or checkout.

## Baseline and preserved work

- Repository: `myreceiptt/transient-contract-manager`.
- Base main: `86baa015a18958b2d9b78d25a014094975e93630` (PR #43).
- Dedicated branch: `feat/issue-30-go721-launch`.
- At resume, this branch had no local commits ahead of main. All launch changes were uncommitted; none were reset or replaced.
- Prior local branches remain intact: creator implementation `cb15395` and readiness-copy `b187163`. Their corresponding changes were already released via PR #31 / #32; they are not being replayed.
- The automatically generated Next.js `AGENTS.md` remains an untracked workspace instruction file, excluded from the application commit.
- The existing integration-results evidence was updated by the successful GO1 regression run and is preserved.

## Implemented in this checkpoint

1. Reproducible TLStacks721 v2.3.1 source, ABI and bytecode; official source commit `de281be1f161a56742dfd7c69344eb5b2fb721c9`. Compiler `0.8.22`, optimizer 20,000, Paris, full IPFS metadata. Hash `0xd63c5a1f574a2c03b17985a72615c25f51362f38e8369cb75ad0c9232fdbc9ce` matches the deployed runtime.
2. The compiler also checks ERC721TL `_counter` / `_burnCounter` storage slots 0 / 1. Zero circulating supply is never used as proof of unminted history.
3. Read-only history audit: deployment block 26,332,151, no code in the preceding block; no Transfer mint/burn events through finalized block 26,358,857. Evidence includes block hashes.
4. Canonical saved draft v10 and the two Owner-audited folder identities are checked without reuploading, repinning or repeating the metadata audit.
5. Isolated SIWE/CSRF-protected review, preflight, submission attachment, finality confirmation, recovery and cancellation for Owner minter permission, Owner/Admin drop configuration and collector purchase. Existing publication records are reused; no database migration or remote data changes.
6. Mainnet admin approval binds the exact sender, destination, calldata, value, nonce, expiry and gas ceiling. Checkout requires a separate campaign/round approval with fee and quantity limits. Both approval variables are absent from Production and remain unset.
7. Exact first-round terms: three allowlisted NFTs at zero artwork price, 10 November 2026 10:10 WIB, proposed 24-hour presale window, no automatic public phase. Second-round review requires three finalized matching protocol purchases and mints; it configures 27 NFTs at 0.025 ETH and a 10-NFT recipient cap.
8. Public Mint Page, quote/eligibility/payment separation, wallet transaction review, receipt and actor-owned recovery ledger. Owner/Admin launch control and guide updates. GO#|O direct creator minting is reserved to protect the launch order #1–#30.
9. Partial-fill behavior is disclosed and receipt quantities are authoritative. The fork test proves a 10-NFT review capped to seven at mining and verifies the excess ETH refund by wallet balance excluding gas.

## Completed verification

Evidence is in `docs/evidence/issue-30-launch/`.

- 252 unit tests across 42 files passed.
- TypeScript passed; a focused resume check is recorded separately.
- All four contract runtime reproductions passed (ERC721TL, TLStacks721, ERC1155TL, TLStacks1155).
- Nine real Mainnet-fork application lifecycle tests passed on loopback chain 31337: exact runtime/counters, SIWE/CSRF/chain/role authorization, grant, expiry/nonce/role/CID changes, same-nonce cancellation, presale setup, allowlist and burned-history rejection, 3+27 sequential minting, public setup, forged receipt rejection, idempotency, partial fill/refund, exact 0.675 ETH artwork payout, all Token IDs/URI paths/owners.
- GO1 full integration regression passed: creator actions, native/ERC20 checkout, Merkle allowance, publication/reconfiguration, receipt, cancellation and security paths.
- Seven isolated ERC721 creator lifecycle regressions passed.
- Database RLS/grants/RPC/version/recovery tests passed for three starting permission profiles.
- Dependency audit: zero vulnerabilities.
- Earlier fork fixture failures (array callback checksum and comparison of a derived response field) were corrected. The final fork run has zero failures.

## Remaining release work — do not confuse with passed acceptance

1. Push this checkpoint and create a draft PR linked to #30 before starting more changes.
2. Complete focused TypeScript/tests at the saved revision, then GitHub CI, build and HTTP/CSP checks.
3. Review new UI visually on desktop and narrow/mobile widths, including real fork-generated review/receipt data. A real authenticated Production wallet session is not available to this agent; do not claim it was tested.
4. Complete independent security review of the new transaction path; fix any findings, add focused tests as needed.
5. Release only after CI, security and GO1 gates pass; verify the actual Production deployment and APIs/browser afterward. Preview is not final acceptance.
6. Write the consolidated acceptance/approval report with the actual release SHA, deployment, screenshots, CI links and remaining boundaries.

## Actions still requiring separate explicit user authorization

- Owner `setRole(APPROVED_MINT_CONTRACT, [TLStacks721], true)` on collection `0x99b8ae3c16559b80424a45c92dd530d50d970a46`.
- Owner/Admin `configureDrop(collection, presaleDrop)` on TLStacks721 `0x384092784cfaa91efaa77870c04d958e20840242`.
- Mainnet checkout activation and the collector's actual purchase. Artwork price 0 ETH does not waive protocol fees: observed fee 0.0009 ETH per NFT, 0.0027 ETH for three, plus gas.
- After three finalized presale mints: separate round-2 configuration and separate checkout activation. Public artwork price 0.025 ETH, plus protocol fee and gas.

Payout: `0x57eE21f9aCFFCBa7F1E8cB51f9b96aFd33b4CB87`.
Presale recipient / current Owner: `0xbeE916aBC292D4EfF57702fABbA1AAC4d4046036`.
Admin: `0x29bF68E3969E0b6686ea55B7C48241ba3f6B9bA0`.

No Ethereum Mainnet transaction was submitted. No role was granted on Mainnet. No ETH/NFT was moved. No Mainnet checkout was enabled. Fork success is not authorization. TLAuctionHouse execution remains out of this primary-sale release and locked.

## Checkpoint safely pushed, then release review resumed

- Draft PR #44: https://github.com/myreceiptt/transient-contract-manager/pull/44
- First remote checkpoint commit: `cee047b75b2c231c56f9d8de6e3768a656e98e59`; its tree exactly matches local checkpoint `7f9e3072804300339cc470224bfc293d4ee591c1`, retained on `checkpoint/issue-30-local-7f9e307`.
- GitHub CI passed: application run `42349974820`; real fork lifecycle run `42349974862`.
- Local production build and HTTP/CSP/security checks passed.
- Follow-up security/recovery review: actor and payload-kind filtering now precedes the recovery ledger limit; review/permission expiry is checked again after asynchronous preflight; primary and archive RPC must agree on the finalized block; recovering a replacement updates the durable browser hash.
- The expanded real fork suite passed **10/10**, including recovery after 30 other-wallet reviews.
- The cloud browser could not reach the local development server (`ERR_CONNECTION_REFUSED`). The temporary local-only review fixture was removed from application sources. This is not Production visual evidence; Production visual acceptance remains required.

- Final follow-up validation: TypeScript and all 252 unit tests passed; GO1 integration passed after the shared history-query change.
- Removed duplicate legacy readiness UI from the GO#|O studio; draft previews now distinguish the available public page from guarded execution.
