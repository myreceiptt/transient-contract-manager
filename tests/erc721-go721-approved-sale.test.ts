import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {prepareOneWalletPresale} from '../src/lib/erc721-sale-allowlist';
import {
  GO721_APPROVED_PLAN,GO721_PRESALE_START_UNIX,GO721_COLLECTION,GO721_PAYOUT,
  GO721_PUBLIC_PRICE_WEI,makeGo721DraftReview,validateGo721SalePlan
} from '../src/lib/erc721-go721-approved-sale';
const sample=()=>{
  const presale=prepareOneWalletPresale(GO721_APPROVED_PLAN.presale.wallet,1,GO721_COLLECTION);
  return {
    schema:'prof-nota-erc721-sale-preparation/v3',onChainSaleConfigured:false,
    collection:{chainId:1,contract:GO721_COLLECTION},
    payoutReceiver:GO721_PAYOUT,
    sourceArtworkPositions:Array.from({length:30},(_,i)=>({position:i+1})),
    rounds:[{round:1,phase:'presale_whitelist',supply:3,priceEth:'0',
      recipientWalletLimit:3,allowlistedWallet:presale.recipient,
      presaleNumberCanMint:3,presaleProof:[],presaleMerkleRoot:presale.merkleRoot,
      payoutReceiver:GO721_PAYOUT,metadataFolderCid:null},
    {round:2,phase:'public_sale',supply:27,priceEth:'0.025',
      recipientWalletLimit:10,payoutReceiver:GO721_PAYOUT,metadataFolderCid:null}],
  };
};
describe('GO#|O operator-approved sale policy; on-chain writes disabled',()=>{
  it('encodes 10 Nov 2026 10:10 WIB unambiguously, without timezone drift',()=>{
    expect(GO721_PRESALE_START_UNIX).toBe(1794280200);
    expect(new Date(GO721_APPROVED_PLAN.presale.startUnix*1000).toISOString())
      .toBe('2026-11-10T03:10:00.000Z');
  });
  it('retains whitelist, payout, pricing, capped supply and fee units',()=>{
    expect(GO721_APPROVED_PLAN.presale).toMatchObject({supply:3,priceEth:'0',walletLimit:3});
    expect(GO721_APPROVED_PLAN.public).toMatchObject({supply:27,priceEth:'0.025',walletLimit:10});
    expect(GO721_PUBLIC_PRICE_WEI).toBe(25000000000000000n);
    expect(validateGo721SalePlan(sample())).toBe(GO721_APPROVED_PLAN);
  });
  it('fails closed when whitelist, price, supply or payout differ',()=>{
    const changed=structuredClone(sample());
    changed.rounds[0].presaleNumberCanMint=2;
    expect(()=>validateGo721SalePlan(changed)).toThrow('Presale');
    const altered=structuredClone(sample());altered.rounds[1].recipientWalletLimit=47;
    expect(()=>validateGo721SalePlan(altered)).toThrow('Public sale');
    const different=structuredClone(sample());
    different.payoutReceiver='0x0000000000000000000000000000000000000001';
    expect(()=>validateGo721SalePlan(different)).toThrow('identity or payout');
  });
  it('warns against the legacy saved 47-wallet draft and empty payout without crashing',()=>{
    expect(makeGo721DraftReview({price:'0.025',payout:GO721_PAYOUT,maxPerWallet:'47',
      start:'2026-11-10T10:10'}).mismatch).toContain('Saved public wallet limit must be 10, not 47');
    expect(makeGo721DraftReview({price:'',payout:'',maxPerWallet:'',
      start:''}).matching).toBe(false);
    expect(makeGo721DraftReview({price:'0.025',payout:GO721_PAYOUT,maxPerWallet:'10',
      start:'2026-11-10T10:10'}).matching).toBe(true);
  });
  it('does not create executable sale endpoints or wallet writes',()=>{
    const probe=readFileSync('src/server/erc721-sale-readiness.ts','utf8');
    const ui=readFileSync('src/components/erc721-sale-readiness-panel.tsx','utf8');
    const route=readFileSync('src/app/api/route.ts','utf8');
    expect(probe).toContain("stacksExactRuntimeAttested:false");
    expect(probe).toContain("zeroHistoricalMintEventsVerified:false");
    expect(probe).toContain("readyForMainnetWrites:false");
    expect(ui).toContain("read_erc721_sale_readiness");
    expect(route).toContain("readGo721SaleReadiness");
    for(const src of [probe,ui]){
      expect(src).not.toContain('sendTransaction');
      expect(src).not.toContain('writeContract');
      expect(src).not.toContain('configureDrop(');
    }
  });
});