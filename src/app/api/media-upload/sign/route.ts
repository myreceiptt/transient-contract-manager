import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkOrigin, errorHeaders, readBody } from '@/server/security';
import { session, requireSessionChain } from '@/server/auth';
import { authorize } from '@/server/chain';
import { acquireSlot, rateLimit } from '@/server/abuse';
import { AppError, addressSchema, chainSchema } from '@/lib/domain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// This is an application policy (not an IPFS limit). Artwork retains original bytes.
const MAX_ARTWORK_BYTES = 100 * 1024 * 1024;
const mimeExtensions = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
} as const;
const requestSchema = z.object({
  chainId: chainSchema,
  contract: addressSchema,
  kind: z.enum(['artwork', 'banner']),
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  size: z.number().int().positive().max(MAX_ARTWORK_BYTES),
}).strict();

export async function POST(req: NextRequest) {
  let release: (() => void) | undefined;
  try {
    checkOrigin(req);
    release = acquireSlot(req, 'media');
    await rateLimit(req, 'media');
    const s = await session(req, true);
    const args = requestSchema.parse(await readBody(req));
    requireSessionChain(s, args.chainId);
    await authorize(args.chainId, args.contract, s.wallet);
    const jwt = process.env.PINATA_JWT;
    if (!jwt) throw new AppError('UPLOAD_NOT_CONFIGURED', 'IPFS upload service is not configured', 503);

    const response = await fetch('https://uploads.pinata.cloud/v3/files/sign', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: Math.floor(Date.now() / 1000),
        expires: 600,
        max_file_size: MAX_ARTWORK_BYTES,
        allow_mime_types: [args.mime],
        filename: 'tcm-' + args.kind + '-' + randomUUID() + mimeExtensions[args.mime],
        cid_version: 'v1',
      }),
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    }).catch(() => { throw new AppError('UPLOAD_PROVIDER', 'Could not prepare a signed IPFS upload', 502); });
    if (!response.ok) throw new AppError('UPLOAD_PROVIDER', 'IPFS provider rejected the upload request', 502);
    const result = await response.json();
    const raw = (result as { data?: unknown })?.data;
    if (typeof raw !== 'string') throw new AppError('UPLOAD_PROVIDER', 'Invalid signed upload response', 502);
    let signed: URL;
    try { signed = new URL(raw); }
    catch { throw new AppError('UPLOAD_PROVIDER', 'Invalid signed upload URL', 502); }
    if (signed.protocol !== 'https:' || signed.hostname !== 'uploads.pinata.cloud' ||
        signed.port || !signed.pathname.startsWith('/v3/files'))
      throw new AppError('UPLOAD_PROVIDER', 'Unexpected signed upload destination', 502);
    return NextResponse.json(
      { url: signed.toString(), maxBytes: MAX_ARTWORK_BYTES, expiresIn: 600 },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    const error = e instanceof AppError ? e : undefined;
    const status = error?.status ?? (e instanceof z.ZodError ? 400 : 500);
    return NextResponse.json(
      { error: error?.code ?? 'UPLOAD_SIGN_ERROR', message: error?.message ?? 'Unable to prepare artwork upload' },
      { status, headers: errorHeaders(status) },
    );
  } finally { release?.(); }
}
