import { parseAbi } from 'viem';

// Reproduced from the pinned Transient Labs 4.1.2 sources, including all metadata bytes.
// This adapter is deliberately separate from the ERC1155/Stacks adapter registry.
export const erc721Creator = {
  version: '4.1.2',
  sourceCommit: 'a2ef226db2e6df9d07e002c7c11ddab17c1df3f5',
  implementation: '0xea573d90cfd624bed1344a7a7eb44785ae1ad540',
  runtimeHash: '0x3ef32f426fbb9aadd50d894e5c9a8cfea059f7c02106e692e871508da62b05f4',
} as const;
export const erc721CreatorAbi = parseAbi([
  'function VERSION() view returns (string)',
  'function owner() view returns (address)',
  'function hasRole(bytes32,address) view returns (bool)',
  'function supplyLocked() view returns (bool)',
  'function renderingContract() view returns (address)',
  'function mint(address recipient,string uri)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)',
]);
