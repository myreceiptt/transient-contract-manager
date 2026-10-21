import fs from 'node:fs';
import {
  createPublicClient,
  createWalletClient,
  http,
  zeroAddress,
  type Address,
  type Hex,
  parseEther,
} from 'viem';
import { localChain } from '../src/lib/chains';
export async function setupLocal() {
  const rpc = process.env.LOCAL_RPC_URL || 'http://127.0.0.1:8545';
  const u = new URL(rpc);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname))
    throw new Error('Local setup refuses non-loopback RPC URLs');
  const c = createPublicClient({ chain: localChain, transport: http(rpc) });
  if ((await c.getChainId()) !== 31337) throw new Error('Local setup requires chain 31337');
  const wallet = createWalletClient({ chain: localChain, transport: http(rpc) });
  const accounts = await wallet.getAddresses();
  if (accounts.length < 6) throw new Error('Start Anvil with at least six local accounts');
  const [owner, admin, collector, outsider, payout, feeReceiver] = accounts;
  const creator = JSON.parse(fs.readFileSync('contracts/ERC1155TL.artifact.json', 'utf8'));
  const stacks = JSON.parse(fs.readFileSync('contracts/TLStacks1155.artifact.json', 'utf8'));
  const deploy = async (artifact: any, args: any[]) => {
    const h = await wallet.deployContract({
      account: owner,
      abi: artifact.abi,
      bytecode: artifact.bytecode,
      args,
    });
    const r = await c.waitForTransactionReceipt({ hash: h });
    if (!r.contractAddress || r.status !== 'success')
      throw new Error('Local fixture deployment failed');
    return r.contractAddress;
  };
  const nft = await deploy(creator, [false]);
  const sale = await deploy(stacks, [
    owner,
    zeroAddress,
    zeroAddress,
    feeReceiver,
    parseEther('0.0009'),
  ]);
  async function write(address: Address, abi: any, functionName: string, args: any[]) {
    const h = await wallet.writeContract({ account: owner, address, abi, functionName, args });
    const r = await c.waitForTransactionReceipt({ hash: h });
    if (r.status !== 'success') throw new Error(functionName + ' reverted');
  }
  await write(nft, creator.abi, 'initialize', [
    'Local Editions',
    'LOCAL',
    payout,
    500n,
    owner,
    [admin],
    true,
    zeroAddress,
    0,
  ]);
  await write(nft, creator.abi, 'createToken', [
    'ipfs://bafybeicycur6535m3r2lktirmxh4jaghvrwzbbymztz7my5bz2srkhmlbi/0',
    ['0x000000000000000000000000000000000000dEaD'],
    [0n],
  ]);
  await write(nft, creator.abi, 'setApprovedMintContracts', [[sale], true]);
  const data = { rpc, nft, stacks: sale, owner, admin, collector, outsider, payout, feeReceiver };
  fs.mkdirSync('.local', { recursive: true });
  fs.writeFileSync('.local/local-chain.json', JSON.stringify(data, null, 2));
  console.log('Local fixtures deployed:', JSON.stringify({ chainId: 31337, nft, stacks: sale }));
  return data;
}
if (process.argv[1]?.endsWith('setup-local.ts')) await setupLocal();
