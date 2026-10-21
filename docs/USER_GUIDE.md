# Administrator and collector guide

## Open a collection

Choose the network, paste the collection address and open the workspace. Contract Checker is public and requires no wallet signature. Only the exact supported ERC1155TL 4.1.2 runtime, directly deployed or behind its canonical EIP-1167 clone, enables the adapter.

Connect the owner or an existing ADMIN_ROLE wallet. A wallet signature signs you in; it is not an approval to spend or change a contract. The server verifies roles again for every private action. Changing wallets or networks requires the matching session. Do not sign a mainnet transaction merely to test the interface.

## Tokens, editions and metadata

Tokens & Editions lists created IDs and metadata. `Token types` is not minted-unit supply. Use the holder balance form for exact current ownership of an ID. The audit includes a full historical GO1 supply calculation; the general dashboard does not pretend to be a complete multi-chain event indexer.

Choose an operation in the action form:

- Create a token with a pinned metadata URI; leave recipients empty for a zero-unit token-ID creation.
- Mint/airdrop an existing unlocked token to `address, amount` entries, one per line.
- Batch create using the displayed JSON shape. Optional per-token `royalty: {recipient, bps}` must be supplied for every batch entry if used. At most 40 IDs / 200 total recipients are accepted.
- Update metadata URI or set default/token royalties, with a maximum of 1000 basis points (10%).
- Grant mint permission to the verified Stacks deployment. Arbitrary mint contracts, ownership changes, role revocations and permanent token locks are not exposed.

Metadata must already be pinned or hosted. Example standard JSON:

```json
{
  "name": "Edition title",
  "description": "Plain text description",
  "image": "ipfs://YOUR_IMAGE_CID",
  "external_url": "https://your.example/work",
  "attributes": [{ "trait_type": "Series", "value": "First" }]
}
```

This release accepts URIs and reads safe fields; it does not upload or pin media for you. IPFS or an operator-approved HTTPS media host is required for previews. PNG/JPEG/WebP/GIF are supported; SVG/HTML are rejected by the media route.

## Shared mint page

1. Open Mint Pages and sign in.
2. Create a page for an existing token ID and unique slug. These identity fields become immutable after the first save.
3. Enter title, description, artwork, banner and external link. These fields belong to the independent page, not automatically to the on-chain token URI.
4. Set allocation, per-recipient limit, payout address, currency and unit price. For ERC-20, read and verify the token decimals before entering a price. Amounts beyond the currency precision are rejected.
5. Set the start in UTC and durations in seconds. Public duration starts after the presale duration.
6. For presale, supply the correct Merkle root. Collectors need their own allowance and proof, generated using the Stacks format described in the protocol audit.
7. Save a revision. Other current owner/admin wallets can open and edit it. If another editor saved first, reload instead of overwriting their revision.
8. Preview desktop/mobile content. A preview does not activate minting.

## Publish and synchronize

Prepare publication only after saving. Compare the operation, network, contract, payout, amounts and fees before selecting the transaction approval checkbox. The app simulates again before the wallet opens. A failed simulation is not bypassed.

A new drop usually needs `configureDrop`. An active drop may need several individual updates; confirm each and prepare the next step. Allocation cannot change while the drop is active. Public content changes only after the matching configuration is confirmed, or after an explicit content-only publication when settings already match.

If external settings changed, inspect the current on-chain snapshot and explicitly accept it before preparing a difference. Accepting a baseline does not itself change the contract. A published page can remain available while an unpublished draft is edited; its public content stays on the previous published revision.

Revision history can restore old content into the editor; save it to create a new revision. Audit history records who saved, accepted a baseline or published.

## Transaction recovery

Closing a wallet review does not cancel a sent transaction. Open Transactions, load history, and reopen the review. A hash is retained in the database and locally in the browser. Check confirmation; do not send again just because finality is slow.

If you sped up a transaction, supply the replacement hash and choose Verify same action. For cancellation or another replacement, use Verify cancellation / changed action. The server verifies actor, nonce and finalized receipt. It never decides to send a replacement automatically.

## Collector

Open `/mint/[slug]`. The displayed sale phase, price, remaining allocation and protocol fee are live chain values. Connect the intended recipient wallet and switch to the page's chain. Select a quantity and, in presale, enter your allowance/proof. Review payment before signing.

ETH sale: pay edition price plus ETH protocol fee. ERC-20 sale: approve only the required token amount, then review and send the separate purchase with its ETH protocol fee. An existing insufficient nonzero allowance may require a reset transaction first. Gas is additional and estimated.

Minting stops when the page is out of sync, the drop is closed/sold out, the token is locked, Stacks is paused/unapproved, or the wallet exceeds its remaining allowance. Insufficient funds and simulation errors are shown. There are no automatic wallet retries. Wait for finality and inspect the receipt and NFT details in the explorer.

Mainnet writes are intentionally locked in this development release. Local testing uses disposable Anvil assets only.
