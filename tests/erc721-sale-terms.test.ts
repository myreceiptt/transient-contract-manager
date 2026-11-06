import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {approvedGoTerms,inspectDraftAgainstApprovedTerms} from '../src/lib/erc721-sale-terms';
const contract='0x99b8ae3c16559b80424a45c92dd530d50d970a46';
describe('GO#|O operator-approved sale terms (no contract writes)',()=>{
  it('uses 10 November 2026 10:10 WIB as exact start, not UTC or browser local',()=>{
    const x=approvedGoTerms(1,contract);
    expect(x.presale.startIsoUtc).toBe('2026-11-10T03:10:00.000Z');
    expect(x.plannedCampaignEndIsoUtc).toBe('2027-11-10T03:10:00.000Z');
  });
  it('locks 3 whitelist NFT and 27 public NFT supply with exact ether units',()=>{
    const x=approvedGoTerms(1,contract);
    expect(x.presale).toMatchObject({supply:3,unitPriceWei:'0',recipientWalletLimit:3,
      recipient:'0xbeE916aBC292D4EfF57702fABbA1AAC4d4046036',
      merkleRoot:'0x099149fab0112133588d7e328ada8d936974fd2d51188e6ded8c5bbc4551e6c5',
      merkleProof:[]});
    expect(x.publicSale).toMatchObject({supply:27,unitPriceWei:'25000000000000000',
      recipientWalletLimit:10,earliestStartTimestampSeconds:null});
    expect(x.payoutReceiver).toBe('0x57eE21f9aCFFCBa7F1E8cB51f9b96aFd33b4CB87');
  });
  it('does not silently change the live Mint Page draft wallet limit 47 to 10',()=>{
    const mismatches=inspectDraftAgainstApprovedTerms({
      payout:'0x57eE21f9aCFFCBa7F1E8cB51f9b96aFd33b4CB87',
      price:'0.025',start:'2026-11-10T10:10',maxPerWallet:'47'});
    expect(mismatches).toEqual(['Draft public limit is not 10 per wallet.']);
    expect(inspectDraftAgainstApprovedTerms({
      payout:'0x57eE21f9aCFFCBa7F1E8cB51f9b96aFd33b4CB87',
      price:'0.025',start:'2026-11-10T10:10',maxPerWallet:'10'})).toEqual([]);
  });
  it('remains scoped to GO#|O and requires separate approval to transact',()=>{
    expect(()=>approvedGoTerms(8453,contract)).toThrow('scoped');
    expect(()=>approvedGoTerms(1,'0x0000000000000000000000000000000000000001')).toThrow('scoped');
    const x=approvedGoTerms(1,contract);
    expect(x.onChainSaleConfigured).toBe(false);
    expect(x.approvalRequiredForEveryMainnetWrite).toBe(true);
    expect(x.metadataFolderCids).toEqual({presale:null,public:null});
    const ui=readFileSync('src/components/erc721-sale-preparation.tsx','utf8');
    expect(ui).not.toContain('writeContract');
    expect(ui).not.toContain('sendTransaction');
  });
});