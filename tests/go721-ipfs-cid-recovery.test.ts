import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {mediaTarget} from '../src/server/media';

describe('GO#|O pending CID recovery without reupload',()=>{
  it('checks only the requested round of the 30 immutable source JSONs',()=>{
    const source=readFileSync('src/server/erc721-metadata-archive.ts','utf8');
    const folder=readFileSync('src/server/go721-folder-pin.ts','utf8');
    const audit=readFileSync('src/server/go721-folder-audit.ts','utf8');
    expect(source).toContain('round?:1|2');
    expect(source).toContain('sequence.filter(a=>a.round===round)');
    expect(source).toContain('GO721_SOURCE_GATEWAY');
    expect(folder.match(/verifiedGo721MetadataItems\(chainId,contract,s,round\)/g)?.length).toBe(2);
    expect(audit).toContain('verifiedGo721MetadataItems(chainId,contract,s,round)');
    expect(folder).toContain('verifyPinnedFolderPath(rawCid,folder,subset)');
    expect(folder).not.toContain('writeContract(');
  });
  it('allows manual resumption of the exact pending CID after a hard refresh',()=>{
    const ui=readFileSync('src/components/erc721-sale-preparation.tsx','utf8');
    expect(ui).toContain('recoveryCids');
    expect(ui).toContain("recoveryCids[round]||folders[round]?.cid");
    expect(ui).toContain('Verify this existing CID (no upload)');
    expect(ui).toContain("'verify_go721_metadata_folder'");
    expect(ui).toContain('replaceExisting:true');
    expect(ui).not.toContain('sendTransaction(');
  });
  it('accepts only trusted public IPFS gateway paths',()=>{
    expect(mediaTarget('https://ipfs.filebase.io/ipfs/bafybeiaaaa').hostname).toBe('ipfs.filebase.io');
    expect(mediaTarget('https://nftstorage.link/ipfs/bafybeiaaaa').hostname).toBe('nftstorage.link');
    expect(()=>mediaTarget('https://ipfs.filebase.io/private/metadata')).toThrow('gateway IPFS path');
    expect(()=>mediaTarget('https://127.0.0.1/ipfs/anything')).toThrow();
  });
  it('does not follow redirects and keeps fallback host list strictly controlled',()=>{
    const source=readFileSync('src/server/media.ts','utf8');
    expect(source).toContain("Redirects are never followed.");
    expect(source).toContain('mypinata\\.cloud');
    expect(source).toContain('https://w3s.link/ipfs/');
    expect(source).toContain("agent: false");
    expect(source).toContain('checkServerIdentity');
  });
});
