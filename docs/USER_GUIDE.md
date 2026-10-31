# Transient Contract Manager by ENDHONESA — User Guide

The up-to-date illustrated instructions are available in the live app at
[Guide & network status](https://transient.endhonesa.com/guide).

This is an independent, non-custodial manager for **existing ERC1155TL v4.1.2**
collections and **TLStacks1155 v2.3.1 fixed-price drops**. It does not deploy
new NFT collection contracts or import the private database of The Lab.

## 1. Open an existing collection

1. From **Collections → Open a collection**, select the network: Ethereum,
   Robinhood Chain, Base or Shape.
2. Paste the **ERC-1155 collection contract address**, not the wallet address
   or the shared Stacks contract address. Select **Start managing**.
3. The app verifies bytecode, implementation version and the token standard.
4. Connect a supported injected EVM wallet using the top-right wallet menu.
5. Owner/admin changes require the on-chain owner or ADMIN_ROLE wallet.
   Sign the SIWE sign-in message (no gas) when prompted; actual wallet
   transactions require a separate explicit approval.
6. **Contract Checker** performs read-only inspection without a signature.

## 2. Understand the five workspace tabs

- **Overview:** verified contract facts, owner/admin role and featured token metadata.
- **Tokens & Editions:** existing token inventory, NFT metadata on IPFS,
  token creation, batch creation, airdrops, metadata changes and royalties.
- **Mint Pages:** token-first inventory, Stacks sale status, Create/Manage/Restore,
  page content and sale publishing.
- **Collection Settings:** contract facts and allowed on-chain admin actions,
  including granting the verified Stacks minter permission.
- **Transactions:** saved reviews, hashes, finality checks and replacement recovery.

ERC1155TL totalSupply() counts created **Token IDs**, not the total number
of circulating NFT units. Use **Check a holder's balance** for one wallet's
units of a specific Token ID.

## 3. Create metadata and a token

In **Tokens & Editions → NFT Metadata & Edition Studio**:

1. Enter NFT name, description, optional external URL and attributes.
2. Upload original JPG/PNG/WebP artwork (up to 100 MiB), or paste an IPFS URI.
3. Review artwork. Click **Pin metadata JSON to IPFS** and retain its URI.
4. Choose **Prepare new token**, **Prepare metadata update**, or
   **Add to batch queue**. Preparing metadata alone sends no transaction.
5. In **Prepare a collection action**, select **Create token ID** and check
   the pinned URI. Leave recipients empty for zero issued units, or enter
   one wallet and amount per line to issue units immediately.
6. Select **Simulate & review**, verify network, contract, recipients,
   amounts and fee, then **Approve in wallet**.
7. After wallet confirmation, use **Check confirmation** and refresh inventory.

Existing tokens can be minted/airdropped with **Mint existing token / airdrop**
if unlocked. Supported metadata/royalty operations are available in the
same action form. A batch can prepare up to 40 Token IDs and 200 recipients;
royalty bps are limited to 1,000 (10%). Pinned JSON is not itself a token.

## 4. Choose an NFT in Mint Pages

Open **Mint Pages**. The permanent **A home for every edition.** banner appears above a responsive, artwork-first grid of NFT cards, matching **Tokens & Editions**. Each card shows separate **Mint Page** and **On-chain drop** statuses. Select **Create**, **Manage**, **Restore** or **Review closeDrop** to open a full-width workflow; use **Back to NFT Editions** to return to the grid. Unsaved editor changes trigger a warning before leaving.

| Token status | Meaning | Next action |
| --- | --- | --- |
| Available | Created NFT; no configured Stacks drop; no canonical page | Create |
| Existing Mint Page | This app already owns the Token ID page identity | Manage |
| Archived canonical page | Historic published page is hidden | Restore |
| Existing on-chain drop | Drop remains configured, even if Ended | Close first |
| Verification required or locked | State unreadable or token mint-locked | Resolve or refresh |

**Ended is not Closed.** A Timed Edition may expire and still have a configured
drop. First-page creation here requires NOT_CONFIGURED (dropType 0) and no
existing canonical Mint Page in this app.

### The Lab → this app

1. Find the NFT/drop in [The Lab](https://lab.transient.xyz).
2. Close its Stacks drop with an authorized wallet, if The Lab provides that
   action; a verified contract interface can also be used if required.
3. Confirm the transaction, then refresh the Mint Pages token inventory here.
4. Verify NOT_CONFIGURED and then **Create** if no canonical page exists.

The Lab's private Mint Page contents and slug do not automatically transfer.
An existing on-chain drop does not establish which UI originally created it.

### This app → The Lab

1. Select **Review closeDrop** for a configured drop here.
2. Review the read-only closeDrop simulation, parameters and gas.
3. Select **Prepare closeDrop wallet review**, approve the wallet transaction,
   then use **Check confirmation**.
4. Refresh to verify the drop is NOT_CONFIGURED.
5. Use The Lab separately; its page creation rules may differ.

**Closing a drop does not burn NFT balances, delete blockchain history, or
automatically unpublish The Lab's off-chain Mint Page.**

## 5. Create and publish an independent Mint Page

1. **01 · Page content:** fill unique slug, title, description, artwork,
   banner and optional external URL. Page art is separate from NFT metadata.
2. **02 · Sale configuration:** payout receiver, allocation, allowance,
   ETH or ERC-20 payment, price, Start (UTC) and duration (seconds).
   For ERC-20 choose **Read decimals** first. The protocol fee is in ETH
   per unit even for ERC-20 purchases. Presale requires valid Merkle root
   and collector allowance/proof.
3. **03 · Content preview:** review desktop and mobile layouts.
4. **04 · Save and publish:** choose **Save revision**, then
   **Check sale readiness (read-only)**. Fix mint permission or on-chain
   baseline issues before **Prepare publication**.
5. In **Review before you sign**, inspect the exact configureDrop/update
   call and approve only after checking network, payout, price, supply,
   sale window and fees. Sign in the wallet.
6. Use **Check confirmation** to reconcile finality and contract state.
   A page may remain PUBLISHING until the confirmed transaction is
   verified by the app. **Do not resubmit merely because it looks stuck.**
7. Published URL: https://transient.endhonesa.com/mint/your-slug.
   A scheduled future start blocks minting, not public page viewing.

The current app uses fixed-price Stacks parameters. It does not offer separate
preset modes for all Limited, Timed and Inclusive Edition variants of The Lab.
A finite allocation/time window is not unlimited minting.

## 6. Manage an existing Mint Page

One Chain + Collection Contract + Token ID has **one permanent canonical Mint
Page identity after publication**. New rounds reuse **Manage** or **Restore**.

- **Save revision:** records draft content without publishing it. The public
  URL continues serving the last successfully published revision.
- **Edit URL:** open **01 · Page content → Public Mint Page URL → Edit URL**;
  enter the new slug and select **Save new URL**. No blockchain gas.
  Old published URLs permanently redirect (HTTP 308), and remain reserved.
- **Close drop:** read-only Review close, then explicit wallet transaction,
  Check confirmation, and refreshed contract status.
- **Archive:** for published pages, close the drop first; archiving hides the
  page but preserves identity and historical audits.
- **Restore:** bring back the canonical page, then manage any permitted
  new round through the same page.
- **Draft-only archive:** may release temporary reservation when there is
  no active/sent transaction history.

A new round may increase total minted copies. Respect any lifetime edition
cap promised to collectors.

## 7. Recover transactions

Open **Transactions → Load history**, select the saved review and choose
**Check confirmation**. Wallet speed-up/replacement can be reconciled with
**Verify same action**, or **Verify cancellation / changed action** for a
different replacement. Submitted is not necessarily finalized; closing a
review modal does not cancel a transaction. Never duplicate configureDrop
to resolve a stale PUBLISHING indicator.

## 8. Collector minting

Collectors visit the published Mint Page, connect a compatible wallet to
the correct chain and select **Review payment & mint** during an active
sale. ETH sales require edition price + native protocol fee + gas.
ERC-20 sales require token approval/payment plus native ETH protocol fee
and gas. Presales require the Merkle allowance and proof. Minting is
blocked on closed, paused, sold-out, locked, out-of-sync or not-yet-started
sales.

## 9. Network status and supported scope

Configured target networks: Ethereum (1), Robinhood Chain (4663),
Base (8453), Shape (360). Contract Checker and on-chain inventory make
fresh runtime checks. Supported pinned adapters: ERC1155TL v4.1.2
and TLStacks1155 v2.3.1 fixed-price drops.

Mainnet writes are available only when explicitly enabled by the operator
and allowed by chain, verified contract, wallet permissions and wallet
approval. Otherwise the app offers safe simulations and draft editing.
The web app does not duplicate all of The Lab's features, manage Velocity
drops, arbitrary creator contracts, ownership transfer, arbitrary role
revocation or burns.

**Never enter wallet seed phrases, private keys or recovery words in the app.**
