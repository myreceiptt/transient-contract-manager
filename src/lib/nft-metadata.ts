import { z } from 'zod';
import { isSafeUrl } from './domain';

const ipfsResource = z.string().max(2048).refine(
  (value) => value.startsWith('ipfs://') && isSafeUrl(value) &&
    value.split('/').slice(3).every(segment => {
      try { return !['.', '..'].includes(decodeURIComponent(segment)); }
      catch { return false; }
    }),
  'Use a pinned ipfs:// URI (upload images first)',
);
const attribute = z.object({
  trait_type: z.string().trim().min(1).max(100),
  value: z.union([z.string().trim().min(1).max(250), z.number().finite()]),
}).strict();

export const nftMetadataSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(6000),
  image: ipfsResource,
  external_url: z.string().max(2048).refine(
    value => value === '' || isSafeUrl(value),
    'External link must be an approved HTTPS or IPFS URL',
  ).optional(),
  attributes: z.array(attribute).max(40).default([]),
}).strict();

export type NftMetadata = z.infer<typeof nftMetadataSchema>;

export function validatedMetadata(raw: unknown): { metadata: NftMetadata; bytes: Uint8Array } {
  const metadata = nftMetadataSchema.parse(raw);
  const bytes = new TextEncoder().encode(JSON.stringify(metadata));
  if (bytes.byteLength > 24 * 1024) throw new Error('Metadata JSON exceeds 24 KiB');
  return { metadata, bytes };
}
