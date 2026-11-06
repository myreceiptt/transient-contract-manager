import {getAddress,parseEther,zeroAddress,zeroHash,type Address,type Hex} from 'viem';
import {GO_APPROVED_TERMS,approvedGoTerms} from './erc721-sale-terms';
import {GO721_COLLECTION} from './go721-sale-engine';

export const GO721_PROPOSED_PRESALE_DURATION_SECONDS=24*60*60;
export type PlannedDrop={
  dropType:1;payoutReceiver:Address;initialSupply:bigint;supply:bigint;
  allowance:bigint;currencyAddress:Address;startTime:bigint;
  presaleDuration:bigint;presaleCost:bigint;presaleMerkleRoot:Hex;
  publicDuration:bigint;publicCost:bigint;decayRate:bigint;baseUri:string;
};
function baseUri(uri:string){
  if(!/^ipfs:\/\/(?:bafy[a-z2-7]{35,}|Qm[1-9A-HJ-NP-Za-km-z]{44})(?:\/[a-z0-9-]+)?$/.test(uri))
    throw new Error('A verified indexed IPFS folder base URI is required.');
  return uri;
}
/** Deterministic contract struct planning, NOT transaction calldata.
 * Operator must separately approve: 24h presale duration, each exact
 * round configuration, contract role grant, and mainnet signatures.
 */
export function planGo721Drop(args:{
  round:1|2;metadataBaseUri:string;
  round2StartSeconds?:number;
  presaleDurationSeconds?:number;
  confirmedPresaleMints?:number;
  historicalTokenCounterVerified?:boolean;
}):PlannedDrop{
  const info=approvedGoTerms(1,GO721_COLLECTION),base=baseUri(args.metadataBaseUri);
  if(args.historicalTokenCounterVerified!==true)
    throw new Error('Original ERC721 Token ID history is not independently verified.');
  const payoutReceiver=getAddress(GO_APPROVED_TERMS.payoutReceiver);
  if(args.round===1){
    const duration=args.presaleDurationSeconds??GO721_PROPOSED_PRESALE_DURATION_SECONDS;
    if(!Number.isSafeInteger(duration)||duration<3600||duration>7*86400)
      throw new Error('Presale duration must be 1 hour to 7 days.');
    return {
      dropType:1,payoutReceiver,initialSupply:3n,supply:3n,
      allowance:0n,currencyAddress:zeroAddress,
      startTime:BigInt(info.presale.startTimestampSeconds),
      presaleDuration:BigInt(duration),presaleCost:0n,
      presaleMerkleRoot:info.presale.merkleRoot,
      publicDuration:0n,publicCost:0n,decayRate:0n,baseUri:base,
    };
  }
  if(args.round!==2)throw new Error('Unknown GO#|O sale round.');
  if(args.confirmedPresaleMints!==3)
    throw new Error('Public sale cannot start before three verified presale mints.');
  const when=args.round2StartSeconds;
  const end=Math.floor(Date.parse(GO_APPROVED_TERMS.plannedCampaignEndWib)/1000);
  if(when===undefined||!Number.isSafeInteger(when)||when<=0||when>=end)
    throw new Error('Round 2 requires a valid scheduled start before campaign end.');
  return {
    dropType:1,payoutReceiver,initialSupply:27n,supply:27n,
    allowance:10n,currencyAddress:zeroAddress,startTime:BigInt(when),
    presaleDuration:0n,presaleCost:0n,presaleMerkleRoot:zeroHash,
    publicDuration:BigInt(end-when),publicCost:parseEther('0.025'),
    decayRate:0n,baseUri:base,
  };
}
export function explainGo721RoundPlan(round:1|2){
  return round===1?{
    allocation:'NFT #1–#3 (conditional on unminted creator contract)',
    access:'one allowlisted recipient',
    expectedSupply:3,priceEth:'0',allowance:3,
    automaticSwitchToPublic:false,requiresOwnerTransactionApproval:true,
  }:{
    allocation:'NFT #4–#30 (conditional on the three confirmed first mints)',
    access:'public',expectedSupply:27,priceEth:'0.025',allowance:10,
    automaticSwitchToPublic:false,requiresOwnerTransactionApproval:true,
  };
}
