import { targetChains, STACKS, CREATOR_IMPLEMENTATION } from '@/lib/chains';
export default function Guide() {
  return (
    <div className="document">
      <div className="eyebrow">WORKSPACE HANDBOOK</div>
      <h1>
        Clear permissions.
        <br />
        Deliberate actions.
      </h1>
      <section className="panel">
        <h2>Start managing</h2>
        <ol>
          <li>Connect your EVM wallet and choose the collection’s chain.</li>
          <li>Enter an existing collection address. Contract Checker is available to everyone.</li>
          <li>
            Sign the sign-in message to access shared drafts. Ownership and admin roles are read
            again for every workspace operation.
          </li>
          <li>
            Use Tokens & Editions for creation, airdrops and metadata. Use Mint Pages for shared
            drafts and sale setup.
          </li>
          <li>
            Review the exact transaction and payout destination. Wallet confirmation is required for
            every on-chain action.
          </li>
        </ol>
      </section>
      <section className="panel">
        <h2>Network compatibility</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Network</th>
                <th>Chain</th>
                <th>Creator adapter</th>
                <th>Stacks adapter</th>
                <th>Execution status</th>
              </tr>
            </thead>
            <tbody>
              {targetChains.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.id}</td>
                  <td>ERC1155TL 4.1.2</td>
                  <td>TLStacks1155 2.3.1</td>
                  <td>Runtime verified; mainnet writes locked by default</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Runtime verification on 21 October 2026 is recorded with block hashes in the source
          evidence. The application checks bytecode again on each request. Matching deployment
          addresses alone never enable an adapter.
        </p>
        <p className="mono">
          Creator implementation: {CREATOR_IMPLEMENTATION}
          <br />
          Stacks: {STACKS}
        </p>
      </section>
      <section className="panel">
        <h2>Before publishing</h2>
        <p>After the Mint Page has been published, the NFT Token ID and
          canonical page identity remain permanent. An authorized collection
          owner/admin can select Edit URL to rename only the off-chain slug.
          This costs no blockchain gas, creates an audit revision, and keeps
          the existing published content unchanged. The old published URL
          returns an HTTP 308 permanent redirect; reserved old URLs cannot
          be claimed by another page.</p>
        <p>Mint Pages now begins with NFT Token IDs. A NOT_CONFIGURED drop (dropType 0)
          can create a new Mint Page only when no canonical identity exists. Scheduled,
          presale, public sale, and ended drops remain configured and cannot create
          a second page. Use The Lab to close a drop first when migrating into this app.</p>
        <p>To transfer management in the opposite direction, use the on-chain Close Drop
          review here, inspect the gas and parameters, then explicitly approve it in
          your wallet. Closing a drop does not delete NFTs, and does not guarantee
          The Lab automatically unpublishes or permits recreating its own off-chain page.</p>
        <p>Published Mint Page identity survives archiving and future rounds: Restore
          the same page and keep its historical slug. A timed sale ending is not
          the same as closeDrop. Unknown RPC status never means available.</p>
        <p>Public pages may appear before minting begins. A submitted publication
          must be reconciled with its finalized transaction receipt using
          Check confirmation; do not submit the same configureDrop twice.</p>
        <p>
          A draft is shared by the collection’s current owners and admins. It is separate from The
          Lab’s drafts. Saving content does not change a contract. Publishing a sale can require
          multiple transactions; each is reviewed separately. A page becomes public only after the
          expected configuration is confirmed.
        </p>
        <p>
          Sale allocation means new units that Stacks may mint. It does not represent units already
          owned by any wallet. ERC1155TL’s totalSupply() is the number of token IDs created.
        </p>
        <h3>Collector payments</h3>
        <p>
          The sale price and per-unit protocol fee come from the current Stacks contract. ETH sales
          pay both in ETH. ERC-20 sales pay the token price in the chosen currency and the protocol
          fee in ETH. An approval is limited to the required amount; an existing nonzero allowance
          may first need a reset to zero.
        </p>
        <h3>Release limits</h3>
        <p>
          Only the exact pinned ERC1155TL 4.1.2 and Stacks 2.3.1 implementations are accepted.
          Velocity drops, ownership changes, role revocations, burns and transfer-validator changes
          are intentionally outside v1. The signature verifier includes EIP-1271, with contract-wallet acceptance still pending; transaction receipts
          currently require direct transactions from the executing wallet.
        </p>
      </section>
    </div>
  );
}
