import { getAddress, keccak256, parseAbi, type Address } from 'viem';
import { AppError, serializable } from '../lib/domain';
import { ADMIN_ROLE } from '../lib/chains';
import { client, exactChain } from './chain';
import { erc721Creator } from '../lib/erc721-creator';

/**
 * READ-ONLY ERC721TL 3.6.0 / 4.1.2 candidate inspector.
 *
 * VERSION+ERC165 compatibility is NOT an authenticated runtime allowlist.
 * There is intentionally no admin write, mint, approval or auction operation
 * in this module. Do not reuse these results as write authorization.
 *
 * Stage-B requires a pinned runtime hash for a fully verified creator
 * implementation on each chain, with direct/EIP1167 verification.
 */
export const erc721ProbeAbi=parseAbi([
  'function VERSION() view returns (string)',
  'function supportsInterface(bytes4 interfaceId) view returns (bool)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function owner() view returns (address)',
  'function getRoleMembers(bytes32 role) view returns (address[])',
  'function hasRole(bytes32 role,address account) view returns (bool)',
  'function totalSupply() view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
]);
export type Erc721CandidateState='ABI_COMPATIBLE_UNVERIFIED_RUNTIME';
/**
 * Audited, version-specific source refs. Interface support is NOT equivalent
 * to allowlisting an exact deployed implementation runtime for writes.
 */
export const erc721ReadonlySourceBaselines={
  '3.6.0':{
    commit:'9063234fb2e4cf5e0459b23a4a1858f496fcf98b',
    totalSupplyMeaning:'MINTED_TOKEN_ID_COUNTER_INCLUDES_BURNED',
  },
  '4.1.2':{
    commit:'a2ef226db2e6df9d07e002c7c11ddab17c1df3f5',
    totalSupplyMeaning:'CURRENT_UNBURNED_SUPPLY',
  },
} as const;
export const erc721ReadonlyVersions=Object.keys(erc721ReadonlySourceBaselines);
export const erc721ReadonlyBaselineLabel='ERC721TL v3.6.0 or v4.1.2';
function readonlySource(version:string){
  return Object.prototype.hasOwnProperty.call(erc721ReadonlySourceBaselines,version)
    ? erc721ReadonlySourceBaselines[version as keyof typeof erc721ReadonlySourceBaselines]
    : null;
}

