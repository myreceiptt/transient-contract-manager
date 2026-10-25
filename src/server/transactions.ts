import { z } from 'zod';
import {
  encodeFunctionData,
  decodeEventLog,
  erc20Abi,
  getAddress,
  zeroAddress,
  type Address,
  type Hex,
  type Abi,
} from 'viem';
import { creatorAbi, stacksAbi } from '../lib/abi';
import {
  AppError,
  addressSchema,
  nonzeroAddress,
  positive,
  uint,
  safeUrl,
  type Draft,
  type Drop,
  dropFromDraft,
  configFingerprint,
  fingerprint,
  serializable,
  mintable,
  quote,
  verifyProof,
  presaleLeaf,
} from '../lib/domain';
import {
  authorize,
  client,
  inspect,
  requireWrites,
  currencyInfo,
  stacksAddress,
  verifyStacks,
  exactChain,
} from './chain';
import { command, listRecords } from './db';
import { baseline, pageForAdmin } from './workspace';
import { publicationPolicyIssue } from '../lib/canonical-mint-pages';
import { requireSessionChain, type Session } from './auth';
const recipients = z
  .array(z.object({ address: nonzeroAddress, amount: positive }).strict())
  .min(1)
  .max(200);
const initialRecipients = z
  .array(z.object({ address: nonzeroAddress, amount: uint }).strict())
  .min(1)
  .max(200);
const royalty = z
  .object({ recipient: nonzeroAddress, bps: z.number().int().min(0).max(1000) })
  .strict();
export const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('createToken'),
    uri: safeUrl.refine((s) => s.length > 0),
    recipients: initialRecipients,
    royalty: royalty.optional(),
  }),
  z.object({
    action: z.literal('batchCreateToken'),
    tokens: z
      .array(
        z.object({
          uri: safeUrl.refine((s) => s.length > 0),
          recipients: initialRecipients,
          royalty: royalty.optional(),
        }),
      )
      .min(1)
      .max(40),
  }),
  z.object({ action: z.literal('mintToken'), tokenId: positive, recipients }),
  z.object({
    action: z.literal('setTokenUri'),
    tokenId: positive,
    uri: safeUrl.refine((s) => s.length > 0),
  }),
  z.object({ action: z.literal('setDefaultRoyalty'), royalty }),
  z.object({ action: z.literal('setTokenRoyalty'), tokenId: positive, royalty }),
  z.object({ action: z.literal('approveStacks') }),
]);
type Call = {
  to: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
  value: bigint;
};
export function adminCall(address: Address, stacks: Address, raw: unknown): Call {
  const a = actionSchema.parse(raw);
  let args: unknown[];
  let fn: string = a.action;
  if (a.action === 'createToken')
    args = [
      a.uri,
      a.recipients.map((r) => r.address),
      a.recipients.map((r) => BigInt(r.amount)),
      ...(a.royalty ? [a.royalty.recipient, BigInt(a.royalty.bps)] : []),
    ];
  else if (a.action === 'batchCreateToken') {
    if (a.tokens.reduce((sum, t) => sum + t.recipients.length, 0) > 200)
      throw new AppError('BATCH_SIZE', 'Use at most 200 recipients in one batch');
    args = [
      a.tokens.map((t) => t.uri),
      a.tokens.map((t) => t.recipients.map((r) => r.address)),
      a.tokens.map((t) => t.recipients.map((r) => BigInt(r.amount))),
    ];
    if (a.tokens.some((t) => t.royalty)) {
      if (!a.tokens.every((t) => t.royalty))
        throw new AppError(
          'BATCH_ROYALTIES',
          'Provide a royalty for every token, or omit royalties for the entire batch',
        );
      args.push(
        a.tokens.map((t) => t.royalty!.recipient),
        a.tokens.map((t) => BigInt(t.royalty!.bps)),
      );
    }
  } else if (a.action === 'mintToken')
    args = [
      BigInt(a.tokenId),
      a.recipients.map((r) => r.address),
      a.recipients.map((r) => BigInt(r.amount)),
    ];
  else if (a.action === 'setTokenUri') args = [BigInt(a.tokenId), a.uri];
  else if (a.action === 'setDefaultRoyalty') args = [a.royalty.recipient, BigInt(a.royalty.bps)];
  else if (a.action === 'setTokenRoyalty')
    args = [BigInt(a.tokenId), a.royalty.recipient, BigInt(a.royalty.bps)];
  else {
    fn = 'setApprovedMintContracts';
    args = [[stacks], true];
  }
  return { to: address, abi: creatorAbi, functionName: fn, args, value: 0n };
}
export async function simulate(id: number, account: Address, call: Call) {
  const c = client(id);
  try {
    await c.simulateContract({
      address: call.to,
      abi: call.abi,
      functionName: call.functionName,
      args: call.args,
      account,
      value: call.value,
    });
    const gas = await c.estimateContractGas({
      address: call.to,
      abi: call.abi,
      functionName: call.functionName,
      args: call.args,
      account,
      value: call.value,
    });
    const gasPrice = await c.getGasPrice();
    return {
      chainId: id,
      account,
      to: call.to,
      data: encodeFunctionData({ abi: call.abi, functionName: call.functionName, args: call.args }),
      value: call.value.toString(),
      estimatedGas: gas.toString(),
      estimatedNetworkFee: (gas * gasPrice).toString(),
      functionName: call.functionName,
      arguments: serializable(call.args),
      simulation: 'passed',
      expiresAt: new Date(Date.now() + 5 * 60000).toISOString(),
    };
  } catch (e) {
    throw new AppError(
      'SIMULATION_FAILED',
      String(
        (e as any)?.shortMessage ||
          'The contract simulation reverted. Check permissions, token locks, balances, allowances and sale state.',
      ).slice(0, 500),
      422,
    );
  }
}
function mutationSnapshot(info: Awaited<ReturnType<typeof inspect>>) {
  return fingerprint({
    owner: info.owner,
    admins: info.admins,
    token: info.token,
    locked: info.locked,
    royalty: info.royalty,
    minters: info.minters,
    tokenTypes: info.tokenTypes,
  });
}
// Both read-only previews and write-enabled local reviews use the same
// validation path; previews never create intents or initiate wallet transactions.
async function validateAdminAction(id: number, address: Address, raw: unknown, s: Session) {
  requireSessionChain(s, id);
  const action = actionSchema.parse(raw);
  const token = 'tokenId' in action ? BigInt(action.tokenId) : 1n;
  const info = await authorize(id, address, s.wallet, token);
  if ('tokenId' in action && !info.token.created)
    throw new AppError('TOKEN_MISSING', 'Token does not exist');
  if (action.action === 'mintToken' && info.locked)
    throw new AppError('TOKEN_LOCKED', 'This token is permanently locked against further minting');
  if (action.action === 'approveStacks') await verifyStacks(client(id), id, info.blockNumber);
  const call = adminCall(info.address, stacksAddress(id), action);
  return { action, token, info, call };
}

