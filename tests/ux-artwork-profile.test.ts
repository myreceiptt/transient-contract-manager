import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkArtwork, formatArtworkSize, MAX_ARTWORK_BYTES } from '../src/lib/direct-ipfs-upload';

const get = (path: string) => readFileSync(path, 'utf8');
describe('Original NFT artifact upload product policy', () => {
  it('enforces 100 MiB per original file with only supported raster MIME', () => {
    expect(MAX_ARTWORK_BYTES).toBe(100 * 1024 * 1024);
    expect(() => checkArtwork(new File(['x'], 'original.png', { type: 'image/png' }))).not.toThrow();
    expect(() => checkArtwork(new File(['x'], 'malicious.svg', { type: 'image/svg+xml' }))).toThrow();
    expect(() => checkArtwork(new File([], 'empty.jpg', { type: 'image/jpeg' }))).toThrow();
    const over = new File([new Uint8Array(1)], 'x.png', { type: 'image/png' });
    Object.defineProperty(over, 'size', { value: MAX_ARTWORK_BYTES + 1 });
    expect(() => checkArtwork(over)).toThrow(/100 MiB/);
  });
  it('shows exact size and retains original binary in direct Pinata submission', () => {
    expect(formatArtworkSize(3 * 1024 * 1024)).toBe('3.0 MiB');
    expect(formatArtworkSize(7 * 1024)).toBe('7 KiB');
    const client = get('src/lib/direct-ipfs-upload.ts');
    expect(client).toContain("form.set('file', args.file, args.file.name)");
    expect(client).toContain("new XMLHttpRequest()");
    expect(client).not.toContain('canvas.toBlob');
    expect(client).not.toContain('toDataURL(');
  });
  it('restricts signed upload capability to SIWE admin and verified Pinata host', () => {
    const sign = get('src/app/api/media-upload/sign/route.ts');
    const csp = get('src/server/csp.ts');
    expect(sign).toContain('await session(req, true)');
    expect(sign).toContain('await authorize(args.chainId, args.contract, s.wallet)');
    expect(sign).toContain('max_file_size: MAX_ARTWORK_BYTES');
    expect(sign).toContain('allow_mime_types: [args.mime]');
    expect(sign).toContain("signed.hostname !== 'uploads.pinata.cloud'");
    expect(csp).toContain('https://uploads.pinata.cloud');
    expect(csp).not.toContain("connect-src *");
  });
  it('renders filenames, IPFS progress and the new public operator profile', () => {
    const metadata = get('src/components/nft-metadata-studio.tsx');
    const mint = get('src/components/mint-studio.tsx');
    const landing = get('src/components/contract-entry.tsx');
    for (const s of [metadata, mint]) {
      expect(s).toContain('uploadOriginalArtwork');
      expect(s).toContain('artwork-upload-status');
      expect(s).toContain('upload-dots');
    }
    expect(landing).toContain('https://nota.endhonesa.com/profile');
    expect(landing).not.toContain('Ganti Oli #1');
  });
  it('closes wallet popover on outside press and Escape and merges duplicate brand announcements', () => {
    const providers = get('src/components/providers.tsx');
    expect(providers).toContain("document.addEventListener('pointerdown', outside)");
    expect(providers).toContain("event.key === 'Escape'");
    expect(providers).toContain("['phantom', 'okx', 'metamask'].includes(candidate.id)");
  });
});
