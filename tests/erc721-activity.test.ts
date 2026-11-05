import {beforeEach,describe,expect,it,vi} from 'vitest';
const st=vi.hoisted(()=>({
  client:{getChainId:vi.fn(),getLogs:vi.fn()},
  inspect:vi.fn(),
}));
vi.mock('../src/server/chain',()=>({
  client:()=>st.client,
  exactChain:async()=>{if(await st.client.getChainId()!==1)throw Error('WRONG_CHAIN')},
}));
vi.mock('../src/server/erc721-probe',()=>({inspectErc721Candidate:st.inspect}));
import {readErc721Transfers} from '../src/server/erc721-activity';

const contract=('0x'+'a'.repeat(40)) as `0x${string}`;
const wallet=('0x'+'b'.repeat(40)) as `0x${string}`;
const tx=('0x'+'c'.repeat(64)) as `0x${string}`;
beforeEach(()=>{
  vi.resetAllMocks();
  st.client.getChainId.mockResolvedValue(1);
  st.inspect.mockResolvedValue({observedBlock:'28000000'});
  st.client.getLogs.mockResolvedValue([
    {args:{from:'0x0000000000000000000000000000000000000000',to:wallet,tokenId:1n},
      blockNumber:27999500n,transactionHash:tx,logIndex:0},
    {args:{from:wallet,to:contract,tokenId:1n},
      blockNumber:27999600n,transactionHash:tx,logIndex:1},
  ]);
});
describe('ERC721 activity bounded observer',()=>{
  it('reads at most 1000 blocks without indexing unrelated contracts',async()=>{
    const result=await readErc721Transfers(1,contract);
    expect(result.events).toHaveLength(2);
    expect(result.events.map((x:any)=>x.type)).toEqual(['TRANSFER','MINT']);
    expect(result.window).toEqual({from:'27999001',to:'28000000'});
    expect(result.completeCollectionHistory).toBe(false);
    expect(result.nextBeforeBlock).toBe('27999000');
    expect(st.client.getLogs).toHaveBeenCalledWith(expect.objectContaining({
      address:contract,fromBlock:27999001n,toBlock:28000000n,strict:true,
    }));
  });
  it('paginates previous windows without refetching the newest block',async()=>{
    const result=await readErc721Transfers(1,contract,27999000n,5n);
    expect(result.window).toEqual({from:'27998001',to:'27999000'});
    expect(st.client.getLogs).toHaveBeenCalledWith(expect.objectContaining({
      args:{tokenId:5n},fromBlock:27998001n,toBlock:27999000n,
    }));
  });
  it('does not claim complete history when 100-event limit truncates a window',async()=>{
    st.client.getLogs.mockResolvedValueOnce(Array.from({length:101},(_,i)=>({
      args:{from:wallet,to:contract,tokenId:BigInt(i+1)},
      blockNumber:27999001n,transactionHash:tx,logIndex:i,
    })));
    const result=await readErc721Transfers(1,contract);
    expect(result.events).toHaveLength(100);
    expect(result.capped).toBe(true);
    expect(result.nextBeforeBlock).toBeNull();
    expect(result.completeCollectionHistory).toBe(false);
  });
  it('rejects unsupported networks and invalid cursors before RPC calls',async()=>{
    await expect(readErc721Transfers(8453,contract)).rejects.toMatchObject({code:'ERC721_ACTIVITY_CHAIN'});
    await expect(readErc721Transfers(1,contract,0n)).rejects.toMatchObject({code:'ERC721_ACTIVITY_BLOCK'});
    expect(st.client.getLogs).not.toHaveBeenCalled();
  });
});
