import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const src=(path:string)=>readFileSync(path,'utf8');

describe('GO#|O Approach A — complete read-only workspace',()=>{
  it('uses the ERC721-specific taxonomy without changing GO1 editions manager',()=>{
    const one=src('src/components/erc721-workspace.tsx');
    const editions=src('src/components/manager.tsx');
    expect(one).toContain("'Artworks & Tokens','Mint Pages','Auctions'");
    expect(one).toContain('Erc721PrimaryStudio');
    expect(one).toContain('Erc721AuctionStudio');
    expect(one).toContain('Erc721Settings');
    expect(one).toContain('Erc721Activity');
    expect(editions).toContain("'Tokens & Editions'");
    expect(editions).not.toContain('Erc721AuctionStudio');
  });
  it('keeps new primary mint as collection-scoped and session-only',()=>{
    const studio=src('src/components/erc721-primary-studio.tsx');
    expect(studio).toContain('collection-wide primary mint campaign');
    expect(studio).toContain('SESSION PREVIEW ONLY');
    expect(studio).toContain('Not saved to a server');
    expect(studio).toContain('Publish transaction disabled');
    expect(studio).not.toContain("api('prepare_mint'");
    expect(studio).not.toContain('writeContract');
    expect(studio).not.toContain('signTransaction');
  });
  it('requires wallet ownerOf proof before a local auction review, no escrow',()=>{
    const source=src('src/components/erc721-auction-studio.tsx');
    expect(source).toContain("api('scan_erc721'");
    expect(source).toContain("ownership.owner.toLowerCase()===wallet.toLowerCase()");
    expect(source).toContain('disabled={!hasOwner}');
    expect(source).toContain('reviewAuctionProposalLocally');
    expect(source).toContain('Approve / list disabled');
    expect(source).not.toContain('writeContract');
    expect(source).not.toContain('approve(');
  });
  it('separates collection owner from NFT seller and avoids inferred royalties',()=>{
    const settings=src('src/components/erc721-settings-dashboard.tsx');
    expect(settings).toContain('Creator roles do not convey seller rights');
    expect(settings).toContain('Not verified');
    expect(settings).toContain('runtime');
    expect(settings).toContain('Change roles disabled');
    expect(settings).toContain('Modify royalties disabled');
  });
  it('does not manufacture historical transactions or merge GO1 ledgers',()=>{
    const ledger=src('src/components/erc721-activity.tsx');
    expect(ledger).toContain('Not indexed');
    expect(ledger).toContain('not evidence that');
    expect(ledger).toContain('Existing ERC1155 reviews are never');
    expect(ledger).toContain('No transaction is automatically retried or submitted');
  });
  it('keeps all ERC721 write API dispatches absent',()=>{
    const api=src('src/app/api/route.ts');
    for(const op of [
      "op === 'submit_erc721_mint'",
      "op === 'configure_erc721_drop'",
      "op === 'submit_auction_bid'",
      "op === 'prepare_auction_list'",
      "op === 'submit_auction_settlement'",
    ])expect(api).not.toContain(op);
    expect(api).toContain("op === 'read_erc721_market'");
    expect(api).toContain("op === 'scan_erc721'");
  });
});
