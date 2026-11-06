import {getAddress} from 'viem';
import {prepareOneWalletPresale} from './erc721-sale-allowlist';

/** Operator-approved planning values; NOT a configured TLStacks721 drop. */
export const GO721_COLLECTION=getAddress('0x99b8ae3c16559b80424a45c92dd530d50d970a46');
export const GO721_WHITELIST=getAddress('0xbeE916aBC292D4EfF57702fABbA1AAC4d4046036');
export const GO721_PAYOUT=getAddress('0x57eE21f9aCFFCBa7F1E8cB51f9b96aFd33b4CB87');
export const GO721_PRESALE_START_WIB='2026-11-10T10:10:00+07:00';
export const GO721_PRESALE_START_UNIX=1794280200;
export const GO721_PUBLIC_PRICE_WEI=25000000000000000n;
export const GO721_APPROVED_PLAN={
  chainId:1,
  collection:GO721_COLLECTION,
  payoutReceiver:GO721_PAYOUT,
  presale:{startWib:GO721_PRESALE_START_WIB,startUnix:GO721_PRESALE_START_UNIX,
    supply:3,wallet:GO721_WHITELIST,walletLimit:3,priceEth:'0'},
  public:{supply:27,walletLimit:10,priceEth:'0.025'},
  distribution:'SEQUENTIAL_TWO_ROUNDS',
  operationalState:'NOT_CONFIGURED_ON_CHAIN',
} as const;
/** Verify a local operator file without giving it write privileges. */
export function validateGo721SalePlan(raw:unknown){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))
    throw new Error('Expected approved GO#|O sale preparation JSON.');
  const obj=raw as Record<string,unknown>,collection=obj.collection as Record<string,unknown>|null;
  if(obj.schema!=='prof-nota-erc721-sale-preparation/v3'||
    obj.onChainSaleConfigured!==false||
    collection?.chainId!==1||
    typeof collection.contract!=='string'||getAddress(collection.contract)!==GO721_COLLECTION||
    typeof obj.payoutReceiver!=='string'||getAddress(obj.payoutReceiver)!==GO721_PAYOUT)
    throw new Error('Sale plan identity or payout does not match operator approval.');
  const rounds=obj.rounds;
  if(!Array.isArray(rounds)||rounds.length!==2)throw new Error('Expected exactly two sale rounds.');
  const [presale,pub]=rounds as Record<string,unknown>[];
  if(presale.round!==1||presale.phase!=='presale_whitelist'||
    presale.supply!==3||presale.priceEth!=='0'||presale.recipientWalletLimit!==3||
    typeof presale.allowlistedWallet!=='string'||
    getAddress(presale.allowlistedWallet)!==GO721_WHITELIST||
    presale.presaleNumberCanMint!==3||
    !Array.isArray(presale.presaleProof)||presale.presaleProof.length!==0||
    presale.presaleMerkleRoot!==prepareOneWalletPresale(GO721_WHITELIST,1,GO721_COLLECTION).merkleRoot)
    throw new Error('Presale wallet, allocation or Merkle root mismatch.');
  if(pub.round!==2||pub.phase!=='public_sale'||pub.supply!==27||
    pub.priceEth!=='0.025'||pub.recipientWalletLimit!==10)
    throw new Error('Public sale supply, price or allowance mismatch.');
  for(const r of [presale,pub])
    if(r.metadataFolderCid!==null||typeof r.payoutReceiver!=='string'||
       getAddress(r.payoutReceiver)!==GO721_PAYOUT)
      throw new Error('Folder or payout state does not match approved unpublished plan.');
  if(!Array.isArray(obj.sourceArtworkPositions)||obj.sourceArtworkPositions.length!==30)
    throw new Error('Expected 30 approved artwork positions.');
  return GO721_APPROVED_PLAN;
}
export function makeGo721DraftReview(data:{price:string;payout:string;maxPerWallet:string;start:string}){
  const mismatch:string[]=[];
  if(data.price!=='0.025')mismatch.push('Public price differs from approved 0.025 ETH');
  if(data.maxPerWallet!=='10')mismatch.push('Saved public wallet limit must be 10, not '+data.maxPerWallet);
  if(!data.payout||getAddress(data.payout)!==GO721_PAYOUT)mismatch.push('Payout receiver differs from approval');
  // datetime-local has no timezone; the approved schedule is explicitly Asia/Jakarta.
  if(data.start!=='2026-11-10T10:10')mismatch.push('Local start should be 2026-11-10 10:10 WIB');
  return {matching:mismatch.length===0,mismatch};
}
