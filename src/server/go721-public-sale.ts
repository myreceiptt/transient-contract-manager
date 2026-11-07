import { getAddress, type Address } from 'viem';
import { serializable } from '../lib/domain';
import { GO721_COLLECTION, GO721_STACKS, go721Phase } from '../lib/go721-sale-engine';
import { GO721_RUNTIME } from '../lib/go721-launch';
import { assertGo721Drop, assertGo721Live, go721Quote, readGo721State, savedGo721Campaign } from './go721-launch-state';
import { go721CheckoutPermission } from './go721-transactions';

/** Coherent public reads; no private draft or calldata. Runtime attestation
 * and an active sale never imply checkout authorization. */
export async function readPublicGo721Status(rawRecipient?: Address, quantity = 1, chainId = 1) {
  const wallet = rawRecipient ? getAddress(rawRecipient) : undefined;
  const [s] = await Promise.all([readGo721State(chainId, wallet), savedGo721Campaign()]);
  const quote = go721Quote(s, wallet, quantity);
  const round = Number(s.round) + 1;
  const issues = [...quote.issues];
  try {
    assertGo721Live(s);
    if (round !== 1 && round !== 2) throw new Error('Unexpected sale round.');
    assertGo721Drop(s, round);
  } catch (e) { issues.push((e as Error).message); }
  const permission = go721CheckoutPermission(round, s.fee, chainId);
  if (permission && quote.mintableQuantity > permission.maxQuantity)
    issues.push('Quantity exceeds the operator-approved checkout limit.');
  return serializable({
    collection: GO721_COLLECTION, chainId, protocol: GO721_STACKS,
    observedBlock: s.block.number, observedAt: new Date().toISOString(),
    observedRuntimeHash: GO721_RUNTIME, reportedVersion: '2.3.1', exactRuntimeVerified: true,
    phase: s.phase, phaseLabel: go721Phase[s.phase], round,
    saleConfigured: s.drop.dropType !== 0, paused: s.paused,
    remainingSupply: s.drop.supply, initialSupply: s.drop.initialSupply,
    historicalMintedCount: s.counter, burnedCount: s.burns,
    perWalletLimit: round === 1 ? 3 : 10, alreadyMintedByWallet: s.mintedByWallet,
    startTime: s.drop.startTime, protocolFeeWei: s.fee,
    priceWei: round === 1 ? 0n : 25000000000000000n, payoutReceiver: s.drop.payoutReceiver,
    displayedQuote: { ...quote, issues, allowed: issues.length === 0 },
    checkoutApproved: !!permission, transactionExecutionEnabled: !!permission && issues.length === 0,
    publicRoute: '/mint/go-one-of-one',
    warning: !permission ? 'Mainnet checkout awaits explicit operator approval.' :
      'Review quantity, payment and gas before approving your wallet transaction.',
  });
}
