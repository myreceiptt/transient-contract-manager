# Source-restoration security review — 21 October 2026

Historical source-restoration review. **22 October update:** the approved migration is applied and independently verified; hosted-preview remediation is recorded in [PREVIEW_SECURITY.md](PREVIEW_SECURITY.md). Deployment remains subject to [PREVIEW_PLAN.md](PREVIEW_PLAN.md).

Scope of the original review: source, Git history, CI, then-unapplied database migration, and release controls. This is a focused engineering review, not an independent security audit. The existing protocol investigations and pinned contract evidence were retained; no real contract or mainnet state was changed.

## Secret and artifact scan

Gitleaks 8.30.1 scanned the complete original Git history: one commit, 75 files, 1,598,521 bytes; zero findings. Its downloaded official binary was SHA-256 verified (`551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb`). Supplementary full-source patterns checked PEM private keys, GitHub/AWS tokens, Supabase secret prefixes, JWTs, credential-bearing URLs, and literal hex private-key assignments. The only supplementary match was `https://u:p@ipfs.io/a` in `tests/domain.test.ts`, a deliberate invalid-URL fixture. It is not a real credential. Public chain addresses, runtime hashes, transaction hashes, compiler bytecode and package integrity hashes are expected source data.

No actual environment file, local database, dependency directory, build cache, coverage directory, private key file, or accidental log was tracked. `.env.example` contains empty credential fields and false write gates. Existing `docs/evidence` files are intentional audit evidence, not runtime data. Local Anvil uses loopback and its own ephemeral test chain; integration tests clear Supabase settings and force mainnet writes false. Secrets are not required by CI.

The archived ZIP passed CRC validation. Every source SHA-256 matched its manifest and its Git blob. The bundle verified as complete history; `git fsck --full` passed. Original commit `c2974ab556a3c233f43b0a4d21d85fd551ea9fa6` was restored exactly. A one-time same-repository GitHub workflow imported the bundle because terminal Git credentials were unavailable. It compared source trees and used an exact lease before replacing only its own temporary bootstrap head. The bootstrap bundle/workflow are absent from the restored main tree. The normal verification workflow has contents-read permissions and no deployment capability.

## Global gate and proposed granular release policy

**Original finding, fixed for this preview:** `writesAllowed()` previously permitted all supported mainnet write categories when `MAINNET_WRITES_ENABLED=true`. Preparation and preflight enforce that gate. It is suitable as an emergency master stop, but is too coarse for phased release. It remains **false**. No new write permission was enabled in this stage.

Use a server-only policy with the following conjunction; missing/invalid policy values must deny:

`master enabled AND approved environment AND exact chain enabled AND exact collection/token scope AND action enabled AND current release approval AND unexpired policy window`

| Network   | Chain ID | Current and initial release setting |
| --------- | -------- | ----------------------------------- |
| Ethereum  | 1        | Deny all writes                     |
| Robinhood | 4663     | Deny all writes                     |
| Base      | 8453     | Deny all writes                     |
| Shape     | 360      | Deny all writes                     |

Approval of one network must never activate another. Unknown chain IDs and local chain 31337 in production must fail closed. Store release policies on the server, never in NEXT_PUBLIC variables or request bodies. Bind policy version, network, collection, token, action and limits into each persisted intent. Re-evaluate immediately before returning signable calldata and at preflight. A policy change invalidates unsent reviews. Keep receipt recovery/read operations available when the master gate is off.

| Action category                                                           | Required release control                                                                                                                                                                                                 |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public purchase                                                           | Separate per-network mint switch; exact collection/token and currency allowlist; amount/quantity/value limits; approved adapter/runtime; fresh sale and fee snapshot; staged cap and expiry                              |
| ERC-20 approval/reset                                                     | Separate permission tied to an approved purchase, exact token/spender/amount; no unlimited approval; purchase must not inherit approval-only permission                                                                  |
| Token creation / batch creation / airdrop                                 | Separate switches and total recipient/quantity caps; fresh owner/admin authorization; explicit operator release approval                                                                                                 |
| Sale creation / price / window / wallet limits / allocation / Merkle root | Separate settings permissions; protect active sales; single publication reservation; require a new simulation and visible change review                                                                                  |
| Payout recipient / royalties / metadata                                   | Current on-chain owner/admin authorization, exact-payload transaction review, simulation and explicit wallet signing; maximum royalty and immutable/frozen-token checks; no additional owner approval in the application |
| Stacks minter grant                                                       | Dedicated capability, exact verified Stacks address/runtime; appropriate current on-chain permission, transaction review, simulation and wallet signing; never a generic role-grant endpoint                             |
| Ownership transfer, upgrade, lock, burn, arbitrary calls or roles         | Unsupported and denied until separately designed, audited and authorized                                                                                                                                                 |

