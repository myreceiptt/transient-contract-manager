import {describe,expect,it} from 'vitest';
import {parseEther,zeroAddress} from 'viem';
import {quoteGo721Mint,type SaleSnapshot,GO721_APPROVED} from '../src/lib/go721-sale-engine';
import {planGo721Drop} from '../src/lib/go721-sale-plan';
import {GO_APPROVED_TERMS} from '../src/lib/erc721-sale-terms';
const presaleRecipient=GO_APPROVED_TERMS.presaleRecipient;
const folder='ipfs://bafybeicrfkcsgbcxbkk6ica3al4k4ykxivdccw3issjqjipw3aepit5bhm';
const input:SaleSnapshot={
  reportedVersion:'2.3.1',paused:false,phase:2,roundNumber:0n,
  supply:3n,initialSupply:3n,allowance:0n,presaleMerkleRoot:GO721_APPROVED.presale.merkleRoot,
  presaleCost:0n,publicCost:0n,currencyAddress:zeroAddress,
  payoutReceiver:GO721_APPROVED.payoutReceiver,baseUri:folder,
  protocolFee:parseEther('0.001'),mintedByWallet:0n,
};
describe('GO#|O strict sequential sale contract policy',()=>{
  it('quotes three presale NFTs at 0 ETH + exactly three protocol fees',()=>{
    const q=quoteGo721Mint(input,presaleRecipient,3);
    expect(q.allowed).toBe(true);
    expect(q.round).toBe(1);
    expect(q.mintableQuantity).toBe(3);
    expect(q.mintPriceWei).toBe('0');
    expect(q.protocolFeeWei).toBe(parseEther('0.003').toString());
    expect(q.transactionExecutionEnabled).toBe(false);
  });
  it('blocks every non-whitelist wallet and bad Merkle root',()=>{
    expect(quoteGo721Mint(input,'0x0000000000000000000000000000000000000001',1).allowed).toBe(false);
    expect(quoteGo721Mint({...input,presaleMerkleRoot:('0x'+'00'.repeat(32)) as `0x${string}`},presaleRecipient,1)
      .issues).toContain('Whitelist drop parameters do not match the approved allocation');
  });
  it('detects TLStacks721 auto-capping instead of quoting a false amount',()=>{
    const q=quoteGo721Mint({...input,supply:1n,mintedByWallet:2n},presaleRecipient,3);
    expect(q.mintableQuantity).toBe(1);
    expect(q.reduced).toBe(true);
    expect(q.protocolFeeWei).toBe(parseEther('0.001').toString());
  });
  it('quotes public 0.025 ETH and max 10 in the second distinct drop round',()=>{
    const round2:SaleSnapshot={...input,phase:3,roundNumber:1n,
      supply:27n,initialSupply:27n,allowance:10n,presaleMerkleRoot:'0x'+'00'.repeat(32),
      publicCost:parseEther('0.025'),mintedByWallet:9n};
    const q=quoteGo721Mint(round2,'0x0000000000000000000000000000000000000001',5);
    expect(q.allowed).toBe(true);
    expect(q.mintableQuantity).toBe(1);
    expect(q.mintPriceWei).toBe(parseEther('0.025').toString());
    expect(q.totalBeforeGasWei).toBe(parseEther('0.026').toString());
    expect(q.reduced).toBe(true);
  });
  it('rejects wrong round, payout, wallet limit, pause, currency and missing IPFS folder',()=>{
    const round2:SaleSnapshot={...input,phase:3,roundNumber:1n,
      supply:27n,initialSupply:27n,allowance:10n,
      publicCost:parseEther('0.025')};
    expect(quoteGo721Mint({...round2,roundNumber:5n},presaleRecipient,1).allowed).toBe(false);
    expect(quoteGo721Mint({...round2,paused:true},presaleRecipient,1).allowed).toBe(false);
    expect(quoteGo721Mint({...round2,payoutReceiver:zeroAddress},presaleRecipient,1).allowed).toBe(false);
    expect(quoteGo721Mint({...round2,allowance:11n},presaleRecipient,1).allowed).toBe(false);
    expect(quoteGo721Mint({...round2,baseUri:''},presaleRecipient,1).allowed).toBe(false);
  });
  it('builds the approved two onchain structs only when all offchain guards pass',()=>{
    const x=planGo721Drop({round:1,metadataBaseUri:folder,historicalTokenCounterVerified:true,
      presaleDurationSeconds:86400});
    expect(x).toMatchObject({dropType:1,initialSupply:3n,supply:3n,
      allowance:0n,presaleCost:0n,presaleDuration:86400n,publicDuration:0n,baseUri:folder});
    expect(x.startTime).toBe(1794280200n);
    expect(()=>planGo721Drop({round:1,metadataBaseUri:folder})).toThrow('history');
    expect(()=>planGo721Drop({round:2,metadataBaseUri:folder,historicalTokenCounterVerified:true,
      confirmedPresaleMints:2,round2StartSeconds:1794400000})).toThrow('three verified');
    const pub=planGo721Drop({round:2,metadataBaseUri:folder,historicalTokenCounterVerified:true,
      confirmedPresaleMints:3,round2StartSeconds:1794400000});
    expect(pub.initialSupply).toBe(27n);
    expect(pub.allowance).toBe(10n);
    expect(pub.publicCost).toBe(parseEther('0.025'));
    expect(pub.presaleDuration).toBe(0n);
    expect(pub.publicDuration>0n).toBe(true);
  });
});