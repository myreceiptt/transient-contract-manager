import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mocked=vi.hoisted(()=>({inspect:vi.fn(),scan:vi.fn(),command:vi.fn()}));
vi.mock('../src/server/erc721-probe',()=>({
  inspectErc721Candidate:mocked.inspect,
  scanErc721Candidates:mocked.scan,
}));
vi.mock('../src/server/db',()=>({command:mocked.command}));
import {archiveErc721Draft,createErc721Draft,erc721DraftAvailability,
  listErc721Drafts,parseErc721Draft,saveErc721Draft} from '../src/server/erc721-drafts';
import {operationBudget} from '../src/server/abuse';

const collection='0x'+'1'.repeat(40);
const admin='0x'+'2'.repeat(40);
const collector='0x'+'3'.repeat(40);
const session=(wallet:string,chainId=1)=>({wallet:wallet as `0x${string}`,chainId});
const sampleArtwork={title:'Original',description:'Unique work',image:'ipfs://bafybeigdyrzt',
  externalUrl:'',metadataUri:'',recipient:''};
const sampleMint={title:'Primary collection drop',description:'',artwork:'',price:'0.01',
 currency:'ETH',payout:'',maxPerWallet:'1',start:'',end:''};
const sampleAuction={tokenId:'1',listingType:'RESERVE_AUCTION',
 payoutReceiver:collector,reserveEth:'0.3',buyNowEth:'',durationHours:'24'};
beforeEach(()=>{
  vi.stubEnv('ERC721_DRAFTS_ENABLED','true');vi.resetAllMocks();
  mocked.inspect.mockResolvedValue({walletRole:'admin'});
  mocked.scan.mockResolvedValue({tokens:[{status:'OWNED',owner:collector}]});
  mocked.command.mockResolvedValue({id:'saved',version:1});
});
afterEach(()=>vi.unstubAllEnvs());

describe('ERC721 server-only draft permissions',()=>{
 it('classifies all new APIs under explicit bounded rate limit buckets',()=>{
   expect(operationBudget('erc721_transfers')).toBe('inventory');
   expect(operationBudget('erc721_royalties')).toBe('public');
   expect(operationBudget('erc721_draft_status')).toBe('public');
   for(const op of ['erc721_draft_list','erc721_draft_get','erc721_draft_create',
     'erc721_draft_save','erc721_draft_archive'])expect(operationBudget(op)).toBe('workspace');
 });
 it('is disabled by default unless the schema was independently enabled',async()=>{
   vi.stubEnv('ERC721_DRAFTS_ENABLED','false');
   expect(erc721DraftAvailability().enabled).toBe(false);
   await expect(listErc721Drafts('ARTWORK',1,collection,session(admin)))
     .rejects.toMatchObject({code:'DRAFTS_NOT_ENABLED',status:503});
   expect(mocked.inspect).not.toHaveBeenCalled();
 });
 it('only accepts strict, bounded editorial data (no arbitrary command fields)',()=>{
   expect(parseErc721Draft('ARTWORK',sampleArtwork)).toMatchObject({title:'Original'});
   expect(()=>parseErc721Draft('ARTWORK',{...sampleArtwork,txHash:'0xdead'})).toThrow();
   expect(()=>parseErc721Draft('MINT_PAGE',{...sampleMint,price:'-1'})).toThrow();
   expect(()=>parseErc721Draft('AUCTION',{...sampleAuction,tokenId:'0'})).toThrow();
 });
 it('rejects a viewer creating or listing collection-wide artwork and mint-page drafts',async()=>{
   mocked.inspect.mockResolvedValue({walletRole:'viewer'});
   await expect(createErc721Draft('ARTWORK',1,collection,sampleArtwork,session(collector)))
     .rejects.toMatchObject({code:'ADMIN_REQUIRED',status:403});
   await expect(listErc721Drafts('MINT_PAGE',1,collection,session(collector)))
     .rejects.toMatchObject({code:'ADMIN_REQUIRED',status:403});
   expect(mocked.command).not.toHaveBeenCalled();
 });
 it('enforces chain-bound SIWE independently of wallet role',async()=>{
   await expect(createErc721Draft('ARTWORK',1,collection,sampleArtwork,session(admin,8453)))
     .rejects.toMatchObject({code:'SESSION_CHAIN',status:403});
   expect(mocked.command).not.toHaveBeenCalled();
 });
 it('treats a primary mint page as one collection-wide identity',async()=>{
   await createErc721Draft('MINT_PAGE',1,collection,sampleMint,session(admin));
   const call=mocked.command.mock.calls.at(-1);
   expect(call?.[0]).toBe('erc721_draft');
   expect(call?.[1]).toMatchObject({identity:'collection',kind:'MINT_PAGE',allowCollection:true,actor:admin});
 });
 it('allows seller-wallet auction drafts but not an admin who does not own the NFT',async()=>{
   mocked.inspect.mockResolvedValue({walletRole:'admin'});
   await expect(createErc721Draft('AUCTION',1,collection,sampleAuction,session(admin)))
     .rejects.toMatchObject({code:'SELLER_NOT_OWNER',status:403});
   expect(mocked.command).not.toHaveBeenCalled();
   mocked.inspect.mockResolvedValue({walletRole:'viewer'});
   await createErc721Draft('AUCTION',1,collection,sampleAuction,session(collector));
   expect(mocked.command).toHaveBeenCalledWith('erc721_draft',expect.objectContaining({
     kind:'AUCTION',identity:'1:'+collector,allowCollection:false,actor:collector,
   }));
 });
 it('requires a fresh ownerOf match on every auction draft update',async()=>{
   mocked.scan.mockResolvedValue({tokens:[{status:'OWNED',owner:admin}]});
   await expect(saveErc721Draft('AUCTION',1,collection,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',1,sampleAuction,session(collector)))
     .rejects.toMatchObject({code:'SELLER_NOT_OWNER'});
   expect(mocked.command).not.toHaveBeenCalled();
 });
 it('forbids archiving the one permanent collection-wide Mint Page identity',async()=>{
   await expect(archiveErc721Draft('MINT_PAGE',1,collection,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',1,session(admin)))
     .rejects.toMatchObject({code:'MINT_PAGE_CANONICAL'});
 });
 it('passes optimistic version precondition to the database and archives without execution',async()=>{
   await saveErc721Draft('ARTWORK',1,collection,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     2,sampleArtwork,session(admin));
   expect(mocked.command).toHaveBeenCalledWith('erc721_draft',
     expect.objectContaining({action:'save',expectedVersion:2,allowCollection:true}));
   await archiveErc721Draft('ARTWORK',1,collection,
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',3,session(admin));
   expect(mocked.command).toHaveBeenCalledWith('erc721_draft',
     expect.objectContaining({action:'archive',expectedVersion:3}));
 });
});
