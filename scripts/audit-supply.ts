import fs from 'node:fs';
import {
  createPublicClient,
  http,
  parseAbiItem,
  zeroAddress,
  type Address,
  decodeEventLog,
} from 'viem';
const c = createPublicClient({
  transport: http('https://ethereum-rpc.publicnode.com', { retryCount: 1, timeout: 20000 }),
});
const nft = '0x5807e66182a38788a3854853225a2b6d8e0480f2' as Address;
const abi = JSON.parse(fs.readFileSync('contracts/ERC1155TL.abi.json', 'utf8'));
const creation = await c.getTransactionReceipt({
  hash: '0xb9f01405b4e183cecddf9f2191e4bb75040f19c59bf00fd7e405e7c38366e3c4',
});
const block = await c.getBlock();
const logs: any[] = [];
for (let start = creation.blockNumber; start <= block.number; start += 1000n)
  logs.push(
    ...(await c.getLogs({
      address: nft,
      fromBlock: start,
      toBlock: start + 999n < block.number ? start + 999n : block.number,
    })),
  );
let minted = 0n,
  burned = 0n;
const balances = new Map<string, bigint>();
const transfers = [];
for (const log of logs) {
  let e;
  try {
    e = decodeEventLog({ abi, data: log.data, topics: log.topics }) as any;
  } catch {
    continue;
  }
  if (!['TransferSingle', 'TransferBatch'].includes(e.eventName)) continue;
  const { from, to } = e.args;
  const ids = e.eventName === 'TransferSingle' ? [e.args.id] : e.args.ids;
  const values = e.eventName === 'TransferSingle' ? [e.args.value] : e.args.values;
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] !== 1n) continue;
    const val = values[i];
    if (from === zeroAddress) minted += val;
    else balances.set(from, (balances.get(from) ?? 0n) - val);
    if (to === zeroAddress) burned += val;
    else balances.set(to, (balances.get(to) ?? 0n) + val);
    transfers.push({
      from,
      to,
      value: val,
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
    });
  }
}
const holders = await Promise.all(
  [...balances]
    .filter(([, b]) => b > 0n)
    .map(async ([address, derivedBalance]) => ({
      address,
      derivedBalance,
      balanceOf: await c.readContract({
        address: nft,
        abi,
        functionName: 'balanceOf',
        args: [address, 1n],
        blockNumber: block.number,
      }),
    })),
);
const result = {
  chainId: 1,
  contract: nft,
  tokenId: '1',
  deploymentBlock: creation.blockNumber,
  toBlock: block.number,
  blockHash: block.hash,
  observedAt: new Date().toISOString(),
  completeFromDeployment: true,
  minted,
  burned,
  circulating: minted - burned,
  holders,
  transfers,
};
fs.writeFileSync(
  'docs/evidence/go1-supply.json',
  JSON.stringify(result, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2),
);
console.log(JSON.stringify(result, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
