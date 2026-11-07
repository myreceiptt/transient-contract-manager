import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  decodeEventLog,
  encodeFunctionData,
  getAddress,
  keccak256,
  zeroAddress,
  type Address,
  type Hex,
} from 'viem';
import { erc721Creator, erc721CreatorAbi as abi } from '../lib/erc721-creator';
import { ADMIN_ROLE } from '../lib/chains';
import { AppError, nonzeroAddress, fingerprint, serializable } from '../lib/domain';
import { nftMetadataSchema } from '../lib/nft-metadata';
import { requireSessionChain, type Session } from './auth';
import { client, exactChain } from './chain';
import { command, listRecords } from './db';
import { fetchMediaWithFallback } from './media';

const kind = 'erc721_creator_mint';
export const creatorMintInput = z
  .object({
    recipient: nonzeroAddress,
    // Raw SHA-256 CID permits independent integrity verification of the exact JSON bytes.
    uri: z
      .string()
      .regex(
        /^ipfs:\/\/bafkrei[a-z2-7]{52}$/,
        'Use the immutable raw JSON CID from Pin metadata JSON to IPFS',
      ),
  })
  .strict();

export function localCreatorExecution(chainId: number) {
  if (
    chainId !== 31337 ||
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL ||
    process.env.VERCEL_ENV ||
    process.env.LOCAL_CHAIN_ENABLED !== 'true'
  )
    return false;
  try {
    const url = new URL(process.env.LOCAL_RPC_URL || 'http://127.0.0.1:8545');
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

export async function attestCreator(chainId: number, contract: Address, wallet?: Address, atBlock?: bigint) {
  if (chainId !== 1 && !localCreatorExecution(chainId))
    throw new AppError(
      'ERC721_CHAIN_SCOPE',
      'Creator mint supports Ethereum or an isolated local fork',
      403,
    );
  const c = client(chainId);
  await exactChain(c, chainId);
  const block = await c.getBlock(atBlock === undefined ? {} : { blockNumber: atBlock });
  const code = await c.getCode({ address: contract, blockNumber: block.number });
  const clone = code?.match(
    /^0x363d3d373d3d3d363d73([0-9a-fA-F]{40})5af43d82803e903d91602b57fd5bf3$/,
  );
  if (!clone)
    throw new AppError(
      'ERC721_PROXY',
      'Only the canonical EIP-1167 creator clone is supported',
      403,
    );
  const implementation = getAddress('0x' + clone[1]);
  const runtime = await c.getCode({ address: implementation, blockNumber: block.number });
  if (
    !runtime ||
    keccak256(runtime) !== erc721Creator.runtimeHash ||
    (chainId === 1 && implementation.toLowerCase() !== erc721Creator.implementation)
  )
    throw new AppError('ERC721_RUNTIME', 'Exact ERC721TL 4.1.2 runtime attestation failed', 403);
  const read = { address: contract, abi, blockNumber: block.number };
  const [version, owner, supplyLocked, renderingContract, admin] = await Promise.all([
    c.readContract({ ...read, functionName: 'VERSION' }),
    c.readContract({ ...read, functionName: 'owner' }),
    c.readContract({ ...read, functionName: 'supplyLocked' }),
    c.readContract({ ...read, functionName: 'renderingContract' }),
    wallet
      ? c.readContract({ ...read, functionName: 'hasRole', args: [ADMIN_ROLE, wallet] })
      : false,
  ]);
  if (version !== erc721Creator.version)
    throw new AppError('ERC721_VERSION', 'Creator version mismatch', 403);
  return {
    chainId,
    contract,
    implementation,
    runtimeHash: erc721Creator.runtimeHash,
    sourceCommit: erc721Creator.sourceCommit,
    block: block.number,
    blockHash: block.hash,
    owner,
    supplyLocked,
    renderingContract,
    role: wallet?.toLowerCase() === owner.toLowerCase() ? 'owner' : admin ? 'admin' : 'viewer',
  };
}

export function verifyCreatorMetadata(uri: string, bytes: Buffer) {
  creatorMintInput.shape.uri.parse(uri);
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let bits = 0,
    acc = 0;
  const decoded: number[] = [];
  for (const ch of uri.slice(8)) {
    acc = (acc << 5) | alphabet.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      decoded.push((acc >> bits) & 255);
      acc &= (1 << bits) - 1;
    }
  }
  const cid = Buffer.from(decoded);
  const digest = createHash('sha256').update(bytes).digest();
  if (
    acc !== 0 ||
    cid.length !== 36 ||
    !cid.subarray(0, 4).equals(Buffer.from([1, 0x55, 0x12, 32])) ||
    !cid.subarray(4).equals(digest)
  )
    throw new AppError(
      'ERC721_METADATA_INTEGRITY',
      'Metadata bytes do not match the reviewed IPFS CID',
      422,
    );
  let raw: unknown;
  try {
    raw = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new AppError('METADATA_JSON', 'Metadata must be JSON', 422);
  }
  return { metadata: nftMetadataSchema.parse(raw), sha256: digest.toString('hex') };
}

export function approvalKey(tx: {
  chainId: number;
  account: string;
  to: string;
  data: string;
  nonce: number;
  value: string;
}) {
  return fingerprint({
    chainId: tx.chainId,
    account: tx.account.toLowerCase(),
    to: tx.to.toLowerCase(),
    data: tx.data.toLowerCase(),
    nonce: tx.nonce,
    value: tx.value,
  });
}
// A general GO1 write switch never enables ERC721. An operator-approved exact call,
// sender and nonce are required, limiting an approval to one blockchain transaction.
export function creatorSigningAllowed(tx: Parameters<typeof approvalKey>[0]) {
  if (localCreatorExecution(tx.chainId)) return true;
  if (
    tx.chainId !== 1 ||
    process.env.VERCEL_ENV === 'preview' ||
    process.env.MAINNET_WRITES_ENABLED !== 'true'
  )
    return false;
  try {
    const permission = z
      .object({
        key: z.string(),
        expiresAt: z.string().datetime(),
        maxNetworkFeeWei: z.string().regex(/^[1-9][0-9]*$/),
      })
      .strict()
      .parse(JSON.parse(process.env.ERC721_MINT_APPROVAL || ''));
    const expiry = Date.parse(permission.expiresAt);
    return (
      permission.key === approvalKey(tx) && expiry > Date.now() && expiry <= Date.now() + 86400000
    );
  } catch {
    return false;
  }
}

async function inspectMint(chainId: number, contract: Address, raw: unknown, s: Session) {
  requireSessionChain(s, chainId);
  if (chainId === 1 && contract.toLowerCase() === '0x99b8ae3c16559b80424a45c92dd530d50d970a46')
    throw new AppError('GO721_RESERVED_SEQUENCE',
      'GO#|O Token IDs 1–30 are reserved for the audited 3 + 27 primary sale. Use Mint Pages launch review.', 409);
  const action = creatorMintInput.parse(raw);
  const info = await attestCreator(chainId, contract, s.wallet);
  if (!['owner', 'admin'].includes(info.role))
    throw new AppError('ERC721_ADMIN_REQUIRED', 'Current owner or ADMIN_ROLE required', 403);
  if (info.supplyLocked)
    throw new AppError('ERC721_SUPPLY_LOCKED', 'Additional NFT supply is permanently locked', 403);
  // A rendering contract overrides tokenURI; fail closed instead of minting different metadata.
  if (info.renderingContract !== zeroAddress)
    throw new AppError(
      'ERC721_RENDERER',
      'A rendering contract overrides tokenURI; this mint path requires the stored URI',
      403,
    );
  const c = client(chainId);
  const data = encodeFunctionData({
    abi,
    functionName: 'mint',
    args: [action.recipient, action.uri],
  });
  // mint() uses _mint, not _safeMint. Do not silently mint into a contract with no ERC721 receiver.
  const recipientCode = await c.getCode({ address: action.recipient, blockNumber: info.block });
  if (recipientCode && recipientCode !== '0x')
    throw new AppError(
      'ERC721_RECIPIENT_CONTRACT',
      'This first-mint path accepts an EOA recipient only',
      403,
    );
  const [gas, fees, balance, latestNonce, pendingNonce] = await Promise.all([
    c.estimateGas({ account: s.wallet, to: contract, data, value: 0n }),
    c.estimateFeesPerGas(),
    c.getBalance({ address: s.wallet }),
    c.getTransactionCount({ address: s.wallet, blockTag: 'latest' }),
    c.getTransactionCount({ address: s.wallet, blockTag: 'pending' }),
  ]);
  if (latestNonce !== pendingNonce)
    throw new AppError(
      'ERC721_PENDING_NONCE',
      'Resolve pending wallet transactions before reviewing a creator mint',
      409,
    );
  await c.call({ account: s.wallet, to: contract, data, value: 0n });
  const gasLimit = (gas * 125n + 99n) / 100n;
  const maxFeePerGas = fees.maxFeePerGas!;
  const maxPriorityFeePerGas = fees.maxPriorityFeePerGas!;
  if (balance < gasLimit * maxFeePerGas)
    throw new AppError(
      'ERC721_GAS_BALANCE',
      'The executing wallet cannot cover the maximum estimated network fee',
      422,
    );
  const tx = {
    chainId,
    account: s.wallet,
    to: contract,
    data,
    value: '0',
    nonce: pendingNonce,
    gas: gasLimit.toString(),
    maxFeePerGas: maxFeePerGas.toString(),
    maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
    estimatedGas: gas.toString(),
    maximumNetworkFee: (gasLimit * maxFeePerGas).toString(),
    balance: balance.toString(),
    expiresAt: new Date(Date.now() + 5 * 60000).toISOString(),
  };
  return {
    action,
    info,
    tx,
    snapshot: fingerprint({
      owner: info.owner.toLowerCase(),
      role: info.role,
      implementation: info.implementation.toLowerCase(),
      runtimeHash: info.runtimeHash,
      supplyLocked: info.supplyLocked,
      renderingContract: info.renderingContract,
    }),
  };
}

export async function prepareCreatorMint(
  chainId: number,
  contract: Address,
  raw: unknown,
  s: Session,
) {
  const { action, info, tx, snapshot } = await inspectMint(chainId, contract, raw, s);
  const bytes = await fetchMediaWithFallback(action.uri, 24 * 1024);
  const metadata = verifyCreatorMetadata(action.uri, bytes);
  const intent = await command('intent_create', {
    chainId,
    contract,
    actor: s.wallet.toLowerCase(),
    payload: {
      kind,
      action,
      tx,
      snapshot,
      metadata,
      attestation: serializable(info),
      approvalKey: approvalKey(tx),
    },
  });
  return { ...intent, signingEnabled: creatorSigningAllowed(tx) };
}

export async function getCreatorMint(id: string, s: Session) {
  const i = await command('intent_get', { id });
  if (!i || i.payload?.kind !== kind || i.page_id !== null)
    throw new AppError('NOT_FOUND', 'ERC721 creator review not found', 404);
  requireSessionChain(s, Number(i.chain_id));
  if (i.actor !== s.wallet.toLowerCase())
    throw new AppError('ACCESS_DENIED', 'This review belongs to another wallet', 403);
  return { ...i, signingEnabled: creatorSigningAllowed(i.payload.tx) };
}

export async function preflightCreatorMint(id: string, s: Session) {
  const i = await getCreatorMint(id, s);
  if (i.status !== 'PREPARED')
    throw new AppError(
      'ALREADY_SUBMITTED',
      'Check the existing transaction instead of minting again',
      409,
    );
  if (Date.now() > Date.parse(i.payload.tx.expiresAt))
    throw new AppError('REVIEW_EXPIRED', 'Prepare a fresh mint review', 409);
  if (!creatorSigningAllowed(i.payload.tx))
    throw new AppError(
      'ERC721_APPROVAL_REQUIRED',
      'This exact creator mint needs explicit operator approval before wallet signing',
      403,
    );
  const fresh = await inspectMint(Number(i.chain_id), getAddress(i.contract), i.payload.action, s);
  if (fresh.snapshot !== i.payload.snapshot || approvalKey(fresh.tx) !== i.payload.approvalKey)
    throw new AppError(
      'STATE_CHANGED',
      'Permission, runtime or wallet nonce changed. Prepare a fresh review',
      409,
    );
  const metadata = verifyCreatorMetadata(
    i.payload.action.uri,
    await fetchMediaWithFallback(i.payload.action.uri, 24 * 1024),
  );
  if (metadata.sha256 !== i.payload.metadata.sha256)
    throw new AppError('ERC721_METADATA_INTEGRITY', 'Metadata changed', 409);
  const approvedCeiling = localCreatorExecution(Number(i.chain_id))
    ? BigInt(i.payload.tx.maximumNetworkFee)
    : BigInt(JSON.parse(process.env.ERC721_MINT_APPROVAL!).maxNetworkFeeWei);
  const reviewedCeiling = BigInt(i.payload.tx.maximumNetworkFee);
  const ceiling = approvedCeiling < reviewedCeiling ? approvedCeiling : reviewedCeiling;
  if (BigInt(fresh.tx.maximumNetworkFee) > ceiling)
    throw new AppError(
      'ERC721_FEE_CHANGED',
      'The network fee exceeds the approved ceiling. Review again',
      409,
    );
  return fresh.tx;
}

export function assertMintTransaction(i: any, tx: any) {
  const expected = i.payload.tx;
  if (
    tx.from.toLowerCase() !== i.actor ||
    tx.to?.toLowerCase() !== i.contract ||
    tx.input.toLowerCase() !== expected.data.toLowerCase() ||
    tx.value !== 0n ||
    tx.nonce !== expected.nonce ||
    (tx.chainId !== undefined && Number(tx.chainId) !== Number(i.chain_id))
  )
    throw new AppError(
      'TX_MISMATCH',
      'Sender, chain, recipient call, metadata, value or nonce differs from the saved mint review',
      409,
    );
}
export async function attachCreatorMint(id: string, txHash: Hex, s: Session) {
  const i = await getCreatorMint(id, s),
    c = client(Number(i.chain_id));
  await exactChain(c, Number(i.chain_id));
  const tx = await c.getTransaction({ hash: txHash });
  assertMintTransaction(i, tx);
  if (i.status === 'CONFIRMED') {
    if (i.tx_hash !== txHash.toLowerCase())
      throw new AppError('TX_MISMATCH', 'This review is already confirmed', 409);
    return i;
  }
  return command('intent_attach', { id, txHash, nonce: tx.nonce });
}
export function mintedTokenFromReceipt(contract: string, recipient: string, logs: any[]) {
  const ids: bigint[] = [];
  for (const log of logs) {
    if (log.address.toLowerCase() !== contract.toLowerCase()) continue;
    try {
      const event = decodeEventLog({ abi, data: log.data, topics: log.topics });
      if (
        event.eventName === 'Transfer' &&
        event.args.from === zeroAddress &&
        event.args.to.toLowerCase() === recipient.toLowerCase()
      )
        ids.push(event.args.tokenId);
    } catch {
      /* Unrelated collection event. */
    }
  }
  if (ids.length !== 1)
    throw new AppError(
      'ERC721_MINT_EVENT',
      'Receipt must contain exactly one matching NFT mint',
      409,
    );
  return ids[0];
}

export async function confirmCreatorMint(id: string, s: Session) {
  const i = await getCreatorMint(id, s);
  if (i.status === 'CONFIRMED') return i;
  if (!i.tx_hash)
    throw new AppError('NO_TX_HASH', 'Attach the submitted transaction hash first', 409);
  const c = client(Number(i.chain_id));
  await exactChain(c, Number(i.chain_id));
  let receipt;
  try {
    receipt = await c.getTransactionReceipt({ hash: i.tx_hash });
  } catch {
    return { pending: true, status: 'SUBMITTED' };
  }
  assertMintTransaction(i, await c.getTransaction({ hash: i.tx_hash }));
  if ((await c.getBlock({ blockNumber: receipt.blockNumber })).hash !== receipt.blockHash)
    return { pending: true, status: 'REORG_DETECTED' };
  if (
    Number(i.chain_id) !== 31337 &&
    (await c.getBlock({ blockTag: 'finalized' })).number < receipt.blockNumber
  )
    return { pending: true, status: 'AWAITING_FINALITY' };
  if (receipt.status === 'reverted')
    return command('intent_finish', {
      id,
      actor: s.wallet.toLowerCase(),
      status: 'REVERTED',
      receipt: serializable(receipt),
    });
  await attestCreator(Number(i.chain_id), getAddress(i.contract));
  const tokenId = mintedTokenFromReceipt(i.contract, i.payload.action.recipient, receipt.logs);
  const [owner, uri] = await Promise.all([
    c.readContract({
      address: getAddress(i.contract),
      abi,
      functionName: 'ownerOf',
      args: [tokenId],
      blockNumber: receipt.blockNumber,
    }),
    c.readContract({
      address: getAddress(i.contract),
      abi,
      functionName: 'tokenURI',
      args: [tokenId],
      blockNumber: receipt.blockNumber,
    }),
  ]);
  if (
    owner.toLowerCase() !== i.payload.action.recipient.toLowerCase() ||
    uri !== i.payload.action.uri
  )
    throw new AppError(
      'ERC721_READBACK',
      'Mint receipt ownership or tokenURI readback does not match the review',
      409,
    );
  return command('intent_finish', {
    id,
    actor: s.wallet.toLowerCase(),
    status: 'CONFIRMED',
    receipt: serializable({
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      gasUsed: receipt.gasUsed,
      status: receipt.status,
      tokenId,
      ownerAtMint: owner,
      tokenURI: uri,
      metadataSha256: i.payload.metadata.sha256,
      collection: i.contract,
    }),
  });
}

export async function cancelCreatorMint(id: string, hash: Hex, s: Session) {
  const i = await getCreatorMint(id, s);
  if (!i.tx_hash || !['SUBMITTED'].includes(i.status))
    throw new AppError('INTENT_STATE', 'Only a submitted mint can be reconciled as replaced', 409);
  const c = client(Number(i.chain_id));
  await exactChain(c, Number(i.chain_id));
  const [tx, receipt] = await Promise.all([
    c.getTransaction({ hash }),
    c.getTransactionReceipt({ hash }),
  ]);
  if (
    tx.from.toLowerCase() !== i.actor ||
    tx.nonce !== i.payload.tx.nonce ||
    hash.toLowerCase() === i.tx_hash
  )
    throw new AppError('TX_MISMATCH', 'Replacement must use the original sender and nonce', 409);
  // A repriced mint still minted the NFT; reconcile it through attach/confirm.
  if (
    tx.to?.toLowerCase() === i.contract &&
    tx.input.toLowerCase() === i.payload.tx.data.toLowerCase() &&
    tx.value === 0n
  )
    throw new AppError('TX_REPRICED', 'Attach the repriced mint hash and check its receipt', 409);
  if ((await c.getBlock({ blockNumber: receipt.blockNumber })).hash !== receipt.blockHash)
    throw new AppError('REORG', 'Replacement receipt is not canonical', 409);
  if (
    Number(i.chain_id) !== 31337 &&
    (await c.getBlock({ blockTag: 'finalized' })).number < receipt.blockNumber
  )
    return { pending: true, status: 'AWAITING_FINALITY' };
  return command('intent_finish', {
    id,
    actor: s.wallet.toLowerCase(),
    status: 'REPLACED',
    receipt: serializable({
      replacementHash: hash,
      originalHash: i.tx_hash,
      blockHash: receipt.blockHash,
      blockNumber: receipt.blockNumber,
    }),
  });
}

export async function creatorMintHistory(chainId: number, contract: Address, s: Session) {
  requireSessionChain(s, chainId);
  // Actor-scoped recovery remains available after a role revocation. It grants no new writes.
  const rows = await listRecords('history', { chainId, contract, limit: 25, offset: 0 });
  return rows
    .filter((i: any) => i.payload?.kind === kind && i.actor === s.wallet.toLowerCase())
    .map((i: any) => ({ ...i, signingEnabled: creatorSigningAllowed(i.payload.tx) }));
}
