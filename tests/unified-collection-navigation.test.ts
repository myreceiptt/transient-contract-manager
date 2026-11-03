import { beforeEach,describe,expect,it,vi } from 'vitest';
const st=vi.hoisted(()=>({
  rpc:{getBlock:vi.fn(),getCode:vi.fn(),getChainId:vi.fn(),readContract:vi.fn()},
  inspect1155:vi.fn(),inspect721:vi.fn()
}));
vi.mock('../src/server/chain',()=>({
  client:()=>st.rpc,
  exactChain:async()=>{if(await st.rpc.getChainId()!==1)throw Error('WRONG_CHAIN');},
  inspect:st.inspect1155,
}));
vi.mock('../src/server/erc721-probe',()=>({inspectErc721Candidate:st.inspect721}));
import {detectCollection} from '../src/server/collection-router';
import {readFileSync} from 'node:fs';
const nft=('0x'+'9'.repeat(40)) as `0x${string}`;
const wallet=('0x'+'2'.repeat(40)) as `0x${string}`;
beforeEach(()=>{
  vi.clearAllMocks();
  st.rpc.getChainId.mockResolvedValue(1);
  st.rpc.getBlock.mockResolvedValue({number:256n});
  st.rpc.getCode.mockResolvedValue('0x363d3d');
  st.rpc.readContract.mockImplementation(async ({args}:any)=>args?.[0]==='0x80ac58cd');
  st.inspect721.mockResolvedValue({name:'GO One of One',walletRole:'admin',version:'4.1.2',
    transactionSigningEnabled:false,runtimeVerification:'ABI_COMPATIBLE_UNVERIFIED_RUNTIME'});
  st.inspect1155.mockResolvedValue({name:'GO Editions',role:'admin',version:'4.1.2'});
});
describe('Universal collection routing',()=>{
  it('routes a unique ERC721TL interface to the ERC721 read-only workspace',async()=>{
    const result=await detectCollection(1,nft,wallet);
    expect(result).toMatchObject({kind:'ERC721TL',status:'READ_ONLY',version:'4.1.2',
      role:'admin'});
    expect(result.destination).toBe('/manage-721?chain=1&contract='+nft);
    expect(st.inspect721).toHaveBeenCalledWith(1,nft,wallet);
    expect(st.inspect1155).not.toHaveBeenCalled();
  });
  it('uses existing strict ERC1155 implementation verifier before management',async()=>{
    st.rpc.readContract.mockImplementation(async ({args}:any)=>args?.[0]==='0xd9b67a26');
    const result=await detectCollection(1,nft,wallet);
    expect(result).toMatchObject({kind:'ERC1155TL',status:'VERIFIED_MANAGEMENT'});
    expect(result.destination).toBe('/manage?chain=1&contract='+nft);
    expect(st.inspect1155).toHaveBeenCalledWith(1,nft,wallet);
    expect(st.inspect721).not.toHaveBeenCalled();
  });
  it('rejects a fake ERC1155 whose implementation fails strict verification',async()=>{
    st.rpc.readContract.mockImplementation(async ({args}:any)=>args?.[0]==='0xd9b67a26');
    st.inspect1155.mockRejectedValue(new Error('UNSUPPORTED_IMPLEMENTATION'));
    await expect(detectCollection(1,nft,wallet)).rejects.toThrow('UNSUPPORTED_IMPLEMENTATION');
  });
  it('rejects unsupported or ambiguous standards rather than guessing management route',async()=>{
    st.rpc.readContract.mockResolvedValue(false);
    await expect(detectCollection(1,nft,wallet)).rejects.toThrow('Cannot uniquely classify');
    st.rpc.readContract.mockResolvedValue(true);
    await expect(detectCollection(1,nft,wallet)).rejects.toThrow('Cannot uniquely classify');
  });
  it('rejects missing contract and invalid RPC chain before routing',async()=>{
    st.rpc.getCode.mockResolvedValue('0x');
    await expect(detectCollection(1,nft)).rejects.toThrow('No contract code');
    st.rpc.getCode.mockResolvedValue('0x1234');
    st.rpc.getChainId.mockResolvedValue(8453);
    await expect(detectCollection(1,nft)).rejects.toThrow('WRONG_CHAIN');
  });
});
describe('Unified navigation layout and ERC721 write isolation',()=>{
  it('keeps exactly one universal homepage form without 721 special CTA',()=>{
    const home=readFileSync('src/components/contract-entry.tsx','utf8');
    expect(home).toContain("api('detect_collection'");
    expect(home).toContain('result.destination');
    expect(home).not.toContain('Have an ERC721TL 1 of 1 collection?');
    expect((home.match(/<form/g)||[]).length).toBe(1);
  });
  it('stacks 1 of 1 and Editions in checker with independent inspection modes',()=>{
    const checker=readFileSync('src/components/checker.tsx','utf8');
    expect(checker).toContain('<Erc721Inspector mode="checker"');
    expect(checker).toContain('02 — Editions Collection');
    expect(checker).toContain("api('inspect',");
  });
  it('shows contextual 721 workspace but does not silently enable creator or auction writes',()=>{
    const studio=readFileSync('src/components/erc721-workspace.tsx','utf8');
    const api=readFileSync('src/app/api/route.ts','utf8');
    expect(studio).toContain("'Tokens & Editions','Mint Pages','Auctions'");
    expect(studio).toContain("api('inspect_erc721'");
    expect(studio).toContain('ownerOf(tokenId)');
    expect(studio).toContain('READ-ONLY');
    expect(api).toContain("op === 'detect_collection'");
    expect(api).not.toContain("op === 'prepare_erc721_mint'");
    expect(api).not.toContain("op === 'prepare_auction_list'");
    expect(api).not.toContain("op === 'submit_auction_bid'");
    expect(readFileSync('src/server/collection-router.ts','utf8')).not.toContain('writeContract');
  });
});
