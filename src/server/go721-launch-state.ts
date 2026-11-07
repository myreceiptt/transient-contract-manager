import { createPublicClient, http, getAddress, keccak256, toHex, zeroAddress, type Address } from 'viem';
import { AppError, fingerprint, serializable } from '../lib/domain';
import { GO_APPROVED_TERMS, inspectDraftAgainstApprovedTerms } from '../lib/erc721-sale-terms';
import { GO721_COLLECTION, GO721_STACKS, go721DropAbi, go721ViewsAbi, quoteGo721Mint } from '../lib/go721-sale-engine';
import { GO721_DRAFT_ID, GO721_FOLDERS, GO721_RUNTIME, GO721_MINTER_ROLE, go721CreatorStateAbi } from '../lib/go721-launch';
import { planGo721Drop } from '../lib/go721-sale-plan';
import { erc721CreatorAbi } from '../lib/erc721-creator';
import { attestCreator, localCreatorExecution } from './erc721-creator-mint';
import { client, exactChain } from './chain';
import { command } from './db';

export function go721Scope(chainId: number) {
  if (chainId !== 1 && !localCreatorExecution(chainId))
    throw new AppError('GO721_CHAIN', 'GO#|O launch supports Ethereum or an isolated local fork.', 403);
}

export async function savedGo721Campaign() {
  // A narrow server-only read. Never return the private draft in a public response.
  const row = await command('erc721_draft', {
    action: 'get', chainId: 1, contract: GO721_COLLECTION.toLowerCase(), kind: 'MINT_PAGE',
    id: GO721_DRAFT_ID, actor: GO_APPROVED_TERMS.presaleRecipient.toLowerCase(), allowCollection: true,
  });
  const d = row?.draft;
  if (!d || row.archived_at || row.version < 10 || inspectDraftAgainstApprovedTerms(d).length ||
      d.currency !== 'ETH' || d.end !== '2027-11-10T10:10' ||
      d.presaleMetadataBaseUri !== GO721_FOLDERS[1] || d.publicMetadataBaseUri !== GO721_FOLDERS[2])
    throw new AppError('GO721_DRAFT_CHANGED', 'Saved launch terms or audited folder identities changed. Launch is locked.', 409);
  return { version: row.version, fingerprint: fingerprint({
    price: d.price, payout: d.payout.toLowerCase(), maxPerWallet: d.maxPerWallet,
    start: d.start, end: d.end, currency: d.currency,
    presale: d.presaleMetadataBaseUri, public: d.publicMetadataBaseUri,
  }) };
}

export async function readGo721State(chainId = 1, wallet?: Address, finalized = false) {
  go721Scope(chainId);
  const c = client(chainId);
  await exactChain(c, chainId);
  const block = await c.getBlock(finalized && chainId === 1 ? { blockTag: 'finalized' } : {});
  const at = { blockNumber: block.number };
  const [creator, code, drop, round, phase, paused, fee, approved, counterHex, burnsHex, supply, version, mintedByWallet] = await Promise.all([
    attestCreator(chainId, GO721_COLLECTION, wallet, block.number),
    c.getCode({ address: GO721_STACKS, ...at }),
    c.readContract({ address: GO721_STACKS, abi: go721DropAbi, functionName: 'getDrop', args: [GO721_COLLECTION], ...at }),
    c.readContract({ address: GO721_STACKS, abi: go721ViewsAbi, functionName: 'getDropRound', args: [GO721_COLLECTION], ...at }),
    c.readContract({ address: GO721_STACKS, abi: go721ViewsAbi, functionName: 'getDropPhase', args: [GO721_COLLECTION], ...at }),
    c.readContract({ address: GO721_STACKS, abi: go721ViewsAbi, functionName: 'paused', ...at }),
    c.readContract({ address: GO721_STACKS, abi: go721ViewsAbi, functionName: 'protocolFee', ...at }),
    c.readContract({ address: GO721_COLLECTION, abi: go721CreatorStateAbi, functionName: 'hasRole', args: [GO721_MINTER_ROLE, GO721_STACKS], ...at }),
    // Slots independently verified by solc storageLayout and contracts:verify.
    c.getStorageAt({ address: GO721_COLLECTION, slot: toHex(0, { size: 32 }), ...at }),
    c.getStorageAt({ address: GO721_COLLECTION, slot: toHex(1, { size: 32 }), ...at }),
    c.readContract({ address: GO721_COLLECTION, abi: go721CreatorStateAbi, functionName: 'totalSupply', ...at }),
    c.readContract({ address: GO721_STACKS, abi: go721ViewsAbi, functionName: 'VERSION', ...at }),
    wallet ? c.readContract({ address: GO721_STACKS, abi: go721ViewsAbi, functionName: 'getNumberMinted', args: [GO721_COLLECTION, wallet], ...at }) : 0n,
  ]);
  if (!code || keccak256(code) !== GO721_RUNTIME || version !== '2.3.1')
    throw new AppError('GO721_RUNTIME', 'TLStacks721 runtime does not match the reproduced official deployment.', 503);
  if (!counterHex || !burnsHex) throw new AppError('GO721_COUNTER', 'Historical counter read unavailable.', 503);
  const counter = BigInt(counterHex), burns = BigInt(burnsHex);
  if (counter < burns || counter - burns !== supply)
    throw new AppError('GO721_COUNTER', 'Creator counter and circulating supply disagree.', 409);
  return { chainId, block, creator, drop, round, phase, paused, fee, approved, counter, burns, supply, mintedByWallet };
}
export type Go721State = Awaited<ReturnType<typeof readGo721State>>;

