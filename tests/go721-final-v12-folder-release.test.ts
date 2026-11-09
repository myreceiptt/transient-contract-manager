import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {keccak256,stringToHex} from 'viem';
import {GO_APPROVED_TERMS} from '../src/lib/erc721-sale-terms';
import {GO721_FOLDERS,GO721_CAMPAIGN_KEY,GO721_RUNTIME,GO721_DRAFT_ID} from '../src/lib/go721-launch';
import {expectedGo721Drop} from '../src/server/go721-launch-state';

const presale='ipfs://bafybeigwxzrvb4qh5asn4fuw3gvo3vk5g47eph32l4y3oyc5l4m7tnzhsm';
const publicFolder='ipfs://bafybeiclzrvhrjjwtdmbcc7qcvzeomoxpajzjcbyfxi3gnpyzwknmwrofm';
const previous={
  1:'ipfs://bafybeie5uy556z3ba4wkwe2domvbpsprozhcliqz35dza3k4bk27cswyfu',
  2:'ipfs://bafybeiasexly6h7rzmfhrqptcjq5hroiycwljllt5vmbaccfos74lc7ds4',
} as const;

describe('GO#|O approved final 30 metadata paths, canonical Mint Page v12',()=>{
  it('pins exactly the two independently audited and saved immutable 3+27 folder CIDs',()=>{
    expect(GO721_FOLDERS).toEqual({1:presale,2:publicFolder});
    expect(GO721_DRAFT_ID).toBe('4b1754ec-ca94-492f-aca5-d2aa69394781');
    expect(GO721_FOLDERS[1]).not.toBe(previous[1]);
    expect(GO721_FOLDERS[2]).not.toBe(previous[2]);
  });
  it('uses v12 folder CIDs in both separately configured TLStacks721 drop structs',()=>{
    const first=expectedGo721Drop(1);
    expect(first).toMatchObject({baseUri:presale,initialSupply:3n,supply:3n,
      presaleCost:0n,publicCost:0n,allowance:0n});
    expect(first.startTime).toBe(1794280200n); // 10 Nov 2026, 10:10 WIB
    const second=expectedGo721Drop(2,1794400000);
    expect(second).toMatchObject({baseUri:publicFolder,initialSupply:27n,supply:27n,
      allowance:10n,publicCost:25000000000000000n});
  });
  it('invalidates all approvals prepared for earlier archived folder CIDs',()=>{
    const oldKey=keccak256(stringToHex(JSON.stringify({
      terms:GO_APPROVED_TERMS,folders:previous,runtime:GO721_RUNTIME,
      presaleDuration:86400,
    })));
    expect(GO721_CAMPAIGN_KEY).toMatch(/^0x[0-9a-f]{64}$/);
    expect(GO721_CAMPAIGN_KEY).not.toBe(oldKey);
    const launch=readFileSync('src/server/go721-launch-state.ts','utf8');
    expect(launch).toContain('d.presaleMetadataBaseUri !== GO721_FOLDERS[1]');
    expect(launch).toContain('d.publicMetadataBaseUri !== GO721_FOLDERS[2]');
    expect(launch).toContain("throw new AppError('GO721_DRAFT_CHANGED'");
  });
  it('keeps Mainnet signing, drop configuration and checkout behind explicit scoped approval',()=>{
    const tx=readFileSync('src/server/go721-transactions.ts','utf8');
    expect(tx).toContain("process.env.GO721_TRANSACTION_APPROVAL");
    expect(tx).toContain("process.env.GO721_CHECKOUT_APPROVAL");
    expect(tx).toContain("z.literal(GO721_CAMPAIGN_KEY)");
    expect(tx).toContain("GO721_APPROVAL_REQUIRED");
    expect(tx).toContain("GO721_START_PASSED");
    const pin=readFileSync('src/lib/go721-launch.ts','utf8');
    expect(pin).not.toContain('writeContract(');
    expect(pin).not.toContain('sendTransaction(');
  });
});
