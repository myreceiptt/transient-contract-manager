import {getAddress,parseEther} from 'viem';
import {prepareOneWalletPresale} from './erc721-sale-allowlist';

/** Operator-approved, OFF-CHAIN sale terms. Never authorize a blockchain transaction based on this file.
 * Collection scoped deliberately: no other ERC721 or GO1 contract inherits these defaults.
 * Nov 10 10:10 WIB = Nov 10 03:10 UTC; timestamps are explicit to avoid timezone drift.
 */
export const GO_APPROVED_TERMS = {
  chainId:1,
  collection:'0x99b8ae3c16559b80424a45c92dd530d50d970a46',
  label:'GO#|O',
  presaleRecipient:'0xbeE916aBC292D4EfF57702fABbA1AAC4d4046036',
  payoutReceiver:'0x57eE21f9aCFFCBa7F1E8cB51f9b96aFd33b4CB87',
  presaleStartWib:'2026-11-10T10:10:00+07:00',
  plannedCampaignEndWib:'2027-11-10T10:10:00+07:00',
  presaleSupply:3, presaleWalletLimit:3, presaleUnitPriceEth:'0',
  publicSupply:27, publicWalletLimit:10, publicUnitPriceEth:'0.025',
} as const;

export function approvedGoTerms(chainId:number,contract:string){
  if(chainId!==GO_APPROVED_TERMS.chainId ||
     getAddress(contract)!==getAddress(GO_APPROVED_TERMS.collection))
    throw new Error('Approved GO#|O terms are scoped to one Ethereum Mainnet collection.');
  const allowlist=prepareOneWalletPresale(GO_APPROVED_TERMS.presaleRecipient,chainId,contract);
  const startMs=Date.parse(GO_APPROVED_TERMS.presaleStartWib);
  const endMs=Date.parse(GO_APPROVED_TERMS.plannedCampaignEndWib);
  if(!Number.isFinite(startMs)||!Number.isFinite(endMs)||endMs<=startMs)
    throw new Error('Invalid campaign time window.');
  return {
    schema:'prof-nota-erc721-approved-terms/v1' as const,
    collection:{chainId:1 as const,contract:getAddress(contract)},
    status:'APPROVED_TERMS_OFFCHAIN_ONLY' as const,
    presale:{
      supply:GO_APPROVED_TERMS.presaleSupply,
      unitPriceWei:'0',
      startTimestampSeconds:Math.floor(startMs/1000),
      startIsoUtc:new Date(startMs).toISOString(),
      timezone:'Asia/Jakarta',
      recipient:allowlist.recipient,
      recipientWalletLimit:GO_APPROVED_TERMS.presaleWalletLimit,
      merkleRoot:allowlist.merkleRoot,
      merkleProof:allowlist.merkleProof,
    },
    publicSale:{
      supply:GO_APPROVED_TERMS.publicSupply,
      unitPriceEth:GO_APPROVED_TERMS.publicUnitPriceEth,
      unitPriceWei:parseEther(GO_APPROVED_TERMS.publicUnitPriceEth).toString(),
      recipientWalletLimit:GO_APPROVED_TERMS.publicWalletLimit,
      startPolicy:'ONLY_AFTER_3_PRESALE_MINTS_CONFIRMED_AND_SEPARATE_APPROVAL' as const,
      earliestStartTimestampSeconds:null,
    },
    payoutReceiver:getAddress(GO_APPROVED_TERMS.payoutReceiver),
    plannedCampaignEndIsoUtc:new Date(endMs).toISOString(),
    metadataFolderCids:{presale:null,public:null},
    protocolFeeWei:null,
    configuredTLStacks721Address:null,
    approvalRequiredForEveryMainnetWrite:true,
    onChainSaleConfigured:false,
  };
}
export function inspectDraftAgainstApprovedTerms(draft:Record<string,unknown>){
  const mismatch:string[]=[];
  if(String(draft.payout||'').toLowerCase()!==GO_APPROVED_TERMS.payoutReceiver.toLowerCase())mismatch.push('Payout receiver does not match.');
  if(String(draft.price||'')!==GO_APPROVED_TERMS.publicUnitPriceEth)mismatch.push('Draft public price does not match 0.025 ETH.');
  if(String(draft.maxPerWallet||'')!=='10')mismatch.push('Draft public limit is not 10 per wallet.');
  if(String(draft.start||'')!=='2026-11-10T10:10')mismatch.push('Draft local start does not match November 10, 10:10 WIB.');
  return mismatch;
}
