import { describe,expect,it } from 'vitest';
import { readFileSync } from 'node:fs';
import { collectionProfileDataSchema } from '../src/server/collection-profile';

const manager=readFileSync('src/components/manager.tsx','utf8');
const token=readFileSync('src/components/token-studio.tsx','utf8');
const settings=readFileSync('src/components/collection-settings.tsx','utf8');
const actions=readFileSync('src/components/admin-actions.tsx','utf8');
const migration=readFileSync('supabase/migrations/20261101110000_collection_profile_versioned.sql','utf8');
describe('Creator studios and Collection Control Center',()=>{
 it('uses context-aware token catalogue and preserves wallet review',()=>{
   expect(manager).toContain('<TokenStudio');
   expect(manager).toContain('<CollectionSettings');
   expect(token).toContain('Where every edition begins.');
   expect(token).toContain('Create Token');
   expect(token).toContain('Create Batch');
   expect(token).toContain('Manage Token');
   expect(token).toContain('Back to NFT Editions');
   expect(token).toContain('onOpenMintPages');
   expect(token).toContain('onDirtyChange');
   expect(actions).toContain('fixedAction');
   expect(actions).toContain('lockedTokenId');
   expect(actions).toContain("info.canWrite ? 'prepare_admin' : 'preview_admin'");
   expect(actions).not.toContain('On mainnet these controls provide simulation only');
 });
 it('separates token-specific and collection-wide controls',()=>{
   expect(settings).toContain('The foundation of every edition.');
   expect(settings).toContain('Collection Identity');
   expect(settings).toContain('Collection Profile');
   expect(settings).toContain('Ownership & Access');
   expect(settings).toContain('Collection Royalties');
   expect(settings).toContain('Stacks Mint Permission');
   expect(settings).toContain('Advanced On-chain Information');
   expect(settings).toContain('info.defaultRoyalty');
   expect(settings).toContain('fixedAction="setDefaultRoyalty"');
   expect(settings).toContain('fixedAction="approveStacks"');
 });
 it('rejects invalid collection profile values before database or IPFS writes',()=>{
   const allowed={description:'Artist & collective profile',logo:'ipfs://bafybeigdyrzt',
     banner:'',website:'https://example.org',x:'',instagram:'',profileUri:''};
   expect(collectionProfileDataSchema.parse(allowed)).toEqual(allowed);
   expect(()=>collectionProfileDataSchema.parse({...allowed,website:'javascript:alert(1)'})).toThrow();
   expect(()=>collectionProfileDataSchema.parse({...allowed,logo:'javascript:alert(1)'})).toThrow();
   expect(()=>collectionProfileDataSchema.parse({...allowed,unexpected:'bad'})).toThrow();
   expect(()=>collectionProfileDataSchema.parse({...allowed,description:'x'.repeat(6001)})).toThrow();
 });
 it('restricts profile RPC to service role and audits version-fenced writes',()=>{
   expect(migration).toContain('security invoker');
   expect(migration).toContain('PROFILE_VERSION_CONFLICT');
   expect(migration).toContain("COLLECTION_PROFILE_UPDATED");
   expect(migration).toContain('from public,anon,authenticated,service_role');
   expect(migration).toContain('to service_role');
 });
});
