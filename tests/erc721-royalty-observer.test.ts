import {beforeEach,describe,expect,it,vi} from 'vitest';
const st=vi.hoisted(()=>({
  c:{getChainId:vi.fn(),readContract:vi.fn()},
  inspect:vi.fn(),
}));
vi.mock('../src/server/chain',()=>({
  client:()=>st.c,
  exactChain:async()=>{if(await st.c.getChainId()!==1)throw Error('WRONG_CHAIN')},
}));
vi.mock('../src/server/erc721-probe',()=>({inspectErc721Candidate:st.inspect}));
import {readErc721Royalties} from '../src/server/erc721-royalty-observer';

const nft=('0x'+'a'.repeat(40)) as `0x${string}`;
const collector=('0x'+'b'.repeat(40)) as `0x${string}`;
const recipient=('0x'+'c'.repeat(40)) as `0x${string}`;
beforeEach(()=>{
  vi.resetAllMocks();
  st.c.getChainId.mockResolvedValue(1);
  st.inspect.mockResolvedValue({version:'4.1.2',observedBlock:'28000000'});
  st.c.readContract.mockImplementation(async({functionName}:any)=>{
    if(functionName==='supportsInterface')return true;
    if(functionName==='getDefaultRoyaltyRecipientAndPercentage')return [recipient,500n];
    if(functionName==='ownerOf')return collector;
    if(functionName==='royaltyInfo')return [recipient,700n];
  });
});
describe('ERC721 v4.1.2 read-only royalties',()=>{
  it('reads default royalty at one observed block without a signed transaction',async()=>{
    const result=await readErc721Royalties(1,nft);
    expect(result.defaultRoyalty).toMatchObject({recipient,basisPoints:'500'});
    expect(result.token).toBeNull();
    expect(result.signingEnabled).toBe(false);
    expect(st.c.readContract).toHaveBeenCalledWith(expect.objectContaining({
      address:nft,functionName:'getDefaultRoyaltyRecipientAndPercentage',blockNumber:28000000n
    }));
  });
  it('checks token existence and computes effective ERC2981 rate from a sample',async()=>{
    const result=await readErc721Royalties(1,nft,12n);
    expect(result.token).toMatchObject({tokenId:'12',owner:collector,receiver:recipient,
      effectiveBasisPoints:'700',sampleSalePriceWei:'10000'});
    expect(st.c.readContract).toHaveBeenCalledWith(expect.objectContaining({
      functionName:'royaltyInfo',args:[12n,10000n],blockNumber:28000000n,
    }));
  });
  it('fails closed on unpinned versions, disabled interfaces and implausible royalty rates',async()=>{
    st.inspect.mockResolvedValueOnce({version:'3.6.0',observedBlock:'28000000'});
    await expect(readErc721Royalties(1,nft)).rejects.toMatchObject({code:'ROYALTY_VERSION'});
    st.c.readContract.mockImplementationOnce(async()=>false);
    await expect(readErc721Royalties(1,nft)).rejects.toMatchObject({code:'ROYALTY_INTERFACE'});
    st.c.readContract.mockImplementation(async({functionName}:any)=>{
      if(functionName==='supportsInterface')return true;
      if(functionName==='getDefaultRoyaltyRecipientAndPercentage')return [recipient,2000n];
    });
    await expect(readErc721Royalties(1,nft)).rejects.toMatchObject({code:'ROYALTY_UNEXPECTED'});
  });
  it('rejects cross-chain or nonsensical Token IDs before any RPC reads',async()=>{
    await expect(readErc721Royalties(8453,nft)).rejects.toMatchObject({code:'ROYALTY_CHAIN'});
    await expect(readErc721Royalties(1,nft,0n)).rejects.toMatchObject({code:'ROYALTY_TOKEN'});
    expect(st.inspect).not.toHaveBeenCalled();
  });
});
