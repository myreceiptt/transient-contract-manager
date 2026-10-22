import { isIP } from 'node:net';
import { AppError } from '../lib/domain';

export function origin() {
  const previewHost =
    process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'preview'
      ? process.env.VERCEL_URL
      : undefined;
  const raw =
    process.env.APP_ORIGIN ||
    (previewHost && /^[a-z0-9-]+\.vercel\.app$/.test(previewHost)
      ? `https://${previewHost}`
      : '') ||
    (process.env.NODE_ENV !== 'production' ? 'http://localhost:3000' : '');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError('ORIGIN_REQUIRED', 'Configure an exact HTTPS application origin', 503);
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    raw !== url.origin ||
    url.username ||
    url.password ||
    (url.protocol !== 'https:' &&
      !(process.env.NODE_ENV !== 'production' && local && url.protocol === 'http:')) ||
    (process.env.NODE_ENV === 'production' && (local || isIP(url.hostname.replace(/^\[|\]$/g, ''))))
  )
    throw new AppError(
      'ORIGIN_INVALID',
      'Application origin must be an exact HTTPS origin; HTTP is limited to local development',
      503,
    );
  return url.origin;
}

export function checkHost(req: Request) {
  const expected = new URL(origin()).host;
  if ((req.headers.get('host') || new URL(req.url).host) !== expected)
    throw new AppError('HOST_DENIED', 'Use the configured application URL', 403);
}

export function checkOrigin(req: Request) {
  checkHost(req);
  if (
    req.headers.get('origin') !== origin() ||
    ![null, 'same-origin', 'none'].includes(req.headers.get('sec-fetch-site'))
  )
    throw new AppError('ORIGIN_DENIED', 'Request origin does not match this application', 403);
}

export function cookieName(kind: 'challenge' | 'session' | 'csrf') {
  return `${origin().startsWith('https:') ? '__Host-' : ''}tcm_${kind}`;
}

export const cookieOptions = () => ({
  httpOnly: true,
  secure: origin().startsWith('https:'),
  sameSite: 'strict' as const,
  path: '/',
});

export async function readBody(req: Request) {
  if (req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    throw new AppError('CONTENT_TYPE', 'Use JSON', 415);
  if (req.headers.has('content-encoding') && req.headers.get('content-encoding') !== 'identity')
    throw new AppError('CONTENT_ENCODING', 'Compressed request bodies are not accepted', 415);
  const length = req.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 65536))
    throw new AppError('BODY_TOO_LARGE', 'Request exceeds 64 KiB', 413);
  const reader = req.body?.getReader();
  if (!reader) throw new AppError('EMPTY_BODY', 'Missing request body');
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(5000)]);
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', cancel, { once: true });
  let n = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      if (signal.aborted) throw new AppError('BODY_TIMEOUT', 'Request body timed out', 408);
      const { value, done } = await reader.read();
      if (signal.aborted) throw new AppError('BODY_TIMEOUT', 'Request body timed out', 408);
      if (done) break;
      n += value.length;
      if (n > 65536) {
        cancel();
        throw new AppError('BODY_TOO_LARGE', 'Request exceeds 64 KiB', 413);
      }
      chunks.push(value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new AppError('INVALID_JSON', 'Invalid JSON request');
    }
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

export function errorHeaders(status: number): Record<string, string> {
  return { 'Cache-Control': 'no-store', ...(status === 429 ? { 'Retry-After': '60' } : {}) };
}
