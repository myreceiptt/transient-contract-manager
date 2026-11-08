import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {validatedMetadata} from '../src/lib/nft-metadata';
import {verifyGo721ArtworkSource} from '../src/server/go721-artwork-source';

const alphabet='abcdefghijklmnopqrstuvwxyz234567';
function cid(bytes:Buffer){
  const digest=createHash('sha256').update(bytes).digest();
  const all=Buffer.concat([Buffer.from([1,0x55,0x12,32]),digest]);
  let value=0,bits=0,out='b';
  for(const byte of all){
    value=(value<<8)|byte;bits+=8;
    while(bits>=5){bits-=5;out+=alphabet[(value>>bits)&31];}
  }
  if(bits)out+=alphabet[(value<<(5-bits))&31];
  return out;
}
const fields={
  title:'Pancasila VS Pancakaki', description:'Original description',
  image:'ipfs://bafybeie5uy556z3ba4wkwe2domvbpsprozhcliqz35dza3k4bk27cswyfu',
  externalUrl:'',metadataUri:'',
};
function pinned(overrides:Record<string,unknown>={}){
  const m={name:fields.title,description:fields.description,image:fields.image,
    external_url:'',attributes:[],...overrides};
  const json=Buffer.from(validatedMetadata(m).bytes);
  return {json,uri:'ipfs://'+cid(json)};
}
describe('GO#|O metadata revisions do not require creator-mint intents',()=>{
  it('validates latest immutable JSON CID and matching saved fields',async()=>{
    const {json,uri}=pinned();
    const result=await verifyGo721ArtworkSource({...fields,metadataUri:uri},
      async()=>json);
    expect(result.json.equals(json)).toBe(true);
    expect(result.sha256).toBe(createHash('sha256').update(json).digest('hex'));
  });
  it('refuses to save drafts with missing pinned JSON',async()=>{
    await expect(verifyGo721ArtworkSource(fields,async()=>Buffer.alloc(0))).rejects.toThrow('Pin');
  });
  it('rejects mismatched draft text even with a valid CID',async()=>{
    const {json,uri}=pinned();
    await expect(verifyGo721ArtworkSource({...fields,description:'Edited but not pinned',metadataUri:uri},
      async()=>json)).rejects.toThrow('does not match');
  });
  it('rejects CID-content mismatch and noncanonical serialized bytes',async()=>{
    const {json,uri}=pinned();
    await expect(verifyGo721ArtworkSource({...fields,metadataUri:uri},
      async()=>Buffer.concat([json,Buffer.from(' ')]))).rejects.toThrow();
    const different=Buffer.from(JSON.stringify(JSON.parse(json.toString()),null,2));
    await expect(verifyGo721ArtworkSource({...fields,metadataUri:'ipfs://'+cid(different)},
      async()=>different)).rejects.toThrow('canonical');
  });
  it('rejects uneditable, hidden attributes rather than silently stripping them',async()=>{
    const {json,uri}=pinned({attributes:[{trait_type:'unreviewed',value:'yes'}]});
    await expect(verifyGo721ArtworkSource({...fields,metadataUri:uri},
      async()=>json)).rejects.toThrow('does not match');
  });
});
