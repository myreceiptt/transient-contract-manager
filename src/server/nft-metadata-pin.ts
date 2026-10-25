import { validUploadCid } from './upload-cid';
import { AppError } from '../lib/domain';
import { validatedMetadata } from '../lib/nft-metadata';

export async function pinTokenMetadata(raw: unknown, signal?: AbortSignal) {
  let data: ReturnType<typeof validatedMetadata>;
  try {
    data = validatedMetadata(raw);
  } catch (error) {
    if (error instanceof Error && error.message.includes('24 KiB'))
      throw new AppError('METADATA_SIZE', 'Token metadata exceeds 24 KiB', 413);
    throw error;
  }
  const jwt = process.env.PINATA_JWT;
  if (!jwt) throw new AppError('UPLOAD_NOT_CONFIGURED', 'IPFS pinning is not configured', 503);

  // No caller-provided URL: fixed Pinata host, no redirects, bounded payload.
  const form = new FormData();
  form.set('file', new File([data.bytes], 'nft-metadata.json', { type: 'application/json' }));
  form.set('network', 'public');
  form.set('name', 'tcm-nft-metadata');
  let response: Response;
  try {
    response = await fetch('https://uploads.pinata.cloud/v3/files', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + jwt },
      body: form,
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.any([
        AbortSignal.timeout(30000),
        ...(signal ? [signal] : []),
      ]),
    });
  } catch {
    throw new AppError('UPLOAD_UPSTREAM', 'IPFS metadata service could not be reached', 502);
  }
  if (!response.ok)
    throw new AppError('UPLOAD_UPSTREAM', 'IPFS provider rejected metadata', 502);
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new AppError('UPLOAD_RESPONSE', 'IPFS provider returned invalid JSON', 502);
  }
  const cid = (result as { data?: { cid?: unknown } })?.data?.cid;
  if (!validUploadCid(cid))
    throw new AppError('UPLOAD_CID', 'IPFS provider returned an invalid CID', 502);
  return {
    uri: 'ipfs://' + cid,
    cid,
    metadata: data.metadata,
    notice: 'Pinned metadata is public and immutable. No NFT contract state was changed.',
  };
}
