import {beforeEach,describe,expect,it,vi} from 'vitest';
import {keccak256} from 'viem';

const rpc=vi.hoisted(()=>({
  readContract:vi.fn(),getCode:vi.fn(),getBlock:vi.fn(),getChainId:vi.fn()
}));
vi.mock('../src/server/chain',()=>({
  client:()=>rpc,
  exactChain:async()=>{if(await rpc.getChainId()!==8453)throw Error('CHAIN_MISMATCH');}
}));
import {inspectErc721Candidate,scanErc721Candidates,diagnoseErc721Candidate,erc721ProbeAbi,erc721ReadonlySourceBaselines}
  from '../src/server/erc721-probe';
const contract=('0x'+'1'.repeat(40)) as `0x${string}`;
const owner=('0x'+'2'.repeat(40)) as `0x${string}`;
const admin=('0x'+'3'.repeat(40)) as `0x${string}`;
const block=7654321n;
const answers:Record<string,unknown>={
 VERSION:'4.1.2',name:'Gallery 1/1',symbol:'G1',
 owner, getRoleMembers:[admin],hasRole:true,totalSupply:2n
};
beforeEach(()=>{
 answers.VERSION='4.1.2';
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
describe('ERC721TL v3.6.0 and v4.1.2 read-only research path',()=>{
 it('probes compatible version and EIP165 without claiming runtime verification',async()=>{
   const info=await inspectErc721Candidate(8453,contract);
   expect(info.standard).toBe('ERC721');
   expect(info.version).toBe('4.1.2');
   expect(info.totalSupply).toBe('2');
   expect(info.totalSupplyMeaning).toBe('CURRENT_UNBURNED_SUPPLY');
   expect(info.owner).toBe(owner);
   expect(info.transactionSigningEnabled).toBe(false);
   expect(info.walletRole).toBe('not-connected');
   expect(info.walletRoleVerifiedReadOnly).toBe(true);
   expect(info.runtimeVerification).toBe('ABI_COMPATIBLE_UNVERIFIED_RUNTIME');
   expect(info.implementationCodeHash).toBe(keccak256('0x60006000'));
   expect(rpc.readContract).toHaveBeenCalledWith(expect.objectContaining({
     functionName:'totalSupply',blockNumber:block
   }));
   expect(erc721ProbeAbi.map(x=>String(x.name))).not.toContain('mint');
   expect(erc721ProbeAbi.map(x=>String(x.name))).not.toContain('approve');
 });
 it('allows official v3.6.0 for read-only ownership while keeping signing disabled',async()=>{
   answers.VERSION='3.6.0';
   const info=await inspectErc721Candidate(8453,contract,admin);
   expect(info.version).toBe('3.6.0');
   expect(info.totalSupplyMeaning).toBe('MINTED_TOKEN_ID_COUNTER_INCLUDES_BURNED');
   expect(info.sourceCommit).toBe('9063234fb2e4cf5e0459b23a4a1858f496fcf98b');
   expect(info.walletRole).toBe('admin');
   expect(info.transactionSigningEnabled).toBe(false);
   expect(info.runtimeVerification).toBe('ABI_COMPATIBLE_UNVERIFIED_RUNTIME');
   const scan=await scanErc721Candidates(8453,contract,1,3);
   expect(scan.tokens.map(x=>x.status)).toEqual(['OWNED','OWNED','UNKNOWN_OR_BURNED']);
   expect(scan.transactionSigningEnabled).toBe(false);
   expect(erc721ReadonlySourceBaselines['3.6.0'].totalSupplyMeaning)
     .not.toBe(erc721ReadonlySourceBaselines['4.1.2'].totalSupplyMeaning);
 });
 it('detects a distinct ADMIN_ROLE wallet without making it the owner or authorizing writes',async()=>{
   const info=await inspectErc721Candidate(8453,contract,admin);
   expect(info.owner).toBe(owner);
   expect(info.walletRole).toBe('admin');
   expect(info.inspectedWallet).toBe(admin);
   expect(info.transactionSigningEnabled).toBe(false);
   expect(rpc.readContract).toHaveBeenCalledWith(expect.objectContaining({
     functionName:'hasRole',args:expect.arrayContaining([admin]),blockNumber:block
   }));
 });
  it('rejects an interface-compatible contract with an incorrect version',async()=>{
   answers.VERSION='4.1.0';
   await expect(inspectErc721Candidate(8453,contract)).rejects.toThrow('ERC721TL 3.6.0 / 4.1.2');
   answers.VERSION='4.1.2';
 });
 it('diagnoses a different reported ERC721TL version without enabling its runtime',async()=>{
   answers.VERSION='4.1.0';
   const report=await diagnoseErc721Candidate(8453,contract);
   expect(report.version).toBe('4.1.0');
   expect(report.erc721Interface).toBe(true);
   expect(report.erc1155Interface).toBe(false);
   expect(report.inspectorMatch).toBe(false);
   expect(report.mismatchReasons).toContain(
     'Reported VERSION 4.1.0 is not in read-only baselines 3.6.0 / 4.1.2');
   expect(report.implementationCodeHash).toBe(keccak256('0x60006000'));
   expect(report.runtimeVerification).toBe('UNVERIFIED');
   expect(report.transactionSigningEnabled).toBe(false);
 });
 it('reports failed VERSION reads distinctly, not as a fake unsupported standard',async()=>{
   rpc.readContract.mockImplementation(async ({functionName,args}:any)=>{
     if(functionName==='VERSION')throw Error('VERSION_NOT_FOUND');
     if(functionName==='supportsInterface')return args?.[0]==='0x80ac58cd';
     if(functionName==='totalSupply')return 2n;
     return answers[functionName];
   });
   const report=await diagnoseErc721Candidate(8453,contract);
   expect(report.version).toBeNull();
   expect(report.erc721Interface).toBe(true);
   expect(report.mismatchReasons).toContain('VERSION() could not be read: absent or reverted');
   expect(report.transactionSigningEnabled).toBe(false);
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
   expect(path).toContain("op === 'diagnose_erc721'");
   expect(path).toContain("op === 'scan_erc721'");
   expect(path).toContain("op === 'prepare_erc721_mint'");
    expect(path).toContain("@/server/erc721-creator-mint");
   expect(path).not.toContain("op === 'create_auction'");
   expect(impl).not.toContain('writeContract');
   expect(impl).not.toContain('simulateContract');
   expect(ui).toContain('RUNTIME UNVERIFIED');
   expect(ui).toContain('Read 12 Token IDs');
   expect(ui).toContain('useState(1)');
   expect(ui).toContain("Number(query.get('chain')||1)");
   expect(ui).toContain('Your on-chain role (read-only)');
   expect(ui).toContain('Ethereum Mainnet');
 });
});
