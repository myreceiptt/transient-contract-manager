import {createHash} from 'node:crypto';
import {AppError} from '../lib/domain';

/** Deterministic uncompressed ZIP of already-verified immutable source metadata. */
const names=['round-1-presale-3','round-2-public-27'] as const;
export type ArchiveItem={round:1|2;file:string;json:Buffer};
export function buildGo721MetadataZip(items:readonly ArchiveItem[]){
  if(items.length!==30)throw new AppError('ZIP_COUNT','Exactly 30 metadata JSON files required.',422);
  const seen=new Set<string>(),parts:Buffer[]=[],directory:Buffer[]=[];
  let position=0;const manifestOrder=[...items].sort((a,b)=>a.round-b.round||Number(a.file)-Number(b.file));
  for(let i=0;i<manifestOrder.length;i++){
    const item=manifestOrder[i];
    const round:1|2=i<3?1:2, file=String(i<3?i:i-3);
    if(item.round!==round||item.file!==file||item.json.length<2||item.json.length>24576)
      throw new AppError('ZIP_SEQUENCE','Metadata archive has an unexpected slot or file size.',422);
    const path=names[round-1]+'/'+file;
    if(seen.has(path))throw new AppError('ZIP_DUPLICATE','Duplicate metadata slot.',422);
    seen.add(path);
    const name=Buffer.from(path,'utf8'),size=item.json.length,crc=crc32(item.json);
    const local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);
    local.writeUInt16LE(0,6);local.writeUInt16LE(0,8);
    local.writeUInt16LE(0,10);local.writeUInt16LE(0x0021,12);
    local.writeUInt32LE(crc,14);local.writeUInt32LE(size,18);
    local.writeUInt32LE(size,22);local.writeUInt16LE(name.length,26);
    local.writeUInt16LE(0,28);
    parts.push(local,name,item.json);
    const central=Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50,0);
    central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);
    central.writeUInt16LE(0,8);central.writeUInt16LE(0,10);
    central.writeUInt16LE(0,12);central.writeUInt16LE(0x0021,14);
    central.writeUInt32LE(crc,16);central.writeUInt32LE(size,20);
    central.writeUInt32LE(size,24);central.writeUInt16LE(name.length,28);
    central.writeUInt32LE(position,42);
    directory.push(central,name);
    position+=local.length+name.length+size;
  }
  const centralSize=directory.reduce((n,b)=>n+b.length,0);
  const end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);
  end.writeUInt16LE(30,8);end.writeUInt16LE(30,10);
  end.writeUInt32LE(centralSize,12);end.writeUInt32LE(position,16);
  const zip=Buffer.concat([...parts,...directory,end]);
  if(zip.length>1024*1024)throw new AppError('ZIP_LARGE','Metadata archive exceeds safe size.',422);
  return {zip,sha256:createHash('sha256').update(zip).digest('hex'),
    count:30,paths:[...seen],status:'OFFCHAIN_ONLY' as const};
}
function crc32(b:Buffer){
  let crc=0xffffffff;
  for(const x of b){crc^=x;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}
