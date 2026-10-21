# MASTER WORK EXECUTION SPECIFICATION
## TRANSIENT CONTRACT MANAGER by ENDHONESA

**Version:** 1.0  
**Prepared:** October 21, 2026  
**Project Domain:** https://transient.endhonesa.com  
**Project Status:** Specification approved for implementation handoff; development not yet started.

---

## 1. Your Mission

Act as a senior full-stack Web3 engineer, smart contract integration specialist, security engineer, and deployment operator.

Build a production-oriented, non-custodial web application called **Transient Contract Manager**, using Next.js and established EVM technologies.

The application solves a specific limitation of Transient Labs' creator dashboard: a wallet holding an authorized admin role on an NFT creator contract may be able to execute administrative functions on-chain but may not be able to access the same collection-management interface as the original creator wallet.

Our application must allow authorized owners and admins to manage supported Transient Labs NFT contracts directly by contract address.

The application must also provide its own independent mint page studio and public mint experience, without relying on the proprietary draft-management backend of lab.transient.xyz.

**Do not recreate, redeploy, migrate, or take ownership of existing NFT creator contracts.**

Build a genuinely functional application, not a static prototype.

## 2. Official References

Research and use these sources:

- https://transient.xyz
- https://lab.transient.xyz
- https://github.com/Transient-Labs
- https://github.com/Transient-Labs/tl-creator-contracts
- https://github.com/Transient-Labs/tl-stacks
- https://github.com/Transient-Labs/tl-stacks/blob/main/deployments.json

Inspect relevant verified contract implementations, ABI artifacts, deployment registries, source revisions, and tests.

Pin the exact source revision used for each adapter. Do not assume that the latest branch represents the historical version of an already deployed contract.

Do not depend on undocumented or private Transient Labs APIs.

Use the owner's provided screenshots of The Lab as workflow and interface references where available. Do not copy proprietary assets or misrepresent this independent application as an official Transient Labs product.

## 3. Reference Case: Ganti Oli #1

Use this actual Ethereum Mainnet collection as the primary reference implementation.

**NFT Collection**

- Name: Ganti Oli #1
- Symbol: GO1
- Standard: ERC-1155
- Contract implementation family: ERC1155TL
- Reported `VERSION()`: `4.1.2`
- Network: Ethereum Mainnet
- Chain ID: `1`
- Address: `0x5807E66182A38788a3854853225a2B6d8E0480f2`

**Collection Owner**

`0xbeE916aBC292D4EfF57702fABbA1AAC4d4046036`

**Authorized Additional Admin**

`0x29bf68e3969e0b6686ea55b7c48241ba3f6b9ba0`

**ADMIN_ROLE**

`0xa49807205ce4d355092ef5a8a18f56e8913cf4a201fbe287825b095693c21775`

The user previously queried `getRoleMembers(ADMIN_ROLE)` and received the additional admin wallet above.

**Approved Mint Contract Role**

`0xf0178e81e3689af48153edf0e1b2d669fe2786ab9e21fdecf3e3771c70330af5`

**Approved Mint Contract**

- Name: TLStacks1155
- Version: 2.3.1
- Address: `0x32953D7ae37B05075b88c34E800aE80C1Cb1B794`

The Stacks deployment address matches the official Transient Labs deployment registry.

**Existing NFT**

- Token ID: `1`
- `getTokenDetails(1).created`: `true`
- Metadata URI: `ipfs://bafybeicycur6535m3r2lktirmxh4jaghvrwzbbymztz7my5bz2srkhmlbi/0`
- Intended edition quantity reported by creator: 1

Verify minted supply, circulating balances, and actual holder information independently. Do not confuse edition quantity, minted units, and sale allocation.

**Existing Sales State**

The user previously read `TLStacks1155.getDrop(GO1, 1)` and received default zero-valued fields, including `dropType = 0` and zero payout receiver.

An original mint page draft exists inside The Lab, but its settings have not been committed to this Stacks drop.

Our application will create and manage independent drafts. Do not assume the original draft is accessible.

All historical facts must be revalidated where their current blockchain state matters.

## 4. Supported Blockchain Networks

Target these four EVM networks:

| Network | Chain ID |
|---|---|
| Ethereum Mainnet | 1 |
| Robinhood Chain Mainnet | 4663 |
| Base Mainnet | 8453 |
| Shape Mainnet | 360 |

Use official RPC configurations and reputable network providers. Provide a network registry containing chain ID, RPC endpoints, explorer configuration, native currency, and verified compatible protocol deployments.

Do not assume CREATE2 addresses are deployed or functional on every network.

For each network, independently verify:

