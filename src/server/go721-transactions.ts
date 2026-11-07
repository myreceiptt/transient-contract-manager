import { z } from 'zod';
import { decodeEventLog, encodeFunctionData, getAddress, zeroAddress, type Address, type Hex } from 'viem';
import stacksAbi from '../../contracts/TLStacks721.abi.json';
import { GO721_COLLECTION, GO721_STACKS, go721DropAbi, go721Phase } from '../lib/go721-sale-engine';
import { GO721_CAMPAIGN_KEY, GO721_FOLDERS, GO721_MINTER_ROLE, GO721_RUNTIME,
  go721CreatorStateAbi, go721PurchaseAbi, type Go721Action } from '../lib/go721-launch';
import { erc721CreatorAbi } from '../lib/erc721-creator';
import { AppError, fingerprint, serializable } from '../lib/domain';
import { requireSessionChain, type Session } from './auth';
import { client, exactChain } from './chain';
import { command, listRecords } from './db';
import { approvalKey, localCreatorExecution } from './erc721-creator-mint';
import { assertGo721Drop, assertGo721Live, expectedGo721Drop, go721Quote,
  readGo721State, savedGo721Campaign, verifyFinalPresale, type Go721State } from './go721-launch-state';

const kind = 'go721_launch';
export const go721ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('grant') }).strict(),
  z.object({ type: z.literal('configure'), round: z.union([z.literal(1), z.literal(2)]),
    startTime: z.number().int().positive().optional() }).strict(),
  z.object({ type: z.literal('purchase'), quantity: z.number().int().min(1).max(10) }).strict(),
]);
const permissionBase = z.object({ expiresAt: z.string().datetime(),
  maxNetworkFeeWei: z.string().regex(/^[1-9][0-9]{0,25}$/) });
