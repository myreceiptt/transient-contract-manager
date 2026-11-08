import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {prepareSequence,verifyApprovedManifest,exportSalePreparation,GO_SALE_POLICY,type Draft} from '../src/lib/erc721-sale-sequence';
const contract='0x99b8ae3c16559b80424a45c92dd530d50d970a46';
const alphabet='abcdefghijklmnopqrstuvwxyz234567';
function sample():Draft[]{
  return Array.from({length:30},(_,i)=>({
    id:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),
    kind:'ARTWORK',version:1,archived_at:null,
    created_at:'2026-11-06T10:'+String(i).padStart(2,'0')+':00.123456+00:00',
    draft:{title:'Artwork '+(i+1),
      image:'ipfs://bafy'+alphabet[i].repeat(56),
      metadataUri:'ipfs://bafkrei'+alphabet[i].repeat(52)}
  }));
}
function approved(artworks:ReturnType<typeof prepareSequence>){
  return {schema:'prof-nota-go-one-of-one-artwork-order/v1',
    collection:{chainId:1,contract},approval:{status:'OFFCHAIN_ORDER_APPROVED'},artworks};
}
describe('GO#|O 30-artwork source order, off-chain only',()=>{
  it('orders by original created_at and preserves database microseconds',()=>{
    const items=prepareSequence(sample().reverse());
    expect(items[0].position).toBe(1);
    expect(items[0].draftCreatedAtUtc).toBe('2026-11-06T10:00:00.123456Z');
    expect(items[29].position).toBe(30);
  });
  it('maps 3 free and 27 priced positions to local zero-based metadata paths',()=>{
    const items=prepareSequence(sample());
    expect(items.slice(0,3).map(x=>[x.round,x.folderFile])).toEqual([[1,'0'],[1,'1'],[1,'2']]);
    expect(items.slice(3).map(x=>x.folderFile)).toEqual(Array.from({length:27},(_,i)=>String(i)));
    expect(GO_SALE_POLICY.rounds[0]).toMatchObject({supply:3,priceEth:'0',walletLimit:3,allowlistedWalletCount:1});
    expect(GO_SALE_POLICY.rounds[1]).toMatchObject({supply:27,priceEth:'0.025',walletLimit:10});
  });
  it('rejects missing source URI, duplicate CIDs and absent creator records',()=>{
    const a=sample();a[2].draft.metadataUri='';
    expect(()=>prepareSequence(a)).toThrow('JSON CID');
    const b=sample();b[3].draft.image=b[0].draft.image;
    expect(()=>prepareSequence(b)).toThrow('image CID');
    expect(()=>prepareSequence(sample().slice(1))).toThrow('exactly 30');
  });
  it('requires approved original UUID, timestamp and CID with no silent edits',()=>{
    const items=prepareSequence(sample());
    expect(verifyApprovedManifest(approved(items),items,1,contract)).toEqual({approved:true,checked:30});
    const changed=structuredClone(approved(items));changed.artworks[1].draftId=items[2].draftId;
    expect(()=>verifyApprovedManifest(changed,items,1,contract)).toThrow('order mismatch');
    const edited=structuredClone(approved(items));edited.artworks[1].sourceMetadataUri=items[2].sourceMetadataUri;
    expect(()=>verifyApprovedManifest(edited,items,1,contract)).toThrow('CID changed');
    const revised=structuredClone(items);
    revised[1].sourceMetadataUri=items[2].sourceMetadataUri;
    expect(verifyApprovedManifest(approved(items),revised,1,contract,
      {allowUpdatedMetadata:true})).toMatchObject({approved:true,checked:30,metadataChanges:1});
    revised[1].draftId=items[2].draftId;
    expect(()=>verifyApprovedManifest(approved(items),revised,1,contract,
      {allowUpdatedMetadata:true})).toThrow('order mismatch');
  });
  it('never creates an executable on-chain drop or sends transaction',()=>{
    const x=exportSalePreparation(1,contract,prepareSequence(sample()));
    expect(x.onChainSaleConfigured).toBe(false);
    expect(x.metadataFolderCids).toEqual({presale:null,public:null});
    const component=readFileSync('src/components/erc721-sale-preparation.tsx','utf8');
    expect(component).toContain("api('erc721_draft_list'");
    expect(component).not.toContain('sendTransaction');
    expect(component).not.toContain('writeContract');
    expect(component).not.toContain('pinata.cloud');
  });
});