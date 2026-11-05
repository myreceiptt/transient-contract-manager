import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';

let db:PGlite;
const contract='0x'+'a'.repeat(40);
const alice='0x'+'b'.repeat(40);
const bob='0x'+'c'.repeat(40);
const q=async(p:Record<string,unknown>)=>{
  const r=await db.query<{result:any}>(
    'select public.tcm_erc721_draft_op($1::jsonb) as result',[JSON.stringify(p)]);
  return r.rows[0].result;
};
const base={chainId:1,contract,actor:alice,kind:'ARTWORK',allowCollection:true};
beforeAll(async()=>{
  db=new PGlite();
  await db.exec("create role anon;create role authenticated;create role service_role;");
  await db.exec(readFileSync('supabase/migrations/20261105110000_erc721_workspace_drafts.sql','utf8'));
});
afterAll(async()=>{await db?.close();});

describe('ERC721 isolated PostgreSQL storage',()=>{
 it('rejects public SQL REST-style reads and function execution under anon',async()=>{
   await db.exec('set role anon');
   try{
     await expect(db.query('select * from public.erc721_workspace_drafts')).rejects.toThrow();
     await expect(db.query("select public.tcm_erc721_draft_op('{}'::jsonb)")).rejects.toThrow();
   }finally{await db.exec('reset role');}
 });
 it('creates append-only revisions, isolates auction sellers and enforces version fences',async()=>{
   const row=await q({...base,action:'create',identity:'11111111-1111-4111-8111-111111111111',
     data:{title:'first'}});
   expect(row.version).toBe(1);
   expect((await q({...base,action:'list'})).length).toBe(1);
   const saved=await q({...base,action:'save',id:row.id,expectedVersion:1,
     data:{title:'second'}});
   expect(saved.version).toBe(2);
   await expect(q({...base,action:'save',id:row.id,expectedVersion:1,
     data:{title:'stale'}})).rejects.toThrow(/VERSION_CONFLICT/);
   const audit=await db.query<{version:number}>(
     'select version from public.erc721_workspace_draft_revisions where draft_id=$1 order by version',
     [row.id]);
   expect(audit.rows.map(v=>v.version)).toEqual([1,2]);
   const auctionBase={chainId:1,contract,actor:alice,kind:'AUCTION',allowCollection:false};
   await q({...auctionBase,action:'create',identity:'42:'+alice,
     data:{tokenId:'42',listingType:'BUY_NOW'}});
   const otherWallet=await q({...auctionBase,action:'list',actor:bob});
   expect(otherWallet).toEqual([]);
   await expect(q({...auctionBase,action:'list',allowCollection:true})).rejects.toThrow(/AUCTION_PRIVATE/);
 });
 it('prevents duplicate primary Mint Page identities and rejects identity changes',async()=>{
   const mint={...base,kind:'MINT_PAGE'};
   await q({...mint,action:'create',identity:'collection',data:{title:'first campaign'}});
   await expect(q({...mint,action:'create',identity:'collection',data:{title:'duplicate'}}))
     .rejects.toThrow();
   await expect(q({...mint,action:'create',identity:'token-1',data:{title:'invalid scope'}}))
     .rejects.toThrow(/MINT_SCOPE|check constraint/);
 });
 it('archives privately without changing on-chain transaction state',async()=>{
   const row=(await q({...base,action:'list'}))[0];
   const archived=await q({...base,action:'archive',id:row.id,expectedVersion:2});
   expect(archived.version).toBe(3);
   expect(archived.archived_at).toBeTruthy();
   expect(await q({...base,action:'list'})).toEqual([]);
   await expect(q({...base,action:'save',id:row.id,expectedVersion:3,data:{title:'test'}}))
     .rejects.toThrow(/DRAFT_ARCHIVED/);
 });
});
