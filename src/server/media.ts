import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { AppError, isSafeUrl } from '../lib/domain';
export function mediaTarget(uri: string) {
  if (
    uri.split('/').some((s) => {
      try {
        const decoded = decodeURIComponent(s);
        return decoded === '.' || decoded === '..' || decoded.includes('\\');
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
    ['ipfs.io', 'gateway.pinata.cloud', 'cloudflare-ipfs.com'].includes(url.hostname) &&
    !url.pathname.startsWith('/ipfs/')
  )
    throw new AppError('MEDIA_PATH', 'Use the gateway IPFS path');
  return url;
}
function publicIp(ip: string) {
  if (isIP(ip) === 6) return !/^(::|f[cd]|fe[89ab]|2001:db8)/i.test(ip) && !ip.includes('.');
  const [a, b] = ip.split('.').map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224 ||
    (a === 198 && (b === 18 || b === 19))
  );
}
export async function fetchMedia(uri: string, max: number) {
  const url = mediaTarget(uri);
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((x) => !publicIp(x.address)))
    throw new AppError('MEDIA_NETWORK', 'Private network destinations are blocked');
  const r = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
    headers: { Accept: 'application/json,image/png,image/jpeg,image/webp,image/gif' },
  });
  if (!r.ok) throw new AppError('MEDIA_UNAVAILABLE', 'Media gateway is unavailable', 502);
  if (Number(r.headers.get('content-length') || 0) > max)
    throw new AppError('MEDIA_SIZE', 'Media exceeds the size limit', 413);
  if (!r.body) throw new AppError('MEDIA_EMPTY', 'No media returned');
  const reader = r.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new AppError('MEDIA_SIZE', 'Media exceeds the size limit', 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export async function readMetadata(uri: string) {
  const bytes = await fetchMedia(uri, 256 * 1024);
  let raw;
  try {
    raw = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new AppError('METADATA_JSON', 'Token metadata must be JSON');
  }
  const text = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
  const image = text(raw.image, 2048);
  return {
    name: text(raw.name, 150),
    description: text(raw.description, 6000),
    image: isSafeUrl(image) ? image : '',
    externalUrl: isSafeUrl(raw.external_url) ? raw.external_url : '',
    attributes: Array.isArray(raw.attributes)
      ? raw.attributes.slice(0, 60).map((a: any) => ({
          trait_type: text(a.trait_type, 100),
          value: text(String(a.value ?? ''), 200),
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