Apply value/gas budgets to the concrete intent, log approval and policy versions without credentials, and maintain an emergency stop with a tested operator procedure. Do not treat a static environment flag as a two-person approval system. A server gate cannot recall signed transactions or disable permissionless minting directly against an already configured on-chain contract; contract-level pause/change requires separate authority and is not performed here.

## Original blockers before hosted browser acceptance

Items 1–4 have been remediated for a protected preview; see the current remediation report. Hosted browser acceptance and operational limits remain explicit gates. The descriptions below preserve the original findings.

1. **Approved database migration and remote verification.** The local grant fix is prepared; the target remains empty. Service credentials must be entered securely into server-only secret settings for the isolated preview, with no production keys or browser exposure. Verify actual PostgREST behavior and restart persistence.
2. **HTTPS/origin enforcement.** Production currently checks that APP_ORIGIN exists but permits an HTTP value, which makes cookies non-Secure. Require an HTTPS origin in production and test SIWE domain/URI, Secure/HttpOnly/SameSite cookies, CSRF, session expiry, chain switching and revoked permissions on the hosted origin.
3. **Media network boundary.** The proxy validates DNS, then `fetch()` resolves the hostname separately. This leaves a DNS rebinding/time-of-check gap for an approved host; IP classification is incomplete for all special-use IPv6 ranges. Pin the validated destination through the connection (preserving TLS hostname verification), or use a hardened egress proxy; test redirects, DNS changes, mapped IPv6, response limits and timeouts. Add media quotas/rate limits; the current `/media` GET path bypasses API throttling.
4. **CSP and request abuse.** Replace production script `unsafe-inline` with a tested nonce/hash policy and narrow connection/image origins where compatible with wallets. Validate Vercel's trusted client-IP header behavior. Public API requests can exhaust the shared 600/minute budget; origin checking alone is not bot authentication. Add per-endpoint cost limits, pagination and bounded concurrency before opening access broadly.
5. **Actual hosted/browser acceptance.** Previous evidence verifies only the rendered landing page. Desktop/mobile navigation, hydration, wallet connect, SIWE, authorized shared editing, collector UI and persistence still need complete browser verification. The earlier browser environment restriction is not evidence of application failure or success.
6. **Repository and operations controls.** Require the verification check on the release branch, review workflow/dependency changes, restrict secret scopes, define log retention and alerting, and rehearse backup/restore. Branch protection and production environment settings were not changed in this stage. Vercel read access is user-verified; project creation/write access remains untested by design.

## Additional blockers before public minting or any mainnet writes

- Implement and test the granular policy above; keep every gate false until a separate scoped release approval.
- Prevent two simultaneous publication preflights from both succeeding before either transaction hash is attached. Current row locking/version checks protect draft mutations, but the PUBLISHING transition occurs after broadcast. Add an atomic reservation with expiry/recovery and concurrency tests.
- Verify finalized-block behavior for each actual network/provider and test reorgs, replacement/cancellation, RPC lag and outages. Reverted receipts currently update failure state before the finalized-block check; require finality for that terminal transition too.
- Validate all four network wallet flows independently; existing cross-network runtime read evidence does not establish write acceptance. Use approved test environments/forks before any separately authorized mainnet canary. No mainnet testing is implied here.
- EIP-1271 verification exists in the SIWE library path, but contract-wallet transaction/receipt behavior is not accepted end to end. Keep unsupported smart-account flows disabled until tested.
- Restrict payment tokens to verified standard ERC-20 behavior; fee-on-transfer/rebasing and unusual approval semantics are not accepted. Confirm payout, protocol fee, decimals and actual delivered quantity under race conditions.
- Define operator recovery for a pending transaction whose signer loses admin access. Preserve chain facts and nonce; never automatically resend or infer success from a UI timeout.
- Complete independent review of transaction authorization, calldata, limits, publication concurrency and the service-key trust boundary. The server role bypasses RLS and can modify audit/revision rows; it is a privileged system boundary, not wallet-level database isolation.

Recommended sequence: approve and verify only the isolated database migration; then resolve hosted-preview blockers and request a separate protected-preview stage with all write gates false; only after browser acceptance and granular controls consider a separately approved network/action canary. No Vercel deployment, DNS change, GO1 modification or mainnet activation is part of the current stage.
