# GO1 mint-page publication decision — 2026-10-25

**Operator decision:** GO1 NFT contract on Ethereum mainnet, Token ID **1**, uses only the official Mint Page slug `pancasila-vs-pancakaki`, with payment receiver **`0x57eE21f9aCFFCBa7F1E8cB51f9b96aFd33b4CB87`**.

The decision is encoded in `src/lib/canonical-mint-pages.ts`. It prevents preparing or completing content publication from another GO1 token-1 draft, and blocks publication when the official draft's payout receiver diverges. It intentionally does **not** prevent ordinary draft editing, alter other NFT contracts, or enable any blockchain writes. Other GO1 token-1 drafts remain drafts and **must not** be treated as additional token supplies or independent Stacks drops.

## Database readback (2026-10-25, read-only)

| Item | Recorded official draft value |
| --- | --- |
| Database page ID | `e2b6b267-bd27-4809-b642-aa1fbc330845` |
| Slug | `pancasila-vs-pancakaki` |
| Version / status | 5 / DRAFT |
| Chain / NFT | Ethereum 1 / `0x5807E66182A38788a3854853225a2B6d8E0480f2` |
| Token ID | 1 |
| Payout address | `0x57eE21f9aCFFCBa7F1E8cB51f9b96aFd33b4CB87` |
| Mint currency / price | Native ETH / **0 ETH** per NFT |
| Maximum allocation | 100 units |
| Per-recipient limit | 1 unit |
| Start | `1793094120` Unix = **2026-10-27 09:42 UTC / 16:42 WIB** |
| Public duration | 86,400 seconds (24 hours) |
| Presale duration | 0 |
| Presale price / Merkle root | 0 / zero root |

**These numeric sale terms are existing DRAFT settings, not yet a separate operator authorization to transact.** The zero sale price does not necessarily remove the Stacks protocol fee or collector gas costs. Payout receiver is not automatically the royalty recipient.

## Before on-chain publication

1. Reopen the official draft as an owner or current on-chain admin, refresh and save any planned modifications. **Confirm separately** whether 0 ETH, 100 allocation, 1 per wallet, and the listed start/end are intentional. If the date is already past or too close, update it and save a new revision.
2. Run **Check sale readiness (read-only)**. Verify token existence/lock, approved Stacks minter, Stacks paused state, accepted baseline and any sibling-page warnings. Review the proposed transaction, decoded arguments, exact payout, and gas estimate. Inspect current on-chain `getDrop` again; do not infer it from a prior snapshot.
3. If the current Stacks drop is unconfigured, the expected next call is `configureDrop(GO1, 1, desiredDrop)`. If it is configured, follow the application's per-field update plan instead. No step may assume that a prior read is live current state.
4. Have the authorized GO1 admin explicitly approve the **exact function and decoded arguments**, the destination contract, chain ID, amount, network fee and timing in a separate step. Never treat this decision as permission to sign a transaction.
5. Keep `MAINNET_WRITES_ENABLED=false` and `networkWritePermissions[1]=false` until a separately reviewed narrow mainnet release is approved. Keep other chains locked. Current deployment cannot send any mainnet transaction.
6. After any future, separately authorized write: verify finalized transaction receipt, Stacks readback, payout/supply/config fingerprint, and published revision. Only then test a controlled collector flow. No automatic transaction retries.

## Collision note

Three saved mint-page drafts currently target GO1 Token ID 1. Official: `pancasila-vs-pancakaki`. Non-official: `minting-pacasila-vs-pancakaki` and `endhonesa-hahaha`. Only one token-scoped Stacks sale exists; a second page does not produce a second independent allocation. The non-official drafts are preserved for testing and historical context, without deletion.
