import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {pinataFolderUploadForm,verifyPinnedFolderPath} from '../src/server/go721-folder-pin';
import {operationBudget} from '../src/server/abuse';
const input=Array.from({length:30},(_,i)=>({
  round:(i<3?1:2) as 1|2,file:String(i<3?i:i-3),
  json:Buffer.from(JSON.stringify({name:'Artwork #'+(i+1),image:'ipfs://bafybeicrfkcsgbcxbkk6ica3al4k4ykxivdccw3issjqjipw3aepit5bhm'}))
}));
const cid='bafybeicrfkcsgbcxbkk6ica3al4k4ykxivdccw3issjqjipw3aepit5bhm';
describe('GO#|O 3+27 metadata folder publication',()=>{
  it('prepares exactly three consecutive, extensionless presale JSON files',()=>{
    const {form,folder,subset}=pinataFolderUploadForm(1,input);
    expect(folder).toBe('go-one-of-one-presale-3');
    const files=form.getAll('file') as File[];
    expect(files).toHaveLength(3);
    expect(files.map(x=>x.name)).toEqual([folder+'/0',folder+'/1',folder+'/2']);
    expect(subset.map(x=>x.file)).toEqual(['0','1','2']);
  });
  it('prepares 27 public metadata file entries 0 through 26',()=>{
    const {form,folder,subset}=pinataFolderUploadForm(2,input);
    expect((form.getAll('file') as File[]).map(x=>x.name))
      .toEqual(Array.from({length:27},(_,i)=>folder+'/'+i));
    expect(subset[26].file).toBe('26');
  });
  it('rejects a missing, duplicate or non-sequential folder slot',()=>{
    expect(()=>pinataFolderUploadForm(1,input.slice(1))).toThrow('Incorrect metadata file count');
    const wrong=input.map(x=>({...x}));
    wrong[1].file='0';
    expect(()=>pinataFolderUploadForm(1,wrong)).toThrow('not contiguous');
  });
  it('discovers only a real path with matching first+last bytes',async()=>{
    const folder='go-one-of-one-presale-3',subset=input.slice(0,3);
    const fetcher=async (uri:string)=>{
      if(!uri.startsWith('ipfs://'+cid+'/'+folder+'/'))throw Error('Missing path');
      const suffix=uri.slice(uri.lastIndexOf('/')+1);
      return subset[Number(suffix)].json;
    };
    expect(await verifyPinnedFolderPath(cid,folder,subset,fetcher))
      .toBe('ipfs://'+cid+'/'+folder);
    expect(await verifyPinnedFolderPath(cid,folder,subset,async()=>Buffer.from('WRONG BYTES')))
      .toBeNull();
  });
  it('requires user-initiated SIWE owner permission and existing Pinata secret',()=>{
    const source=readFileSync('src/server/go721-folder-pin.ts','utf8');
    const route=readFileSync('src/app/api/route.ts','utf8');
    expect(operationBudget('pin_go721_metadata_folder')).toBe('media');
    expect(operationBudget('verify_go721_metadata_folder')).toBe('workspace');
    expect(source).toContain('verifiedGo721MetadataItems(chainId,contract,s)');
    expect(source).toContain('process.env.PINATA_JWT');
    expect(source).toContain("saveErc721Draft('MINT_PAGE'");
    expect(source).toContain('verifyPinnedFolderPath');
    expect(source).toContain('export async function verifyGo721UploadedFolder');
    expect(source).toContain('The existing CID has not reached a trusted gateway yet');
    const ui=readFileSync('src/components/erc721-sale-preparation.tsx','utf8');
    expect(ui).toContain('Check the same CID again (no upload)');
    expect(route).toContain("op === 'pin_go721_metadata_folder'");
    expect(route).toContain("op === 'verify_go721_metadata_folder'");
    expect(route).toContain('requireSessionChain(s,a.chainId)');
    expect(source).not.toContain('eth_sendTransaction');
    expect(source).not.toContain('writeContract');
  });
});