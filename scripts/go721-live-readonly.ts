import {keccak256,stringToHex,parseAbi,type Address} from 'viem';
import {client,exactChain} from '../src/server/chain';
import {GO721_COLLECTION,GO721_STACKS,go721ViewsAbi,go721DropAbi} from '../src/lib/go721-sale-engine';
import {erc721ProbeAbi} from '../src/server/erc721-probe';
import {erc721Creator} from '../src/lib/erc721-creator';
import {ADMIN_ROLE} from '../src/lib/chains';

/**
 * Mainnet observation only; prints reproducible evidence needed before authorizing
 * a GO#|O sale. Does NOT sign, impersonate, mutate, or load credentials.
 * Uses eth_getCode, eth_call and eth_getBlockByNumber only.
 */
async function main(){
  const c=client(1);
  await exactChain(c,1);
  const block=await c.getBlock();
  const height=block.number;
  const [code,creatorCode,version,phase,round,paused,fee,drop,
    creatorVersion,supply,locked,owner,admins] = await Promise.all([
    c.getCode({address:GO721_STACKS,blockNumber:height}),
    c.getCode({address:GO721_COLLECTION,blockNumber:height}),
    c.readContract({address:GO721_STACKS,abi:go721ViewsAbi,functionName:'VERSION',blockNumber:height}),
    c.readContract({address:GO721_STACKS,abi:go721ViewsAbi,functionName:'getDropPhase',args:[GO721_COLLECTION],blockNumber:height}),
    c.readContract({address:GO721_STACKS,abi:go721ViewsAbi,functionName:'getDropRound',args:[GO721_COLLECTION],blockNumber:height}),
    c.readContract({address:GO721_STACKS,abi:go721ViewsAbi,functionName:'paused',blockNumber:height}),
    c.readContract({address:GO721_STACKS,abi:go721ViewsAbi,functionName:'protocolFee',blockNumber:height}),
    c.readContract({address:GO721_STACKS,abi:go721DropAbi,functionName:'getDrop',args:[GO721_COLLECTION],blockNumber:height}),
    c.readContract({address:GO721_COLLECTION,abi:erc721ProbeAbi,functionName:'VERSION',blockNumber:height}),
    c.readContract({address:GO721_COLLECTION,abi:erc721ProbeAbi,functionName:'totalSupply',blockNumber:height}),
    c.readContract({address:GO721_COLLECTION,abi:parseAbi(['function supplyLocked() view returns(bool)']),functionName:'supplyLocked',blockNumber:height}),
    c.readContract({address:GO721_COLLECTION,abi:erc721ProbeAbi,functionName:'owner',blockNumber:height}),
    c.readContract({address:GO721_COLLECTION,abi:erc721ProbeAbi,functionName:'getRoleMembers',args:[ADMIN_ROLE],blockNumber:height}),
  ]);
  if(!code||code==='0x'||!creatorCode||creatorCode==='0x')
    throw Error('Missing deployed contract code');
  const clone=creatorCode.match(/^0x363d3d373d3d3d363d73([0-9a-fA-F]{40})5af43d82803e903d91602b57fd5bf3$/);
  const implementation=clone?'0x'+clone[1]:GO721_COLLECTION;
  const implementationCode=clone?await c.getCode({address:implementation as Address,blockNumber:height}):creatorCode;
  const minterRole=keccak256(stringToHex('APPROVED_MINT_CONTRACT'));
  const approved=await c.readContract({address:GO721_COLLECTION,abi:erc721ProbeAbi,
    functionName:'hasRole',args:[minterRole,GO721_STACKS],blockNumber:height});
  const codehash=keccak256(code);
  const creatorHash=implementationCode?keccak256(implementationCode):null;
  const result={
    observedAt:new Date().toISOString(),chainId:1,block:String(height),blockHash:block.hash,
    creator:{address:GO721_COLLECTION,version:creatorVersion,supply:String(supply),
      totalSupplyIsUnburnedNotHistoricalCounter:creatorVersion==='4.1.2',
      supplyLocked:locked,owner,admins,
      implementation,implementationHash:creatorHash,
      exactPinnedImplementation:implementation.toLowerCase()===erc721Creator.implementation &&
        creatorHash===erc721Creator.runtimeHash,
      approvedMintContractForStacks721:approved},
    stacks:{address:GO721_STACKS,version,codeHash:codehash,
      paused,round:String(round),phase:Number(phase),
      dropType:Number(drop.dropType),supply:String(drop.supply),
      initialSupply:String(drop.initialSupply),
      payoutReceiver:drop.payoutReceiver,baseUri:drop.baseUri,
      protocolFeeWei:String(fee)},
    authState:'READ_ONLY_DIAGNOSTICS_NO_TRANSACTION_PERMISSION',
    historicalMintEventScanComplete:false,
    exactTLStacksRuntimeRebuildVerified:false,
    safeForMainnetWrites:false,
  };
  if(version!=='2.3.1'||creatorVersion!=='4.1.2'||!result.creator.exactPinnedImplementation)
    throw Error('Unexpected creator or Stacks runtime; fail closed. '+JSON.stringify(result));
  console.log('GO721_READONLY_RELEASE_AUDIT='+JSON.stringify(result));
}
main().catch(e=>{console.error('GO721_READONLY_AUDIT_FAILED',e instanceof Error?e.message:String(e));process.exitCode=1;});
