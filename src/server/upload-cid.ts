// Validate CIDv1 base32 syntax and its multiformat header; uploaded files
// normally use raw (0x55) or dag-pb (0x70) codecs with SHA-256 digests.
export function validUploadCid(cid: unknown): cid is string {
  if (typeof cid !== 'string') return false;
  if (/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(cid)) return true;
  if (!/^b[a-z2-7]{20,160}$/.test(cid)) return false;
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  const data: number[] = [];
  let acc = 0, bits = 0;
  for (const ch of cid.slice(1)) {
    const v = alphabet.indexOf(ch);
    if (v < 0) return false;
    acc = (acc << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      data.push((acc >> bits) & 255);
      acc &= (1 << bits) - 1;
    }
  }
  if (acc !== 0) return false;
  let offset = 0;
  function readVarint(): number | undefined {
    let value = 0;
    for (let shift = 0; shift <= 28; shift += 7) {
      const byte = data[offset++];
      if (byte === undefined) return undefined;
      value += (byte & 127) * 2 ** shift;
      if ((byte & 128) === 0) return value;
    }
    return undefined;
  }
  const version = readVarint();
  const codec = readVarint();
  const hashCode = readVarint();
  const digestLength = readVarint();
  return version === 1 && (codec === 0x55 || codec === 0x70) &&
    hashCode === 0x12 && digestLength === 32 && offset + 32 === data.length;
}
