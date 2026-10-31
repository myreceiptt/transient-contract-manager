import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const component=readFileSync('src/components/mint-studio.tsx','utf8');
const css=readFileSync('src/app/globals.css','utf8');

describe('Mint Pages catalogue-first navigation',()=>{
  it('uses a single always-visible banner above catalogue and detail views',()=>{
    expect(component).toContain('className="mint-studio-banner panel"');
    expect(component).toContain('A home for every edition.');
    expect(component).toContain('className="token-grid mint-edition-grid"');
    expect(component).not.toContain('<aside className="page-list panel">');
    expect(component).not.toContain('className="studio-layout"');
    expect(component.indexOf('mint-studio-banner')).toBeLessThan(
      component.indexOf('mint-catalogue"'));
  });
  it('provides full-width closeDrop and editor with safe return to NFT cards',()=>{
    expect(component).toContain("!draft && !closePreview && (");
    expect(component).toContain("closePreview && <section className=\"panel\"");
    expect(component).toContain("draft && (");
    expect(component).toContain('Back to NFT Editions');
    expect(component).toContain("if(draft && dirty && !window.confirm(");
    expect(component).toContain('Review closeDrop');
    expect(component).toContain('Save revision first');
  });
  it('keeps publication and on-chain drop statuses separate and preserves link actions',()=>{
    expect(component).toContain('<span>Mint Page</span>');
    expect(component).toContain('<span>On-chain drop</span>');
    expect(component).toContain('View Mint Page');
    expect(component).toContain('Copy URL');
    expect(component).toContain('RESTORE_CANONICAL');
    expect(component).toContain('target="_blank"');
    expect(css).toContain('.mint-edition-grid');
    expect(css).toContain('.mint-studio-banner');
  });
});
