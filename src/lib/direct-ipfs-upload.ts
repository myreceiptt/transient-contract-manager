import { validUploadCid } from '@/server/upload-cid';

export const MAX_ARTWORK_BYTES = 100 * 1024 * 1024;
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export function checkArtwork(file: File) {
  if (!IMAGE_TYPES.includes(file.type as (typeof IMAGE_TYPES)[number]))
    throw new Error('Choose a JPG, PNG or WebP image.');
  if (file.size === 0 || file.size > MAX_ARTWORK_BYTES)
    throw new Error('Image must be larger than 0 bytes and no more than 100 MiB.');
}

export function formatArtworkSize(size: number) {
  return size >= 1024 * 1024
    ? (size / (1024 * 1024)).toFixed(1) + ' MiB'
    : Math.ceil(size / 1024) + ' KiB';
}

export async function uploadOriginalArtwork(args: {
  file: File;
  kind: 'artwork' | 'banner';
  chainId: number;
  contract: string;
  onProgress?: (percent: number) => void;
}): Promise<{ cid: string; uri: string }> {
  checkArtwork(args.file);
  // Verify image magic bytes before requesting an upload capability. This
  // prevents most accidental MIME/extension mismatches; Pinata also restricts
  // the signed URL to the declared image content type and maximum file size.
  const header = new Uint8Array(await args.file.slice(0, 16).arrayBuffer());
  const png = header.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i)=>header[i]===v);
  const jpeg = header[0]===255 && header[1]===216 && header[2]===255;
  const webp = header.length >= 12 &&
    String.fromCharCode(...header.slice(0,4))==='RIFF' &&
    String.fromCharCode(...header.slice(8,12))==='WEBP';
  if (!(args.file.type==='image/png' && png ||
        args.file.type==='image/jpeg' && jpeg ||
        args.file.type==='image/webp' && webp))
    throw new Error('The selected file does not contain valid JPG, PNG or WebP image data.');
  const csrf = document.cookie.split('; ')
    .find(v => v.startsWith('__Host-tcm_csrf=') || v.startsWith('tcm_csrf='))?.split('=')[1];
  if (!csrf) throw new Error('Sign in with your wallet before uploading artwork.');
  const signed = await fetch('/api/media-upload/sign', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: JSON.stringify({
      chainId: args.chainId, contract: args.contract,
      kind: args.kind, mime: args.file.type, size: args.file.size,
    }),
  });
  const capability = await signed.json();
  if (!signed.ok) throw new Error(capability.message || 'Could not prepare secure upload.');
  let endpoint: URL;
  try { endpoint = new URL(capability.url); }
  catch { throw new Error('IPFS provider returned an invalid upload URL.'); }
  if (endpoint.origin !== 'https://uploads.pinata.cloud' ||
      !endpoint.pathname.startsWith('/v3/files'))
    throw new Error('IPFS upload destination is not trusted.');

  const form = new FormData();
  form.set('file', args.file, args.file.name);
  form.set('network', 'public');

  // XHR provides native upload progress events for a large direct upload.
  // The artwork never transits a Vercel Function and is never recompressed.
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', endpoint.toString());
    request.timeout = 15 * 60 * 1000;
    request.upload.onprogress = event => {
      if (event.lengthComputable && event.total > 0)
        args.onProgress?.(Math.min(99, Math.round(100 * event.loaded / event.total)));
    };
    request.onerror = () => reject(new Error('Network error uploading artwork to IPFS. Check your connection and try again.'));
    request.ontimeout = () => reject(new Error('The artwork upload timed out. Try again on a more stable connection.'));
    request.onabort = () => reject(new Error('Artwork upload was cancelled.'));
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error('IPFS provider rejected the artwork upload (HTTP ' + request.status + ').'));
        return;
      }
      try {
        const response = JSON.parse(request.responseText) as { data?: { cid?: unknown } };
        const cid = response?.data?.cid;
        if (!validUploadCid(cid)) throw new Error('IPFS provider did not return a valid content identifier.');
        args.onProgress?.(100);
        resolve({ cid, uri: 'ipfs://' + cid });
      } catch (error) { reject(error); }
    };
    request.send(form);
  });
}