- Contract bytecode and implementation.
- Applicable NFT creator contract types.
- Available Transient Stacks contracts and versions.
- Exact ABI compatibility.
- Required roles and permissions.
- Public mint execution and fee behavior.

Network configuration must support all four networks. Actual management and public mint functionality must be enabled only when the corresponding implementations are verified.

An unsupported contract or protocol must fail safely with an accurate explanation, rather than being presented as operational.

The architecture must permit adding future EVM networks and additional Transient contract versions without rewriting core application logic.

## 5. Core User Flow

1. User visits `transient.endhonesa.com`.
2. User connects an EVM wallet.
3. User selects **Start Managing**.
4. User selects a supported blockchain.
5. User enters an existing NFT contract address.
6. Application validates the network, contract, implementation, and permissions.
7. Application reads the contract's owner and applicable administrative roles.
8. If the wallet is authorized, open the Collection Management Dashboard.
9. Otherwise, display an informative Access Denied message and provide access to Contract Checker.

Suggested error:

"Your connected wallet does not have the required administrative permission for this collection. If you believe this is an error, open Contract Checker to inspect the contract owner and admin roles."

Never use application database records as the sole source of permission.

## 6. Required Modules

### 6.1 Wallet and Contract Access

Implement:

- EVM wallet connection and disconnection.
- Network selection and switching.
- Sign-In with Ethereum authentication.
- Contract address input and validation.
- Contract type and implementation detection.
- Owner and admin verification.
- Capability-based access control.
- Read-only Contract Checker.
- Clear unsupported-contract and wrong-network states.

Support standard injected and WalletConnect-compatible wallets. Consider EIP-1271 smart contract wallets where compatible.

### 6.2 Collection Management

Build a dashboard containing:

- Collection identity, name, symbol, and contract.
- Network and implementation version.
- Owner and authorized admin information.
- Token inventory and metadata.
- Contract status and royalty settings.
- Relevant transaction history.
- Supported administrative actions.

The UI should be inspired by the workflows in The Lab while maintaining an independent product identity.

### 6.3 Token and Editions Management

For ERC1155TL v4.1.2, inspect and implement supported operations, including:

- `createToken`
- `batchCreateToken`
- `mintToken`
- `getTokenDetails`
- `uri`
- `setTokenUri`
- `balanceOf`
- `setDefaultRoyalty`
- `setTokenRoyalty`

Handle overloaded ABI functions correctly.

Implement token creation, minting, batch minting/airdrop, token details, and metadata updates according to verified contract permissions.

Never label an operation as available solely because its signature exists in the ABI.

Do not expose destructive ownership or role-revocation functions in v1.

### 6.4 Independent Mint Page Studio

Build a complete independent mint page management interface.

Required capabilities:

- Create and save draft.
- Edit existing draft.
- Share editing privileges across authorized collection owner/admin wallets.
- Revision history and audit trails.
- NFT selection by token ID.
- Title, artwork, description, banner, external links.
- Desktop and mobile preview.
- Sale pricing and currency selection.
- Supply allocation and mint limits.
- Presale configuration if supported.
- Public mint schedule and configuration.
- Payout receiver.
- Transaction preparation and simulation.
- Publication and synchronization monitoring.

Draft content must persist in our application's database.

Do not depend on The Lab's proprietary mint page database.

### 6.5 Public Mint Experience

Published pages use:

`https://transient.endhonesa.com/mint/[slug]`

Collector flow:

1. Open public mint page.
2. View NFT content and verified mint conditions.
3. Connect wallet.
4. Switch to the correct network.
5. Select mint quantity if permitted.
6. Review price, fees, and total payment.
7. Approve payment where required.
8. Execute the official Stacks mint transaction.
9. Display transaction confirmation, receipt, and NFT details.

The application must handle insufficient funds, wrong network, sold-out status, expired sales, failed approvals, and transaction errors.

Display current on-chain price, status, supply, and applicable fees rather than relying only on saved draft values.

## 7. Autonomous Admin Policy

A wallet authorized as owner or admin may create, edit, and publish mint sales without a separate in-app approval from the collection owner, provided the relevant contract functions authorize the action.

All administrative transactions require explicit approval from the connected wallet.

The application must not introduce an additional owner approval requirement that contradicts the intended autonomous admin workflow.

However, admin permissions must not be interpreted as unlimited ownership of existing NFT units, third-party wallets, or unrelated assets.

For sensitive settings such as payout receiver changes, require a clear pre-transaction review and explicit acknowledgement by the executing wallet.

## 8. Shared Collection Workspace

The workspace belongs to a collection, not to the wallet that created the first draft.

Every verified owner/admin may:

- View collection drafts.
- Create or edit shared mint pages.
- Save and review revisions.
- Preview and publish sale configurations.
- Continue work started by another authorized administrator.

