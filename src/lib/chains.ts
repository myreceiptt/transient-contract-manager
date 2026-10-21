import { defineChain, type Address } from 'viem';
import { mainnet, base, shape } from 'viem/chains';
export const robinhood = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.chain.robinhood.com'] } },
  blockExplorers: { default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' } },
});
export const localChain = defineChain({
  id: 31337,
  name: 'Local test chain',
  nativeCurrency: { name: 'Test Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
  testnet: true,
});
export const targetChains = [mainnet, robinhood, base, shape] as const;
export const GO1 = '0x5807e66182a38788a3854853225a2b6d8e0480f2' as Address;
export const STACKS = '0x32953d7ae37b05075b88c34e800ae80c1cb1b794' as Address;
export const CREATOR_IMPLEMENTATION = '0x079e23352721084561fb241593d16a4e6f548a97' as Address;
export const ADMIN_ROLE = '0xa49807205ce4d355092ef5a8a18f56e8913cf4a201fbe287825b095693c21775';
export const MINTER_ROLE = '0xf0178e81e3689af48153edf0e1b2d669fe2786ab9e21fdecf3e3771c70330af5';
export const CREATOR_CODE_HASH =
  '0x182a242cdc62526343ae489f36ec62fe36f9069bd9bc79315a613ad1e4e69294';
export const STACKS_CODE_HASH =
  '0x02e6dcd7e74c8a3337cd56868fc5eacd8e0f4cd24fb8975934d47605d46053b7';
export function getChain(id: number) {
  const c = [...targetChains, localChain].find((c) => c.id === id);
  if (!c) throw new Error('Unsupported chain');
  return c;
}
export function explorer(id: number, address: string) {
  const c = getChain(id);
  return 'blockExplorers' in c && c.blockExplorers
    ? `${c.blockExplorers.default.url}/address/${address}`
    : undefined;
}
export function txExplorer(id: number, hash: string) {
  const c = getChain(id);
  return 'blockExplorers' in c && c.blockExplorers
    ? `${c.blockExplorers.default.url}/tx/${hash}`
    : undefined;
}
