import {getAddress,keccak256,parseAbi,stringToHex,formatEther,parseEther,type Address} from 'viem';
import {AppError,serializable} from '../lib/domain';
import {client,exactChain} from './chain';
import {inspectErc721Candidate,erc721ProbeAbi} from './erc721-probe';
import {TLSTACKS721_V231} from './erc721-market-observer';
import {GO_APPROVED_TERMS,approvedGoTerms} from '../lib/erc721-sale-terms';
const GO721_COLLECTION=getAddress(GO_APPROVED_TERMS.collection);
const GO721_PAYOUT=getAddress(GO_APPROVED_TERMS.payoutReceiver);
const GO721_PUBLIC_PRICE_WEI=parseEther(GO_APPROVED_TERMS.publicUnitPriceEth);
const GO721_APPROVED_PLAN=approvedGoTerms(1,GO721_COLLECTION);
/**
 * Observes one Ethereum block. This module only reads.
 * Never use VERSION / ABI matching as authorization to send TLStacks721 writes.
 * A zero ERC721 totalSupply is NOT proof of zero historically minted token IDs.
 */
const dropAbi=[{
  type:'function',name:'getDrop',stateMutability:'view',
  inputs:[{name:'nftAddress',type:'address'}],
  outputs:[{name:'drop',type:'tuple',components:[
    {name:'dropType',type:'uint8'}, {name:'payoutReceiver',type:'address'},
    {name:'initialSupply',type:'uint256'}, {name:'supply',type:'uint256'},
    {name:'allowance',type:'uint256'}, {name:'currencyAddress',type:'address'},
    {name:'startTime',type:'uint256'}, {name:'presaleDuration',type:'uint256'},
    {name:'presaleCost',type:'uint256'}, {name:'presaleMerkleRoot',type:'bytes32'},
    {name:'publicDuration',type:'uint256'}, {name:'publicCost',type:'uint256'},
    {name:'decayRate',type:'int256'}, {name:'baseUri',type:'string'},
  ]}]
}] as const;
const stackViews=parseAbi([
  'function VERSION() view returns (string)',
  'function protocolFee() view returns (uint256)',
  'function protocolFeeReceiver() view returns (address)',
  'function paused() view returns (bool)',
  'function getDropPhase(address nftAddress) view returns (uint8)',
  'function getDropRound(address nftAddress) view returns (uint256)',
]);
const role=keccak256(stringToHex('APPROVED_MINT_CONTRACT'));
const roleAbi=parseAbi([
  'function hasRole(bytes32 role,address account) view returns (bool)',
  'function supplyLocked() view returns (bool)',
]);

export async function readGo721SaleReadiness(chainId:number,rawCollection:Address,actor:Address){
  const collection=getAddress(rawCollection);
  if(chainId!==1||collection!==GO721_COLLECTION)
    throw new AppError('SALE_SCOPE','This review only supports approved GO#|O on Ethereum Mainnet.',403);
  const inspector=await inspectErc721Candidate(chainId,collection,actor);
  if(inspector.walletRole!=='owner'&&inspector.walletRole!=='admin')
    throw new AppError('SALE_ADMIN_REQUIRED','Only a verified creator Owner/Admin may review private sale readiness.',403);
  const c=client(chainId);
  await exactChain(c,chainId);
  const at=BigInt(inspector.observedBlock);
  const stack=TLSTACKS721_V231;
  const code=await c.getCode({address:stack,blockNumber:at});
  if(!code||code==='0x')throw new AppError('SALE_STACK_MISSING','TLStacks721 candidate has no deployed code.',503);
  const [stackVersion,fee,feeReceiver,paused,phase,round,drop,approvedMint,supplyLocked]=await Promise.all([
    c.readContract({address:stack,abi:stackViews,functionName:'VERSION',blockNumber:at}),
    c.readContract({address:stack,abi:stackViews,functionName:'protocolFee',blockNumber:at}),
    c.readContract({address:stack,abi:stackViews,functionName:'protocolFeeReceiver',blockNumber:at}),
    c.readContract({address:stack,abi:stackViews,functionName:'paused',blockNumber:at}),
    c.readContract({address:stack,abi:stackViews,functionName:'getDropPhase',args:[collection],blockNumber:at}),
    c.readContract({address:stack,abi:stackViews,functionName:'getDropRound',args:[collection],blockNumber:at}),
    c.readContract({address:stack,abi:dropAbi,functionName:'getDrop',args:[collection],blockNumber:at}),
    c.readContract({address:collection,abi:roleAbi,functionName:'hasRole',args:[role,stack],blockNumber:at}),
    c.readContract({address:collection,abi:roleAbi,functionName:'supplyLocked',blockNumber:at}),
  ]);
  const checks={
    approvedCollectionMatches:true,
    supportedCreatorRuntime:inspector.creatorMintRuntimeVerified===true,
    stacksReportedVersion:stackVersion==='2.3.1',
    // Deployment candidate and VERSION are NOT sufficient runtime attestation.
    stacksExactRuntimeAttested:false,
    creatorMintPermission:approvedMint,
    creatorSupplyUnlocked:!supplyLocked,
    saleContractNotPaused:!paused,
    unburnedSupplyZero:String(inspector.totalSupply)==='0',
    zeroHistoricalMintEventsVerified:false,
    noInterleavedMintGuaranteed:false,
    firstDropUnconfigured:Number(drop.dropType)===0,
    payoutConfigured:drop.payoutReceiver.toLowerCase()===GO721_PAYOUT.toLowerCase(),
    publicPriceConfigured:drop.publicCost===GO721_PUBLIC_PRICE_WEI,
    approvedManifestPinned:false,
    authorizedMainnetSaleActivation:false,
  };
  const blockers=Object.entries(checks).filter(([,ok])=>!ok).map(([key])=>key);
  return serializable({
    chainId,collection,observedBlock:at,observedAt:new Date().toISOString(),
    protocol:{address:stack,reportedVersion:stackVersion,observedRuntimeHash:keccak256(code),
      exactRuntimeAttestation:'NOT_PERFORMED',paused,protocolFeeWei:fee,
      protocolFeeEth:formatEther(fee),protocolFeeReceiver:feeReceiver},
    creator:{version:inspector.version,totalUnburnedSupply:inspector.totalSupply,
      supplyLocked,approvedMintContract:approvedMint,role:inspector.walletRole,
      creatorRuntimeVerified:inspector.creatorMintRuntimeVerified,
      owner:inspector.owner,admins:inspector.admins,
      approvedMintRoleHash:role,
      ownerMustGrantApprovedMintContract:!approvedMint},
    observedDrop:{phase:Number(phase),round:Number(round),
      configured:Number(drop.dropType)!==0,dropType:Number(drop.dropType),
      payoutReceiver:drop.payoutReceiver,remainingSupply:drop.supply,
      initialSupply:drop.initialSupply,publicWalletAllowance:drop.allowance,
      presaleCostWei:drop.presaleCost,publicCostWei:drop.publicCost,
      baseUri:drop.baseUri},
    approvedOffchainPlan:GO721_APPROVED_PLAN,checks,blockers,
    readyForMainnetWrites:false,transactionSigningEnabled:false,
    notice:'Private on-chain observation only. No verified sale adapter, complete mint history, metadata folder pin, or operator transaction approval. Do not enable purchases from these observations.',
  });
}