function parseImplementation(code:`0x${string}`):Address | null {
  const clone=code.match(/^0x363d3d373d3d3d363d73([0-9a-fA-F]{40})5af43d82803e903d91602b57fd5bf3$/);
  return clone?getAddress('0x'+clone[1]):null;
}
export async function inspectErc721Candidate(chainId:number,contract:Address,wallet?:Address){
  const c=client(chainId);
  await exactChain(c,chainId);
  const block=await c.getBlock();
  const code=await c.getCode({address:contract,blockNumber:block.number});
  if(!code||code==='0x')throw new AppError('NO_CONTRACT','No contract code at this address');
  const clone=parseImplementation(code);
  const implementation=clone??contract;
  const implementationCode=clone?
    await c.getCode({address:clone,blockNumber:block.number}):code;
  if(!implementationCode||implementationCode==='0x')
    throw new AppError('MISSING_IMPLEMENTATION','Proxy implementation has no code');
  // These surface reads establish *compatibility*, not code provenance.
  const [version,erc721,erc1155,name,symbol,owner,admins,supply]=await Promise.all([
    c.readContract({address:contract,abi:erc721ProbeAbi,functionName:'VERSION',blockNumber:block.number}),
    c.readContract({address:contract,abi:erc721ProbeAbi,functionName:'supportsInterface',args:['0x80ac58cd'],blockNumber:block.number}),
    c.readContract({address:contract,abi:erc721ProbeAbi,functionName:'supportsInterface',args:['0xd9b67a26'],blockNumber:block.number}),
    c.readContract({address:contract,abi:erc721ProbeAbi,functionName:'name',blockNumber:block.number}),
    c.readContract({address:contract,abi:erc721ProbeAbi,functionName:'symbol',blockNumber:block.number}),
    c.readContract({address:contract,abi:erc721ProbeAbi,functionName:'owner',blockNumber:block.number}),
    c.readContract({address:contract,abi:erc721ProbeAbi,functionName:'getRoleMembers',args:[ADMIN_ROLE],blockNumber:block.number}),
    c.readContract({address:contract,abi:erc721ProbeAbi,functionName:'totalSupply',blockNumber:block.number}),
  ]);
  const source=readonlySource(version);
  if(!source||erc721!==true||erc1155===true)
    throw new AppError('ERC721_MISMATCH','Contract does not match the read-only ERC721TL 3.6.0 / 4.1.2 interface baselines');
  const adminForWallet=wallet?await c.readContract({address:contract,abi:erc721ProbeAbi,
    functionName:'hasRole',args:[ADMIN_ROLE,wallet],blockNumber:block.number}):false;
  const walletRole=wallet?(owner.toLowerCase()===wallet.toLowerCase()?
    'owner':adminForWallet?'admin':'viewer'):'not-connected';
  return serializable({
    chainId,contract,standard:'ERC721',version,implementation,
    proxy:!!clone,implementationCodeHash:keccak256(implementationCode),
    creatorMintRuntimeVerified: chainId === 1 && !!clone && version === erc721Creator.version &&
      implementation.toLowerCase() === erc721Creator.implementation &&
      keccak256(implementationCode) === erc721Creator.runtimeHash,
    runtimeVerification:'ABI_COMPATIBLE_UNVERIFIED_RUNTIME' as Erc721CandidateState,
    transactionSigningEnabled:false,
    name,symbol,owner,admins,totalSupply:supply,
    sourceCommit:source.commit,totalSupplyMeaning:source.totalSupplyMeaning,
    inspectedWallet:wallet??null,walletRole,walletRoleVerifiedReadOnly:true,
    observedBlock:block.number,observedBlockHash:block.hash,
    notice:'This ERC721TL version has a reviewed official source baseline, but its observed deployment runtime is NOT allowlisted for transactions. Ownership, version and roles are read-only findings. No creator or auction writes are authorized.',
  });
}

/** Token IDs are sampled in bounded explicit windows, not inferred from
 * totalSupply (which excludes burned NFTs). Missing/burned IDs are retained
 * as missing; an ownerOf failure is NOT equivalent to zero ownership.
 */
export async function scanErc721Candidates(chainId:number,contract:Address,start:number,count:number){
  if(!Number.isSafeInteger(start)||start<1||start>100000000 ||
     !Number.isInteger(count)||count<1||count>12)
    throw new AppError('INVALID_TOKEN_WINDOW','Inspect at most 12 IDs per request');
  const info=await inspectErc721Candidate(chainId,contract);
  const c=client(chainId);
  const end=start+count-1;
  const rows=await Promise.all(Array.from({length:count},async(_,index)=>{
    const id=BigInt(start+index);
    let owner:Address;
    try {
      owner=await c.readContract({address:contract,abi:erc721ProbeAbi,
        functionName:'ownerOf',args:[id],blockNumber:BigInt(info.observedBlock)});
    }catch{
      return {tokenId:String(id),status:'UNKNOWN_OR_BURNED' as const,
        message:'ownerOf unavailable, nonexistent, or reverted; not counted as an owned NFT'};
    }
    let tokenUri:string|null=null;
    let metadataStatus:'OK'|'UNAVAILABLE'='OK';
    try{
      tokenUri=await c.readContract({address:contract,abi:erc721ProbeAbi,
        functionName:'tokenURI',args:[id],blockNumber:BigInt(info.observedBlock)});
    }catch{metadataStatus='UNAVAILABLE';}
    return {tokenId:String(id),status:'OWNED' as const,
      owner,tokenUri,metadataStatus};
  }));
  return {chainId,contract,start,end,observedBlock:info.observedBlock,
    runtimeVerification:info.runtimeVerification,transactionSigningEnabled:false,
    tokens:rows};
}

