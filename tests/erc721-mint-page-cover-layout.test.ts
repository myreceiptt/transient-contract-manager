import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
const source=(path:string)=>readFileSync(path,'utf8');

describe('GO#|O screenshot 15–18 acceptance: Mint Page cover & readable review',()=>{
  it('shares the exact authenticated GO1 IPFS uploader and protects 721 creator scope',()=>{
    const go1=source('src/components/mint-studio.tsx');
    const picker=source('src/components/erc721-mint-cover-picker.tsx');
    expect(go1).toContain('uploadOriginalArtwork');
    expect(picker).toContain('uploadOriginalArtwork');
    expect(picker).toContain("standard:'ERC721TL'");
    expect(picker).toContain("kind:'banner'");
    expect(picker).toContain('await ensureSession(chainId)');
    expect(picker).toContain('checkArtwork(file)');
    expect(picker).toContain("onChange('')");
    expect(picker).toContain('setNotice');
    expect(picker).toContain("URL.createObjectURL(file)");
    expect(picker).toContain('URL.revokeObjectURL');
    expect(picker).not.toContain('writeContract');
    expect(picker).not.toContain('signTransaction');
  });
  it('reuses an existing IPFS image rather than requiring another upload',()=>{
    const picker=source('src/components/erc721-mint-cover-picker.tsx');
    expect(picker).toContain("api('erc721_draft_list'");
    expect(picker).toContain("kind:'ARTWORK'");
    expect(picker).toContain("row.draft.image.startsWith('ipfs://')");
    expect(picker).toContain('chooseUri(String(row.draft.image))');
    expect(picker).toContain('Save the Mint Page draft');
  });
  it('renders collector and safety facts in independent responsive cards, not nested dl',()=>{
    const studio=source('src/components/erc721-primary-studio.tsx');
    const css=source('src/app/globals.css');
    expect(studio).toContain('<Erc721MintCoverPicker');
    expect(studio).toContain('erc721-collector-hero');
    expect(studio).toContain('erc721-campaign-facts');
    expect(studio).toContain('erc721-safety-gates');
    expect(studio).not.toContain('<dl>{fields.map');
    expect(css).toContain('.erc721-campaign-fact>strong');
    expect(css).toContain('overflow-wrap:anywhere');
    expect(css).toContain('@media(max-width:680px)');
  });
  it('keeps the canonical Mint Page collection-wide and signing explicitly unavailable',()=>{
    const studio=source('src/components/erc721-primary-studio.tsx');
    const api=source('src/app/api/route.ts');
    expect(studio).toContain('collection-wide primary mint campaign');
    expect(studio).toContain('Publish transaction disabled');
    expect(studio).toContain('Mint unavailable · Draft only');
    expect(studio).toContain('do not configure TLStacks721');
    expect(api).not.toContain("op === 'submit_erc721_mint'");
    expect(api).not.toContain("op === 'configure_erc721_drop'");
  });
});
