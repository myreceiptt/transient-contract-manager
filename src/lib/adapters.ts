import { creatorAbi, stacksAbi } from './abi';
import { CREATOR_CODE_HASH, STACKS_CODE_HASH } from './chains';
/** Adapters are allowlisted by exact runtime, never by ABI probing alone. */
export const adapterRegistry = {
  'erc1155tl-4.1.2-stacks-2.3.1': {
    id: 'erc1155tl-4.1.2-stacks-2.3.1',
    standard: 'ERC1155',
    creatorVersion: '4.1.2',
    stacksVersion: '2.3.1',
    creatorCodeHash: CREATOR_CODE_HASH,
    stacksCodeHash: STACKS_CODE_HASH,
    creatorAbi,
    stacksAbi,
    creatorCommit: 'a2ef226db2e6df9d07e002c7c11ddab17c1df3f5',
    stacksCommit: 'de281be1f161a56742dfd7c69344eb5b2fb721c9',
    proxyKinds: ['direct', 'EIP1167'] as const,
    capabilities: [
      'createToken',
      'batchCreateToken',
      'mintToken',
      'getTokenDetails',
      'uri',
      'setTokenUri',
      'balanceOf',
      'setDefaultRoyalty',
      'setTokenRoyalty',
      'approveStacks',
      'fixedPriceDrop',
      'presale',
      'nativePayment',
      'erc20Payment',
    ] as const,
    managedRole: 'owner-or-ADMIN_ROLE',
    saleType: 1,
  },
} as const;
export function findAdapter(runtimeHash: string) {
  return Object.values(adapterRegistry).find((a) => a.creatorCodeHash === runtimeHash);
}
