import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const read=(p:string)=>readFileSync(p,'utf8');
describe('GO#|O visual QA from screenshots 11–14',()=>{
  it('previews a selected browser image but does not persist local binary or object URL',()=>{
    const studio=read('src/components/erc721-create-draft-studio.tsx');
    expect(studio).toContain('URL.createObjectURL(file)');
    expect(studio).toContain('URL.revokeObjectURL');
    expect(studio).toContain('Local preview only');
    expect(studio).toContain('Temporary browser preview');
    expect(studio).toContain('setImage(\'\');setPinned(\'\');setSimulation(undefined)');
    expect(studio).toContain('image,externalUrl,metadataUri:pinned,recipient');
    expect(studio).not.toContain('image:localPreview');
  });
  it('keeps the IPFS upload server-authorized and correctly explains missing config',()=>{
    const upload=read('src/app/api/media-upload/sign/route.ts');
    const direct=read('src/lib/direct-ipfs-upload.ts');
    expect(upload).toContain('process.env.PINATA_JWT');
    expect(upload).toContain("'UPLOAD_NOT_CONFIGURED'");
    expect(upload).toContain('assertErc721DraftAuthor');
    expect(direct).toContain("endpoint.origin !== 'https://uploads.pinata.cloud'");
    expect(direct).toContain('checkArtwork(args.file)');
  });
  it('uses different saved versions and unsaved editor change counters',()=>{
    const studio=read('src/components/erc721-primary-studio.tsx');
    expect(studio).toContain('Saved draft revision');
    expect(studio).toContain('Unsaved field changes');
    expect(studio).toContain('storage.active?storage.active.version');
    expect(studio).toContain('setUnsavedEdits(0)');
    expect(studio).not.toContain('Local draft revision');
  });
});
