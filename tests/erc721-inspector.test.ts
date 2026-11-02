import {beforeEach,describe,expect,it,vi} from 'vitest';
import {keccak256} from 'viem';

const rpc=vi.hoisted(()=>({
  readContract:vi.fn(),getCode:vi.fn(),getBlock:vi.fn(),getChainId:vi.fn()
}));
vi.mock('../src/server/chain',()=>({
  client:()=>rpc,
  exactChain:async()=>{if(await rpc.getChainId()!==8453)throw Error('CHAIN_MISMATCH');}
}));
import {inspectErc721Candidate,scanErc721Candidates,erc721ProbeAbi}
  from '../src/server/erc721-probe';
const contract=('0x'+'1'.repeat(40)) as `0x${string}`;
const owner=('0x'+'2'.repeat(40)) as `0x${string}`;
const admin=('0x'+'3'.repeat(40)) as `0x${string}`;
const block=7654321n;
const answers:Record<string,unknown>={
 VERSION:'4.1.2',name:'Gallery 1/1',symbol:'G1',
 owner, getRoleMembers:[admin],totalSupply:2n
};
beforeEach(()=>{
 rpc.getChainId.mockReset().mockResolvedValue(8453);
 rpc.getCode.mockReset().mockResolvedValue('0x60006000');
 rpc.getBlock.mockReset().mockResolvedValue({number:block,hash:'0x'+'f'.repeat(64)});
 rpc.readContract.mockReset().mockImplementation(async ({functionName,args,blockNumber}:any)=>{
   if(blockNumber!==block)throw Error('INCONSISTENT_BLOCK');
   if(functionName==='supportsInterface')return args?.[0]==='0x80ac58cd';
   if(functionName==='ownerOf'){
     if(args?.[0]===3n)throw Error('TOKEN_BURNED_OR_NONEXISTENT');
     return owner;
   }
   if(functionName==='tokenURI'){
     if(args?.[0]===2n)throw Error('URI_UNAVAILABLE');
     return 'ipfs://bafybeign7onboarding/1';
   }
   return answers[functionName];
 });
});
describe('ERC721TL v4.1.2 read-only research path',()=>{
 it('probes compatible version and EIP165 without claiming runtime verification',async()=>{
   const info=await inspectErc721Candidate(8453,contract);
   expect(info.standard).toBe('ERC721');
   expect(info.version).toBe('4.1.2');
   expect(info.totalSupply).toBe('2');
   expect(info.owner).toBe(owner);
   expect(info.transactionSigningEnabled).toBe(false);
   expect(info.runtimeVerification).toBe('ABI_COMPATIBLE_UNVERIFIED_RUNTIME');
   expect(info.implementationCodeHash).toBe(keccak256('0x60006000'));
   expect(rpc.readContract).toHaveBeenCalledWith(expect.objectContaining({
     functionName:'totalSupply',blockNumber:block
   }));
   expect(erc721ProbeAbi.map(x=>String(x.name))).not.toContain('mint');
   expect(erc721ProbeAbi.map(x=>String(x.name))).not.toContain('approve');
 });
 it('rejects an interface-compatible contract with an incorrect version',async()=>{
   answers.VERSION='4.1.0';
   await expect(inspectErc721Candidate(8453,contract)).rejects.toThrow('ERC721TL 4.1.2');
   answers.VERSION='4.1.2';
 });
 it('does not treat existing token counts as maximum Token ID or missing tokens as balances',async()=>{
   const scan=await scanErc721Candidates(8453,contract,1,3);
   expect(scan.tokens.map(x=>x.status)).toEqual(['OWNED','OWNED','UNKNOWN_OR_BURNED']);
   expect(scan.tokens[0]).toMatchObject({tokenId:'1',owner,metadataStatus:'OK'});
   expect(scan.tokens[1]).toMatchObject({tokenId:'2',owner,tokenUri:null,metadataStatus:'UNAVAILABLE'});
   expect(scan.tokens[2]).not.toHaveProperty('owner');
   expect(scan.transactionSigningEnabled).toBe(false);
   expect(scan.observedBlock).toBe(String(block));
   expect(rpc.readContract.mock.calls.every(([call])=>call.blockNumber===block)).toBe(true);
 });
 it('bounds token probing and rejects wrong RPC chain',async()=>{
   await expect(scanErc721Candidates(8453,contract,1,100)).rejects.toThrow('12 IDs');
   rpc.getChainId.mockResolvedValue(1);
   await expect(inspectErc721Candidate(8453,contract)).rejects.toThrow('CHAIN_MISMATCH');
 });
 it('does not attach ERC721 candidate to the live ERC1155 write-authorized adapter',async()=>{
   const {readFileSync}=await import('node:fs');
   const path=readFileSync('src/app/api/route.ts','utf8');
   const impl=readFileSync('src/server/erc721-probe.ts','utf8');
   const ui=readFileSync('src/components/erc721-inspector.tsx','utf8');
   expect(path).toContain("op === 'inspect_erc721'");
   expect(path).toContain("op === 'scan_erc721'");
   expect(path).not.toContain("op === 'prepare_erc721_mint'");
   expect(path).not.toContain("op === 'create_auction'");
   expect(impl).not.toContain('writeContract');
   expect(impl).not.toContain('simulateContract');
   expect(ui).toContain('RUNTIME UNVERIFIED');
   expect(ui).toContain('Read 12 Token IDs');
 });
});
