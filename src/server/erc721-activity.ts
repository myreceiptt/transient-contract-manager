import {parseAbiItem,zeroAddress,type Address} from 'viem';
import {AppError,serializable} from '../lib/domain';
import {client,exactChain} from './chain';
import {inspectErc721Candidate} from './erc721-probe';

/** Bounded on-chain activity, not a complete index or a financial ledger.
 * Never writes data or infers the absence of history outside inspected blocks.
 */
const transferEvent=parseAbiItem(
  'event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)'
);
export async function readErc721Transfers(chainId:number,contract:Address,beforeBlock?:bigint,tokenId?:bigint){
  if(chainId!==1)throw new AppError('ERC721_ACTIVITY_CHAIN',
    'Bounded ERC721 transfer lookup currently supports Ethereum Mainnet only');
  if(beforeBlock!==undefined&&beforeBlock<1n)
    throw new AppError('ERC721_ACTIVITY_BLOCK','Invalid history cursor');
  if(tokenId!==undefined&&(tokenId<1n||tokenId>100000000n))
    throw new AppError('ERC721_ACTIVITY_TOKEN','Invalid Token ID');
  const c=client(chainId);
  await exactChain(c,chainId);
  const inspected=await inspectErc721Candidate(chainId,contract);
  const observedBlock=BigInt(inspected.observedBlock);
  const toBlock=beforeBlock===undefined?observedBlock:
    beforeBlock<observedBlock?beforeBlock:observedBlock;
  const fromBlock=toBlock>999n?toBlock-999n:0n;
  const logs=await c.getLogs({
    address:contract,event:transferEvent,
    ...(tokenId===undefined?{}:{args:{tokenId}}),
    fromBlock,toBlock,strict:true,
  });
  const limit=100;
  // Keep returned logs bounded and retain an explicit coverage window.
  const recent=logs.slice(-limit).reverse().map(l=>({
    tokenId:l.args.tokenId?.toString(),
    from:l.args.from,to:l.args.to,
    type:l.args.from?.toLowerCase()===zeroAddress?'MINT':
      l.args.to?.toLowerCase()===zeroAddress?'BURN':'TRANSFER',
    blockNumber:String(l.blockNumber),
    transactionHash:l.transactionHash,
    logIndex:l.logIndex,
  }));
  return serializable({chainId,contract,observedBlock:String(observedBlock),
    window:{from:String(fromBlock),to:String(toBlock)},
    nextBeforeBlock:logs.length>limit||fromBlock===0n?null:String(fromBlock-1n),
    capped:logs.length>limit,events:recent,
    completeCollectionHistory:fromBlock===0n&&! (logs.length>limit),
    note:'Block-scoped Transfer events only. A limited window is not a complete ownership or auction history. '+
      'Separate Stacks and AuctionHouse contract events are not included. No state changes are made.'});
}