Enforce authorization on the server and database operations, not only in the UI.

Use optimistic concurrency/version checks or an equivalent mechanism to prevent silent overwrites from simultaneous editors.

When a wallet loses its on-chain admin role, revoke its ability to modify drafts or execute management operations through the application.

## 9. Data Architecture

Recommended stack:

- Next.js App Router
- React and TypeScript
- Tailwind CSS
- Wagmi and Viem
- SIWE-compatible authentication
- Supabase PostgreSQL
- IPFS-compatible media/metadata storage
- Vercel deployment
- GitHub source control

Suggested database entities:

- `collections`
- `collection_profiles`
- `mint_pages`
- `mint_page_revisions`
- `media_assets`
- `publication_records`
- `audit_logs`

Use a unique collection identity based on `chainId + normalizedContractAddress`.

Store canonical addresses carefully, using case-insensitive identity and checksum formatting for display.

Mint page slugs must be globally unique and resolve to a specific chain, contract, token ID, and configured sales protocol.

On-chain ownership, roles, sale status, payment conditions, and token balances remain authoritative. Database copies are caches or application records, never substitutes for current blockchain verification.

## 10. Mint Page Publication State Machine

Separate content publication from on-chain sale status.

Suggested content states:

- DRAFT
- READY_FOR_REVIEW
- PUBLISHING
- PUBLISHED
- PUBLISH_FAILED
- OUT_OF_SYNC
- ACTION_REQUIRED

Sale phases must be independently derived from the Stacks contract and its actual version-specific rules.

Publication workflow:

1. Validate all draft fields.
2. Recheck administrative authorization.
3. Read the latest NFT and Stacks contract states.
4. Compare against the editor's original snapshot.
5. Display and resolve external modifications.
6. Verify payout, price, allowance, supply, dates, and fees.
7. Simulate the transaction.
8. Request explicit wallet approval.
9. Wait for transaction confirmation.
10. Read back the resulting Stacks drop configuration.
11. Publish the corresponding revision only when on-chain settings are consistent.

Handle interrupted transactions, browser closure, transaction replacement, RPC outages, and chain reorganizations.

Do not automatically retry a transaction that could produce duplicate on-chain effects.

## 11. Security Requirements

Security is mandatory, not optional.

Implement:

- Non-custodial architecture.
- No private keys or seed phrase collection.
- SIWE nonce, signature, domain, chain, expiry, and replay validation.
- Secure sessions and CSRF protections.
- Server-side authorization for every mutation.
- Current on-chain role verification for sensitive actions.
- Exact-chain validation for reads and writes.
- Verified ABI and implementation matching.
- Transaction simulation before execution.
- Explicit wallet signing for every on-chain write.
- Robust validation of addresses, token IDs, amounts, timestamps, and currency decimals.
- Supabase Row Level Security.
- Safe handling of service-role credentials.
- Sanitized external content, metadata, and SVG/media.
- IPFS integrity and gateway fallback strategies.
- Rate limiting, logging, and error handling.
- Audit trails for changes and publication.
- Detection of revoked admin permissions.
- Detection of external Stacks configuration changes.
- Proper ERC-20 approval handling where relevant.
- Avoidance of unlimited ERC-20 allowance by default.
- Appropriate transaction finality checks.

Conduct automated security tests and review dependencies for known vulnerabilities.

The system must never assume that successful wallet connection proves administrative authorization.

## 12. Hard Safety Boundaries

The GO1 collection is a real mainnet asset.

During development:

**DO NOT perform any write transaction against GO1 on Ethereum Mainnet without explicit approval from the user for that particular action.**

Do not:

- Mint real GO1 NFT units.
- Create or change its live drop.
- Change its payout receiver.
- Change its royalties or metadata.
- Change roles or ownership.
- Publish its live mint sale.
- Spend ETH or approve token transfers from a real wallet.

Use read-only mainnet access, local mocks, suitable testnets, and preferably mainnet-fork testing with impersonated accounts where appropriate.

Do not deploy additional smart contracts to any mainnet without explicit approval.

GitHub, Vercel, Supabase, DNS, and paid infrastructure actions must use authorized connections and respect the user's approval for consequential changes.

## 13. UX and Design

Provide a clean, functional creator-oriented experience.

Prioritize clarity and practical management workflows over decorative design.

Recommended management navigation:

- Overview
- Tokens & Editions
- Mint Pages
- Collection Settings
- Contract Checker

Provide responsive desktop and mobile layouts.

Visual references may come from the screenshots of the official The Lab dashboard supplied in the project conversation.

Use English for internal documentation and default UI, with a localization-friendly architecture for Indonesian and additional languages.

Make clear that Transient Contract Manager is an independent application, not an officially operated Transient Labs interface.