export async function previewAdmin(id: number, address: Address, raw: unknown, s: Session) {
  const { action, token, info, call } = await validateAdminAction(id, address, raw, s);
  // viem simulateContract/estimateContractGas use eth_call/eth_estimateGas only.
  // No DB intent, no transaction signing and no blockchain state mutation.
  const tx = await simulate(id, s.wallet, call);
  return {
    mode: 'READ_ONLY_SIMULATION' as const,
    broadcast: false,
    signerRequired: false,
    chainId: id,
    contract: info.address,
    account: s.wallet,
    observedBlock: info.blockNumber.toString(),
    action: action.action,
    tokenId: token.toString(),
    tx,
    warning: 'Simulation only. No transaction was submitted and live contract state may change.',
  };
}

export async function prepareAdmin(id: number, address: Address, raw: unknown, s: Session) {
  requireSessionChain(s, id);
  requireWrites(id);
  const { action, token, info, call } = await validateAdminAction(id, address, raw, s);
  const tx = await simulate(id, s.wallet, call);
  return command('intent_create', {
    chainId: id,
    contract: address,
    actor: s.wallet.toLowerCase(),
    payload: {
      kind: 'admin',
      action,
      tokenId: token.toString(),
      snapshot: mutationSnapshot(info),
      tx,
    },
  });
}
export function nextDropCall(
  nft: Address,
  tokenId: bigint,
  stacks: Address,
  current: Drop,
  wanted: Drop,
  phase: number,
): Call | null {
  if (configFingerprint(current) === configFingerprint(wanted)) return null;
  let fn = '',
    args: unknown[] = [];
  if (current.dropType === 0 || phase === 4) {
    fn = 'configureDrop';
    args = [nft, tokenId, wanted];
  } else {
    if (
      current.dropType !== 1 ||
      current.initialSupply !== wanted.initialSupply ||
      current.decayRate !== 0n
    )
      throw new AppError(
        'SALE_ALLOCATION_LOCKED',
        'An active drop cannot change its initial supply or drop type. Use its current allocation or wait until it ends.',
        409,
      );
    if (current.payoutReceiver.toLowerCase() !== wanted.payoutReceiver.toLowerCase()) {
      fn = 'updateDropPayoutReceiver';
      args = [nft, tokenId, wanted.payoutReceiver];
    } else if (current.allowance !== wanted.allowance) {
      fn = 'updateDropAllowance';
      args = [nft, tokenId, wanted.allowance];
    } else if (
      current.currencyAddress.toLowerCase() !== wanted.currencyAddress.toLowerCase() ||
      current.presaleCost !== wanted.presaleCost ||
      current.publicCost !== wanted.publicCost
    ) {
      fn = 'updateDropPrices';
      args = [nft, tokenId, wanted.currencyAddress, wanted.presaleCost, wanted.publicCost];
    } else if (
      current.startTime !== wanted.startTime ||
      current.presaleDuration !== wanted.presaleDuration ||
      current.publicDuration !== wanted.publicDuration
    ) {
      fn = 'updateDropDuration';
      args = [nft, tokenId, wanted.startTime, wanted.presaleDuration, wanted.publicDuration];
    } else if (current.presaleMerkleRoot.toLowerCase() !== wanted.presaleMerkleRoot.toLowerCase()) {
      fn = 'updateDropPresaleMerkleRoot';
      args = [nft, tokenId, wanted.presaleMerkleRoot];
    }
  }
  return fn ? { to: stacks, abi: stacksAbi, functionName: fn, args, value: 0n } : null;
}
export async function previewPublication(id: string, expectedVersion: number, s: Session) {
  const { page, info } = await pageForAdmin(id, s);
  if (page.version !== expectedVersion)
    throw new AppError('VERSION_CONFLICT', 'Reload the latest mint page revision', 409);
  // A Stacks drop is keyed by NFT contract and token ID, not by mint-page slug.
  // Only an authenticated on-chain owner/admin reaches this point. Keep sibling
  // drafts private; surface conflicts exclusively inside their workspace.
  const pages = (await listRecords('pages', {
    chainId: page.chain_id, contract: page.contract, limit: 25, offset: 0,
  })) as { id: string; token_id: string; slug: string; state: string; draft: Draft }[];
  const intended = configFingerprint(dropFromDraft(page.draft));
  const policyIssue = publicationPolicyIssue(page);
  const relatedPages = pages
    .filter(p => p.id !== page.id && p.token_id === page.token_id)
    .map(p => ({
      slug: p.slug,
      state: p.state,
      sameSaleConfig: configFingerprint(dropFromDraft(p.draft)) === intended,
      samePayoutReceiver: p.draft.sale.payoutReceiver.toLowerCase() === page.draft.sale.payoutReceiver.toLowerCase(),
    }));
  const checks: { status: 'PASS' | 'WARNING' | 'BLOCKED'; detail: string }[] = [];
  const note = (status: 'PASS' | 'WARNING' | 'BLOCKED', detail: string) =>
    checks.push({ status, detail });
  const result = (nextAction: string | null = null, tx?: Awaited<ReturnType<typeof simulate>>) => ({
    mode: 'READ_ONLY_SALE_PREFLIGHT' as const,
    chainId: page.chain_id,
    contract: page.contract,
    tokenId: page.token_id,
    revision: page.version,
    observedBlock: info.blockNumber.toString(),
    observedTimestamp: info.timestamp.toString(),
    status: checks.some(c => c.status === 'BLOCKED')
      ? 'BLOCKED' as const : 'READY_FOR_REVIEW' as const,
    checks,
    relatedPages,
    nextAction,
    tx,
    note: 'Read-only preflight. This does not publish the page, modify a contract or authorize a future transaction.',
  });
  if (policyIssue) note('BLOCKED', policyIssue);
  else if (page.chain_id === 1 && page.contract.toLowerCase() === '0x5807e66182a38788a3854853225a2b6d8e0480f2' && page.token_id === '1')
    note('PASS', 'Official GO1 Mint Page and payout receiver match the operator-approved identity');
  if (relatedPages.length) {
    note('WARNING',
      'This NFT contract and token ID also appear in ' + relatedPages.length +
      ' other Mint Page(s). Stacks uses one drop configuration per token, not per page.');
    if (relatedPages.some(p => !p.sameSaleConfig))
      note('WARNING',
        'Other Mint Pages specify different sale parameters. Confirm a single intended page before any on-chain publication.');
    if (relatedPages.some(p => !p.samePayoutReceiver))
      note('WARNING',
        'Other Mint Pages specify a different payout receiver. Review the collector payment destination before publication.');
    if (relatedPages.some(p => p.state === 'PUBLISHED' || p.state === 'PUBLISHING'))
      note('WARNING',
        'Another page for this token has already been published or is publishing. Review shared on-chain state before modifying it.');
  }
  if (pages.length === 25)
    note('WARNING', 'Only the 25 most recently updated Mint Pages were checked for duplicate token references.');
  if (!info.sale) {
    note('BLOCKED', info.saleError || 'Verified Stacks contract is unavailable');
    return result();
  }
  if (!info.token.created) note('BLOCKED', 'Referenced NFT token ID does not exist');
  else note('PASS', 'Referenced NFT token ID exists');
  if (info.locked) note('BLOCKED', 'Token is permanently locked for new minting');
  else note('PASS', 'Token minting is not locked');
  if (!info.sale.approved) note('BLOCKED', 'Verified Stacks is not an approved NFT minter');
  else note('PASS', 'Verified Stacks has the NFT minter permission');
  if (info.sale.paused) note('BLOCKED', 'Verified Stacks is currently paused');
  else note('PASS', 'Verified Stacks is not paused');
  const current = baseline(info);
  if (page.baseline !== current)
    note('BLOCKED', 'On-chain state diverged from the accepted draft baseline. Inspect and rebase before proceeding');
  else note('PASS', 'Shared draft baseline matches the current on-chain snapshot');
  const wanted = dropFromDraft(page.draft);
  const now = BigInt(info.timestamp);
  const start = wanted.startTime;
  const end = start + wanted.presaleDuration + wanted.publicDuration;
  if (end <= now) note('BLOCKED', 'The configured mint window has ended. Update the start and duration, then save a new revision');
  else if (start <= now) note('WARNING', 'Sale start time has already passed; publishing on-chain could make the sale immediately active');
  else note('PASS', 'The draft sale starts in the future');
  if (wanted.publicCost === 0n) note('WARNING', 'Public mint is free excluding any Stacks protocol fee');
  else note('PASS', 'Public mint price is nonzero');
  note('WARNING', 'Review payout receiver ' + wanted.payoutReceiver + ' and immutable metadata before authorizing any live write');
  let call: Call | null = null;
  try {
    call = nextDropCall(
      info.address, BigInt(page.token_id), info.sale.address,
      info.sale.drop, wanted, info.sale.phase,
    );
  } catch (error) {
    note('BLOCKED', error instanceof Error ? error.message : 'Unsupported current drop configuration');
  }
  if (!call) return result();
  if (checks.some(c => c.status === 'BLOCKED')) return result(call.functionName);
  try {
    await currencyInfo(page.chain_id, getAddress(wanted.currencyAddress), info.blockNumber);
    const tx = await simulate(page.chain_id, s.wallet, call);
    note('PASS', 'Contract call ' + call.functionName + ' simulated with the connected admin wallet');
    return result(call.functionName, tx);
  } catch (error) {
    note('BLOCKED', error instanceof Error ? error.message : 'The on-chain sale simulation reverted');
    return result(call.functionName);
  }
}

