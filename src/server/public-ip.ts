import { isIP } from 'node:net';

// Conservative egress policy: only ordinary global unicast. Special-purpose
// ranges are denied even when a registry lists a globally reachable exception.
export function publicIp(ip: string) {
  if (isIP(ip) === 4) {
    const [a, b, c] = ip.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (isIP(ip) !== 6 || ip.includes('%') || ip.includes('.')) return false;
  const normalized = new URL(`http://[${ip}]`).hostname.slice(1, -1);
  const first = parseInt(normalized.split(':')[0], 16);
  if (!(first >= 0x2000 && first <= 0x3fff)) return false; // excludes mapped, NAT64, ULA, multicast, link-local
  const second = parseInt(normalized.split(':')[1] || '0', 16);
  return !(
    (first === 0x2001 && (second < 0x200 || second === 0xdb8)) ||
    first === 0x2002 || // 6to4 embeds IPv4, including private addresses
    (first === 0x3fff && second < 0x1000)
  ); // documentation /20
}
