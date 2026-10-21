import fs from 'node:fs';
import { createPublicClient, http, keccak256, parseAbi, type Address, type Abi } from 'viem';
const creatorAbi = JSON.parse(fs.readFileSync('contracts/ERC1155TL.abi.json', 'utf8')) as Abi;
const stacksAbi = JSON.parse(fs.readFileSync('contracts/TLStacks1155.abi.json', 'utf8')) as Abi;
const GO1 = '0x5807e66182a38788a3854853225a2b6d8e0480f2' as Address;
const STACKS = '0x32953d7ae37b05075b88c34e800ae80c1cb1b794' as Address;
const IMPLEMENTATION = '0x079e23352721084561fb241593d16a4e6f548a97' as Address;
const targets = [
  { id: 1, name: 'Ethereum', rpc: 'https://ethereum-rpc.publicnode.com' },
  { id: 4663, name: 'Robinhood', rpc: 'https://rpc.mainnet.chain.robinhood.com' },
  { id: 8453, name: 'Base', rpc: 'https://mainnet.base.org' },
  { id: 360, name: 'Shape', rpc: 'https://mainnet.shape.network' },
];
const output = await Promise.all(
  targets.map(async (n) => {
    const c = createPublicClient({ transport: http(n.rpc, { timeout: 18000, retryCount: 0 }) });
    const result: any = { ...n, observedAt: new Date().toISOString() };
    try {
      result.observedChainId = await c.getChainId();
      if (result.observedChainId !== n.id) throw new Error('RPC_CHAIN_MISMATCH');
      const block = await c.getBlock();
      result.blockNumber = block.number;
      result.blockHash = block.hash;
      result.blockTimestamp = block.timestamp;
      result.contracts = {};
      for (const [key, address, abi] of [
        ['creatorImplementation', IMPLEMENTATION, creatorAbi],
        ['stacks', STACKS, stacksAbi],
        ...(n.id === 1 ? [['go1', GO1, creatorAbi]] : []),
      ] as [string, Address, Abi][]) {
        const code = await c.getCode({ address, blockNumber: block.number });
        const entry: any = { address, code: code ?? '0x', codeHash: code ? keccak256(code) : null };
        result.contracts[key] = entry;
        if (!code || code === '0x') continue;
        try {
          entry.version = await c.readContract({
            address,
            abi,
            functionName: 'VERSION',
            blockNumber: block.number,
          });
        } catch (e) {
          entry.error = String(e).slice(0, 300);
        }
        if (key === 'stacks')
          for (const fn of ['protocolFee', 'protocolFeeReceiver', 'paused', 'weth'])
            entry[fn] = await c.readContract({
              address,
              abi,
              functionName: fn,
              blockNumber: block.number,
            });
        if (key === 'go1') {
          for (const fn of [
            'owner',
            'name',
            'symbol',
            'ADMIN_ROLE',
            'APPROVED_MINT_CONTRACT',
            'totalSupply',
          ])
            entry[fn] = await c.readContract({
              address,
              abi,
              functionName: fn,
              blockNumber: block.number,
            });
          entry.admins = await c.readContract({
            address,
            abi,
            functionName: 'getRoleMembers',
            args: [entry.ADMIN_ROLE],
            blockNumber: block.number,
          });
          entry.minters = await c.readContract({
            address,
            abi,
            functionName: 'getRoleMembers',
            args: [entry.APPROVED_MINT_CONTRACT],
            blockNumber: block.number,
          });
          entry.token1 = await c.readContract({
            address,
            abi,
            functionName: 'getTokenDetails',
            args: [1n],
            blockNumber: block.number,
          });
          entry.locked = await c.readContract({
            address,
            abi,
            functionName: 'tokenLocked',
            args: [1n],
            blockNumber: block.number,
          });
          entry.royalty = await c.readContract({
            address,
            abi,
            functionName: 'royaltyInfo',
            args: [1n, 10000n],
            blockNumber: block.number,
          });
          entry.ownerBalance = await c.readContract({
            address,
            abi,
            functionName: 'balanceOf',
            args: [entry.owner, 1n],
            blockNumber: block.number,
          });
          entry.drop = await c.readContract({
            address: STACKS,
            abi: stacksAbi,
            functionName: 'getDrop',
            args: [address, 1n],
            blockNumber: block.number,
          });
        }
      }
      result.status = 'read-success';
    } catch (e) {
      result.status = 'unverified';
      result.error = String(e).slice(0, 800);
    }
    console.log(
      n.name,
      result.status,
      JSON.stringify(
        result.contracts
          ? Object.fromEntries(
              Object.entries(result.contracts).map(([k, v]: any) => [
                k,
                { version: v.version, codeBytes: (v.code.length - 2) / 2 },
              ]),
            )
          : result.error,
      ),
    );
    return result;
  }),
);
fs.writeFileSync(
  'docs/evidence/network-snapshot.json',
  JSON.stringify(output, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2),
);
