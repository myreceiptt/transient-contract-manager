import { NextRequest, NextResponse } from 'next/server';
import { fetchMediaWithFallback, rasterType } from '@/server/media';
import { AppError } from '@/lib/domain';
import { acquireSlot, rateLimit } from '@/server/abuse';
import { checkHost, errorHeaders } from '@/server/security';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  let release: (() => void) | undefined;
  try {
    checkHost(req);
    if (req.headers.get('sec-fetch-site') === 'cross-site')
      throw new AppError('MEDIA_ORIGIN', 'Cross-site media requests are blocked', 403);
    const uri = req.nextUrl.searchParams.get('url');
    if (!uri || uri.length > 2048)
      throw new AppError('MEDIA_URL', 'Missing or oversized media URI');
    release = acquireSlot(req, 'media');
    await rateLimit(req, 'media');
    const data = await fetchMediaWithFallback(uri, 3 * 1024 * 1024, req.signal);
    const mime = rasterType(data);
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'private, max-age=300',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof AppError ? e.code : 'MEDIA_UNAVAILABLE' },
      {
        status: e instanceof AppError ? e.status : 502,
        headers: errorHeaders(e instanceof AppError ? e.status : 502),
      },
    );
  } finally {
    release?.();
  }
}