## 14. Implementation Milestones

### M0 — Protocol and Network Audit

Before implementing transaction capabilities:

- Verify creator contract implementation and ABI.
- Verify TLStacks1155 v2.3.1 source and ABI.
- Determine all function-specific permissions.
- Audit mint sale configuration semantics.
- Verify buyer fees, payout behavior, quantity units, decimals, and sale restrictions.
- Verify actual Stacks deployment availability on all four networks.
- Produce a compatibility matrix.
- Define transaction fixtures and failure cases.
- Identify any unsupported requirements or blockers.

**Gate:** No live-write functionality may be activated based on unverified assumptions.

### M1 — Localhost Application

Build the working Next.js application with:

- Wallet connection.
- SIWE authentication.
- Network selection.
- Contract checker.
- Contract adapter registry.
- Permission verification.
- GO1 dashboard and read-only collection data.

**Gate:** Both GO1 owner and admin roles are recognized; unauthorized wallets cannot gain management access.

### M2 — Collection Management

Implement:

- Token management.
- Editions and minting operations.
- Metadata workflows.
- Royalties.
- Simulation and transaction review.

Test using mocked or forked contracts before any live transactions.

**Gate:** All supported functions pass success and failure tests.

### M3 — Independent Mint System

Implement:

- Shared collection workspace.
- Mint page editor.
- Persistent drafts and revisions.
- Preview.
- Sales configuration.
- Publication workflow.
- Public mint pages.
- Collector payment and minting.

**Gate:** End-to-end mint workflow succeeds in a controlled testing environment, and the system correctly handles failures.

### M4 — Production Preparation and Deployment

- Configure GitHub repository and CI.
- Prepare Supabase migrations and security policies.
- Prepare environment variables and secret management.
- Deploy Vercel preview.
- Perform production build and integration tests.
- Validate network compatibility.
- Review security checklist.
- Prepare domain `transient.endhonesa.com`.
- Connect DNS with user authorization.
- Validate HTTPS and authentication-domain configuration.
- Deploy production when approved.

**Gate:** No unapproved mainnet writes. No claim of full four-chain functionality unless it has been individually demonstrated.

## 15. Definition of Done

Work is complete only when:

- The application runs locally and has a documented setup process.
- Authorized owner/admin wallets can manage compatible contracts by address.
- Unauthorized wallets cannot change administrative data.
- GO1 displays correct verified collection and token information.
- Shared drafts work across owner and admin sessions.
- Mint Page Studio saves, restores, previews, and publishes configurations in supported environments.
- Collector minting succeeds in end-to-end tests.
- Chain switching and network-specific configuration work correctly.
- Each of the four target chains has a documented, tested capability status.
- Security and transaction tests pass.
- The GitHub repository and deployment artifacts are reproducible.
- The production or preview deployment has been checked.
- Known limitations are documented honestly.
- No mainnet assets have been changed without authorization.

A successfully deployed frontend with nonfunctional administrative controls does not satisfy the Definition of Done.

## 16. Required Deliverables

Provide:

1. Complete source repository.
2. README and architecture documentation.
3. Pinned contract ABI/adapter registry.
4. Verified network/deployment matrix.
5. Supabase SQL migrations and RLS policies.
6. `.env.example` without secrets.
7. Unit and integration tests.
8. Contract simulation/fork tests.
9. Security test and review results.
10. Localhost run instructions.
11. Vercel deployment configuration.
12. DNS/custom-domain instructions.
13. Admin and collector user guides.
14. Final implementation report with test evidence.
15. Explicit list of remaining blockers, if any.

## 17. Execution Instructions for ChatGPT Work

Carry out the project end-to-end, using approved connected tools and services where available.

Begin with M0. Continue through subsequent milestones when the previous gate has passed.

Do not stop after writing a plan or producing mockups. Write, run, test, debug, and document the working application.

Maintain a clear progress report showing:

- Completed milestone.
- Files and services changed.
- Tests executed and results.
- Known issues.
- Required user decisions.
- Next action.

You may make reversible technical choices autonomously, but ask before irreversible blockchain transactions, unexpected payments, changes to existing production infrastructure, or other consequential external actions.

If access to GitHub, Vercel, Supabase, or DNS is unavailable, explain the precise blocker and continue every independent task possible. Never claim an external action succeeded without verification.

Use an extensible, auditable, security-first architecture.

**Primary acceptance scenario:** An additional administrative wallet for Ganti Oli #1 can manage the collection through TRANSIENT.ENDHONESA.COM even though that wallet did not create the collection in The Lab.

**Final product principle:**

One management interface. Four target blockchains. Independent mint pages. Shared collection workspace. On-chain authority. No unnecessary custody.

**OiOi.**
