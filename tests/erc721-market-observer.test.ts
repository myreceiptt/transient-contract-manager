import {beforeEach,describe,expect,it,vi} from 'vitest';
const rpc=vi.hoisted(()=>({
  getChainId:vi.fn(),getCode:vi.fn(),readContract:vi.fn()
}));
const inspector=vi.hoisted(()=>vi.fn());
vi.mock('../src/server/chain',()=>({
  client:()=>rpc,
  exactChain:async()=>{if(await rpc.getChainId()!==1)throw Error('wrong chain')}
}));
vi.mock('../src/server/erc721-probe',()=>({inspectErc721Candidate:inspector}));
import {readErc721MarketStatus,TLSTACKS721_V231,TLAUCTIONHOUSE_V261}
  from '../src/server/erc721-market-observer';
const collection=('0x'+'1'.repeat(40)) as `0x${string}`;
const seller=('0x'+'2'.repeat(40)) as `0x${string}`;
const empty=('0x'+'0'.repeat(40)) as `0x${string}`;
beforeEach(()=>{
  vi.clearAllMocks();
  rpc.getChainId.mockResolvedValue(1);
  rpc.getCode.mockResolvedValue('0x60006000');
  inspector.mockResolvedValue({version:'4.1.2',observedBlock:'26332646',
    runtimeVerification:'ABI_COMPATIBLE_UNVERIFIED_RUNTIME'});
  rpc.readContract.mockImplementation(async({address,functionName}:any)=>{
    if(functionName==='VERSION')return address.toLowerCase()===TLSTACKS721_V231?'2.3.1':'2.6.1';
    if(functionName==='getDropPhase')return 0;
    if(functionName==='getDropRound')return 0n;
    if(functionName==='getListing')return {
      type_:0,zeroProtocolFee:false,seller:empty,payoutReceiver:empty,
      currencyAddress:empty,openTime:0n,reservePrice:0n,buyNowPrice:0n,
      startTime:0n,duration:0n,recipient:empty,highestBidder:empty,
      highestBid:0n,id:0n,
    };
    if(functionName==='getNextBid')return 0n;
    throw Error('unexpected method '+functionName);
  });
});
describe('ERC721 mainnet sale/auction status remains read-only',()=>{
 it('reads collection-scoped 721 drop and protocol state without signing',async()=>{
   const x=await readErc721MarketStatus(1,collection);
   expect(x.sale).toMatchObject({status:'READ_OK',version:'2.3.1',
     scope:'ONE_DROP_PER_COLLECTION',phaseLabel:'Not configured',round:'0'});
   expect(x.auction).toMatchObject({status:'READ_OK',version:'2.6.1',
     scope:'ONE_LISTING_PER_NFT',listing:null});
   expect(x.transactionSigningEnabled).toBe(false);
   expect(rpc.readContract).toHaveBeenCalledWith(expect.objectContaining({
     functionName:'getDropPhase',args:[collection],blockNumber:26332646n
   }));
 });
 it('does not identify empty auction struct as active listing',async()=>{
   const x=await readErc721MarketStatus(1,collection,1n);
   expect(x.auction.listing).toEqual({configured:false,type:0});
   expect(rpc.readContract.mock.calls.some(([arg])=>arg.functionName==='getNextBid')).toBe(false);
 });
 it('reads occupied listing with exact token id and no transaction ability',async()=>{
   rpc.readContract.mockImplementation(async({address,functionName}:any)=>{
     if(functionName==='VERSION')return address.toLowerCase()===TLSTACKS721_V231?'2.3.1':'2.6.1';
     if(functionName==='getDropPhase')return 1;
     if(functionName==='getDropRound')return 4n;
     if(functionName==='getNextBid')return 110n;
     if(functionName==='getListing')return {
       type_:2,zeroProtocolFee:false,seller,payoutReceiver:seller,
       currencyAddress:empty,openTime:99n,reservePrice:100n,buyNowPrice:0n,
       startTime:120n,duration:600n,recipient:empty,highestBidder:seller,
       highestBid:100n,id:7n,
     };
     throw Error('unexpected');
   });
   const x=await readErc721MarketStatus(1,collection,47n);
   expect(x.sale.round).toBe('4');
   expect(x.auction.listing).toMatchObject({configured:true,typeLabel:'Reserve auction',
     seller,highestBid:'100',nextBid:'110',id:'7'});
   expect(x.transactionSigningEnabled).toBe(false);
 });
 it('fails closed for wrong version or unavailable RPC',async()=>{
   rpc.readContract.mockImplementation(async({address,functionName}:any)=>{
     if(functionName==='VERSION')return address.toLowerCase()===TLSTACKS721_V231?'2.4.0':'2.6.1';
     if(functionName==='getListing')throw Error('node unavailable');
     return 0n;
   });
   const x=await readErc721MarketStatus(1,collection,1n);
   expect(x.sale.status).toBe('VERSION_MISMATCH');
   expect(x.auction.status).toBe('READ_FAILED');
   expect(x.transactionSigningEnabled).toBe(false);
 });
 it('rejects non-mainnet and invalid token ids',async()=>{
   await expect(readErc721MarketStatus(84532,collection)).rejects.toThrow('Ethereum Mainnet');
   await expect(readErc721MarketStatus(1,collection,0n)).rejects.toThrow('positive');
 });
});