// Price preview for a potential collector, against the saved draft (not an active sale).
// This is deliberately NOT prepareMint and never generates a transaction intent.
export async function previewCollectorQuote(
  id: string, expectedVersion: number, quantity: bigint, s: Session,
) {
  const { page, info } = await pageForAdmin(id, s);
  if (page.version !== expectedVersion)
    throw new AppError('VERSION_CONFLICT', 'Reload the latest mint page draft', 409);
  if (!info.sale) throw new AppError('STACKS_UNAVAILABLE', info.saleError || 'Verified Stacks unavailable');
  const wanted = dropFromDraft(page.draft);
  if (quantity < 1n || quantity > 20n)
    throw new AppError('QUANTITY', 'Preview quantity must be between 1 and 20');
  if (quantity > wanted.allowance || quantity > wanted.initialSupply)
    throw new AppError('QUANTITY', 'Quantity exceeds the draft per-wallet allowance or initial supply');
  const currency = await currencyInfo(page.chain_id, getAddress(wanted.currencyAddress), info.blockNumber);
  const cost = quote(wanted, quantity, BigInt(info.sale.fee), 3);
  return {
    mode: 'DRAFT_COLLECTOR_QUOTE' as const,
    quantity: quantity.toString(),
    currency: { symbol: currency.symbol, decimals: currency.decimals, address: currency.address },
    publicUnitPrice: wanted.publicCost.toString(),
    paymentAmount: cost.price.toString(),
    protocolFeeWei: cost.protocolFee.toString(),
    totalNativeWei: cost.value.toString(),
    perWalletMax: wanted.allowance.toString(),
    observedBlock: info.blockNumber.toString(),
    activeOnChain: info.sale.phase === 3 && info.sale.drop.dropType !== 0,
    draftOnly: true,
    warning: 'This quote uses the saved draft, not an active public sale. Gas is not included. Real collector terms may differ until the sale is configured and published.',
  };
}

