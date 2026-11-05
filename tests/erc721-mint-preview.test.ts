import {beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
const mocked=vi.hoisted(()=>({
  inspector:vi.fn(),readContract:vi.fn(),simulateContract:vi.fn(),getChainId:vi.fn(),
}));
vi.mock('../src/server/erc721-probe',()=>({
  inspectErc721Candidate:mocked.inspector,
}));
vi.mock('../src/server/chain',()=>({
  client:()=>mocked,
  exactChain:async()=>{if(await mocked.getChainId()!==1)throw Error('CHAIN_MISMATCH')},
}));
import { previewErc721Mint,MAINNET_ERC721_V412_IMPLEMENTATION,
  OBSERVED_V412_IMPLEMENTATION_CODEHASH,mintDryRunAbi } from '../src/server/erc721-mint-preview';
const contract=('0x'+'1'.repeat(40)) as `0x${string}`;
const admin=('0x'+'2'.repeat(40)) as `0x${string}`;
const recipient=('0x'+'3'.repeat(40)) as `0x${string}`;
const uri='ipfs://bafybeigdyrztgaklr7sh3gvwksdpfpfdf3cbe3x5v7s4sqjh3h4pb3uvna';
beforeEach(()=>{
  vi.clearAllMocks();
  mocked.getChainId.mockResolvedValue(1);
  mocked.readContract.mockResolvedValue(false);
  mocked.simulateContract.mockResolvedValue({result:undefined});
  mocked.inspector.mockResolvedValue({
    chainId:1,contract,version:'4.1.2',
    proxy:true,implementation:MAINNET_ERC721_V412_IMPLEMENTATION,
    implementationCodeHash:OBSERVED_V412_IMPLEMENTATION_CODEHASH,
    walletRole:'admin',observedBlock:'26332646',
    transactionSigningEnabled:false,
  });
});
describe('ERC721TL mainnet mint dry-run: no wallet signing path',()=>{
 it('previews admin mint at the observed Ethereum block only',async()=>{
   const out=await previewErc721Mint(1,contract,admin,recipient,uri);
   expect(out).toMatchObject({simulation:'PASSED',reviewStatus:'PREVIEW_ONLY',
     transactionSigningEnabled:false,role:'admin',recipient,observedBlock:'26332646'});
   expect(mocked.simulateContract).toHaveBeenCalledWith(expect.objectContaining({
     address:contract,account:admin,functionName:'mint',args:[recipient,uri],
     blockNumber:26332646n,
   }));
   expect(mintDryRunAbi.map(x=>String(x.name))).toContain('mint');
   expect(readFileSync('src/app/api/route.ts','utf8')).not.toContain("op === 'submit_erc721_mint'");
 });
 it('does not simulate with unverified clone implementation or mismatched hash',async()=>{
   mocked.inspector.mockResolvedValueOnce({
     version:'4.1.2',proxy:true,implementation:contract,
     implementationCodeHash:OBSERVED_V412_IMPLEMENTATION_CODEHASH,
     walletRole:'admin',observedBlock:'26332646'
   });
   await expect(previewErc721Mint(1,contract,admin,recipient,uri)).rejects.toThrow('runtime');
   mocked.inspector.mockResolvedValueOnce({
     version:'4.1.2',proxy:true,implementation:MAINNET_ERC721_V412_IMPLEMENTATION,
     implementationCodeHash:'0x'+'0'.repeat(64),
     walletRole:'admin',observedBlock:'26332646'
   });
   await expect(previewErc721Mint(1,contract,admin,recipient,uri)).rejects.toThrow('runtime');
   expect(mocked.simulateContract).not.toHaveBeenCalled();
 });
 it('enforces owner/admin privileges and permanent supply lock',async()=>{
   mocked.inspector.mockResolvedValueOnce({
     version:'4.1.2',proxy:true,implementation:MAINNET_ERC721_V412_IMPLEMENTATION,
     implementationCodeHash:OBSERVED_V412_IMPLEMENTATION_CODEHASH,
     walletRole:'viewer',observedBlock:'26332646'
   });
   await expect(previewErc721Mint(1,contract,admin,recipient,uri)).rejects.toThrow('ADMIN_ROLE');
   mocked.readContract.mockResolvedValueOnce(true);
   await expect(previewErc721Mint(1,contract,admin,recipient,uri)).rejects.toThrow('locked');
   expect(mocked.simulateContract).not.toHaveBeenCalled();
 });
 it('rejects wrong chain, unsafe URI and whitespace metadata',async()=>{
   await expect(previewErc721Mint(8453,contract,admin,recipient,uri)).rejects.toThrow('Mainnet');
   await expect(previewErc721Mint(1,contract,admin,recipient,'https://untrusted.example/a.json')).rejects.toThrow('IPFS');
   await expect(previewErc721Mint(1,contract,admin,recipient,uri+' ')).rejects.toThrow('IPFS');
   expect(mocked.simulateContract).not.toHaveBeenCalled();
 });
 it('preserves ERC1155 credential and exact role authorization for its existing operations',()=>{
   const sign=readFileSync('src/app/api/media-upload/sign/route.ts','utf8');
   expect(sign).toContain("args.standard==='ERC721TL'");
   expect(sign).toContain('await authorize(args.chainId, args.contract, s.wallet)');
   const api=readFileSync('src/app/api/route.ts','utf8');
   expect(api).toContain("op === 'metadata_pin_erc721'");
   expect(api).toContain("op === 'preview_erc721_mint'");
   expect(api).toContain('requireSessionChain(s,args.chainId)');
   expect(api).not.toContain("op === 'submit_erc721_mint'");
 });
});
