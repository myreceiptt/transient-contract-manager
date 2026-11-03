import { getAddress, parseAbi, type Address } from 'viem';
import { AppError, serializable } from '../lib/domain';
import { client, exactChain } from './chain';
import { inspectErc721Candidate } from './erc721-probe';

/**
 * A transaction-free ERC721TL v4.1.2 mint DRY-RUN.
 * No transaction intent or wallet signing route is created by this module.
 * Source: official Transient Labs creator-contract deployments.json at the
 * already-pinned v4.1.2 source commit. Codehash is a candidate observed on
 * mainnet in two 4.1.2 EIP1167 clones; NOT an execution authorization.
 */
export const MAINNET_ERC721_V412_IMPLEMENTATION =
  '0xea573d90cfd624bed1344a7a7eb44785ae1ad540' as Address;
export const OBSERVED_V412_IMPLEMENTATION_CODEHASH =
  '0x3ef32f426fbb9aadd50d894e5c9a8cfea059f7c02106e692e871508da62b05f4';
export const mintDryRunAbi=parseAbi([
  'function supplyLocked() view returns (bool)',
  'function mint(address recipient,string uri)',
]);

export async function previewErc721Mint(
  chainId:number,contract:Address,caller:Address,recipient:Address,uri:string
){
  if(chainId!==1)throw new AppError('ERC721_CHAIN_SCOPE','ERC721 mint dry-runs currently support Ethereum Mainnet only',400);
  const metadata=uri.trim();
  if(metadata!==uri || metadata.length>2048 ||
    !/^ipfs:\/\/(?:ipfs\/)?[A-Za-z0-9]{40,}(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%-]*)?$/.test(metadata))
    throw new AppError('INVALID_METADATA_URI','Pin original NFT JSON to IPFS before requesting a mint simulation',400);
  const c=client(chainId);
  await exactChain(c,chainId);
  const info=await inspectErc721Candidate(chainId,getAddress(contract),getAddress(caller));
  if(info.version!=='4.1.2' ||
     info.implementation.toLowerCase()!==MAINNET_ERC721_V412_IMPLEMENTATION ||
     info.implementationCodeHash!==OBSERVED_V412_IMPLEMENTATION_CODEHASH ||
     info.proxy!==true)
    throw new AppError('ERC721_RUNTIME_NOT_APPROVED','Exact ERC721TL v4.1.2 mainnet runtime does not match the reviewed dry-run candidate',403);
  if(info.walletRole!=='owner'&&info.walletRole!=='admin')
    throw new AppError('ERC721_ADMIN_REQUIRED','Caller does not hold owner or ADMIN_ROLE at the observed block',403);
  const locked=await c.readContract({address:getAddress(contract),abi:mintDryRunAbi,
    functionName:'supplyLocked',blockNumber:BigInt(info.observedBlock)});
  if(locked)throw new AppError('ERC721_SUPPLY_LOCKED','The owner/admin has permanently locked additional NFT supply',403);
  await c.simulateContract({
    address:getAddress(contract),abi:mintDryRunAbi,functionName:'mint',
    account:getAddress(caller),args:[getAddress(recipient),metadata],
    blockNumber:BigInt(info.observedBlock),
  });
  return serializable({
    chainId,contract,caller,recipient,uri:metadata,
    reportedVersion:info.version,role:info.walletRole,observedBlock:info.observedBlock,
    implementation:info.implementation,
    observedCodeHash:info.implementationCodeHash,
    supplyLocked:false,simulation:'PASSED' as const,
    transactionSigningEnabled:false,
    reviewStatus:'PREVIEW_ONLY' as const,
    warning:'Simulation does not mint or reserve any Token ID. No wallet signature, transaction intent, or on-chain write is available. Fresh runtime/authorization checks and signed transaction review are required before actual mint.',
  });
}