function hostedWrites() {
  return process.env.VERCEL_ENV !== 'preview' && process.env.MAINNET_WRITES_ENABLED === 'true';
}
function validUntil(iso: string, maxDays: number) {
  const expiry = Date.parse(iso);
  return expiry > Date.now() && expiry <= Date.now() + maxDays * 86400000;
}
export function go721CheckoutPermission(round: number, fee: bigint, chainId = 1) {
  if (localCreatorExecution(chainId)) return { maxQuantity: 10, maxNetworkFeeWei: '100000000000000000' };
  if (chainId !== 1 || !hostedWrites()) return null;
  try {
    const p = permissionBase.extend({ campaignKey: z.literal(GO721_CAMPAIGN_KEY),
      round: z.union([z.literal(1), z.literal(2)]),
      maxProtocolFeeWei: z.string().regex(/^[0-9]{1,25}$/),
      maxQuantity: z.number().int().min(1).max(10),
    }).strict().parse(JSON.parse(process.env.GO721_CHECKOUT_APPROVAL || ''));
    return p.round === round && validUntil(p.expiresAt, 7) && fee <= BigInt(p.maxProtocolFeeWei) ? p : null;
  } catch { return null; }
}
export function go721SigningPermission(i: any) {
  const tx = i.payload.tx;
  if (localCreatorExecution(Number(i.chain_id))) return { maxNetworkFeeWei: tx.maximumNetworkFee };
  if (Number(i.chain_id) !== 1 || !hostedWrites()) return null;
  if (i.payload.action.type === 'purchase') {
    const p = go721CheckoutPermission(i.payload.round, BigInt(i.payload.protocolFeeWei));
    return p && i.payload.quantity <= p.maxQuantity ? p : null;
  }
  try {
    const p = permissionBase.extend({ key: z.string().regex(/^0x[0-9a-f]{64}$/) }).strict()
      .parse(JSON.parse(process.env.GO721_TRANSACTION_APPROVAL || ''));
    return validUntil(p.expiresAt, 1) && p.key === approvalKey(tx) ? p : null;
  } catch { return null; }
}
function snapshot(s: Go721State, draft: string) {
  return fingerprint(serializable({ owner: s.creator.owner, role: s.creator.role,
    runtime: GO721_RUNTIME, minter: s.approved, round: s.round, drop: s.drop,
    counter: s.counter, burns: s.burns, fee: s.fee, draft }));
}
async function inspect(chainId: number, raw: unknown, session: Session) {
  requireSessionChain(session, chainId);
  const action = go721ActionSchema.parse(raw);
  const [s, saved] = await Promise.all([readGo721State(chainId, session.wallet), savedGo721Campaign()]);
  const c = client(chainId);
  let to: Address = GO721_STACKS, data: Hex, value = 0n, quantity = 0, round = Number(s.round) + 1;
  let drop: ReturnType<typeof expectedGo721Drop> | undefined;
  let presaleEvidence: unknown;
  if (s.paused || s.creator.supplyLocked || s.creator.renderingContract !== zeroAddress)
    throw new AppError('GO721_NOT_READY', 'Sale paused, supply locked or metadata overridden.', 409);
  if (action.type === 'grant') {
    if (s.creator.role !== 'owner') throw new AppError('OWNER_REQUIRED', 'Only the collection Owner can grant the minter role.', 403);
    if (s.approved || s.counter !== 0n || s.burns !== 0n || s.round !== 0n || s.phase !== 0)
      throw new AppError('GO721_GRANT_STATE', 'Grant review requires an unminted collection with no configured drop or existing role.', 409);
    to = GO721_COLLECTION;
    data = encodeFunctionData({ abi: go721CreatorStateAbi, functionName: 'setRole',
      args: [GO721_MINTER_ROLE, [GO721_STACKS], true] });
  } else if (action.type === 'configure') {
    if (!['owner', 'admin'].includes(s.creator.role))
      throw new AppError('ADMIN_REQUIRED', 'Current Owner or Admin required.', 403);
    assertGo721Live(s); round = action.round;
    if (round === 1) {
      if (s.counter !== 0n || s.burns !== 0n || s.round !== 0n || s.phase !== 0)
        throw new AppError('GO721_INITIAL_STATE', 'Presale must start with historical Token ID counter 0 and an unconfigured drop.', 409);
      if (action.startTime !== undefined) throw new AppError('GO721_START', 'Presale uses the approved 10 November 10:10 WIB start.', 409);
      drop = expectedGo721Drop(1);
      if (s.block.timestamp >= drop.startTime)
        throw new AppError('GO721_START_PASSED', 'The approved presale start has passed. A revised launch needs explicit review.', 409);
    } else {
      assertGo721Drop(s, 1);
      presaleEvidence = await verifyFinalPresale(chainId);
      const start = action.startTime;
      if (!start || BigInt(start) < s.block.timestamp || BigInt(start) > s.block.timestamp + 3600n)
        throw new AppError('GO721_START', 'Public start must be within the next hour, after finalized presale completion.', 409);
      drop = expectedGo721Drop(2, start);
    }
    data = encodeFunctionData({ abi: stacksAbi, functionName: 'configureDrop', args: [GO721_COLLECTION, drop] });
  } else {
    assertGo721Live(s);
    if (round !== 1 && round !== 2) throw new AppError('GO721_ROUND', 'Unexpected round.', 409);
    assertGo721Drop(s, round);
    const quote = go721Quote(s, session.wallet, action.quantity);
    if (!quote.allowed) throw new AppError('GO721_ELIGIBILITY', quote.issues.join('. '), 409);
    quantity = quote.mintableQuantity;
    // TLStacks uses _mint, so restrict recipients to externally owned wallets.
    const code = await c.getCode({ address: session.wallet, blockNumber: s.block.number });
    if (code && code !== '0x') throw new AppError('GO721_RECIPIENT', 'This checkout requires an externally owned recipient wallet.', 409);
    value = BigInt(quote.totalBeforeGasWei);
    data = encodeFunctionData({ abi: go721PurchaseAbi, functionName: 'purchase',
      args: [GO721_COLLECTION, session.wallet, BigInt(quantity), round === 1 ? 3n : 0n, []] });
  }
  const [gas, fees, balance, nonce, pending] = await Promise.all([
    c.estimateGas({ account: session.wallet, to, data, value }), c.estimateFeesPerGas(),
    c.getBalance({ address: session.wallet }),
    c.getTransactionCount({ address: session.wallet, blockTag: 'latest' }),
    c.getTransactionCount({ address: session.wallet, blockTag: 'pending' }),
  ]);
  if (nonce !== pending) throw new AppError('GO721_PENDING_NONCE', 'Resolve pending wallet transactions before reviewing.', 409);
  await c.call({ account: session.wallet, to, data, value });
  const gasLimit = (gas * 125n + 99n) / 100n;
  const maximumNetworkFee = gasLimit * fees.maxFeePerGas!;
  if (balance < maximumNetworkFee + value)
    throw new AppError('GO721_BALANCE', 'Wallet balance cannot cover payment plus the estimated maximum gas fee.', 422);
  const tx = { chainId, account: session.wallet, to, data, value: value.toString(), nonce,
    gas: gasLimit.toString(), maxFeePerGas: fees.maxFeePerGas!.toString(),
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas!.toString(),
    maximumNetworkFee: maximumNetworkFee.toString(), estimatedGas: gas.toString(),
    expiresAt: new Date(Date.now() + 300000).toISOString() };
  return { kind, action, tx, round, quantity, protocolFeeWei: s.fee.toString(),
    counterAtReview: s.counter.toString(), mintPriceWei: (value - BigInt(quantity) * s.fee).toString(),
    drop: drop ? serializable(drop) : null, presaleEvidence: presaleEvidence ?? null,
    snapshot: snapshot(s, saved.fingerprint), campaignKey: GO721_CAMPAIGN_KEY,
    draftVersion: saved.version, approvalKey: approvalKey(tx),
    attestation: serializable({ ...s.creator, stacksRuntime: GO721_RUNTIME }) };
}
export async function prepareGo721(chainId: number, raw: unknown, s: Session) {
  const payload = await inspect(chainId, raw, s);
  const i = await command('intent_create', { chainId, contract: GO721_COLLECTION,
    actor: s.wallet.toLowerCase(), payload });
  return { ...i, signingEnabled: !!go721SigningPermission(i) };
}
export async function getGo721Intent(id: string, s: Session) {
  const i = await command('intent_get', { id });
  if (!i || i.payload?.kind !== kind || i.page_id !== null)
    throw new AppError('NOT_FOUND', 'GO#|O transaction review not found.', 404);
  requireSessionChain(s, Number(i.chain_id));
  if (i.actor !== s.wallet.toLowerCase()) throw new AppError('ACCESS_DENIED', 'This review belongs to another wallet.', 403);
  return { ...i, signingEnabled: !!go721SigningPermission(i) };
}
export async function preflightGo721(id: string, s: Session) {
  const i = await getGo721Intent(id, s), permission = go721SigningPermission(i);
  if (i.status !== 'PREPARED') throw new AppError('GO721_ALREADY_SUBMITTED', 'Recover the existing transaction instead of sending again.', 409);
  if (!permission) throw new AppError('GO721_APPROVAL_REQUIRED', 'Explicit Mainnet transaction or checkout approval is required.', 403);
  if (Date.now() >= Date.parse(i.payload.tx.expiresAt)) throw new AppError('REVIEW_EXPIRED', 'Prepare a fresh review.', 409);
  const fresh = await inspect(Number(i.chain_id), i.payload.action, s);
  if (Date.now() >= Date.parse(i.payload.tx.expiresAt) || !go721SigningPermission(i))
    throw new AppError('REVIEW_EXPIRED', 'The review or permission expired during preflight. Review again.', 409);
  if (fresh.snapshot !== i.payload.snapshot || fresh.approvalKey !== i.payload.approvalKey)
    throw new AppError('GO721_STATE_CHANGED', 'Sale, role, fee, allowance, nonce or metadata identity changed. Review again.', 409);
  if (BigInt(fresh.tx.maximumNetworkFee) > BigInt(i.payload.tx.maximumNetworkFee) ||
      BigInt(fresh.tx.maximumNetworkFee) > BigInt(permission.maxNetworkFeeWei))
    throw new AppError('GO721_FEE_CHANGED', 'Gas estimate exceeds the reviewed or approved ceiling.', 409);
  return fresh.tx;
}
export function assertGo721Transaction(i: any, tx: any) {
  const expected = i.payload.tx;
  if (tx.from.toLowerCase() !== i.actor || tx.to?.toLowerCase() !== expected.to.toLowerCase() ||
      tx.input.toLowerCase() !== expected.data.toLowerCase() || tx.value !== BigInt(expected.value) ||
      tx.nonce !== expected.nonce || (tx.chainId !== undefined && Number(tx.chainId) !== Number(i.chain_id)))
    throw new AppError('TX_MISMATCH', 'Sender, destination, calldata, payment, nonce or chain differs from the review.', 409);
}
export async function attachGo721(id: string, hash: Hex, s: Session) {
  const i = await getGo721Intent(id, s), c = client(Number(i.chain_id));
  await exactChain(c, Number(i.chain_id));
  assertGo721Transaction(i, await c.getTransaction({ hash }));
  if (['CONFIRMED', 'REPLACED', 'REVERTED'].includes(i.status)) {
    if (i.tx_hash !== hash.toLowerCase()) throw new AppError('TX_MISMATCH', 'Review already resolved.', 409);
    return i;
  }
  return command('intent_attach', { id, txHash: hash, nonce: i.payload.tx.nonce });
}
export async function confirmGo721(id: string, s: Session) {
  const i = await getGo721Intent(id, s);
  if (['CONFIRMED', 'REVERTED', 'REPLACED'].includes(i.status)) return i;
  if (!i.tx_hash) throw new AppError('NO_TX_HASH', 'Attach the submitted transaction hash first.', 409);
  const c = client(Number(i.chain_id));
  await exactChain(c, Number(i.chain_id));
  let receipt;
  try { receipt = await c.getTransactionReceipt({ hash: i.tx_hash }); }
  catch { return { pending: true, status: 'SUBMITTED' }; }
  assertGo721Transaction(i, await c.getTransaction({ hash: i.tx_hash }));
  if ((await c.getBlock({ blockNumber: receipt.blockNumber })).hash !== receipt.blockHash)
    return { pending: true, status: 'REORG_DETECTED' };
  if (Number(i.chain_id) === 1 && (await c.getBlock({ blockTag: 'finalized' })).number < receipt.blockNumber)
    return { pending: true, status: 'AWAITING_FINALITY' };
  if (receipt.status === 'reverted') return command('intent_finish', { id, actor: i.actor, status: 'REVERTED', receipt: serializable(receipt) });
  const action: Go721Action = i.payload.action;
  const tokens: { tokenId: string; tokenURI: string; recipientAtMint: string }[] = [];
  let actualQuantity = 0;
  if (action.type === 'purchase') {
    let purchaseAmount = 0n;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() === GO721_STACKS.toLowerCase()) {
        try {
          const e = decodeEventLog({ abi: go721PurchaseAbi, ...log });
          if (e.eventName === 'Purchase' && e.args.nftAddress.toLowerCase() === GO721_COLLECTION.toLowerCase() &&
              e.args.nftReceiver.toLowerCase() === i.actor && e.args.currencyAddress === zeroAddress &&
              e.args.price === (i.payload.round === 1 ? 0n : 25000000000000000n) && e.args.isPresale === (i.payload.round === 1))
            purchaseAmount += e.args.amount;
        } catch { /* Unrelated event. */ }
      }
      if (log.address.toLowerCase() !== GO721_COLLECTION.toLowerCase()) continue;
      let id: bigint | undefined;
      try {
        const e = decodeEventLog({ abi: erc721CreatorAbi, ...log });
        if (e.eventName === 'Transfer' && e.args.from === zeroAddress && e.args.to.toLowerCase() === i.actor) id = e.args.tokenId;
      } catch { /* Unrelated event. */ }
      if (id === undefined) continue;
      const offset = i.payload.round === 1 ? 1n : 4n;
      if (id < offset || id > (i.payload.round === 1 ? 3n : 30n))
        throw new AppError('GO721_RECEIPT_SEQUENCE', 'Mined Token ID falls outside the reviewed round.', 409);
      const uri = await c.readContract({ address: GO721_COLLECTION, abi: erc721CreatorAbi,
        functionName: 'tokenURI', args: [id], blockNumber: receipt.blockNumber });
      if (uri !== GO721_FOLDERS[i.payload.round as 1 | 2] + '/' + (id - offset))
        throw new AppError('GO721_RECEIPT_URI', 'Minted metadata URI differs from the audited artwork order.', 409);
      tokens.push({ tokenId: id.toString(), tokenURI: uri, recipientAtMint: i.actor });
    }
    actualQuantity = tokens.length;
    if (!actualQuantity || actualQuantity > i.payload.quantity || purchaseAmount !== BigInt(actualQuantity))
      throw new AppError('GO721_RECEIPT', 'Matching mint and Purchase events are required.', 409);
  } else if (action.type === 'grant') {
    if (!await c.readContract({ address: GO721_COLLECTION, abi: go721CreatorStateAbi,
      functionName: 'hasRole', args: [GO721_MINTER_ROLE, GO721_STACKS], blockNumber: receipt.blockNumber }))
      throw new AppError('GO721_RECEIPT', 'Minter role readback failed.', 409);
  } else {
    const drop = await c.readContract({ address: GO721_STACKS, abi: go721DropAbi,
      functionName: 'getDrop', args: [GO721_COLLECTION], blockNumber: receipt.blockNumber });
    // A purchase later in the same block can reduce supply; all configured terms must still match.
    for (const [key, v] of Object.entries(i.payload.drop))
      if (key !== 'supply' && String(drop[key as keyof typeof drop]).toLowerCase() !== String(v).toLowerCase())
        throw new AppError('GO721_RECEIPT', 'Configured drop readback differs from the review.', 409);
  }
  return command('intent_finish', { id, actor: i.actor, status: 'CONFIRMED', receipt: serializable({
    transactionHash: receipt.transactionHash, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash,
    gasUsed: receipt.gasUsed, effectiveGasPrice: receipt.effectiveGasPrice,
    gasPaidWei: receipt.gasUsed * receipt.effectiveGasPrice, action: action.type,
    sentWei: i.payload.tx.value, reviewedQuantity: i.payload.quantity, actualQuantity,
    partialFill: action.type === 'purchase' && actualQuantity < i.payload.quantity, tokens,
    // Any capped purchase is refunded by TLStacks721 in the same transaction.
    refundPolicy: 'TLStacks721 refunds excess ETH; receipt quantities are authoritative.',
  }) });
}
export async function cancelGo721(id: string, hash: Hex, s: Session) {
  const i = await getGo721Intent(id, s), c = client(Number(i.chain_id));
  if (!i.tx_hash || i.status !== 'SUBMITTED') throw new AppError('INTENT_STATE', 'Only a submitted transaction can be replaced.', 409);
  await exactChain(c, Number(i.chain_id));
  const [tx, receipt] = await Promise.all([c.getTransaction({ hash }), c.getTransactionReceipt({ hash })]);
  if (tx.from.toLowerCase() !== i.actor || tx.nonce !== i.payload.tx.nonce || hash.toLowerCase() === i.tx_hash)
    throw new AppError('TX_MISMATCH', 'Replacement must use the original sender and nonce.', 409);
  if (tx.to?.toLowerCase() === i.payload.tx.to.toLowerCase() && tx.input.toLowerCase() === i.payload.tx.data.toLowerCase() && tx.value === BigInt(i.payload.tx.value))
    throw new AppError('TX_REPRICED', 'Attach the repriced transaction and check its receipt.', 409);
  if ((await c.getBlock({ blockNumber: receipt.blockNumber })).hash !== receipt.blockHash)
    throw new AppError('REORG', 'Replacement receipt is not canonical.', 409);
  if (Number(i.chain_id) === 1 && (await c.getBlock({ blockTag: 'finalized' })).number < receipt.blockNumber)
    return { pending: true, status: 'AWAITING_FINALITY' };
  return command('intent_finish', { id, actor: i.actor, status: 'REPLACED',
    receipt: serializable({ replacementHash: hash, originalHash: i.tx_hash, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash }) });
}
export async function go721History(chainId: number, s: Session) {
  requireSessionChain(s, chainId);
  const rows = await listRecords('history', { chainId, contract: GO721_COLLECTION, limit: 25, offset: 0,
    actor: s.wallet, payloadKind: kind });
  return rows.filter((i: any) => i.actor === s.wallet.toLowerCase() && i.payload?.kind === kind)
    .map((i: any) => ({ ...i, signingEnabled: !!go721SigningPermission(i) }));
}
export async function go721Readiness(chainId: number, s: Session) {
  requireSessionChain(s, chainId);
  const [state, saved] = await Promise.all([readGo721State(chainId, s.wallet), savedGo721Campaign()]);
  if (!['owner', 'admin'].includes(state.creator.role)) throw new AppError('ADMIN_REQUIRED', 'Owner or Admin required.', 403);
  let publicRoundReady = false, reason = '';
  if (state.counter === 3n && state.round === 0n && state.drop.supply === 0n) {
    try { await verifyFinalPresale(chainId); publicRoundReady = true; }
    catch (e) { reason = (e as Error).message; }
  }
  return serializable({ role: state.creator.role, owner: state.creator.owner, approvedMinter: state.approved,
    counter: state.counter, burned: state.burns, round: Number(state.round) + 1,
    phase: go721Phase[state.phase], phaseCode: state.phase, remaining: state.drop.supply,
    runtimeVerified: true, draftVersion: saved.version, protocolFeeWei: state.fee,
    publicRoundReady, reason, observedBlock: state.block.number, blockTimestamp: state.block.timestamp,
    campaignKey: GO721_CAMPAIGN_KEY, presalePlan: expectedGo721Drop(1),
    transactionExecutionEnabled: false });
}
