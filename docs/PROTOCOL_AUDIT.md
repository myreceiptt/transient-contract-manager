# Protocol and network audit

Recorded 21 October 2026. All evidence is read-only. Deployed bytecode was obtained by RPC, Etherscan verified compiler inputs were extracted, the main Solidity sources were compared against official pinned Git commits, and both complete runtime bytecodes were reproduced locally. Comparing a version string or address alone was not accepted as verification.

## Pinned implementations

| Component          | Source pin                                                                              | Compiler                                  | Exact runtime Keccak-256                                             |
| ------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------- |
| ERC1155TL 4.1.2    | `Transient-Labs/tl-creator-contracts` commit `a2ef226db2e6df9d07e002c7c11ddab17c1df3f5` | 0.8.30; optimizer 2000; Osaka; no CBOR    | `0x182a242cdc62526343ae489f36ec62fe36f9069bd9bc79315a613ad1e4e69294` |
| TLStacks1155 2.3.1 | `Transient-Labs/tl-stacks` commit `de281be1f161a56742dfd7c69344eb5b2fb721c9`            | 0.8.22; optimizer 20000; Paris; IPFS CBOR | `0x02e6dcd7e74c8a3337cd56868fc5eacd8e0f4cd24fb8975934d47605d46053b7` |

Creator implementation: `0x079e23352721084561fb241593d16a4e6f548a97`.
Stacks: `0x32953d7ae37b05075b88c34e800ae80c1cb1b794`.

The inspected creator default branch reported 4.1.0; the 4.1.2 branch was required. Stacks default branch was 2.7.0; the requested 2.3.1 tag was used. The artifacts are not generated from an unpinned default branch. Reproduce with `npm run contracts:verify`.

