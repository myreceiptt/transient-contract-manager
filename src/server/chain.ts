import {
  createPublicClient,
  http,
  getAddress,
  keccak256,
  parseAbi,
  zeroAddress,
  erc20Abi,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';
import { creatorAbi, stacksAbi } from '../lib/abi';
import { findAdapter } from '../lib/adapters';
import {
  getChain,
  STACKS,
  ADMIN_ROLE,
  MINTER_ROLE,
  CREATOR_CODE_HASH,
  STACKS_CODE_HASH,
} from '../lib/chains';
import { AppError, type Drop, configFingerprint, fingerprint, serializable } from '../lib/domain';
const rpcKeys: Record<number, string> = {
  1: 'ETHEREUM_RPC_URL',
  4663: 'ROBINHOOD_RPC_URL',
  8453: 'BASE_RPC_URL',
  360: 'SHAPE_RPC_URL',
  31337: 'LOCAL_RPC_URL',
};
const rpcDefaults: Record<number, string> = {
  1: 'https://ethereum-rpc.publicnode.com',
  4663: 'https://rpc.mainnet.chain.robinhood.com',
  8453: 'https://mainnet.base.org',
  360: 'https://mainnet.shape.network',
  31337: 'http://127.0.0.1:8545',
};
export function client(id: number) {
  getChain(id);
  if (
    id === 31337 &&
    (process.env.NODE_ENV === 'production' ||
      process.env.VERCEL === '1' ||
      process.env.LOCAL_CHAIN_ENABLED !== 'true')
  )
    throw new AppError('CHAIN_DISABLED', 'Local chain is not enabled', 400);
  return createPublicClient({
    chain: getChain(id),
    transport: http(process.env[rpcKeys[id]] || rpcDefaults[id], { retryCount: 1, timeout: 12000 }),
  });
}
export function stacksAddress(id: number): Address {
  if (id === 31337) {
    if (!process.env.LOCAL_STACKS_ADDRESS)
      throw new AppError('LOCAL_SETUP', 'Run the local-chain setup script', 503);
    return getAddress(process.env.LOCAL_STACKS_ADDRESS);
  }
  return STACKS;
}
export async function exactChain(c: ReturnType<typeof client>, id: number) {
  if ((await c.getChainId()) !== id)
    throw new AppError('CHAIN_MISMATCH', 'RPC returned a different chain ID', 503);
}
// Mainnet execution is available only for the exact verified ERC1155TL and
// Stacks runtime adapter. The server checks bytecode/version, chain ID and the
// current on-chain owner/admin role before preparing or submitting a review.
// The operator can disable all new writes immediately via the Vercel kill switch.
// Wallets must still explicitly approve every independent on-chain transaction.
export const networkWritePermissions: Readonly<Record<number, boolean>> = Object.freeze({
  1: true,
  4663: true,
  8453: true,
  360: true,
});
export function writesAllowed(id: number) {
  return id === 31337
    ? process.env.NODE_ENV !== 'production' &&
        process.env.VERCEL !== '1' &&
        process.env.LOCAL_CHAIN_ENABLED === 'true'
    : process.env.MAINNET_WRITES_ENABLED === 'true' && networkWritePermissions[id] === true;
}
export function requireWrites(id: number) {
  if (!writesAllowed(id))
    throw new AppError(
      'WRITE_LOCK',
      'Live writes are disabled by the operator. Contract checks and draft editing remain available.',
      403,
    );
}
export async function verifyCreator(
  c: ReturnType<typeof client>,
  address: Address,
  blockNumber: bigint,
) {
  const code = await c.getCode({ address, blockNumber });
  if (!code || code === '0x')
    throw new AppError('NO_CONTRACT', 'No contract exists at this address on the selected chain');
  let implementation = address;
  let implementationCode = code;
  const clone = code.match(
    /^0x363d3d373d3d3d363d73([0-9a-fA-F]{40})5af43d82803e903d91602b57fd5bf3$/,
  );
  if (clone) {
    implementation = getAddress('0x' + clone[1]);
    implementationCode = (await c.getCode({ address: implementation, blockNumber })) ?? '0x';
  }
  const adapter = findAdapter(keccak256(implementationCode));
  if (!adapter)
    throw new AppError(
      'UNSUPPORTED_IMPLEMENTATION',
      'This implementation is not the verified ERC1155TL v4.1.2 adapter. Management is unavailable.',
    );
  const [version, standard] = await Promise.all([
    c.readContract({ address, abi: creatorAbi, functionName: 'VERSION', blockNumber }),
    c.readContract({
      address,
      abi: creatorAbi,
      functionName: 'supportsInterface',
      args: ['0xd9b67a26'],
      blockNumber,
    }),
  ]);
  if (version !== '4.1.2' || standard !== true)
    throw new AppError('ABI_MISMATCH', 'Contract reports incompatible version or token standard');
  return {
    implementation,
    adapterId: adapter.id,
    implementationCodeHash: adapter.creatorCodeHash,
    proxy: !!clone,
    version: String(version),
  };
}
export async function verifyStacks(c: ReturnType<typeof client>, id: number, blockNumber: bigint) {
  const address = stacksAddress(id);
  const code = await c.getCode({ address, blockNumber });
  if (!code || keccak256(code) !== STACKS_CODE_HASH)
    throw new AppError(
      'STACKS_UNVERIFIED',
      'Stacks deployment does not match the pinned v2.3.1 runtime',
      503,
    );
  const version = await c.readContract({
    address,
    abi: stacksAbi,
    functionName: 'VERSION',
    blockNumber,
  });
  if (version !== '2.3.1') throw new AppError('STACKS_VERSION', 'Stacks version mismatch', 503);
  return address;
}
export async function inspect(id: number, rawAddress: string, wallet?: Address, tokenId = 1n) {
  const address = getAddress(rawAddress.toLowerCase());
  const c = client(id);
  await exactChain(c, id);
  const block = await c.getBlock();
  const adapter = await verifyCreator(c, address, block.number);
  const read = (fn: string, args?: readonly unknown[]) =>
    c.readContract({ address, abi: creatorAbi, functionName: fn, args, blockNumber: block.number });
  const [name, symbol, owner, admins, count, token, locked, royalty, minters] = await Promise.all([
    read('name'),
    read('symbol'),
    read('owner'),
    read('getRoleMembers', [ADMIN_ROLE]),
    read('totalSupply'),
    read('getTokenDetails', [tokenId]),
    read('tokenLocked', [tokenId]),
    read('royaltyInfo', [tokenId, 10000n]),
    read('getRoleMembers', [MINTER_ROLE]),
  ]);
  const isOwner = !!wallet && String(owner).toLowerCase() === wallet.toLowerCase();
  const isAdmin = !!wallet && (await read('hasRole', [ADMIN_ROLE, wallet])) === true;
  let sale: any = null;
  let saleError: string | undefined;
  try {
    const stacks = await verifyStacks(c, id, block.number);
    const r = (fn: string, args?: readonly unknown[]) =>
      c.readContract({
        address: stacks,
        abi: stacksAbi,
        functionName: fn,
        args,
        blockNumber: block.number,
      });
    const [drop, fee, feeReceiver, paused, phase, round, approved] = await Promise.all([
      r('getDrop', [address, tokenId]),
      r('protocolFee'),
      r('protocolFeeReceiver'),
      r('paused'),
      r('getDropPhase', [address, tokenId]),
      r('getDropRound', [address, tokenId]),
      read('hasRole', [MINTER_ROLE, stacks]),
    ]);
    sale = {
      address: stacks,
      version: '2.3.1',
      drop,
      fee,
      feeReceiver,
      paused,
      phase: Number(phase),
      round,
      approved,
      configFingerprint: configFingerprint(drop as Drop),
      stateFingerprint: fingerprint({ drop, round, fee, paused, approved }),
    };
  } catch (e) {
    saleError = e instanceof Error ? e.message : 'Stacks check failed';
  }
  return {
    chainId: id,
    address,
    blockNumber: block.number,
    blockHash: block.hash,
    timestamp: block.timestamp,
    observedAt: new Date().toISOString(),
    ...adapter,
    name: String(name).trim(),
    symbol: String(symbol),
    owner: owner as Address,
    admins: admins as Address[],
    minters: minters as Address[],
    tokenTypes: count as bigint,
    tokenId,
    token: token as { created: boolean; uri: string },
    locked: Boolean(locked),
    royalty: royalty as [Address, bigint],
    role: isOwner ? 'owner' : isAdmin ? 'admin' : 'viewer',
    authorized: isOwner || isAdmin,
    canWrite: writesAllowed(id),
    sale,
    saleError,
  };
}
export async function authorize(id: number, address: string, wallet: Address, tokenId = 1n) {
  const info = await inspect(id, address, wallet, tokenId);
  if (!info.authorized)
    throw new AppError(
      'ACCESS_DENIED',
      'Your connected wallet does not have the required administrative permission for this collection. Open Contract Checker to inspect the contract owner and admin roles.',
      403,
    );
  return info;
}
export async function currencyInfo(id: number, address: Address, blockNumber?: bigint) {
  if (address === zeroAddress) return { address, decimals: 18, symbol: 'ETH' };
  const c = client(id);
  const [decimals, symbol] = await Promise.all([
    c.readContract({ address, abi: erc20Abi, functionName: 'decimals', blockNumber }),
    c.readContract({ address, abi: erc20Abi, functionName: 'symbol', blockNumber }),
  ]);
  if (decimals > 36) throw new AppError('CURRENCY_DECIMALS', 'Unsupported currency precision');
  return { address, decimals, symbol: String(symbol).slice(0, 20) };
}
export async function tokenInventory(id: number, address: Address, start = 1, limit = 20) {
  const info = await inspect(id, address);
  const c = client(id);
  const end =
    BigInt(start + Math.min(limit, 40) - 1) < info.tokenTypes
      ? BigInt(start + Math.min(limit, 40) - 1)
      : info.tokenTypes;
  const entries = [];
  for (let token = BigInt(start); token <= end; token++) {
    const [details, locked] = await Promise.all([
      c.readContract({
        address,
        abi: creatorAbi,
        functionName: 'getTokenDetails',
        args: [token],
        blockNumber: info.blockNumber,
      }),
      c.readContract({
        address,
        abi: creatorAbi,
        functionName: 'tokenLocked',
        args: [token],
        blockNumber: info.blockNumber,
      }),
    ]);
    entries.push({ id: token, ...(details as object), locked });
  }
  return serializable({ tokens: entries, total: info.tokenTypes });
}
