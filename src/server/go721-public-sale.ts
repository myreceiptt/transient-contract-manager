import {getAddress,keccak256,type Address} from 'viem';
import {AppError,serializable} from '../lib/domain';
import {client,exactChain} from './chain';
import {GO721_COLLECTION,GO721_STACKS,go721ViewsAbi,go721DropAbi,go721Phase,quoteGo721Mint} from '../lib/go721-sale-engine';

/** Public read-only collection sale status. No private drafts are exposed, no
 * unsigned calldata or transaction signing affordance is returned.
 * Observations are coherent at one block, never cached across payments.
 */
export async function readPublicGo721Status(rawRecipient?:Address){
  const c=client(1);
  await exactChain(c,1);
  const block=await c.getBlock();
  const address=GO721_STACKS;
  const code=await c.getCode({address,blockNumber:block.number});
  if(!code||code==='0x')return {collection:GO721_COLLECTION,chainId:1,
    saleConfigured:false,phase:0,phaseLabel:'Unavailable',
    protocolStatus:'NO_CODE',transactionExecutionEnabled:false};
  const version=await c.readContract({address,abi:go721ViewsAbi,
    functionName:'VERSION',blockNumber:block.number});
  if(version!=='2.3.1')return {collection:GO721_COLLECTION,chainId:1,
    saleConfigured:false,phase:0,phaseLabel:'Protocol unavailable',
    protocolStatus:'VERSION_MISMATCH',transactionExecutionEnabled:false};
  const [paused,phase,round,drop,fee]=await Promise.all([
    c.readContract({address,abi:go721ViewsAbi,functionName:'paused',blockNumber:block.number}),
    c.readContract({address,abi:go721ViewsAbi,functionName:'getDropPhase',args:[GO721_COLLECTION],blockNumber:block.number}),
    c.readContract({address,abi:go721ViewsAbi,functionName:'getDropRound',args:[GO721_COLLECTION],blockNumber:block.number}),
    c.readContract({address,abi:go721DropAbi,functionName:'getDrop',args:[GO721_COLLECTION],blockNumber:block.number}),
    c.readContract({address,abi:go721ViewsAbi,functionName:'protocolFee',blockNumber:block.number}),
  ]);
  const wallet=rawRecipient?getAddress(rawRecipient):undefined;
  let mintedByWallet=0n;
  if(wallet){
    // An unavailable wallet allowance read must not be treated as zero minted.
    mintedByWallet=await c.readContract({address,abi:go721ViewsAbi,
      functionName:'getNumberMinted',args:[GO721_COLLECTION,wallet],blockNumber:block.number});
  }
  const quote=quoteGo721Mint({
    reportedVersion:version,paused,phase:Number(phase),roundNumber:round,
    supply:drop.supply,initialSupply:drop.initialSupply,allowance:drop.allowance,
    presaleMerkleRoot:drop.presaleMerkleRoot,presaleCost:drop.presaleCost,
    publicCost:drop.publicCost,currencyAddress:drop.currencyAddress,
    payoutReceiver:drop.payoutReceiver,baseUri:drop.baseUri,
    protocolFee:fee,mintedByWallet,
  },wallet,1);
  const saleConfigured=Number(drop.dropType)!==0;
  return serializable({
    collection:GO721_COLLECTION,chainId:1,protocol:address,
    observedBlock:block.number,observedAt:new Date().toISOString(),
    observedRuntimeHash:keccak256(code),reportedVersion:version,
    phase:Number(phase),phaseLabel:go721Phase[Number(phase)]||'Unknown',
    round:Number(round)+1,saleConfigured,paused,
    remainingSupply:drop.supply,initialSupply:drop.initialSupply,
    perWalletLimit:drop.allowance,alreadyMintedByWallet:mintedByWallet,
    startTime:drop.startTime,
    protocolFeeWei:fee,priceWei:Number(phase)===2?drop.presaleCost:drop.publicCost,
    payoutReceiver:drop.payoutReceiver,
    displayedQuote:quote,publicRoute:'/mint/go-one-of-one',
    // Runtime codehash has not yet been attested against a reproducible
    // official deploy; observation and quotation never grant permission.
    exactRuntimeVerified:false,
    transactionExecutionEnabled:false,
    warning:'This is an Ethereum blockchain observation, not permission to pay, sign, or purchase. Minting remains disabled.'
  });
}
