import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {GO721_FOLDERS,GO721_CAMPAIGN_KEY} from '../src/lib/go721-launch';
import {GO_APPROVED_TERMS} from '../src/lib/erc721-sale-terms';
import {GO721_LATEST_SAME_DAY_START_SECONDS,planGo721Drop} from '../src/lib/go721-sale-plan';
import {expectedGo721Drop} from '../src/server/go721-launch-state';
const original=Math.floor(Date.parse('2026-11-10T10:10:00+07:00')/1000);
const next=Math.floor(Date.parse('2026-11-10T11:30:00+07:00')/1000);
function first(start:number){return planGo721Drop({round:1,metadataBaseUri:GO721_FOLDERS[1],
  historicalTokenCounterVerified:true,round1StartSeconds:start});}
describe('GO#|O same-day late presale is review-only and explicit',()=>{
  it('preserves historical campaign target and accepts an exact revised same-day start',()=>{
    expect(GO_APPROVED_TERMS.presaleStartWib).toBe('2026-11-10T10:10:00+07:00');
    const planned=first(next);
    expect(planned.startTime).toBe(BigInt(next));
    expect(planned).toMatchObject({baseUri:GO721_FOLDERS[1],initialSupply:3n,supply:3n,
      allowance:0n,presaleCost:0n,presaleDuration:86400n,publicDuration:0n});
    expect(expectedGo721Drop(1,next)).toEqual(planned);
  });
  it('never accepts the preceding date, next day or a noninteger timestamp',()=>{
    expect(()=>first(original-1)).toThrow('10 November 2026');
    expect(()=>first(Math.floor(Date.parse('2026-11-09T23:59:00+07:00')/1000))).toThrow();
    expect(()=>first(Math.floor(Date.parse('2026-11-11T00:00:00+07:00')/1000))).toThrow();
    expect(()=>first(next+0.5)).toThrow();
    expect(first(GO721_LATEST_SAME_DAY_START_SECONDS).startTime)
      .toBe(BigInt(GO721_LATEST_SAME_DAY_START_SECONDS));
  });
  it('keeps 27 public terms and both final IPFS CIDs unchanged',()=>{
    expect(GO721_FOLDERS).toEqual({
      1:'ipfs://bafybeigwxzrvb4qh5asn4fuw3gvo3vk5g47eph32l4y3oyc5l4m7tnzhsm',
      2:'ipfs://bafybeiclzrvhrjjwtdmbcc7qcvzeomoxpajzjcbyfxi3gnpyzwknmwrofm'});
    const pub=expectedGo721Drop(2,1794400000);
    expect(pub.initialSupply).toBe(27n);
    expect(pub.allowance).toBe(10n);
    expect(pub.publicCost).toBe(25000000000000000n);
    expect(GO721_CAMPAIGN_KEY).toMatch(/^0x[0-9a-f]{64}$/);
  });
  it('requires fresh fixed presale timestamp and keeps distinct wallet approval',()=>{
    const api=readFileSync('src/server/go721-transactions.ts','utf8');
    const ui=readFileSync('src/components/go721-launch-panel.tsx','utf8');
    expect(api).toContain('BigInt(start) < s.block.timestamp + 300n');
    expect(api).toContain('BigInt(start) > s.block.timestamp + 3600n');
    expect(api).toContain('expectedGo721Drop(1, start)');
    expect(api).toContain("GO721_APPROVAL_REQUIRED");
    expect(api).toContain("process.env.GO721_TRANSACTION_APPROVAL");
    expect(api).toContain("process.env.GO721_CHECKOUT_APPROVAL");
    expect(ui).toContain("startTime: Number(state.proposedPresaleStart)");
    expect(ui).toContain("state.proposedPresaleStart");
    expect(ui).not.toContain("onClick={() => void run({ type: 'configure', round: 1 })}");
  });
});