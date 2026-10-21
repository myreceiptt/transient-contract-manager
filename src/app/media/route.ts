import { NextRequest, NextResponse } from 'next/server';
import { fetchMedia, rasterType } from '@/server/media';
import { AppError } from '@/lib/domain';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  try {
    const uri = req.nextUrl.searchParams.get('url');
    if (!uri || uri.length > 2048)
      throw new AppError('MEDIA_URL', 'Missing or oversized media URI');
    const data = await fetchMedia(uri, 8 * 1024 * 1024);
    const mime = rasterType(data);
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof AppError ? e.code : 'MEDIA_UNAVAILABLE' },
      { status: e instanceof AppError ? e.status : 502 },
    );
  }
}
