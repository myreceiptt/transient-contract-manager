import { z } from 'zod';
import { AppError, isSafeUrl } from '../lib/domain';
import { command } from './db';
import { inspect, authorize } from './chain';
import { validUploadCid } from './upload-cid';
import type { Session } from './auth';

const image = z.string().max(2048).refine(v=>!v || isSafeUrl(v),'Use IPFS or a safe HTTPS image URI');
const website = z.string().max(500).refine(v=>!v || /^https:\/\/[a-z0-9]/i.test(v),'Use a public HTTPS URL');
export const collectionProfileDataSchema = z.object({
  description:z.string().max(6000).default(''),
  logo:image.default(''),
  banner:image.default(''),
  website:website.default(''),
  x:website.default(''),
  instagram:website.default(''),
  profileUri:z.string().max(2048).refine(v=>!v || /^ipfs:\/\/[a-zA-Z0-9]+$/.test(v),'Use an IPFS content URI').default(''),
}).strict();
export type CollectionProfileData=z.infer<typeof collectionProfileDataSchema>;

export async function readCollectionProfile(chainId:number,contract:string){
  await inspect(chainId,contract);
  return command('collection_profile_read',{action:'read',chainId,contract:contract.toLowerCase()});
}
export async function saveCollectionProfile(
 chainId:number,contract:string,raw:unknown,expectedVersion:number,s:Session
){
  const data=collectionProfileDataSchema.parse(raw);
  await authorize(chainId,contract,s.wallet);
  return command('collection_profile_write',{
    action:'write',chainId,contract:contract.toLowerCase(),
    actor:s.wallet.toLowerCase(),expectedVersion,data,
  });
}
export async function pinCollectionProfile(
 chainId:number,contract:string,raw:unknown,s:Session,signal?:AbortSignal
){
  const data=collectionProfileDataSchema.parse(raw);
  const info=await authorize(chainId,contract,s.wallet);
  const payload={
    name:info.name,symbol:info.symbol,
    description:data.description,image:data.logo,banner_image:data.banner,
    external_link:data.website,
    social_links:{x:data.x,instagram:data.instagram},
    collection_contract:info.address,chain_id:chainId,
  };
  const bytes=Buffer.from(JSON.stringify(payload));
  if(bytes.length>20*1024)
    throw new AppError('PROFILE_TOO_LARGE','Collection profile exceeds 20 KiB',413);
  const jwt=process.env.PINATA_JWT;
  if(!jwt)throw new AppError('UPLOAD_NOT_CONFIGURED','IPFS pinning is not configured',503);
  const form=new FormData();
  form.set('file',new File([new Uint8Array(bytes)],'collection-profile.json',{type:'application/json'}));
  form.set('network','public');
  form.set('name','tcm-collection-profile');
  let response:Response;
  try{
    response=await fetch('https://uploads.pinata.cloud/v3/files',{
      method:'POST',headers:{Authorization:'Bearer '+jwt},
      body:form,cache:'no-store',redirect:'error',
      signal:AbortSignal.any([AbortSignal.timeout(30000),...(signal?[signal]:[])]),
    });
  }catch{throw new AppError('UPLOAD_UPSTREAM','IPFS profile pinning service unavailable',502);}
  if(!response.ok)throw new AppError('UPLOAD_UPSTREAM','IPFS provider rejected profile JSON',502);
  const body=await response.json().catch(()=>null);
  const cid=(body as {data?:{cid?:unknown}})?.data?.cid;
  if(!validUploadCid(cid))throw new AppError('UPLOAD_CID','Invalid CID from IPFS provider',502);
  return {uri:'ipfs://'+cid,cid,
    notice:'The immutable JSON is publicly pinned. It is not stored as a contractURI() on-chain.'};
}
