import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkOrigin, errorHeaders } from '@/server/security';
import { session, requireSessionChain } from '@/server/auth';
import { authorize } from '@/server/chain';
import { acquireSlot, rateLimit } from '@/server/abuse';
import { AppError, addressSchema, chainSchema } from '@/lib/domain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_BODY = MAX_BYTES + 32 * 1024;
const identity = z.object({ chainId: chainSchema, contract: addressSchema });
const sniff = (b: Buffer): string | undefined => {
  if (b.length >= 8 && b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (b.length >= 3 && b[0]===255 && b[1]===216 && b[2]===255) return 'image/jpeg';
  if (b.length >= 12 && b.toString('ascii',0,4)==='RIFF' && b.toString('ascii',8,12)==='WEBP') return 'image/webp';
};
const cidPattern = /^(?:bafy[a-z2-7]{20,}|Qm[1-9A-HJ-NP-Za-km-z]{44})$/;
export async function POST(req: NextRequest) {
  let release: (() => void) | undefined;
  try {
    checkOrigin(req);
    release = acquireSlot(req, 'media');
    await rateLimit(req, 'media');
    const s = await session(req, true);
    if (!req.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data;'))
      throw new AppError('UPLOAD_TYPE', 'Use multipart/form-data', 415);
    if (req.headers.get('content-encoding') && req.headers.get('content-encoding') !== 'identity')
      throw new AppError('UPLOAD_ENCODING', 'Compressed upload requests are not accepted', 415);
    const length = req.headers.get('content-length');
    if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY))
      throw new AppError('UPLOAD_SIZE', 'Upload body exceeds 3 MiB', 413);
    // Bound the incoming stream before invoking FormData (which buffers it).
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = req.body?.getReader();
    if (!reader) throw new AppError('UPLOAD_EMPTY', 'Missing upload', 400);
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(15000)]);
    try {
      while (true) {
        if (signal.aborted) throw new AppError('UPLOAD_TIMEOUT', 'Upload timed out', 408);
        const {value,done} = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BODY) throw new AppError('UPLOAD_SIZE', 'Upload body exceeds 3 MiB', 413);
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const body = new Request('https://upload.invalid/', {
      method:'POST', headers:{'content-type':req.headers.get('content-type')!},
      body:Buffer.concat(chunks.map(x=>Buffer.from(x))),
    });
    const form = await body.formData();
    const args = identity.parse({chainId:Number(form.get('chainId')),contract:form.get('contract')});
    requireSessionChain(s,args.chainId);
    await authorize(args.chainId,args.contract,s.wallet);
    const kind=form.get('kind');
    if (kind !== 'artwork' && kind !== 'banner') throw new AppError('UPLOAD_KIND','Invalid image destination',400);
    const file=form.get('file');
    if (!(file instanceof File)) throw new AppError('UPLOAD_FILE','Choose an image file',400);
    if (file.size===0 || file.size>MAX_BYTES) throw new AppError('UPLOAD_SIZE','Images must be under 3 MiB',413);
    const bytes=Buffer.from(await file.arrayBuffer());
    const mime=sniff(bytes);
    if (!mime || mime!==file.type) throw new AppError('UPLOAD_MIME','Upload PNG, JPEG, or WebP images only',415);
    const token=process.env.PINATA_JWT;
    if (!token) throw new AppError('UPLOAD_NOT_CONFIGURED','IPFS upload service is not configured',503);
    const payload = new FormData();
    payload.set('file',new File([bytes],kind+'-'+Date.now()+({ 'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp'}[mime]),{type:mime}));
    payload.set('network','public');
    payload.set('name','tcm-'+kind+'-'+Date.now());
    const uploadSignal=AbortSignal.any([req.signal,AbortSignal.timeout(30000)]);
    let upstream: Response;
    try {
      upstream=await fetch('https://uploads.pinata.cloud/v3/files',{method:'POST',headers:{Authorization:'Bearer '+token},body:payload,redirect:'error',signal:uploadSignal,cache:'no-store'});
    } catch {
      throw new AppError('UPLOAD_UPSTREAM','IPFS provider could not be reached',502);
    }
    if (!upstream.ok) throw new AppError('UPLOAD_UPSTREAM','IPFS provider rejected the upload',502);
    let result: unknown;
    try {result=await upstream.json();}catch {throw new AppError('UPLOAD_UPSTREAM','Invalid IPFS provider response',502);}
    const cid=(result as any)?.data?.cid;
    if(typeof cid!=='string'||!cidPattern.test(cid)) throw new AppError('UPLOAD_CID','IPFS provider returned an invalid CID',502);
    return NextResponse.json({uri:'ipfs://'+cid,cid,kind},{headers:{'Cache-Control':'no-store'}});
  } catch(e) {
    const err=e instanceof AppError?e:undefined;
    const status=err?.status??400;
    return NextResponse.json({error:err?.code??'UPLOAD_ERROR',message:err?.message??'Image upload failed'},{status,headers:errorHeaders(status)});
  } finally {release?.();}
}