export async function preparePublication(id: string, expectedVersion: number, s: Session) {
  const { page, info } = await pageForAdmin(id, s);
  const policyIssue = publicationPolicyIssue(page);
  if (policyIssue) throw new AppError('PUBLICATION_POLICY', policyIssue, 409);
  if (page.version !== expectedVersion)
    throw new AppError('VERSION_CONFLICT', 'Reload the latest revision', 409);
  const current = baseline(info);
  if (page.baseline !== current)
    throw new AppError(
      'OUT_OF_SYNC',
      'On-chain settings have changed. Inspect and accept the current snapshot before preparing publication.',
      409,
    );
  if (info.locked) throw new AppError('TOKEN_LOCKED', 'The selected token cannot be minted');
  if (!info.sale.approved)
    throw new AppError(
      'MINTER_NOT_APPROVED',
      'Approve the verified Stacks contract in Collection Settings before publication',
    );
  if (info.sale.paused) throw new AppError('STACKS_PAUSED', 'The Stacks contract is paused');
  const wanted = dropFromDraft(page.draft);
  const call = nextDropCall(
    info.address,
    BigInt(page.token_id),
    info.sale.address,
    info.sale.drop,
    wanted,
    info.sale.phase,
  );
  if (!call) {
    return {
      contentOnly: true,
      version: page.version,
      expectedBaseline: current,
      review: serializable({ drop: info.sale.drop, fee: info.sale.fee, revision: page.version }),
    };
  }
  requireWrites(page.chain_id);
  await currencyInfo(page.chain_id, getAddress(wanted.currencyAddress), info.blockNumber);
  const tx = await simulate(page.chain_id, s.wallet, call);
  const after = { ...info.sale.drop };
  const fieldMap: Record<string, string[]> = {
    updateDropPayoutReceiver: ['payoutReceiver'],
    updateDropAllowance: ['allowance'],
    updateDropPrices: ['currencyAddress', 'presaleCost', 'publicCost'],
    updateDropDuration: ['startTime', 'presaleDuration', 'publicDuration'],
    updateDropPresaleMerkleRoot: ['presaleMerkleRoot'],
  };
  if (call.functionName === 'configureDrop') Object.assign(after, wanted);
  else for (const f of fieldMap[call.functionName]) (after as any)[f] = (wanted as any)[f];
  const expectedPost = configFingerprint(after);
  const expectedRound =
    BigInt(info.sale.round) +
    (call.functionName === 'configureDrop' && info.sale.drop.dropType !== 0 ? 1n : 0n);
  return command('intent_create', {
    chainId: page.chain_id,
    contract: page.contract,
    actor: s.wallet.toLowerCase(),
    pageId: page.id,
    revision: page.version,
    payload: {
      kind: 'publication',
      snapshot: current,
      expectedPost,
      expectedRound: expectedRound.toString(),
      wanted: serializable(wanted),
      tokenId: page.token_id,
      tx,
    },
  });
}
export async function publishContent(
  id: string,
  expectedVersion: number,
  expectedBaseline: string,
  s: Session,
) {
  const { page, info } = await pageForAdmin(id, s);
  const policyIssue = publicationPolicyIssue(page);
  if (policyIssue) throw new AppError('PUBLICATION_POLICY', policyIssue, 409);
  requireWrites(page.chain_id);
  if (page.version !== expectedVersion)
    throw new AppError('VERSION_CONFLICT', 'Reload the latest revision', 409);
  if (
    baseline(info) !== expectedBaseline ||
    configFingerprint(dropFromDraft(page.draft)) !== info.sale.configFingerprint
  )
    throw new AppError('OUT_OF_SYNC', 'On-chain configuration does not match this revision', 409);
  if (!info.sale.approved || info.locked || info.sale.paused)
    throw new AppError(
      'ACTION_REQUIRED',
      'Minting is unavailable; resolve the contract restriction first',
    );
  return command('publish_content', {
    id,
    expectedVersion,
    baseline: baseline(info),
    blockHash: info.blockHash,
    actor: s.wallet.toLowerCase(),
  });
}
export async function publicPage(slug: string) {
  const record = await command('public_get', { slug });
  if (!record) throw new AppError('NOT_FOUND', 'This mint page has not been published', 404);
  const draft = record.revision.draft as Draft;
  const info = await inspect(draft.chainId, draft.contract, undefined, BigInt(draft.tokenId));
  const expected = configFingerprint(dropFromDraft(draft));
  const consistent = !!info.sale && expected === info.sale.configFingerprint;
  return {
    slug,
    revision: record.revision.version,
    content: draft.content,
    chainId: draft.chainId,
    contract: draft.contract,
    tokenId: draft.tokenId,
    onchain: info,
    consistent,
    state: !consistent
      ? 'OUT_OF_SYNC'
      : info.sale.paused || !info.sale.approved || info.locked
        ? 'ACTION_REQUIRED'
        : 'PUBLISHED',
    currency: info.sale
      ? await currencyInfo(
          draft.chainId,
          getAddress(info.sale.drop.currencyAddress),
          info.blockNumber,
        )
      : null,
  };
}
export async function prepareMint(
  slug: string,
  qty: bigint,
  presaleAllowance: bigint,
  proof: Hex[],
  s: Session,
) {
  const page = await publicPage(slug);
  requireSessionChain(s, page.chainId);
  requireWrites(page.chainId);
  if (page.state !== 'PUBLISHED')
    throw new AppError(
      'MINT_UNAVAILABLE',
      'Mint conditions changed; minting is temporarily unavailable',
      409,
    );
  const info = page.onchain;
  const d = info.sale.drop as Drop;
  const phase = info.sale.phase;
  const c = client(page.chainId);
  if (![2, 3].includes(phase)) throw new AppError('SALE_CLOSED', 'The sale is not currently open');
  if (
    phase === 2 &&
    !verifyProof(presaleLeaf(s.wallet, presaleAllowance), proof, d.presaleMerkleRoot)
  )
    throw new AppError('ALLOWLIST', 'Invalid proof for this wallet and presale allowance');
  const minted = (await c.readContract({
    address: info.sale.address,
    abi: stacksAbi,
    functionName: 'getNumberMinted',
    args: [info.address, BigInt(page.tokenId), s.wallet],
    blockNumber: info.blockNumber,
  })) as bigint;
  const available = mintable(d, minted, phase === 2 ? presaleAllowance : undefined);
  if (qty <= 0n || qty > available)
    throw new AppError(
      'QUANTITY',
      'Requested quantity exceeds the remaining allocation or wallet limit',
    );
  const costs = quote(d, qty, info.sale.fee, phase);
  let call: Call;
  let kind = 'mint';
  if (d.currencyAddress !== zeroAddress && costs.price > 0n) {
    const currency = getAddress(d.currencyAddress);
    const [balance, allowance] = await Promise.all([
      c.readContract({
        address: currency,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [s.wallet],
        blockNumber: info.blockNumber,
      }),
      c.readContract({
        address: currency,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [s.wallet, info.sale.address],
        blockNumber: info.blockNumber,
      }),
    ]);
    if (balance < costs.price)
      throw new AppError('INSUFFICIENT_TOKEN', 'Insufficient payment-token balance');
    if (allowance < costs.price) {
      kind = 'approval';
      call = {
        to: currency,
        abi: erc20Abi,
        functionName: 'approve',
        args: [info.sale.address, allowance > 0n ? 0n : costs.price],
        value: 0n,
      };
    } else
      call = {
        to: info.sale.address,
        abi: stacksAbi,
        functionName: 'purchase',
        args: [info.address, BigInt(page.tokenId), s.wallet, qty, presaleAllowance, proof],
        value: costs.value,
      };
  } else
    call = {
      to: info.sale.address,
      abi: stacksAbi,
      functionName: 'purchase',
      args: [info.address, BigInt(page.tokenId), s.wallet, qty, presaleAllowance, proof],
      value: costs.value,
    };
  const tx = await simulate(page.chainId, s.wallet, call);
  const ethBalance = await c.getBalance({ address: s.wallet });
  if (ethBalance < BigInt(tx.value) + BigInt(tx.estimatedNetworkFee))
    throw new AppError(
      'INSUFFICIENT_ETH',
      'Insufficient ETH for payment, protocol fee and estimated network gas',
    );
  return command('intent_create', {
    chainId: page.chainId,
    contract: page.contract,
    actor: s.wallet.toLowerCase(),
    payload: {
      kind,
      slug,
      qty: qty.toString(),
      presaleAllowance: presaleAllowance.toString(),
      proof,
      tokenId: page.tokenId,
      snapshot: baseline(info),
      phase,
      costs: serializable(costs),
      currency: page.currency,
      tx,
    },
  });
}
export async function getIntent(id: string, s: Session) {
  const intent = await command('intent_get', { id });
  if (!intent) throw new AppError('NOT_FOUND', 'Transaction review not found', 404);
  requireSessionChain(s, Number(intent.chain_id));
  if (['admin', 'publication'].includes(intent.payload.kind)) {
    await authorize(
      Number(intent.chain_id),
      intent.contract,
      s.wallet,
      BigInt(intent.payload.tokenId),
    );
  } else if (intent.actor !== s.wallet.toLowerCase())
    throw new AppError('ACCESS_DENIED', 'This transaction belongs to another wallet', 403);
  return intent;
}
export async function preflight(id: string, s: Session) {
  const i = await getIntent(id, s);
  if (i.actor !== s.wallet.toLowerCase())
    throw new AppError(
      'SIGNER_CHANGED',
      'Only the wallet that prepared this transaction can sign it. Prepare a new review.',
      403,
    );
  if (i.status !== 'PREPARED')
    throw new AppError(
      'ALREADY_SUBMITTED',
      'This transaction has already been submitted. Check its receipt instead.',
      409,
    );
  if (Date.now() > Date.parse(i.payload.tx.expiresAt))
    throw new AppError('REVIEW_EXPIRED', 'Prepare a fresh transaction review');
  requireWrites(Number(i.chain_id));
  if (i.payload.kind === 'publication') {
    const page = await command('page_get', { id: i.page_id });
    if (page.version !== i.revision || page.state === 'PUBLISHING')
      throw new AppError(
        'VERSION_CONFLICT',
        'The page changed or another publication is pending. Prepare a new review.',
        409,
      );
  }
  const info = await inspect(Number(i.chain_id), i.contract, s.wallet, BigInt(i.payload.tokenId));
  const snapshot = i.payload.kind === 'admin' ? mutationSnapshot(info) : baseline(info);
  if (snapshot !== i.payload.snapshot)
    throw new AppError(
      'STATE_CHANGED',
      'Contract settings changed since simulation. Prepare a fresh review.',
      409,
    );
  if (['mint', 'approval'].includes(i.payload.kind) && info.sale.phase !== i.payload.phase)
    throw new AppError('PHASE_CHANGED', 'The sale phase changed. Review a new quote.', 409);
  if (['mint', 'approval'].includes(i.payload.kind)) {
    const minted = (await client(Number(i.chain_id)).readContract({
      address: info.sale.address,
      abi: stacksAbi,
      functionName: 'getNumberMinted',
      args: [info.address, BigInt(i.payload.tokenId), s.wallet],
    })) as bigint;
    const maximum = mintable(
      info.sale.drop,
      minted,
      info.sale.phase === 2 ? BigInt(i.payload.presaleAllowance) : undefined,
    );
    if (BigInt(i.payload.qty) > maximum)
      throw new AppError(
        'QUANTITY_CHANGED',
        'Available quantity changed. Review a new quote.',
        409,
      );
  }
  const tx = i.payload.tx;
  await client(Number(i.chain_id)).call({
    account: s.wallet,
    to: tx.to,
    data: tx.data,
    value: BigInt(tx.value),
  });
  return tx;
}
export async function attachIntent(id: string, txHash: Hex, s: Session) {
  const i = await getIntent(id, s);
  const c = client(Number(i.chain_id));
  await exactChain(c, Number(i.chain_id));
  let tx;
  try {
    tx = await c.getTransaction({ hash: txHash });
  } catch {
    throw new AppError(
      'TX_PENDING',
      'The RPC has not seen this transaction yet. Retry checking this hash.',
      409,
    );
  }
  const expected = i.payload.tx;
  if (
    tx.from.toLowerCase() !== i.actor ||
    tx.to?.toLowerCase() !== expected.to.toLowerCase() ||
    tx.input.toLowerCase() !== expected.data.toLowerCase() ||
    tx.value !== BigInt(expected.value)
  )
    throw new AppError(
      'TX_MISMATCH',
      'Transaction sender, destination, calldata or payment does not match the saved review',
      409,
    );
  if (i.status === 'CONFIRMED') return i;
  if (i.tx_hash && i.tx_hash.toLowerCase() !== txHash.toLowerCase()) {
    if (Number(i.payload.nonce) !== tx.nonce)
      throw new AppError('TX_NONCE', 'A replacement must use the original nonce', 409);
  }
  return command('intent_attach', { id, txHash, nonce: tx.nonce });
}
export async function confirmIntent(id: string, s: Session) {
  const i = await getIntent(id, s);
  if (i.status === 'CONFIRMED') return i;
  if (!i.tx_hash) throw new AppError('NO_TX_HASH', 'Save the submitted transaction hash first');
  const c = client(Number(i.chain_id));
  await exactChain(c, Number(i.chain_id));
  let receipt;
  try {
    receipt = await c.getTransactionReceipt({ hash: i.tx_hash });
  } catch {
    return { pending: true, status: 'SUBMITTED' };
  }
  const block = await c.getBlock({ blockNumber: receipt.blockNumber });
  if (block.hash !== receipt.blockHash) return { pending: true, status: 'REORG_DETECTED' };
  if (receipt.status === 'reverted')
    return command('intent_finish', {
      id,
      status: 'REVERTED',
      pageState: 'PUBLISH_FAILED',
      actor: s.wallet.toLowerCase(),
      receipt: serializable(receipt),
    });
  if (Number(i.chain_id) !== 31337) {
    const finalized = await c.getBlock({ blockTag: 'finalized' });
    if (finalized.number < receipt.blockNumber)
      return {
        pending: true,
        status: 'AWAITING_FINALITY',
        blockNumber: receipt.blockNumber.toString(),
      };
  }
  let pageState = 'PUBLISHED',
    base: string | undefined;
  const info = await inspect(Number(i.chain_id), i.contract, s.wallet, BigInt(i.payload.tokenId));
  if (i.payload.kind === 'publication') {
    if (!info.authorized) pageState = 'ACTION_REQUIRED';
    else {
      if (
        info.sale.configFingerprint !== i.payload.expectedPost ||
        String(info.sale.round) !== i.payload.expectedRound
      ) {
        return command('intent_finish', {
          id,
          status: 'CONFIRMED',
          pageState: 'OUT_OF_SYNC',
          actor: s.wallet.toLowerCase(),
          receipt: serializable(receipt),
        });
      }
      base = baseline(info);
      const page = await command('page_get', { id: i.page_id });
      if (page.version !== i.revision) pageState = 'ACTION_REQUIRED';
      else if (configFingerprint(dropFromDraft(page.draft)) !== info.sale.configFingerprint)
        pageState = 'READY_FOR_REVIEW';
      else if (info.locked || info.sale.paused || !info.sale.approved)
        pageState = 'ACTION_REQUIRED';
    }
  }
  let mintResult: Record<string, unknown> = {};
  if (i.payload.kind === 'mint') {
    let actualMinted = 0n;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== i.contract) continue;
      try {
        const event = decodeEventLog({
          abi: creatorAbi,
          data: log.data,
          topics: log.topics,
        }) as any;
        if (
          event.eventName === 'TransferSingle' &&
          event.args.from.toLowerCase() === zeroAddress &&
          event.args.to.toLowerCase() === i.actor &&
          event.args.id === BigInt(i.payload.tokenId)
        )
          actualMinted += event.args.value;
      } catch {}
    }
    mintResult = {
      requestedQuantity: i.payload.qty,
      actualMinted: actualMinted.toString(),
      quantityAdjusted: actualMinted !== BigInt(i.payload.qty),
      tokenId: i.payload.tokenId,
      collection: i.contract,
    };
  }
  return command('intent_finish', {
    id,
    status: 'CONFIRMED',
    pageState,
    baseline: base,
    actor: s.wallet.toLowerCase(),
    receipt: serializable({
      ...mintResult,
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      gasUsed: receipt.gasUsed,
      status: receipt.status,
    }),
  });
}

