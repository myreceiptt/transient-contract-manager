# Security review and validation

This is an implementation review with automated tests, not an independent security audit. Mainnet writes remain disabled. No private key, recovery phrase, production database secret or live wallet approval was requested or used.

Current hosted-preview remediation and regression coverage: [PREVIEW_SECURITY.md](PREVIEW_SECURITY.md). Deployment approval scope: [PREVIEW_PLAN.md](PREVIEW_PLAN.md).

## Enforced boundaries

| Threat                     | Control                                                                           | Evidence                                                               |
| -------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Fake wallet identity       | Server-issued SIWE challenge and verified signature                               | Integration login and unauthorized-wallet scenarios                    |
| Replay / CSRF              | Atomic single-use challenge, expiry, strict origin, session-bound CSRF            | Replay, missing session, wrong origin and CSRF tests                   |
| Stale admin access         | Live owner/ADMIN_ROLE check on every workspace operation                          | Same active session denied after local on-chain revocation             |
| Cross-chain confusion      | Supported-chain allowlist, RPC eth_chainId, session chain                         | Contract inspection and session binding code; local tests              |
| Unverified ABI/proxy       | Exact runtime hash; canonical EIP-1167 or direct only                             | Four chain snapshots and compiler reproduction                         |
| Browser database access    | RLS + revoked table/function access for anon/authenticated                        | Direct role-switched SQL tests                                         |
| Draft lost updates         | Atomic row lock/version check, immutable identity                                 | Shared owner/admin and stale-version tests                             |
| Wrong payment              | Integer arithmetic, live decimals/fee, exact ERC20 approval, simulation           | Native/6-decimal token payout and protocol-fee assertions              |
| Stale quote                | Configuration, phase and quantity recheck before signing                          | External mutation and preflight conflict tests                         |
| Malicious transaction hash | Validate actor, destination, calldata, value and replacement nonce                | Attachment code and cancellation recovery test                         |
| Premature publication      | Receipt canonicality, finalized block, configuration/round readback               | Controlled local publication test; mainnet finality pending validation |
| XSS / media fetch abuse    | React text, CSP, approved hosts, redirect refusal, byte/time bounds, raster magic | URL and SVG/HTML rejection unit tests                                  |
| Silent repeated sends      | Persist hash; receipt checking only; no automatic wallet resubmission             | Pending/replacement scenario                                           |
| Secret leakage             | Server-only Supabase variable, ignored environment files                          | Source/packaging boundary; no secrets in repository                    |
| Paid/mainnet surprises     | Default-off mainnet gate and per-action wallet review                             | Gate test; recorded mainnet transaction count zero                     |

## Tests

`docs/evidence/integration-results.json` is written by a controlled run against freshly deployed, exact pinned contracts. It includes timings and individual outcomes. The harness uses real local EVM execution and actual PostgreSQL-compatible SQL, including role-switched RLS checks. It invokes the Next route handlers with Request/Cookie/CSRF data; it does **not** simulate a full browser wallet extension.

`docs/evidence/unit-results.json` records boundary tests for phases, allocation, allowlist leaves, fees, configuration drift and untrusted media. `docs/evidence/dependency-audit.json` records npm audit. `npm run contracts:verify` checks the compiled runtime against the audited hash rather than merely recompiling successfully.

Production build and type checking are required. CI repeats tests/build and has only `contents: read`; it neither exposes production secrets on pull requests nor automatically deploys mainnet-enabled code.

## Issues found and fixed during execution

1. PostgreSQL local variable `v` conflicted with a revision-table alias in the public lookup. Renamed the variable; private draft lookup and later published lookup pass.
2. Replaced mempool transactions can disappear from an RPC. Recovery now verifies the persisted sender/nonce rather than requiring the dropped original transaction to remain fetchable.
3. Two JSX closing errors were found by TypeScript and corrected before the successful production build.
4. A transitive `tmp` advisory was removed with a fixed exact override; wallet dependencies were upgraded to a version with a clean audit.
5. IPFS dot-segment traversal and SVG/HTML response types are rejected by explicit boundary tests.
6. The managed preview supplied Vite-style flags. The development wrapper now translates `--host` and drops `--strictPort` for Next.js.
7. Prices exceeding ERC-20 precision are blocked in the editor rather than silently rounded by unit conversion.
8. Editing content on an ended but unchanged drop no longer prepares an unintended new sale round.

## Remaining production risks / acceptance gates

- The isolated Supabase migration and read-only catalog/advisor checks are complete. Actual hosted PostgREST, browser security and persistence acceptance remain open. No production database was accessed.
- The homepage rendered and was visually inspected after an initial browser timeout. Interactions were not confirmed, and a later reload was blocked by browser URL policy. Responsive CSS and semantic form labels are implemented, but interactive/mobile/wallet acceptance remains open.
- A real injected wallet and WalletConnect must be exercised on the intended HTTPS preview origin. WalletConnect needs a separately configured project ID and allowed origin.
- Mainnet `finalized` behavior must be checked on each production RPC, especially L2s. No live mint or mainnet transaction was sent.
- There is an unavoidable inclusion-time race: Stacks may clamp a purchase after preflight if other buyers consume supply/allowance. Final receipts, not prepared quantities, are authoritative. There is no contract-level slippage parameter added by this app.
- Reorg recovery is checked by canonical block hashes in code; a real finality/reorg fault-injection suite has not been executed. A finalized receipt is treated as final.
- Direct EOA transactions are supported. EIP-1271 sign-in exists through viem, but multisig/user-operation receipt mapping needs an additional adapter and test suite.
- Only standard ERC-20 transfer behavior is tested. Fee-on-transfer/rebasing/nonstandard approval currencies need explicit compatibility review.
- Public RPCs are development defaults, not an availability commitment. Configure paid/provider RPCs only with approval; apply provider quotas/monitoring for release.
- Media hosts are operator-approved. Do not approve arbitrary user-controlled hostnames; that would weaken the SSRF trust boundary. Remote image availability and large-image behavior still require visual QA.
- Production scripts now require per-response nonces; inline styles remain allowed for existing React/wallet styling. The production HTTP regression checks real rendered script attributes. Hosted wallet/CSP acceptance remains open.
- API/media limits now use separate per-operation/client/wallet quotas, byte/time bounds and local concurrency lanes. Vercel's actual forwarding boundary and protected access must still be verified on deployment; public release needs measured gateway/bandwidth controls.
- `collection_profiles` and `media_assets` are reserved; upload/pinning, storage quotas and automatic retention jobs are not implemented. Currently administrators supply pinned IPFS or approved HTTPS URIs.
- Errors intentionally avoid logging credentials or raw session material. Production monitoring/alerts and backup/restore drills remain to be configured.

## Release policy

Keep `MAINNET_WRITES_ENABLED=false` until all intended-network acceptance gates pass and the user approves that release. Every actual wallet operation still requires review of its exact target, calldata, recipient/payout and amounts. A deployment approval does not authorize changing GO1 royalties, metadata, roles or mint state. Domain/DNS changes and new paid resources need their own explicit authorization.
