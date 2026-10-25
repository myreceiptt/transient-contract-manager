import { GO1 } from './chains';

// Operator-approved token-specific publication identity.
// This registry is deliberately separate from contract adapters: non-GO1
// collections remain unchanged, and no blockchain state is written here.
export const canonicalMintPages = [
  {
    chainId: 1,
    contract: GO1.toLowerCase(),
    tokenId: '1',
    slug: 'pancasila-vs-pancakaki',
    payoutReceiver: '0x57eE21f9aCFFCBa7F1E8cB51f9b96aFd33b4CB87',
  },
] as const;

type PublicationPageIdentity = {
  chain_id: number;
  contract: string;
  token_id: string;
  slug: string;
  draft: { sale: { payoutReceiver: string } };
};

/** Returns an operator policy blocker; never overrides on-chain authorization. */
export function publicationPolicyIssue(page: PublicationPageIdentity): string | null {
  const record = canonicalMintPages.find(
    (r) =>
      r.chainId === page.chain_id &&
      r.contract === page.contract.toLowerCase() &&
      r.tokenId === page.token_id,
  );
  if (!record) return null;
  if (page.slug !== record.slug)
    return (
      'GO1 Token ID 1 has a designated official Mint Page: /mint/' +
      record.slug +
      '. This page remains an editable draft but cannot initiate publication.'
    );
  if (page.draft.sale.payoutReceiver.toLowerCase() !== record.payoutReceiver.toLowerCase())
    return (
      'Official GO1 payout address differs from the operator-approved recipient ' +
      record.payoutReceiver +
      '. Review the draft and save an approved revision before publication.'
    );
  return null;
}