/**
 * Diagnostic only: inspect mismatched ERC-721 candidates without declaring
 * them supported and without changing the accepted read-only version baselines.
 * All calls are read-only and pinned to one observed Ethereum block.
 */
export async function diagnoseErc721Candidate(chainId:number,contract:Address) {
  const c=client(chainId);
  await exactChain(c,chainId);
  const block=await c.getBlock();
  const code=await c.getCode({address:contract,blockNumber:block.number});
  if(!code||code==='0x')throw new AppError('NO_CONTRACT','No deployed code at this address');
  const clone=parseImplementation(code);
  const implementation=clone??contract;
  const implementationCode=clone?
    await c.getCode({address:clone,blockNumber:block.number}):code;
  if(!implementationCode||implementationCode==='0x')
    throw new AppError('MISSING_IMPLEMENTATION','EIP-1167 implementation has no code');

  async function optional<T>(read:()=>Promise<T>):Promise<T|null>{
    try{return await read();}catch{return null;}
  }
  const [version,erc721,erc1155,name,symbol,owner,supply]=await Promise.all([
    optional(()=>c.readContract({address:contract,abi:erc721ProbeAbi,
      functionName:'VERSION',blockNumber:block.number})),
    optional(()=>c.readContract({address:contract,abi:erc721ProbeAbi,
      functionName:'supportsInterface',args:['0x80ac58cd'],blockNumber:block.number})),
    optional(()=>c.readContract({address:contract,abi:erc721ProbeAbi,
      functionName:'supportsInterface',args:['0xd9b67a26'],blockNumber:block.number})),
    optional(()=>c.readContract({address:contract,abi:erc721ProbeAbi,
      functionName:'name',blockNumber:block.number})),
    optional(()=>c.readContract({address:contract,abi:erc721ProbeAbi,
      functionName:'symbol',blockNumber:block.number})),
    optional(()=>c.readContract({address:contract,abi:erc721ProbeAbi,
      functionName:'owner',blockNumber:block.number})),
    optional(()=>c.readContract({address:contract,abi:erc721ProbeAbi,
      functionName:'totalSupply',blockNumber:block.number})),
  ]);
  const reasons:string[]=[];
  if(version===null)reasons.push('VERSION() could not be read: absent or reverted');
  else if(!readonlySource(version))reasons.push('Reported VERSION '+version+' is not in read-only baselines 3.6.0 / 4.1.2');
  if(erc721!==true)reasons.push(erc721===null?
    'ERC-721 ERC-165 query unavailable':'Contract did not report ERC-721 interface support');
  if(erc1155===true)reasons.push('Contract also reports ERC-1155 interface support');
  if(name===null||symbol===null)reasons.push('Name or symbol could not be read');
  if(owner===null)reasons.push('Owner could not be read with the candidate ABI');
  if(supply===null)reasons.push('Supply could not be read with the candidate ABI');
  return serializable({
    chainId,contract,implementation,
    proxyKind:clone?'CANONICAL_EIP1167':'DIRECT_OR_UNRECOGNIZED_PROXY',
    implementationCodeHash:keccak256(implementationCode),
    contractCodeHash:keccak256(code),
    version,erc721Interface:erc721,erc1155Interface:erc1155,
    name,symbol,owner,totalSupply:supply,
    observedBlock:block.number,
    inspectorBaseline:erc721ReadonlyBaselineLabel,
    inspectorMatch:reasons.length===0,
    mismatchReasons:reasons,
    runtimeVerification:'UNVERIFIED',transactionSigningEnabled:false,
    notice:'Informational RPC observations only. A VERSION string and interfaces do not prove official Transient Labs runtime compatibility or authorize signing.',
  });
}
