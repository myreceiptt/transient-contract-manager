import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request } from 'node:https';
import { checkServerIdentity } from 'node:tls';
import { publicIp } from './public-ip';
import { AppError, isSafeUrl } from '../lib/domain';
export function mediaTarget(uri: string) {
  if (
    uri.split('/').some((s) => {
      try {
        const decoded = decodeURIComponent(s);
        return (
          decoded === '.' || decoded === '..' || decoded.includes('\\') || decoded.includes('/')
        );
      } catch {
        return true;
      }
    })
  )
    throw new AppError('MEDIA_PATH', 'Path traversal is not allowed');
  if (!isSafeUrl(uri))
    throw new AppError('MEDIA_URL', 'Use a valid IPFS or approved HTTPS media URL');
  const url = new URL(uri.startsWith('ipfs://') ? 'https://ipfs.io/ipfs/' + uri.slice(7) : uri);
  const hosts = [
    'ipfs.io',
    'gateway.pinata.cloud',
    'dweb.link',
    'w3s.link',
    'cloudflare-ipfs.com',
    ...(process.env.MEDIA_ALLOWED_HOSTS || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  ];
  if (
    url.protocol !== 'https:' ||
    (url.port && url.port !== '443') ||
    !hosts.includes(url.hostname) ||
    isIP(url.hostname)
  )
    throw new AppError(
      'MEDIA_HOST',
      'This media host is not approved. Use an IPFS URI or ask the operator to approve its HTTPS hostname.',
    );
  if (
    ['ipfs.io', 'gateway.pinata.cloud', 'cloudflare-ipfs.com', 'dweb.link', 'w3s.link'].includes(url.hostname) &&
    !url.pathname.startsWith('/ipfs/')
  )
    throw new AppError('MEDIA_PATH', 'Use the gateway IPFS path');
  return url;
}
export async function fetchMedia(uri: string, max: number, callerSignal?: AbortSignal) {
  const url = mediaTarget(uri);
  const signal = AbortSignal.any([
    AbortSignal.timeout(10000),
    ...(callerSignal ? [callerSignal] : []),
  ]);
  try {
    const addresses = await new Promise<Awaited<ReturnType<typeof resolveAddresses>>>(
      (resolve, reject) => {
        const abort = () => reject(new AppError('MEDIA_TIMEOUT', 'Media request timed out', 504));
        if (signal.aborted) {
          abort();
          return;
        }
        signal.addEventListener('abort', abort, { once: true });
        resolveAddresses(url.hostname)
          .then(resolve, reject)
          .finally(() => signal.removeEventListener('abort', abort));
      },
    );
    if (!addresses.length || addresses.some((x) => !publicIp(x.address)))
      throw new AppError(
        'MEDIA_NETWORK',
        'Private or special-use network destinations are blocked',
      );
    const destination = addresses[0];
    // Connect to the checked IP itself. No second hostname resolution, redirects,
    // connection reuse or proxy agent. TLS still authenticates the original name.
    return await new Promise<Buffer>((resolve, reject) => {
      const r = request(
        {
          protocol: 'https:',
          hostname: destination.address,
          family: destination.family,
          port: 443,
          path: url.pathname + url.search,
          method: 'GET',
          agent: false,
          servername: url.hostname,
          rejectUnauthorized: true,
          checkServerIdentity: (_hostname, cert) => checkServerIdentity(url.hostname, cert),
          signal,
          maxHeaderSize: 16384,
          headers: {
            Host: url.host,
            Accept: 'application/json,image/png,image/jpeg,image/webp,image/gif',
            'Accept-Encoding': 'identity',
          },
        },
        (res) => {
          const fail = (e: AppError) => {
            reject(e);
            res.destroy();
            r.destroy();
          };
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            fail(
              new AppError(
                'MEDIA_UNAVAILABLE',
                'Media gateway failed or attempted a redirect',
                502,
              ),
            );
            return;
          }
          if (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') {
            fail(
              new AppError('MEDIA_ENCODING', 'Compressed media responses are not accepted', 502),
            );
            return;
          }
          const length = res.headers['content-length'];
          if (length && (!/^\d+$/.test(length) || Number(length) > max)) {
            fail(new AppError('MEDIA_SIZE', 'Media exceeds the size limit', 413));
            return;
          }
          let size = 0;
          const chunks: Buffer[] = [];
          res.on('data', (value: Buffer) => {
            size += value.length;
            if (size > max) {
              fail(new AppError('MEDIA_SIZE', 'Media exceeds the size limit', 413));
              return;
            }
            chunks.push(value);
          });
          res.on('error', reject);
          res.on('aborted', () =>
            reject(new AppError('MEDIA_UNAVAILABLE', 'Media response interrupted', 502)),
          );
          res.on('end', () => {
            if (!size) reject(new AppError('MEDIA_EMPTY', 'No media returned'));
            else resolve(Buffer.concat(chunks));
          });
        },
      );
      r.on('error', reject);
      r.end();
    });
  } catch (e) {
    if (e instanceof AppError) throw e;
    if (signal.aborted) throw new AppError('MEDIA_TIMEOUT', 'Media request timed out', 504);
    throw new AppError('MEDIA_UNAVAILABLE', 'Media gateway is unavailable', 502);
  }
}
// Fallback belongs to the higher-level media resolver, not the low-level
// pinned HTTPS transport. Its single-request contract is security-tested.
// Never follow redirects; each approved gateway is independently DNS-validated,
// pinned by IP, TLS-authenticated, and subjected to the same content limits.
export async function fetchMediaWithFallback(uri: string, max: number, callerSignal?: AbortSignal) {
  if (!uri.startsWith('ipfs://')) return fetchMedia(uri, max, callerSignal);
  if (!isSafeUrl(uri))
    throw new AppError('MEDIA_URL', 'Use a valid IPFS URI');
  const cidPath = uri.slice('ipfs://'.length);
  const gateways = [
    'https://dweb.link/ipfs/',
    'https://gateway.pinata.cloud/ipfs/',
    'https://ipfs.io/ipfs/',
  ];
  const signal = AbortSignal.any([
    AbortSignal.timeout(12000),
    ...(callerSignal ? [callerSignal] : []),
  ]);
  let lastError: unknown;
  for (const gateway of gateways) {
    if (signal.aborted) break;
    try {
      return await fetchMedia(gateway + cidPath, max, signal);
    } catch (error) {
      lastError = error;
      // Never hide malformed inputs, forbidden DNS destinations, invalid
      // response encodings, or oversize assets behind a different gateway.
      if (!(error instanceof AppError) ||
          !['MEDIA_UNAVAILABLE', 'MEDIA_EMPTY', 'MEDIA_TIMEOUT'].includes(error.code))
        throw error;
    }
  }
  if (signal.aborted)
    throw new AppError('MEDIA_TIMEOUT', 'IPFS gateway requests timed out', 504);
  throw lastError ?? new AppError('MEDIA_UNAVAILABLE', 'IPFS gateways are unavailable', 502);
}
const resolveAddresses = (hostname: string) => lookup(hostname, { all: true, verbatim: true });
export async function readMetadata(uri: string, signal?: AbortSignal) {
  const bytes = await fetchMediaWithFallback(uri, 256 * 1024, signal);
  let raw;
  try {
    raw = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new AppError('METADATA_JSON', 'Token metadata must be JSON');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new AppError('METADATA_JSON', 'Token metadata must be a JSON object');
  const text = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
  const image = text(raw.image, 2048);
  return {
    name: text(raw.name, 150),
    description: text(raw.description, 6000),
    image: isSafeUrl(image) ? image : '',
    externalUrl: isSafeUrl(raw.external_url) ? raw.external_url : '',
    attributes: Array.isArray(raw.attributes)
      ? raw.attributes.slice(0, 60).map((a: any) => ({
          trait_type: text(a?.trait_type, 100),
          value: text(String(a?.value ?? ''), 200),
        }))
      : [],
  };
}
export function rasterType(data: Buffer) {
  if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png';
  if (data[0] === 255 && data[1] === 216 && data[2] === 255) return 'image/jpeg';
  if (['GIF87a', 'GIF89a'].includes(data.subarray(0, 6).toString())) return 'image/gif';
  if (data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP')
    return 'image/webp';
  throw new AppError(
    'MEDIA_TYPE',
    'Only PNG, JPEG, GIF and WebP images are supported. SVG and HTML are not served.',
  );
}
