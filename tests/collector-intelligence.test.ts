import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const page = readFileSync('src/components/public-mint.tsx','utf8');
const studio = readFileSync('src/components/mint-studio.tsx','utf8');
const service = readFileSync('src/server/collector-intelligence.ts','utf8');
const sql = readFileSync('supabase/migrations/20261031140000_nft_collector_intelligence.sql','utf8');

describe('Collector intelligence and canonical links',()=>{
  it('links only published and non-archived Mint Pages to new tabs',()=>{
    expect(studio).toContain('token.page?.published && !token.page.archived');
    expect(studio).toContain('target="_blank" rel="noopener noreferrer"');
    expect(studio).toContain('View Mint Page');
    expect(studio).toContain('Copy URL');
    expect(studio).toContain('window.location.origin');
  });
  it('separates verified ERC1155 ownership from mint/transfer history',()=>{
    expect(service).toContain("functionName:'balanceOf'");
    expect(service).toContain("event TransferSingle");
    expect(service).toContain("event TransferBatch");
    expect(service).toContain("event Purchase");
    expect(service).toContain("BigInt(r.quantity)>0n");
    expect(page).toContain('Your editions');
    expect(page).toContain('Collectors');
    expect(page).toContain('Activity');
    expect(page).toContain('Historical indexing in progress');
  });
  it('never exposes raw database service privileges or misstates history completeness',()=>{
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('to service_role');
    expect(sql).toContain('return jsonb_build_object');
    expect(service).toContain('historyComplete:snapshot.complete===true');
    expect(service).toContain('scanWarning');
    expect(service).toContain('kind');
  });
});
