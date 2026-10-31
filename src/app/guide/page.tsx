import Link from 'next/link';
import { targetChains, STACKS, CREATOR_IMPLEMENTATION } from '@/lib/chains';

const chapters = [
  ['start', 'Start here'],
  ['connect', 'Connect a collection'],
  ['overview', 'Understand your workspace'],
  ['metadata', 'Create NFT metadata'],
  ['tokens', 'Create tokens & editions'],
  ['eligibility', 'Choose an NFT for a Mint Page'],
  ['draft', 'Set up your Mint Page'],
  ['publish', 'Publish & confirm'],
  ['lifecycle', 'Manage & close drops'],
  ['transactions', 'Recover transactions'],
  ['collector', 'For collectors'],
  ['networks', 'Network status & limits'],
  ['troubleshooting', 'Troubleshooting'],
] as const;

export default function Guide() {
  return (
    <div className="document creator-guide">
      <header className="guide-hero">
        <span className="eyebrow">CREATOR HANDBOOK · TRANSIENT CONTRACT MANAGER BY ENDHONESA</span>
        <h1>From existing collection to a live Mint Page.</h1>
        <p className="lead">A step-by-step guide to managing verified Transient Labs NFT contracts,
          creating ERC-1155 editions, publishing independent Mint Pages and safely
          handing off an on-chain Stacks drop between this app and The Lab.</p>
        <div className="guide-hero-links">
          <Link className="button" href="/">Open a collection</Link>
          <Link className="button secondary" href="/checker">Contract Checker</Link>
        </div>
        <div className="guide-flow" aria-label="Creator workflow">
          <span>Verify contract</span><span>Prepare metadata</span><span>Create token</span>
          <span>Check drop</span><span>Publish Mint Page</span><span>Confirm receipt</span>
        </div>
      </header>

      <nav className="panel guide-toc" aria-label="Guide contents">
        <div className="section-top"><h2>On this page</h2><span className="tag">STEP BY STEP</span></div>
        <div className="guide-toc-grid">
          {chapters.map(([id, label], index) => (
            <a key={id} href={'#' + id}>
              <span>{String(index + 1).padStart(2, '0')}</span>{label}
            </a>
          ))}
        </div>
      </nav>

      <section className="panel guide-section" id="start">
        <span className="section-number">01 / BEFORE YOU BEGIN</span>
        <h2>Start with a collection you already own or administer</h2>
        <p>This is an independent, non-custodial application. It does <strong>not</strong> deploy a
          new NFT collection, import The Lab&apos;s private drafts, or take custody of your wallet.
          It works with existing supported collection contracts and the verified TLStacks1155
          sale protocol on the same blockchain.</p>
        <div className="guide-grid">
          <div className="guide-note">
            <h3>You will need</h3>
            <ul>
              <li>An existing Transient Labs <strong>ERC1155TL v4.1.2</strong> collection contract address.</li>
              <li>The correct supported network and an injected EVM wallet (for example MetaMask,
                OKX Wallet or Phantom with EVM support).</li>
              <li>A wallet that is the collection <strong>owner</strong> or has its on-chain <strong>ADMIN_ROLE</strong>
                to make changes.</li>
              <li>The native network currency for gas when approving real on-chain actions,
                plus artwork and edition information.</li>
            </ul>
          </div>
          <div className="guide-note">
            <h3>What costs gas?</h3>
            <p><strong>No gas:</strong> checking a contract, connecting a wallet, signing in,
              reading status, saving private drafts, uploading to IPFS (subject to the app&apos;s
              service), and changing a published Page Slug.</p>
            <p><strong>Gas:</strong> creating or minting a token, changing on-chain metadata or
              royalties, granting Stacks permission, publishing or updating an on-chain sale,
              closing a drop and collector mint transactions.</p>
          </div>
        </div>
        <div className="guide-callout">
          <strong>Two separate systems:</strong> Your NFT token and sale/drop state live on-chain.
          Your Mint Page text, banner, slug, drafts and page history are managed by this app.
          A transaction or a page change in one system does not automatically update the other.
        </div>
      </section>

      <section className="panel guide-section" id="connect">
        <span className="section-number">02 / OPEN YOUR COLLECTION</span>
        <h2>Connect an existing Transient Labs contract</h2>
        <ol className="guide-steps">
          <li>On <Link href="/">Collections</Link>, open <strong>Open a collection</strong>.</li>
          <li>Choose the network where your NFT collection actually exists: Ethereum,
            Robinhood Chain, Base or Shape.</li>
          <li>Paste your <strong>collection contract address</strong> into the field. Use the
            ERC-1155 collection address, <em>not</em> your wallet address and <em>not</em>
            the shared TLStacks1155 contract address.</li>
          <li>Click <strong>Start managing</strong>. The app reads the collection and verifies
            the bytecode, version and ERC-1155 interface. Your existing NFT and transactions
            remain on their original chain.</li>
          <li>Use the top-right <strong>Connect wallet</strong> control to choose your browser
            wallet. Switch the wallet to the same network as your collection.</li>
          <li>When you first save or prepare a privileged operation, sign the app&apos;s
            sign-in message. This is a <strong>Sign-In with Ethereum</strong> authorization
            (no gas, no contract transaction). Owner/admin permissions are rechecked on-chain.</li>
        </ol>
        <p>If you only want to inspect a collection, open <Link href="/checker">Contract Checker</Link>,
          choose its network, paste the same collection address and select
          <strong> Inspect contract</strong>. Read-only inspection does not require a wallet
          signature. An unsupported contract will be rejected rather than treated as compatible.</p>
      </section>

      <section className="panel guide-section" id="overview">
        <span className="section-number">03 / FIND YOUR WAY AROUND</span>
        <h2>Five tabs, one collection workspace</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Tab</th><th>Use it for</th></tr></thead>
            <tbody>
              <tr><td><strong>Overview</strong></td><td>Collection name, owner/admin role,
                verified adapter, token-type count and saved Collection Profile, with a featured-token fallback.</td></tr>
              <tr><td><strong>Tokens &amp; Editions</strong></td><td>View NFT Token IDs and
                metadata; prepare IPFS artwork/JSON; create tokens, batches, airdrops,
                metadata changes and token-specific royalties.</td></tr>
              <tr><td><strong>Mint Pages</strong></td><td>Select an existing token, inspect its
                Stacks drop, create/manage/restore its one canonical Mint Page and configure
                a fixed-price sale.</td></tr>
              <tr><td><strong>Collection Settings</strong></td><td>Open a Collection Control Center for profile, identity, ownership, default royalties,
                Stacks minter permission and technical details.</td></tr>
              <tr><td><strong>Transactions</strong></td><td>Load saved transaction reviews,
                reopen pending operations and verify receipts after wallet approval.</td></tr>
            </tbody>
          </table>
        </div>
        <p><strong>Token types are not minted units.</strong> For ERC1155TL, the displayed
          <code> totalSupply()</code> reflects the number of created Token IDs, not the total
          number of NFT copies in circulation. In <strong>Tokens &amp; Editions</strong>,
          select <strong>Manage Token</strong> and use <strong>Ownership &amp; balances</strong>
          to read a specific wallet&apos;s units without guessing total circulation.</p>
      </section>

      <section className="panel guide-section" id="metadata">
        <span className="section-number">04 / PREPARE THE WORK</span>
        <h2>Create and pin NFT metadata</h2>
        <p>Open <strong>Tokens &amp; Editions</strong> and choose
          <strong> Create Token</strong> or <strong>Create Batch</strong> from the NFT catalogue.
          The corresponding Metadata Studio prepares NFT identity and content before a
          separate on-chain transaction. To edit an existing token, choose its
          <strong> Manage Token</strong> card and select <strong>Edit metadata URI</strong>.</p>
        <ol className="guide-steps">
          <li>Enter the <strong>NFT name</strong> and <strong>Description</strong>.</li>
          <li>Choose an artwork file under <strong>Or upload artwork</strong>, or paste an
            existing IPFS image URI. JPG, PNG and WebP originals are supported up to
            <strong> 100 MiB</strong>. Review the preview after upload.</li>
          <li>Optionally enter an <strong>External URL</strong> and
            <strong> Attributes</strong> (trait/value pairs).</li>
          <li>Click <strong>Pin metadata JSON to IPFS</strong>. Copy or retain the returned
            <code> ipfs://...</code> URI. This creates metadata JSON, not an NFT Token ID.</li>
          <li>For creation, choose <strong>Prepare new token</strong> to enter the
            <strong> Edition distribution</strong> and <strong>Simulate &amp; review</strong>
            steps. For existing tokens, select <strong>Prepare metadata update</strong>
            within Manage Token. Only the current selected Token ID is used.</li>
        </ol>
        <p>Already have pinned metadata from The Lab or another workflow? Use
          <strong> Import an existing IPFS metadata URI → Load metadata</strong> to populate
          the editor, review the fields and pin an updated JSON document if needed.
          Updating JSON in the editor does not automatically replace the token&apos;s
          on-chain metadata URI.</p>
        <div className="guide-callout">
          <strong>Keep the two artworks distinct:</strong> metadata artwork belongs to the NFT
          URI, while the Mint Page&apos;s artwork and banner are independently editable
          presentation assets. Editing a Mint Page does not silently rewrite NFT metadata.
        </div>
      </section>

      <section className="panel guide-section" id="tokens">
        <span className="section-number">05 / TOKENS &amp; EDITIONS</span>
        <h2>Create a Token ID, mint copies or prepare a batch</h2>
        <h3>A. Create one new NFT Token ID</h3>
        <ol className="guide-steps">
          <li>In <strong>Tokens &amp; Editions</strong>, select <strong>Create Token</strong>
            above the NFT cards and pin metadata. Choose <strong>Prepare new token</strong>
            to review the <code>createToken</code> / Create token ID contract action.</li>
          <li>Confirm the <strong>Pinned metadata URI</strong>. Under
            <strong> Recipients: one address, amount per line</strong>, leave the field
            empty to create a Token ID with <strong>zero issued units</strong>, or enter
            each recipient and a positive unit count as <code>0xWalletAddress, 1</code>.</li>
          <li>Select <strong>Simulate &amp; review</strong> (or
            <strong> Simulate (read-only)</strong> if live contract writes are disabled).</li>
          <li>In <strong>Review before you sign</strong>, verify the network, contract,
            executing wallet, action, recipients, amounts and estimated gas.</li>
          <li>Tick the confirmation checkbox and click <strong>Approve in wallet</strong>.
            Confirm in your wallet; record the transaction hash and use
            <strong> Check confirmation</strong> after it is mined.</li>
          <li>Refresh the collection and return to <strong>Tokens &amp; Editions</strong>
            to inspect the new Token ID and artwork.</li>
        </ol>
        <h3>B. Issue more copies of an existing NFT</h3>
        <p>Select a token card and choose <strong>Manage Token → Mint / Airdrop</strong>.
          Its Token ID is filled automatically. Enter recipient wallets and quantities,
          then simulate and approve.
          This is an owner/admin contract action, <strong>not</strong> a collector sale
          through Stacks. Permanently mint-locked tokens cannot be minted again.</p>
        <h3>C. Create multiple Token IDs</h3>
        <p>Choose <strong>Create Batch</strong>, pin each metadata JSON
          and select <strong>Add to batch queue</strong>
          (up to 40 pinned entries). Set the intended wallet recipient and
          <strong> Units per newly created token</strong>; use 0 for unminted editions.
          Prepare the batch, inspect the generated JSON in the action form and sign only
          after simulation. The contract action supports at most
          <strong> 40 new Token IDs / 200 total recipients</strong> per batch.</p>
        <h3>D. Update an existing Token ID</h3>
        <p>Open a token card with <strong>Manage Token</strong> and choose
          <strong> Edit metadata URI</strong>, <strong>Mint / Airdrop</strong> or
          <strong> Token royalty</strong>. The Token ID is locked to that edition.
          <strong> Default royalty</strong> is managed separately under
          <strong> Collection Settings → Collection Royalties</strong>.
          Review every permanent on-chain change before signing.</p>
        <h3>E. Collection Settings &amp; Collection Profile</h3>
        <p>Open <strong>Collection Settings</strong> to see the
          <strong> The foundation of every edition.</strong> banner and dedicated
          settings cards. <strong>Collection Identity</strong> and
          <strong> Ownership &amp; Access</strong> are read-only. The
          <strong> Collection Royalties</strong> card reads the real default-royalty
          value using <code>getDefaultRoyaltyRecipientAndPercentage</code>.
          <strong> Stacks Mint Permission</strong> shows approval status and offers
          an authorized wallet review only when the verified contract is not approved.</p>
        <p>Choose <strong>Collection Profile</strong> to add a logo, banner,
          description and HTTPS website/social links. Uploading logo or banner images pins
          original raster artwork to IPFS. <strong>Save Collection Profile</strong>
          writes app-managed data to the shared workspace with version checks and audit
          history, not to the NFT contract. The optional
          <strong> Pin Collection Profile to IPFS</strong> action creates an immutable
          public JSON document; save the resulting URI to associate it with the profile.
          This ERC1155TL v4.1.2 contract does <strong>not</strong> expose
          <code> contractURI()</code>, so the profile is not natively available to
          every marketplace. Use <strong>Back to Collection Settings</strong> to return
          to the settings cards.</p>
      </section>

      <section className="panel guide-section" id="eligibility">
        <span className="section-number">06 / CHOOSE YOUR MINT PAGE TOKEN</span>
        <h2>Mint Pages begins with the existing NFT inventory</h2>
        <p>Open <strong>Mint Pages</strong>. A persistent
          <strong> A home for every edition.</strong> banner appears above an artwork-first
          <strong> NFT Editions</strong> card grid, matching the Tokens &amp; Editions catalogue.
          Each card shows the NFT, its Mint Page status, and its separate on-chain
          TLStacks1155 drop status. Use <strong>Refresh on-chain status</strong> after
          changing a drop in The Lab or an explorer.</p>
        <p>Select <strong>Create</strong>, <strong>Manage</strong>,
          <strong> Restore</strong> or <strong>Review closeDrop</strong> on a token card.
          The catalogue is replaced by a full-width editor or transaction review;
          choose <strong>Back to NFT Editions</strong> to return to the cards.
          When editing a Mint Page, the app asks before discarding unsaved changes.</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>What you see</th><th>What it means</th><th>What to do</th></tr></thead>
            <tbody>
              <tr><td><strong>Available / Create</strong></td><td>The NFT exists,
                its Stacks drop is not configured and this app has no reserved
                canonical Mint Page.</td><td>Select <strong>Create</strong>.</td></tr>
              <tr><td><strong>Existing Mint Page / Manage</strong></td><td>This token
                already has a canonical Mint Page in this app.</td><td>Select
                <strong> Manage</strong>; do not create another identity.</td></tr>
              <tr><td><strong>Archived / Restore</strong></td><td>A previously published
                canonical Mint Page is archived.</td><td>Select
                <strong> Restore</strong> to recover its existing URL and history.</td></tr>
              <tr><td><strong>Existing on-chain drop / Review closeDrop</strong></td>
                <td>A Stacks drop is still configured, including Scheduled,
                  Presale, Public Sale or Ended.</td><td>Close the previous drop
                  first if you want to create a new Mint Page here.</td></tr>
              <tr><td><strong>Verification required / Locked</strong></td>
                <td>The RPC read is unknown, the token is missing or minting
                  is permanently locked.</td><td>Refresh or investigate;
                  do not assume the token is available.</td></tr>
            </tbody>
          </table>
        </div>
        <div className="guide-callout">
          <strong>IMPORTANT — Ended is not Closed.</strong> A timed sale may have
          finished or sold out while its drop configuration still exists.
          A configured drop must be <strong>closed on TLStacks1155</strong>
          before creating a brand-new Mint Page in this app. The app checks the
          contract, not who originally created the drop.
        </div>
        <h3>Moving an NFT drop from The Lab to this app</h3>
        <ol className="guide-steps">
          <li>In The Lab (<a href="https://lab.transient.xyz" target="_blank"
            rel="noopener noreferrer">lab.transient.xyz</a>), use the authorized
            wallet to find the collection and the token&apos;s existing drop.</li>
          <li>Close that drop using The Lab&apos;s available management control,
            if it supports the action. Confirm the transaction in your wallet.
            If necessary, use a verified contract interface with the authorized wallet.</li>
          <li>Return to <strong>Mint Pages</strong> in this app and refresh.
            Check that <strong>dropType = 0</strong> / <strong>NOT_CONFIGURED</strong>.
            If there is no canonical page here, the token can offer <strong>Create</strong>.</li>
          <li>Build and publish your independent page here. No The Lab private draft,
            artwork layout or URL is imported automatically.</li>
        </ol>
        <h3>Moving a Stacks drop from this app toward The Lab</h3>
        <ol className="guide-steps">
          <li>In <strong>Mint Pages</strong>, find the token with a configured drop and
            select <strong>Review closeDrop</strong>.</li>
          <li>Inspect the read-only <code>closeDrop</code> simulation, transaction
            arguments and gas estimate. Then select
            <strong> Prepare closeDrop wallet review</strong> and explicitly approve
            the wallet transaction.</li>
          <li>Use <strong>Check confirmation</strong>, refresh inventory and verify the
            drop has become <strong>NOT_CONFIGURED</strong> before using The Lab.</li>
        </ol>
        <p>Closing an on-chain drop does <strong>not</strong> burn previously minted NFTs,
          delete ownership balances, remove The Lab&apos;s off-chain Mint Page or guarantee
          that The Lab permits a new page. The Lab can apply its own page-identity rules.
          Both apps must be checked separately. <strong>Never close a drop you still want
          collectors to mint from.</strong></p>
      </section>

      <section className="panel guide-section" id="draft">
        <span className="section-number">07 / CREATE A MINT PAGE</span>
        <h2>Fill the four sections of Mint Page Studio</h2>
        <h3>01 · Page content</h3>
        <ol className="guide-steps">
          <li>Select an <strong>Available</strong> token and click <strong>Create</strong>.
            Enter a unique, lowercase hyphenated <strong>Page slug</strong>
            (for example <code>my-first-edition</code>).</li>
          <li>Enter your page <strong>Title</strong> and
            <strong> Description</strong>, then upload or paste
            <strong> Artwork URL</strong> and <strong>Banner URL</strong>.
            JPG, PNG and WebP files can be pinned to IPFS from the editor.
            An optional <strong>External link</strong> can lead to the artist&apos;s site.</li>
          <li>Remember that page content is independent of the on-chain NFT metadata.</li>
        </ol>
        <h3>02 · Sale configuration</h3>
        <ol className="guide-steps">
          <li>Enter and double-check the <strong>Payout receiver</strong> wallet.
            This receives sale proceeds according to the Stacks contract.</li>
          <li>Set <strong>Allocation (units)</strong> and
            <strong> Maximum per recipient / round</strong>.
            Allocation is how many new units Stacks is allowed to mint in this
            drop; it is not a lifetime cap on already issued NFT copies.</li>
          <li>Select <strong>ETH</strong> or <strong>ERC20</strong> payment.
            For ERC-20, enter its contract and choose <strong>Read decimals</strong>
            before typing the public price. The protocol fee is charged in
            native ETH per minted unit even for ERC-20 sales.</li>
          <li>Set <strong>Public price per unit</strong>,
            <strong> Start (UTC)</strong> and
            <strong> Public duration (seconds)</strong>.
            <code>86400</code> seconds means one day.
            Public sale begins after any presale window.</li>
          <li>For a presale, expand <strong>Presale and allowlist</strong>.
            Supply its duration, presale price and compatible Merkle root.
            Each allowlisted collector must separately provide their correct
            allowance and proof when minting.</li>
        </ol>
        <div className="guide-callout">
          <strong>Limited, Timed and Inclusive are sale concepts, not three
          preset buttons in this editor.</strong> This release configures
          TLStacks1155 v2.3.1 <strong>fixed-price</strong> drops using explicit
          allocation, allowance and time-window parameters. A limited allocation
          or scheduled end can stop minting, but it does not automatically call
          <code> closeDrop</code>. Do not describe a positive-duration,
          finite-allocation configuration as mathematically unlimited.
        </div>
        <h3>03 · Content preview</h3>
        <p>Switch between <strong>desktop</strong> and <strong>mobile</strong>
          previews. This only previews the content; it neither mints an NFT nor
          makes the page public.</p>
        <h3>04 · Save and publish</h3>
        <ol className="guide-steps">
          <li>Click <strong>Save revision</strong> to persist the draft in the shared,
            authenticated collection workspace. Other authorized owners/admins
            can continue editing with version protection.</li>
          <li>Click <strong>Check sale readiness (read-only)</strong> and, if desired,
            <strong> Calculate draft collector quote</strong> to inspect the
            configured amount and estimated fee before submitting.</li>
          <li>Resolve any warning about missing Stacks mint permission, locked token,
            paused protocol, a stale on-chain baseline or invalid sale parameters.</li>
          <li>When ready, select <strong>Prepare publication</strong>. See the
            next section for the wallet and confirmation workflow.</li>
        </ol>
      </section>

      <section className="panel guide-section" id="publish">
        <span className="section-number">08 / PUBLISH SAFELY</span>
        <h2>Simulate, sign, confirm, then share the public URL</h2>
        <ol className="guide-steps">
          <li>First verify that the collection has granted the pinned
            TLStacks1155 contract mint permission. In
            <strong> Collection Settings</strong> or the collection action form,
            choose <strong>Approve verified Stacks as a minter</strong>
            if the checker reports <strong>Not approved</strong>.
            This is a separate on-chain action.</li>
          <li>Save the latest page revision, review the sale-readiness result
            and select <strong>Prepare publication</strong>. For a first drop,
            the reviewed function is normally <code>configureDrop</code>.
            Updates to a running drop may require several separate transactions.</li>
          <li>In <strong>Review before you sign</strong>, inspect chain,
            wallet, Stacks contract, payout address, price, supply settings,
            start time, durations, gas and exact function arguments.</li>
          <li>Tick the acknowledgment, select <strong>Approve in wallet</strong>
            and confirm the transaction. Copy the hash; do not repeat the action
            just because the app has not updated its status.</li>
          <li>Click <strong>Check confirmation</strong>. The app verifies
            receipt/finality and reads back the expected on-chain state.
            A page can remain <strong>PUBLISHING</strong> until this
            reconciliation finishes—even if your wallet says Confirmed.</li>
          <li>After the page reports a completed publication, open
            <code> https://transient.endhonesa.com/mint/your-slug</code>.
            You can share the public page before the scheduled mint start time;
            collectors cannot mint until the applicable sale phase opens.</li>
        </ol>
        <p>If sale settings already match the blockchain, a content-only
          publication may be offered instead of a new chain transaction.
          If you changed the draft but have not published it, visitors still
          see the <strong>last published revision</strong>. Publishing does not
          automatically retry a failed or replaced wallet transaction.</p>
      </section>

      <section className="panel guide-section" id="lifecycle">
        <span className="section-number">09 / MANAGE YOUR DROP</span>
        <h2>One Token ID, one permanent Mint Page identity</h2>
        <p>This app applies the policy <strong>one chain + collection contract +
          Token ID → one canonical Mint Page</strong>. Once a page has been published,
          its internal ID and NFT identity remain reserved. A future drop round must
          use <strong>Manage</strong> or <strong>Restore</strong> on that same page,
          not a new duplicate URL.</p>
        <div className="guide-grid">
          <div className="guide-note">
            <h3>Edit content or sale terms</h3>
            <p>Open <strong>Manage</strong>, change content or permitted sale fields,
              save a new revision and review the difference before publishing.
              Allocation and certain contract parameters cannot be changed
              while an active drop forbids them. Use <strong>Inspect current state</strong>
              if another app changed the drop.</p>
          </div>
          <div className="guide-note">
            <h3>Edit the published URL</h3>
            <p>Open <strong>Manage → 01 · Page content →
              Public Mint Page URL → Edit URL</strong>, enter a new slug and
              click <strong>Save new URL</strong>. No blockchain gas is needed.
              Old URLs are permanently reserved and issue an HTTP 308 redirect
              to the current canonical URL. Unsaved content revisions remain
              unpublished.</p>
          </div>
          <div className="guide-note">
            <h3>Close a configured drop</h3>
            <p>Use <strong>Review closeDrop</strong>, inspect the simulated
              <code>closeDrop</code> call and request the wallet review.
              After confirming, check the finalized receipt and refresh status.
              <strong>NOT_CONFIGURED</strong> and an increased
              <code> getDropRound</code> confirm the contract-level transition.</p>
          </div>
          <div className="guide-note">
            <h3>Archive, restore or reopen</h3>
            <p>For a published page, close the drop before selecting
              <strong> Archive</strong>. Archiving hides the public page but
              preserves its publication, transaction and slug history.
              Later choose <strong>Restore</strong> for the same token and
              prepare its next permitted round. Draft-only unpublished
              pages can release a token claim when safely archived.</p>
          </div>
        </div>
        <p><strong>Ended ≠ Closed.</strong> An expired/sold-out sale may remain
          configured until deliberately closed. Closing does not burn
          collector NFTs, erase the on-chain transaction record or
          delete an existing The Lab page. Opening a later round may issue
          additional NFT units, so preserve any lifetime edition cap promised
          to collectors.</p>
      </section>

      <section className="panel guide-section" id="transactions">
        <span className="section-number">10 / TRANSACTION RECOVERY</span>
        <h2>When a wallet confirms but the app still says PUBLISHING</h2>
        <ol className="guide-steps">
          <li>Open the collection&apos;s <strong>Transactions</strong> tab and
            choose <strong>Load history</strong>.</li>
          <li>Find the saved action (for example <code>configureDrop</code>,
            <code>closeDrop</code> or <code>createToken</code>) and reopen its review.</li>
          <li>Use <strong>Check confirmation</strong> for the existing hash.
            The service checks the finalized receipt and expected contract
            changes; do <strong>not</strong> prepare/send a duplicate transaction.</li>
          <li>If you used wallet speed-up, paste the replacement hash and
            select <strong>Verify same action</strong>.
            For a wallet cancellation or different replacement, select
            <strong> Verify cancellation / changed action</strong>.</li>
          <li>After finality, refresh the collection and Mint Pages inventory.
            If the baseline changed externally, use
            <strong> Inspect current state</strong> and review before accepting it.</li>
        </ol>
        <div className="guide-callout">
          <strong>Closing the review modal is not cancellation.</strong>
          Wallet submissions are never automatically retried by the app.
          A saved status of <strong>SUBMITTED</strong> must not be mistaken
          for a finalized on-chain success.
        </div>
      </section>

      <section className="panel guide-section" id="collector">
        <span className="section-number">11 / FOR YOUR COLLECTORS</span>
        <h2>How visitors mint from your public page</h2>
        <ol className="guide-steps">
          <li>Share the published URL:
            <code> https://transient.endhonesa.com/mint/your-slug</code>.</li>
          <li>The collector opens the page, connects their compatible
            wallet and switches to the NFT collection&apos;s chain.</li>
          <li>They check the live phase and price, select a quantity and
            click <strong>Review payment &amp; mint</strong> during an
            active sale window.</li>
          <li>Allowlisted presale collectors must also provide the correct
            Merkle <strong>allowance and proof</strong>.</li>
          <li>For native ETH sales, the edition price and Stacks
            protocol fee are paid in ETH, plus gas. For ERC-20
            sales, the collector approves the required ERC-20
            amount, then pays the token price and separate ETH
            protocol fee (plus gas).</li>
          <li>After signing, check transaction confirmation and NFT
            balances on the chain. Minting is blocked when the drop
            is closed, sold out, not yet started, paused, out of sync,
            locked or outside the collector&apos;s allowance.</li>
        </ol>
        <h3>View your editions, activity and collectors</h3>
        <p>On a published Mint Page, <strong>Your editions</strong> reads the
          connected wallet&apos;s current ERC-1155 <code>balanceOf</code>
          for that Token ID. It is a live ownership balance, not the
          quantity originally purchased. No wallet connected means no
          personal balance is displayed.</p>
        <p><strong>Activity</strong> shows indexed Stacks purchases and ERC-1155
          mint/transfer events with on-chain transaction links.
          <strong> Collectors</strong> lists wallet addresses discovered
          from those transfer events and verifies each displayed quantity
          using a fresh ERC-1155 balance read. Wallets may have received
          or transferred editions without minting them personally.</p>
        <p>Historical blockchain indexing runs in bounded, incremental
          batches. While the page displays <strong>Historical indexing in
          progress</strong>, its activity and holder list can be
          incomplete; the app does <strong>not</strong> assert a complete
          collector count until older events have been processed.
          Wallet addresses are not verified real-world identities.</p>
        <h3>Open and share a published Mint Page from the editor</h3>
        <p>In <strong>Mint Pages</strong>, a published and non-archived
          token offers <strong>Manage</strong>,
          <strong> View Mint Page</strong> (opens a new tab) and
          <strong> Copy URL</strong>. The same public-link actions are
          available under <strong>01 · Page content → Public Mint Page URL</strong>
          inside the editor. They use the current canonical slug;
          the old slug redirects to it after an Edit URL operation.</p>
        <ol className="guide-steps">
        </ol>
      </section>

      <section className="panel guide-section" id="networks">
        <span className="section-number">12 / NETWORK STATUS &amp; COMPATIBILITY</span>
        <h2>Supported adapters and runtime checks</h2>
        <p>These are the application&apos;s <strong>configured target networks</strong>.
          This table is not a live RPC uptime indicator and does not promise that
          writes are currently enabled. For the current contract state,
          use <Link href="/checker">Contract Checker</Link> or the Mint Page
          inventory. Each request verifies chain ID and pinned contract code.</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Network</th><th>Chain ID</th><th>Creator</th><th>Stacks sale adapter</th></tr></thead>
            <tbody>{targetChains.map(chain => (
              <tr key={chain.id}>
                <td><strong>{chain.name}</strong></td>
                <td>{chain.id}</td>
                <td>ERC1155TL v4.1.2</td>
                <td>TLStacks1155 v2.3.1</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <p className="mono guide-address">Pinned creator implementation: {CREATOR_IMPLEMENTATION}</p>
        <p className="mono guide-address">Pinned Stacks contract: {STACKS}</p>
        <div className="guide-callout">
          <strong>Live write availability is conditional.</strong> Contract compatibility,
          current owner/admin permission, network state, wallet approval and the
          operator&apos;s mainnet-write control must all allow a transaction.
          If the app shows <strong>Simulate (read-only)</strong> or
          <strong> Mainnet publication locked</strong>, you may inspect
          and prepare drafts but cannot send that action from this app.
        </div>
        <h3>What this release does not do</h3>
        <p>It does not reproduce all of The Lab. It supports the verified
          ERC1155TL creator adapter and TLStacks1155 fixed-price drop flow,
          not every Transient Labs contract, every drop style or private
          The Lab page feature. It does not automatically manage ownership
          transfers, role revocations, arbitrary mint contracts, burning,
          Velocity drops or third-party private Mint Page records.</p>
      </section>

      <section className="panel guide-section" id="troubleshooting">
        <span className="section-number">13 / QUICK TROUBLESHOOTING</span>
        <h2>Common questions and fixes</h2>
        <details className="guide-faq">
          <summary>My collection says Unsupported implementation.</summary>
          <p>Confirm you selected the correct chain and the ERC-1155 collection
            address. This release only accepts a verified ERC1155TL v4.1.2
            implementation (including its supported canonical clone),
            not all NFT contracts created elsewhere.</p>
        </details>
        <details className="guide-faq">
          <summary>I can inspect the collection but cannot save or publish.</summary>
          <p>Connect the collection owner or ADMIN_ROLE wallet, switch to the
            collection&apos;s chain and complete the SIWE sign-in message.
            Check whether the operator has disabled live on-chain writes.
            Public read access does not grant admin privileges.</p>
        </details>
        <details className="guide-faq">
          <summary>Why is a Timed Edition already Ended but Create is unavailable?</summary>
          <p>Ending the sale window does not remove its drop configuration.
            It must be closed on TLStacks1155 before a first Mint Page
            can be created here. Review close with an authorized wallet
            and check the finalized receipt before refreshing.</p>
        </details>
        <details className="guide-faq">
          <summary>Why is my published Mint Page inaccessible?</summary>
          <p>Check whether the page was archived and whether its transaction
            is still PUBLISHING or SUBMITTED. In Transactions,
            use Check confirmation rather than configuring the drop again.
            A scheduled future start normally prevents minting,
            not viewing a successfully published page.</p>
        </details>
        <details className="guide-faq">
          <summary>Can I edit the slug after publishing?</summary>
          <p>Yes. In Manage, use Public Mint Page URL → Edit URL.
            The Token ID and Mint Page ID remain permanent; the
            previous URL becomes a reserved 308 redirect.
            A new URL cannot take over another page&apos;s past slug.</p>
        </details>
        <details className="guide-faq">
          <summary>Why did my changes not appear on the public Mint Page?</summary>
          <p>Save revision stores a private draft. Publish its content or
            reconcile a required on-chain change before expecting visitors
            to see the new revision. Slug edits are separate and never
            automatically publish unsent title, artwork or sale edits.</p>
        </details>
        <details className="guide-faq">
          <summary>Does Close Drop remove NFTs or my page on The Lab?</summary>
          <p>No. It ends/removes the active Stacks drop configuration and
            advances the drop round. Existing NFTs and historical
            on-chain events remain; The Lab&apos;s private page lifecycle
            is separate. Also check The Lab before assuming a new
            page there can be created.</p>
        </details>
        <details className="guide-faq">
          <summary>My transaction was sped up or canceled in my wallet.</summary>
          <p>Open the saved review under Transactions and supply the
            replacement hash. Use Verify same action or Verify
            cancellation / changed action as applicable. Never
            automatically resend a transaction because the UI looks stale.</p>
        </details>
        <p className="guide-finish"><strong>Need to start again?</strong>{' '}
          Open <Link href="/">Collections</Link>, or read the contract
          first in <Link href="/checker">Contract Checker</Link>.
          Keep your wallet seed phrase and private keys out of this app
          and out of support conversations.</p>
      </section>
    </div>
  );
}
