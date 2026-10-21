# Transient Contract Manager by ENDHONESA

Independent Next.js application for existing ERC1155TL v4.1.2 collections and TLStacks1155 v2.3.1 fixed-price drops. It does not use The Lab's private APIs or database.

**Release status: tested local implementation; deployment blocked on service access and database selection.** Mainnet writes are disabled by default. A successful local build is not a claim of a deployed or fully four-chain-tested service. Read [Implementation Report](docs/IMPLEMENTATION_REPORT.md) first.

## What works

- Exact-runtime contract adapter, read-only checker, inventory, holder balance and owner/admin recognition.
- Injected EVM wallets; optional WalletConnect project configuration. SIWE sessions bound to wallet, chain, domain and one-time nonce.
- Token creation (both overloads), batch creation (both overloads), mint/airdrop, URI updates, default/token royalties and a narrowly scoped Stacks minter grant.
- Shared PostgreSQL drafts, optimistic versions, immutable page identities, revisions, audit history, desktop/mobile content preview.
- Fixed-price sale configuration and sequential updates, simulation, transaction review, persisted hashes, replacement recovery, finality and on-chain readback.
- Public `/mint/[slug]` using the published revision and live sale data. Native ETH, ERC-20 decimals/exact approvals, per-unit ETH protocol fees and Merkle presale proofs.
- Safe metadata/media gateway with an operator-controlled hostname allowlist, size/time limits, redirect refusal and raster-only responses.

## Local read-only workspace

Requirements: Node 22–24, npm, network access to chain RPCs. Node 24 is the tested runtime.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. PGlite creates `.local/database` for development. It is an actual PostgreSQL-compatible database, not browser storage; the same SQL command function is used with Supabase in production. No Supabase account is needed for local development. A production process refuses this fallback.

Contract Checker can inspect GO1 at `0x5807e66182a38788a3854853225a2b6d8e0480f2` on Ethereum. Connect a genuine on-chain owner/admin wallet to edit shared drafts. Reading a role from a supplied address never creates an authenticated session.

## Controlled local blockchain

For an automated run that deploys the exact pinned contracts, authenticates local wallets, exercises the Next API handlers and checks balances, payouts and database access:

```bash
npm run test:integration
```

The harness starts Anvil on loopback chain 31337, uses its disposable unlocked accounts, creates an isolated temporary database, and shuts down afterward. It never uses mainnet or production database credentials.

For a persistent manual local-wallet session, start Anvil in one terminal:

```bash
node node_modules/@foundry-rs/anvil/bin.mjs --host 127.0.0.1 --port 8545 --chain-id 31337
```

In another terminal:

```bash
node --import tsx scripts/setup-local.ts
```

The script writes public fixture addresses to `.local/local-chain.json`. Set `LOCAL_CHAIN_ENABLED=true`, `NEXT_PUBLIC_LOCAL_CHAIN_ENABLED=true`, and `LOCAL_STACKS_ADDRESS` to that fixture's Stacks address in `.env.local`; restart the app. Add localhost chain 31337 to a **disposable development wallet** using Anvil's displayed test account. These public development accounts must never hold real assets. Open the local collection by its fixture address. The setup script refuses non-loopback URLs and any chain other than 31337.

In a managed sandbox, Anvil and its integration runner must share a process network namespace. The automated harness already handles this. The `scripts/dev.mjs` wrapper also adapts the managed preview flags and origin.

## Verification

```bash
npm run typecheck
npm test
npm run contracts:verify
npm run test:integration
npm audit --audit-level=moderate
npm run build
```

Read-only live audit commands:

```bash
npm run audit:protocol
npm run audit:supply
```

Where the environment uses an HTTP proxy, start these standalone Node scripts with `NODE_USE_ENV_PROXY=1` on a compatible Node runtime. Do not change the verified code hashes just to make an unsupported deployment pass.

## Project map

| Path                           | Responsibility                                                            |
| ------------------------------ | ------------------------------------------------------------------------- |
| `src/lib/adapters.ts`          | Allowlisted adapter metadata, ABIs, commits and capabilities              |
| `src/server/chain.ts`          | Pinned implementation checks, exact chain, permission and live sale reads |
| `src/server/auth.ts`           | SIWE challenge, session, CSRF, request bounds and throttling              |
| `src/server/workspace.ts`      | Shared drafts, identity and revision checks                               |
| `src/server/transactions.ts`   | Simulation, publication, minting, transaction and receipt verification    |
| `src/server/db.ts`             | Supabase service-only RPC / development PGlite transport                  |
| `supabase/migrations`          | Reviewed schema, RLS denial to browser roles and service-only function    |
| `src/components`               | Creator workspace, editor, collector and wallet review interfaces         |
| `contracts`                    | Verified-source standard inputs, reproducible artifacts and complete ABIs |
| `docs/evidence`                | Recorded chain reads and test results                                     |
| `.github/workflows/verify.yml` | Tests and build; no automatic deployment or secret-bearing PR workflow    |

## Deployment and use

- [Protocol audit and network matrix](docs/PROTOCOL_AUDIT.md)
- [Architecture and state machine](docs/ARCHITECTURE.md)
- [Security review and testing](docs/SECURITY.md)
- [Vercel, Supabase, environment and DNS setup](docs/DEPLOYMENT.md)
- [Administrator and collector guide](docs/USER_GUIDE.md)
- [Implementation report and remaining gates](docs/IMPLEMENTATION_REPORT.md)

Source code from Transient Labs and its dependencies retains its embedded license headers. See [Third-party notices](THIRD_PARTY_NOTICES.md). No license to change deployed contracts is implied by this repository.