export function expectedGo721Drop(round: 1 | 2, startTime?: number) {
  return planGo721Drop({ round, metadataBaseUri: GO721_FOLDERS[round],
    historicalTokenCounterVerified: true, presaleDurationSeconds: 86400,
    confirmedPresaleMints: round === 2 ? 3 : undefined, round2StartSeconds: startTime });
}
export function assertGo721Drop(s: Go721State, round: 1 | 2) {
  const expected = expectedGo721Drop(round, round === 2 ? Number(s.drop.startTime) : undefined);
  for (const [key, value] of Object.entries(expected)) {
    if (key === 'supply') continue;
    if (String(s.drop[key as keyof typeof s.drop]).toLowerCase() !== String(value).toLowerCase())
      throw new AppError('GO721_CONFIG', 'On-chain ' + key + ' differs from the reviewed campaign.', 409);
  }
  const minted = (round === 2 ? 3n : 0n) + s.drop.initialSupply - s.drop.supply;
  if (s.round !== BigInt(round - 1) || s.drop.supply > s.drop.initialSupply || s.counter !== minted || s.burns !== 0n)
    throw new AppError('GO721_SEQUENCE', 'Mint/burn history or round does not match the 3 + 27 allocation.', 409);
}
export function assertGo721Live(s: Go721State) {
  if (s.paused || s.creator.supplyLocked || s.creator.renderingContract !== zeroAddress || !s.approved)
    throw new AppError('GO721_NOT_READY', 'Sale is paused, supply locked, metadata overridden, or minter permission missing.', 409);
}
export function go721Quote(s: Go721State, wallet?: Address, quantity = 1) {
  return quoteGo721Mint({ reportedVersion: '2.3.1', paused: s.paused,
    phase: s.phase, roundNumber: s.round, ...s.drop, protocolFee: s.fee,
    mintedByWallet: s.mintedByWallet }, wallet, quantity);
}

/** Three finalized Transfer mints AND the matching protocol Purchase event(s).
 * A zero circulating supply or three direct creator mints cannot unlock round 2.
 * Read-only archive access is separate from the transaction transport.
 */
export async function verifyFinalPresale(chainId: number) {
  const s = await readGo721State(chainId, undefined, true);
  assertGo721Live(s); assertGo721Drop(s, 1);
  if (s.counter !== 3n || s.drop.supply !== 0n || s.phase !== 4)
    throw new AppError('GO721_PRESALE_PENDING', 'Wait for all three presale mints to reach Ethereum finality.', 409);
  const c = chainId === 1
    ? createPublicClient({ transport: http('https://ethereum.reth.rs/rpc', { timeout: 25000, retryCount: 1 }) })
    : client(chainId);
  await exactChain(c as ReturnType<typeof client>, chainId);
  // The historical counter is 0 at the independently audited prelaunch checkpoint.
  const from = chainId === 1 ? 26332151n : BigInt(process.env.TCM_GO721_FORK_BLOCK || '26332151');
  const logs = [];
  for (let start = from; start <= s.block.number; start += 99999n) {
    const end = start + 99998n < s.block.number ? start + 99998n : s.block.number;
    logs.push(...await c.getLogs({ address: GO721_COLLECTION, event: erc721CreatorAbi[8],
      fromBlock: start, toBlock: end, strict: true }));
    if (start - from > 600000n) throw new AppError('GO721_HISTORY_RANGE', 'Presale evidence range exceeds the launch window.', 409);
  }
  const mints = logs.filter(l => l.args.from === zeroAddress);
  if (mints.length !== 3 || mints.some((l, i) => l.args.tokenId !== BigInt(i + 1) ||
      l.args.to?.toLowerCase() !== GO_APPROVED_TERMS.presaleRecipient.toLowerCase()))
    throw new AppError('GO721_PRESALE_HISTORY', 'Finalized presale mint recipients or Token IDs differ from the plan.', 409);
  const { decodeEventLog } = await import('viem');
  const { go721PurchaseAbi } = await import('../lib/go721-launch');
  let purchased = 0n;
  for (const hash of new Set(mints.map(l => l.transactionHash))) {
    if (!hash) throw new AppError('GO721_PRESALE_HISTORY', 'Mint transaction hash missing.', 409);
    const receipt = await c.getTransactionReceipt({ hash });
    if (receipt.status !== 'success' || receipt.blockNumber > s.block.number ||
        (await c.getBlock({ blockNumber: receipt.blockNumber })).hash !== receipt.blockHash)
      throw new AppError('GO721_FINALITY', 'Presale receipt is not canonical and final.', 409);
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== GO721_STACKS.toLowerCase()) continue;
      try {
        const ev = decodeEventLog({ abi: go721PurchaseAbi, ...log });
        if (ev.eventName === 'Purchase' && ev.args.nftAddress.toLowerCase() === GO721_COLLECTION.toLowerCase() &&
            ev.args.nftReceiver.toLowerCase() === GO_APPROVED_TERMS.presaleRecipient.toLowerCase() &&
            ev.args.currencyAddress === zeroAddress && ev.args.price === 0n && ev.args.isPresale)
          purchased += ev.args.amount;
      } catch { /* Ignore unrelated protocol events. */ }
    }
  }
  if (purchased !== 3n) throw new AppError('GO721_PRESALE_PURCHASE', 'Three finalized TLStacks721 purchases are required.', 409);
  return serializable({ block: s.block.number, blockHash: s.block.hash, tokenIds: ['1', '2', '3'],
    transactionHashes: [...new Set(mints.map(l => l.transactionHash))] });
}
