import { describe, expect, it } from 'vitest';
import { GO1 } from '../src/lib/chains';
import { canonicalMintPages, publicationPolicyIssue } from '../src/lib/canonical-mint-pages';

const official = canonicalMintPages[0];
const makePage = (overrides: Partial<{
  chain_id: number;
  contract: string;
  token_id: string;
  slug: string;
  payoutReceiver: string;
}> = {}) => ({
  chain_id: overrides.chain_id ?? 1,
  contract: overrides.contract ?? GO1,
  token_id: overrides.token_id ?? '1',
  slug: overrides.slug ?? official.slug,
  draft: { sale: { payoutReceiver: overrides.payoutReceiver ?? official.payoutReceiver } },
});

describe('Operator-approved canonical GO1 publication policy', () => {
  it('accepts only the exact selected GO1 page and payout', () => {
    expect(publicationPolicyIssue(makePage())).toBeNull();
    expect(publicationPolicyIssue(makePage({
      contract: GO1.toUpperCase().replace('0X', '0x'),
      payoutReceiver: official.payoutReceiver.toLowerCase(),
    }))).toBeNull();
  });
  it('keeps other token-1 GO1 draft slugs editable but ineligible for publication', () => {
    for (const slug of ['endhonesa-hahaha', 'minting-pacasila-vs-pancakaki']) {
      expect(publicationPolicyIssue(makePage({ slug }))).toMatch(/cannot initiate publication/);
    }
  });
  it('blocks changes to the approved payout on the selected page', () => {
    expect(publicationPolicyIssue(makePage({
      payoutReceiver: '0xbeE916aBC292D4EfF57702fABbA1AAC4d4046036',
    }))).toMatch(/payout address differs/);
  });
  it('does not constrain other GO1 token IDs, networks or collections', () => {
    expect(publicationPolicyIssue(makePage({ token_id: '2', slug: 'another-drop' }))).toBeNull();
    expect(publicationPolicyIssue(makePage({ chain_id: 8453, slug: 'another-drop' }))).toBeNull();
    expect(publicationPolicyIssue(makePage({
      contract: '0x1111111111111111111111111111111111111111',
      slug: 'another-drop',
    }))).toBeNull();
  });
});
