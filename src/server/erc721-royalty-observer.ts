import {parseAbi,type Address} from 'viem';
import {AppError,serializable} from '../lib/domain';
import {client,exactChain} from './chain';
import {inspectErc721Candidate} from './erc721-probe';

/** ERC721TL v4.1.2 pinned-source royalty observation only.
 * Runtime compatibility is not enough to approve any contract write.
 * The royaltyInfo sample salePrice 10000 wei yields an effective basis-point
 * fraction; this is NOT an actual sale quote, payment, or settlement.
 */
export const erc721RoyaltyReadAbi=parseAbi([
  'function getDefaultRoyaltyRecipientAndPercentage() view returns (address,uint256)',
  'function royaltyInfo(uint256 tokenId,uint256 salePrice) view returns (address,uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function supportsInterface(bytes4 interfaceId) view returns (bool)',
]);
export async function readErc721Royalties(chainId:number,contract:Address,tokenId?:bigint){
  if(chainId!==1)throw new AppError('ROYALTY_CHAIN','ERC721TL royalty observations currently support Ethereum Mainnet only');
  if(tokenId!==undefined&&(tokenId<1n||tokenId>100000000n))
    throw new AppError('ROYALTY_TOKEN','Invalid Token ID');
  const c=client(chainId);
  await exactChain(c,chainId);
  const inspected=await inspectErc721Candidate(chainId,contract);
  if(inspected.version!=='4.1.2')
    throw new AppError('ROYALTY_VERSION','Default royalty reader is only pinned for ERC721TL v4.1.2');
  const blockNumber=BigInt(inspected.observedBlock);
  const [supported,defaultRoyalty]=await Promise.all([
    c.readContract({address:contract,abi:erc721RoyaltyReadAbi,
      functionName:'supportsInterface',args:['0x2a55205a'],blockNumber}),
    c.readContract({address:contract,abi:erc721RoyaltyReadAbi,
      functionName:'getDefaultRoyaltyRecipientAndPercentage',blockNumber}),
  ]);
  if(!supported)throw new AppError('ROYALTY_INTERFACE','Contract did not report ERC-2981 interface support');
  const [recipient,basisPoints]=defaultRoyalty;
  if(basisPoints>1000n)
    throw new AppError('ROYALTY_UNEXPECTED','Default royalty exceeds the pinned-source maximum');
  let token=null;
  if(tokenId!==undefined){
    // Validate existence and avoid labeling a nonexistent token override as real.
    const owner=await c.readContract({address:contract,abi:erc721RoyaltyReadAbi,
      functionName:'ownerOf',args:[tokenId],blockNumber});
    const [receiver,royaltyAmount]=await c.readContract({address:contract,
      abi:erc721RoyaltyReadAbi,functionName:'royaltyInfo',
      args:[tokenId,10000n],blockNumber});
    token={tokenId:String(tokenId),owner,receiver,effectiveBasisPoints:String(royaltyAmount),
      sampleSalePriceWei:'10000'};
  }
  return serializable({chainId,contract,version:inspected.version,
    observedBlock:String(blockNumber),defaultRoyalty:{recipient,basisPoints:String(basisPoints)},
    token,signingEnabled:false,sourceCompatibilityOnly:true,
    note:'Read-only royalty settings at one block. The effective token rate may override the default. '+
      'This does not guarantee marketplace enforcement or authorize changing royalty settings.'});
}
