import { getAddress, parseAbi, type Address } from 'viem';
import { AppError } from '../lib/domain';
import { client, exactChain, inspect as inspect1155 } from './chain';
import { inspectErc721Candidate } from './erc721-probe';

const erc165Abi=parseAbi([
  'function supportsInterface(bytes4 interfaceId) view returns (bool)',
]);
export type CollectionDetection =
  | {kind:'ERC1155TL';status:'VERIFIED_MANAGEMENT';destination:string;name:string;role:string;version:string}
  | {kind:'ERC721TL';status:'READ_ONLY';destination:string;name:string;role:string;version:string};

/**
 * Homepage routing is a read-only operation. Standard detection is NEVER an
 * execution allowlist. The ERC1155 path must pass the existing exact runtime
 * verification; ERC721 remains strictly read-only pending a version-specific
 * deployed runtime allowlist and independently verified transactions.
 */
export async function detectCollection(chainId:number,address:Address,wallet?:Address):Promise<CollectionDetection>{
  const contract=getAddress(address);
  const c=client(chainId);
  await exactChain(c,chainId);
  const block=await c.getBlock();
  const code=await c.getCode({address:contract,blockNumber:block.number});
  if(!code||code==='0x')throw new AppError('NO_CONTRACT','No contract code exists at that address on this network');
  const [is721,is1155]=await Promise.all([
    c.readContract({address:contract,abi:erc165Abi,functionName:'supportsInterface',
      args:['0x80ac58cd'],blockNumber:block.number}).catch(()=>false),
    c.readContract({address:contract,abi:erc165Abi,functionName:'supportsInterface',
      args:['0xd9b67a26'],blockNumber:block.number}).catch(()=>false),
  ]);
  if(is721===is1155){
    throw new AppError('UNRECOGNIZED_STANDARD',
      'Cannot uniquely classify this contract as ERC721TL or ERC1155TL. Use Contract Checker for read-only diagnostics.');
  }
  const query='chain='+chainId+'&contract='+encodeURIComponent(contract.toLowerCase());
  if(is1155){
    const info=await inspect1155(chainId,contract,wallet);
    return {kind:'ERC1155TL',status:'VERIFIED_MANAGEMENT',
      destination:'/manage?'+query,name:String(info.name),role:String(info.role),version:String(info.version)};
  }
  const info=await inspectErc721Candidate(chainId,contract,wallet);
  return {kind:'ERC721TL',status:'READ_ONLY',destination:'/manage-721?'+query,
    name:String(info.name),role:String(info.walletRole),version:String(info.version)};
}
