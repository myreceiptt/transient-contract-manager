import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {verifyAllGo721Paths} from '../src/server/go721-folder-audit';
import {operationBudget} from '../src/server/abuse';

const cid='bafybeicrfkcsgbcxbkk6ica3al4k4ykxivdccw3issjqjipw3aepit5bhm';
const base='ipfs://'+cid;
const source=Array.from({length:30},(_,i)=>({
  round:(i<3?1:2) as 1|2,
  file:String(i<3?i:i-3),
  json:Buffer.from(JSON.stringify({
    name:'Test original #'+(i+1),image:'ipfs://'+cid,
    description:'Immutable source JSON '+i,
  })),
}));
function gateway(){
  return vi.fn(async(uri:string,max:number)=>{
    expect(max).toBe(24576);
    const path=uri.slice(base.length+1);
    const item=source.find(x=>x.round===1&&x.file===path);
    if(item)return Buffer.from(item.json);
    throw Error('not found');
  });
}
describe('GO#|O complete IPFS directory audit (no chain writes)',()=>{
  it('matches all three presale files byte-for-byte',async()=>{
    const reader=gateway();
    const result=await verifyAllGo721Paths(base,1,source,reader);
    expect(result).toMatchObject({round:1,verifiedPaths:3,expectedPaths:3,
      allGatewayBytesMatched:true,ethereumTransactionPerformed:false});
    expect(reader).toHaveBeenCalledTimes(3);
    expect(result.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it('checks every one of 27 public entries, not only the first and last',async()=>{
    const reader=vi.fn(async (uri:string)=>{
      const file=uri.slice(base.length+1);
      const item=source.find(x=>x.round===2&&x.file===file);
      if(!item)throw Error('unexpected path');
      return Buffer.from(item.json);
    });
    const result=await verifyAllGo721Paths(base,2,source,reader);
    expect(result.verifiedPaths).toBe(27);
    expect(reader).toHaveBeenCalledTimes(27);
    expect(new Set(reader.mock.calls.map(args=>args[0])).size).toBe(27);
  });
  it('fails if middle public JSON differs despite correct first/last entries',async()=>{
    await expect(verifyAllGo721Paths(base,2,source,async uri=>{
      const file=uri.slice(base.length+1);
      const item=source.find(x=>x.round===2&&x.file===file)!;
      return file==='13'?Buffer.from('{"name":"TAMPERED"}'):item.json;
    })).rejects.toThrow('file /13 differs');
  });
  it('fails on missing file, duplicate index, incomplete folder or invalid CID',async()=>{
    await expect(verifyAllGo721Paths(base,1,source,async()=>{throw Error('gateway 404')}))
      .rejects.toThrow('gateway 404');
    const duplicate=source.map(x=>({...x}));
    duplicate[7].file='0';
    await expect(verifyAllGo721Paths(base,2,duplicate,gateway()))
      .rejects.toThrow('sequence is incomplete');
    await expect(verifyAllGo721Paths(base,1,source.slice(1),gateway()))
      .rejects.toThrow('source JSON files are missing');
    await expect(verifyAllGo721Paths('ipfs://not-a-cid',1,source,gateway()))
      .rejects.toThrow('valid, saved IPFS folder');
  });
  it('enforces private authenticated owner access through existing draft list',()=>{
    const src=readFileSync('src/server/go721-folder-audit.ts','utf8');
    const api=readFileSync('src/app/api/route.ts','utf8');
    const ui=readFileSync('src/components/erc721-sale-preparation.tsx','utf8');
    expect(operationBudget('audit_go721_folder_paths')).toBe('media');
    expect(src).toContain("verifiedGo721MetadataItems(chainId,contract,s)");
    expect(src).toContain("listErc721Drafts('MINT_PAGE',chainId,contract,s)");
    expect(src).toContain("fetchMediaWithFallback");
    expect(api).toContain("op === 'audit_go721_folder_paths'");
    expect(api).toContain('auditSavedGo721Folder(a.round,a.chainId,a.contract,s)');
    expect(ui).toContain('Verify all 30 published IPFS files');
    expect(src).not.toContain('writeContract(');
    expect(src).not.toContain('sendTransaction(');
    expect(src).not.toContain('pinFileToIPFS');
  });
});
