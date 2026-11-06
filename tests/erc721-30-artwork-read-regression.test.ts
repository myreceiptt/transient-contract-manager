import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
const read=(p:string)=>readFileSync(p,'utf8');
describe('GO#|O regression: 30 original artwork list not truncated by generic 25 limit',()=>{
  it('preserves generic 25-row RPC and performs only bounded mainnet GO#|O direct read',()=>{
    const sql=read('supabase/migrations/20261105110000_erc721_workspace_drafts.sql');
    const db=read('src/server/db.ts');
    expect(sql).toContain('order by updated_at desc,id desc limit 25');
    expect(db).toContain('export async function listGo721ArtworkRows');
    expect(db).toContain("chainId!==1");
    expect(db).toContain("contract.toLowerCase()!=='0x99b8ae3c16559b80424a45c92dd530d50d970a46'");
    expect(db).toContain(".eq('kind','ARTWORK').is('archived_at',null)");
    expect(db).toContain('.limit(31)');
    expect(db).toContain("kind='ARTWORK' and archived_at is null order by updated_at desc,id desc limit 31");
  });
  it('enforces current on-chain Owner/Admin before database read',()=>{
    const server=read('src/server/erc721-drafts.ts');
    const list=server.substring(server.indexOf('export async function listErc721Drafts('),server.indexOf('export async function getErc721Draft('));
    expect(list.indexOf("await scope(kind,chainId,contract,s,'list')"))
      .toBeLessThan(list.indexOf('listGo721ArtworkRows(chainId,contract)'));
    expect(list).toContain("kind==='ARTWORK'");
    const archive=read('src/server/erc721-metadata-archive.ts');
    expect(archive).toContain("listErc721Drafts('ARTWORK',chainId,contract,s)");
    // Fix must apply to the archive ZIP generation too, not only the frontend.
    expect(archive).toContain('const sequence=prepareSequence(raw)');
  });
  it('keeps the official manifest picker visible even before data load',()=>{
    const ui=read('src/components/erc721-sale-preparation.tsx');
    expect(ui).toContain('Advanced verification and technical files (optional)');
    expect(ui).toContain('Verify Official Artwork Order v1');
    expect(ui).toContain('downloadVerifiedFolderArchive');
    expect(ui).toContain('disabled={!loaded||busy}');
    expect(ui).toContain("api('erc721_draft_list'");
    expect(ui).toContain('Download verified 3+27 metadata folders ZIP');
  });
  it('introduces no chain write or database migration',()=>{
    const paths=['src/components/erc721-sale-preparation.tsx','src/server/erc721-drafts.ts'];
    for(const path of paths){
      const source=read(path);
      expect(source).not.toContain('writeContract(');
      expect(source).not.toContain('sendTransaction(');
    }
  });
});
