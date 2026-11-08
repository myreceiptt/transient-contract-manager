import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {buildGo721MetadataZip,type ArchiveItem} from '../src/lib/erc721-metadata-zip';
const fixtures=():ArchiveItem[]=>Array.from({length:30},(_,i)=>({
  round:i<3?1:2,file:String(i<3?i:i-3),
  json:Buffer.from(JSON.stringify({name:'Artwork '+(i+1),image:'ipfs://bafyexample',attributes:[]}))
}));
describe('GO#|O local metadata 3+27 ZIP package',()=>{
  it('contains 30 deterministic numbered entries and correct folder assignment',()=>{
    const a=buildGo721MetadataZip(fixtures().reverse());
    const b=buildGo721MetadataZip(fixtures());
    expect(a.sha256).toBe(b.sha256);
    expect(a.zip.equals(b.zip)).toBe(true);
    expect(a.count).toBe(30);
    expect(a.paths.slice(0,3)).toEqual([
      'round-1-presale-3/0','round-1-presale-3/1','round-1-presale-3/2'
    ]);
    expect(a.paths[3]).toBe('round-2-public-27/0');
    expect(a.paths[29]).toBe('round-2-public-27/26');
    expect(a.zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(a.zip.readUInt32LE(a.zip.length-22)).toBe(0x06054b50);
    expect(a.zip.readUInt16LE(a.zip.length-12)).toBe(30);
  });
  it('fails closed on duplicates, missing positions, wrong metadata lengths',()=>{
    expect(()=>buildGo721MetadataZip(fixtures().slice(1))).toThrow('Exactly 30');
    const wrong=fixtures();wrong[2].file='1';
    expect(()=>buildGo721MetadataZip(wrong)).toThrow('unexpected slot');
    const empty=fixtures();empty[11].json=Buffer.from('x');
    expect(()=>buildGo721MetadataZip(empty)).toThrow('unexpected slot');
  });
  it('produces private ZIP after on-chain admin scope and CID/hash check, never publishes',()=>{
    const server=readFileSync('src/server/erc721-metadata-archive.ts','utf8');
    const route=readFileSync('src/app/api/route.ts','utf8');
    const ui=readFileSync('src/components/erc721-sale-preparation.tsx','utf8');
    expect(server).toContain("listErc721Drafts('ARTWORK'");
    const attestation=readFileSync('src/server/go721-artwork-source.ts','utf8');
    expect(server).toContain("verifyGo721ArtworkSource");
    expect(attestation).toContain("verifyCreatorMetadata(draft.metadataUri, bytes)");
    expect(attestation).toContain("validatedMetadata(metadata)");
    expect(server).not.toContain("listRecords('history'");
    expect(server).toContain("pinnedToIpfs:false");
    expect(route).toContain("download_erc721_metadata_archive");
    expect(ui).toContain("Download verified 3+27 metadata folders ZIP");
    expect(ui).toContain('disabled={archiveBusy||!saleTerms}');
    expect(ui).toContain("if(archiveBusy||!authorized||!saleTerms)return;");
    expect(server).not.toContain('writeContract');
    expect(server).not.toContain('pinTokenMetadata');
  });
});