# Acceptance — unified collection entry and ERC721TL Phase A/B preview

Updated: 2026-11-03. **Use protected Vercel Preview** from PR #27. Ethereum Mainnet, read-only plus optional immutable public IPFS uploads and simulation. **Never sign an ERC721 mint, approve an auction house or send ETH during these tests.**

## Preconditions
- Creator collection: GO#|O `0x99B8AE3C16559B80424a45C92Dd530d50d970a46` on Ethereum chain ID 1.
- Collection owner: `0xbeE916aBC292D4EfF57702fAbBA1AAC4d4046036`.
- Admin wallet (distinct): `0x29bF68E3969E0b6686ea55B7C48241ba3f6B9bA0`.
- This 1 of 1 collection was observed as ERC721TL v4.1.2 EIP-1167 and unburned supply 0 at screenshot block 26332646. These are historical observations, not necessarily current chain state.
- ERC1155 regression collection: GO1 `0x5807E66182A38788a3854853225a2B6d8E0480f2`.
- Collector addresses and source images are optional for read-only routing tests. For IPFS pinning use **intentionally public** original artwork; pinning is permanent.

## Browser acceptance checks

| ID | Action | Expected |
| --- | --- | --- |
| U01 | Homepage: choose Ethereum, GO#|O ERC721 collection address, click Open collection | Automatic route to `/manage-721?chain=1&contract=...`, no separate ERC721 special link |
| U02 | Open GO#|O Overview with your connected admin wallet | Version 4.1.2, owner and admin distinct, role ADMIN, supply 0; **READ-ONLY** |
| U03 | Open GO#|O Tokens & Editions | Empty-state for supply 0, no fabricated Token IDs. Authorized creator sees Prepare an original NFT draft studio |
| U04 | Open GO#|O Mint Pages / Auctions | Explain collection-wide primary TLStacks721 and token-owner TLAuctionHouse escrow separately; no write buttons |
| U05 | Open GO#|O Collection Settings / Transactions | Owner/admin and signed-runtime status visible; no fake transaction history or approval controls |
| U06 | Contract Checker | Two vertically stacked independent forms: ERC721TL 1 of 1 first, ERC1155TL Editions second |
| U07 | ERC721TL Checker: inspect GO#|O | v4.1.2, owner/admin, supply 0; no signature |
| U08 | ERC1155TL Checker: inspect GO1 | Strict verified runtime and existing ERC1155 collection facts, unchanged |
| U09 | Homepage: enter GO1 | Automatic routing to existing `/manage` with real ERC1155 management still available |
| U10 | Homepage: invalid wallet address/no contract/unsupported implementation | Clear rejection or diagnostic; never route to wrong workspace |
| U11 | Owner/admin: upload intentional JPG/PNG/WebP artwork, pin metadata | Image + metadata pinned to IPFS; no Ethereum transaction. Validate preview, URI, and public content |
| U12 | Owner/admin: choose valid recipient, simulate ERC721TL mint | Read-only preview returns PASSED only if official runtime candidate, same-chain role and unlocked supply match; **no Token ID issued** |
| U13 | Viewer wallet / wrong network / malformed URI | Unauthorized pin/simulation rejected; no signing, no uploaded file for unauthorized wallet |
| U14 | Switch admin wallet to viewer while viewing collection | Refresh role and restrict draft capabilities appropriately; creator admin must not grant unrelated wallet auction rights |
| U15 | ERC721TL 3.6.0 cultural stories collection (optional) | Read-only inspector works; minted ID counter semantics accurately stated; no 4.1.2 mint simulation |
| U16 | GO1 regression: Mint Pages Manage / View / Copy, Token & Editions, Collection Settings, public Mint Page | Existing ERC1155 functionality and data unchanged; no migrated records or duplicate Mint Pages |

## Do not perform during this acceptance
- No `mint()` transactions, 721 royalty updates, contract approvals, TLStacks721 drop configuration, bidding, Buy Now, delist or settlement.
- Do not upload confidential/copyright-uncleared content to public IPFS.
- Do not use mainnet ETH merely to prove a read-only screen.
- Do not consider `simulateContract()` equivalent to transaction finality.

After U01–U16, the next engineering gate is a pinned reproducible ERC721 runtime, a transaction-intent engine with SIWE/role rechecks, explicit wallet approval, receipt/finality and ownerOf/tokenURI readback, then TLStacks721 primary mint and TLAuctionHouse escrowed secondary auction integrations.
