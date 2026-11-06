import {getAddress,parseEther,zeroAddress,type Address,type Hex} from 'viem';
import {GO_APPROVED_TERMS,approvedGoTerms} from './erc721-sale-terms';

export const GO721_COLLECTION=getAddress(GO_APPROVED_TERMS.collection);
export const GO721_STACKS='0x384092784cfaa91efaa77870c04d958e20840242' as Address;
export const GO721_APPROVED=approvedGoTerms(1,GO721_COLLECTION);

/** Exact TLStacks721 v2.3.1 Drop tuple as pinned in the official source. */
export const go721DropAbi=[{
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
export const go721ViewsAbi=[
  {type:'function',name:'VERSION',stateMutability:'view',inputs:[],outputs:[{type:'string'}]},
  {type:'function',name:'protocolFee',stateMutability:'view',inputs:[],outputs:[{type:'uint256'}]},
  {type:'function',name:'paused',stateMutability:'view',inputs:[],outputs:[{type:'bool'}]},
  {type:'function',name:'getDropPhase',stateMutability:'view',
    inputs:[{type:'address'}],outputs:[{type:'uint8'}]},
  {type:'function',name:'getDropRound',stateMutability:'view',
    inputs:[{type:'address'}],outputs:[{type:'uint256'}]},
  {type:'function',name:'getNumberMinted',stateMutability:'view',
    inputs:[{type:'address'},{type:'address'}],outputs:[{type:'uint256'}]},
] as const;
export const go721Phase=['Not configured','Scheduled','Whitelist presale','Public sale','Ended'] as const;
export type Round=1|2;
export type SaleSnapshot={
  reportedVersion:string;paused:boolean;phase:number;roundNumber:bigint;
  supply:bigint;initialSupply:bigint;allowance:bigint;presaleMerkleRoot:Hex;
  presaleCost:bigint;publicCost:bigint;currencyAddress:Address;
  payoutReceiver:Address;baseUri:string;protocolFee:bigint;mintedByWallet:bigint;
};
/** Fully fail closed until the contract's actual round and configured values match
 * the preapproved GO#|O two-round allocation, fee, payout, root and metadata folder.
 * A VERSION string alone never authorizes wallet execution.
 */
export function quoteGo721Mint(input:SaleSnapshot,recipient?:string,requested=1){
  const issues:string[]=[];
  const round:Round|null=input.roundNumber===0n?1:input.roundNumber===1n?2:null;
  if(input.reportedVersion!=='2.3.1')issues.push('Protocol version mismatch');
  if(input.paused)issues.push('Sale contract paused');
  if(round===null)issues.push('Unexpected sale round');
  if(input.phase!==(round===1?2:3))issues.push('Sale phase not open');
  if(!recipient)issues.push('Connect an Ethereum wallet');
  let wallet:Address|undefined;
  if(recipient)try{wallet=getAddress(recipient);}catch{issues.push('Invalid wallet address');}
  if(round===1 && wallet!==GO721_APPROVED.presale.recipient)
    issues.push('Wallet is not on the one-recipient presale allowlist');
  if(input.currencyAddress!==zeroAddress)issues.push('ETH-only sale required');
  if(input.payoutReceiver!==GO721_APPROVED.payoutReceiver)issues.push('Unexpected payout receiver');
  if(input.supply===0n)issues.push('Round is sold out');
  if(input.baseUri.length<55||!input.baseUri.startsWith('ipfs://'))
    issues.push('Verified indexed IPFS folder is missing');
  if(round===1){
    if(input.initialSupply!==3n||input.presaleCost!==0n||
       input.presaleMerkleRoot!==GO721_APPROVED.presale.merkleRoot)
      issues.push('Whitelist drop parameters do not match the approved allocation');
  } else if(round===2){
    if(input.initialSupply!==27n||input.publicCost!==parseEther('0.025')||
       input.allowance!==10n)
      issues.push('Public drop parameters do not match approved supply, wallet limit and price');
  }
  if(!Number.isInteger(requested)||requested<1||requested>10)issues.push('Invalid requested quantity');
  const walletLimit=round===1?3n:10n;
  const remainingWallet=walletLimit>input.mintedByWallet?walletLimit-input.mintedByWallet:0n;
  const safeRequested=Number.isInteger(requested)&&requested>0?BigInt(requested):0n;
  const actualMintable=[safeRequested,input.supply,remainingWallet].reduce((a,b)=>a<b?a:b);
  if(actualMintable===0n)issues.push('Wallet allowance exhausted');
  // TLStacks721 silently caps requested quantity. It cannot be presented as an
  // unconditional exact-quantity purchase. Only quote what can actually mint.
  const unitPrice=round===1?0n:parseEther('0.025');
  const saleSubtotal=actualMintable*unitPrice;
  const fee=actualMintable*input.protocolFee;
  return {
    round,requestedQuantity:requested,mintableQuantity:Number(actualMintable),
    reduced:actualMintable!==safeRequested,
    mintPriceWei:saleSubtotal.toString(),protocolFeeWei:fee.toString(),
    totalBeforeGasWei:(saleSubtotal+fee).toString(),
    recipient:wallet??null,
    allowed:issues.length===0,issues,
    // Mechanically prepared but not authorized as an actual transaction.
    presaleNumberCanMint:round===1?'3':'0',merkleProof:[] as Hex[],
    transactionExecutionEnabled:false,
  };
}