export async function cancelIntent(id: string, replacementHash: Hex, s: Session) {
  const i = await getIntent(id, s);
  if (!i.tx_hash) throw new AppError('NO_TX_HASH', 'Original transaction hash is required');
  if (i.status === 'CONFIRMED')
    throw new AppError('ALREADY_CONFIRMED', 'The original action was confirmed', 409);
  const c = client(Number(i.chain_id));
  const [replacement, receipt] = await Promise.all([
    c.getTransaction({ hash: replacementHash }),
    c.getTransactionReceipt({ hash: replacementHash }),
  ]);
  if (
    i.actor !== replacement.from.toLowerCase() ||
    i.payload.nonce === undefined ||
    Number(i.payload.nonce) !== replacement.nonce ||
    replacement.hash === i.tx_hash
  )
    throw new AppError(
      'TX_MISMATCH',
      'This is not a replacement for the submitted transaction',
      409,
    );
  if (
    replacement.to?.toLowerCase() === i.payload.tx.to.toLowerCase() &&
    replacement.input === i.payload.tx.data &&
    replacement.value === BigInt(i.payload.tx.value)
  )
    throw new AppError('SAME_ACTION', 'Attach and confirm this replacement as the original action');
  const block = await c.getBlock({ blockNumber: receipt.blockNumber });
  if (block.hash !== receipt.blockHash)
    throw new AppError('REORG', 'Replacement receipt is not canonical', 409);
  if (
    Number(i.chain_id) !== 31337 &&
    (await c.getBlock({ blockTag: 'finalized' })).number < receipt.blockNumber
  )
    return { status: 'AWAITING_FINALITY' };
  return command('intent_finish', {
    id,
    status: 'REPLACED',
    pageState: 'ACTION_REQUIRED',
    actor: s.wallet.toLowerCase(),
    receipt: serializable({
      replacementHash,
      blockHash: receipt.blockHash,
      blockNumber: receipt.blockNumber,
    }),
  });
}