Sources: [creator repository](https://github.com/Transient-Labs/tl-creator-contracts/tree/a2ef226db2e6df9d07e002c7c11ddab17c1df3f5), [Stacks repository](https://github.com/Transient-Labs/tl-stacks/tree/de281be1f161a56742dfd7c69344eb5b2fb721c9), [creator verified source](https://etherscan.io/address/0x079e23352721084561fb241593d16a4e6f548a97#code), [Stacks verified source](https://etherscan.io/address/0x32953d7ae37b05075b88c34e800ae80c1cb1b794#code).

## Network capability matrix

| Chain       |    ID | Snapshot block | Creator 4.1.2 runtime  | Stacks 2.3.1 runtime   | Read-only RPC         | Live mint test                |
| ----------- | ----: | -------------: | ---------------------- | ---------------------- | --------------------- | ----------------------------- |
| Ethereum    |     1 |     26,240,435 | Exact match            | Exact match            | Passed; GO1 inspected | Not authorized / not executed |
| Robinhood   |  4663 |     94,219,539 | Exact match            | Exact match            | Passed                | Not authorized / not executed |
| Base        |  8453 |     52,894,935 | Exact match            | Exact match            | Passed                | Not authorized / not executed |
| Shape       |   360 |     35,417,378 | Exact match            | Exact match            | Passed                | Not authorized / not executed |
| Local Anvil | 31337 |  Fresh fixture | Exact compiled runtime | Exact compiled runtime | Passed                | ETH, ERC-20, presale passed   |

The same two addresses held matching runtimes on all four mainnets at these snapshots. Runtime compatibility is demonstrated; production finality behavior, wallet UX and paid mainnet transactions on each chain are not. Every request rechecks chain ID and bytecode. A missing/changed implementation fails closed.

All four snapshot protocol fees were `900000000000000` wei (0.0009 ETH) per unit, and none of the Stacks contracts was paused. Fees are mutable and are never hardcoded in purchase quotes. Shape had a different protocol fee receiver; the application reads it on the selected chain. Full block hashes, RPCs and bytecodes are in `evidence/network-snapshot.json`.

## GO1 findings

| Field                         | Verified value                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------ |
| Collection                    | Ganti Oli #1 / GO1                                                             |
| Proxy                         | `0x5807e66182a38788a3854853225a2b6d8e0480f2`, canonical 45-byte EIP-1167 clone |
| Implementation                | Pinned ERC1155TL 4.1.2 address above                                           |
| Owner                         | `0xbeE916aBC292D4EfF57702fABbA1AAC4d4046036`                                   |
| Admin                         | `0x29bF68E3969E0b6686ea55B7C48241ba3f6B9bA0`                                   |
| Token 1                       | Created, mint-unlocked                                                         |
| URI                           | `ipfs://bafybeicycur6535m3r2lktirmxh4jaghvrwzbbymztz7my5bz2srkhmlbi/0`         |
| Royalty                       | 500 bps (5%) to `0x57eE21f9aCFFCBa7F1E8cB51f9b96aFd33b4CB87`                   |
| Stacks permission             | Approved                                                                       |
| Drop                          | Not configured                                                                 |
| Token types                   | 1; `totalSupply()` is token ID count                                           |
| Actual units at audited block | Minted 0, burned 0, circulating 0                                              |

Unit supply was reconstructed from all TransferSingle/TransferBatch logs from deployment block 26,234,362 through 26,240,441. The only token-1 event was a zero-unit mint to the dead address at block 26,234,486, transaction `0xcbd6f07d50f5c2d68babb81a6dec22a06e427177e3588f78f2be09a3ac10b3c5`. Evidence: `evidence/go1-supply.json`. This is a dated snapshot, not a promise about future supply.

## Permissions and supported operations

| Operation                                                 | Contract authority / checks                                 | Application behavior                                   |
| --------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------ |
| Create / batch create                                     | Owner or ADMIN_ROLE; array and royalty validity             | Both ABI overloads; bounded batch                      |
| Mint / airdrop                                            | Owner or ADMIN_ROLE; token exists; mint unlocked            | Rechecks and simulates; positive units                 |
| Metadata URI                                              | Owner or ADMIN_ROLE; valid token                            | Pinned URI workflow, no destructive ownership controls |
| Default / token royalty                                   | Owner or ADMIN_ROLE; maximum 1000 bps                       | Recipient, range and simulation checked                |
| Grant mint contract                                       | Collection owner/admin                                      | Only verified Stacks address, grant=true               |
| Configure / update drop                                   | Collection owner/admin plus Stacks restrictions             | One reviewed transaction per step                      |
| Purchase                                                  | Collector; sale phase, quantity, allowance, proof, balances | Live quote and preflight; direct wallet transaction    |
| Owner transfer / role revoke / burn / permanent mint lock | Contract may expose these                                   | Not exposed as managed v1 actions                      |

`ADMIN_ROLE = 0xa49807205ce4d355092ef5a8a18f56e8913cf4a201fbe287825b095693c21775`.
`APPROVED_MINT_CONTRACT = 0xf0178e81e3689af48153edf0e1b2d669fe2786ab9e21fdecf3e3771c70330af5`.

## Sale semantics

- `dropType=1` is a fixed-price edition drop. Velocity/decaying drops are unsupported by this editor.
- Native purchase value is `quantity × (unit price + protocolFee)`.
- ERC-20 purchase approves Stacks for `quantity × token price`, using the token's actual decimals, and still sends `quantity × protocolFee` in ETH. An insufficient nonzero allowance is reset to zero, then an exact amount is approved in a separate reviewed transaction.
- Allocation is additional units Stacks may mint, not already held units or the collection's token-type count.
- Purchases count against the recipient, across both presale and public phases, within one drop round. A zero allowance permits zero units, not unlimited minting.
- Presale is `[start, start+presaleDuration)`; public sale follows until its exclusive end. Zero remaining supply ends the drop. Zero payout receiver represents an unconfigured drop.
- The contract can clamp a purchase quantity to remaining supply or allowance. The application checks quantity before simulation and again before signing. There is still an unavoidable race between preflight and transaction inclusion; inspect the actual receipt for the minted amount.
- Active drops cannot be replaced with `configureDrop`. The editor generates supported field updates in sequence; an ended/unconfigured drop can be configured. Existing content changes with an identical configuration need no chain transaction.
- `initialSupply` must equal `supply` at configuration time. Publication readback ignores normal supply depletion but checks configuration and round.
- Presale leaf: hash the ABI-encoded recipient address, ABI-encode that bytes32 with its uint256 allowance, hash, then hash the resulting bytes32 again. Pair hashing is sorted. `src/lib/domain.ts` and the tested on-chain fixture are the canonical implementation.

## Remaining protocol validation

Each mainnet needs its own approved small-value acceptance run, reliable production RPC and finality-tag check before enabling writes. EIP-1271 sign-in is supported by viem, but account-abstraction/Safe batch execution needs a dedicated receipt adapter; v1 expects a direct transaction from the signing wallet. Nonstandard fee-on-transfer/rebasing ERC-20s are not supported or tested. No production contract deployment or GO1 state mutation occurred.
