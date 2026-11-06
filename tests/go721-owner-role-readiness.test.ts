import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {keccak256,stringToHex} from 'viem';
const server=readFileSync('src/server/erc721-sale-readiness.ts','utf8');
const panel=readFileSync('src/components/erc721-sale-readiness-panel.tsx','utf8');
const audit=readFileSync('scripts/go721-live-readonly.ts','utf8');
describe('GO#|O mainnet launch Owner permission preflight',()=>{
  it('uses exact Transient Labs APPROVED_MINT_CONTRACT role hash',()=>{
    const role=keccak256(stringToHex('APPROVED_MINT_CONTRACT'));
    expect(role).toMatch(/^0x[0-9a-f]{64}$/);
    expect(server).toContain("keccak256(stringToHex('APPROVED_MINT_CONTRACT'))");
    expect(server).toContain('approvedMintRoleHash:role');
  });
  it('requires the genuine creator Owner to grant sale protocol mint rights',()=>{
    expect(panel).toContain('OWNER ACTION REQUIRED BEFORE THE PRESALE');
    expect(panel).toContain('snapshot.creator.owner');
    expect(panel).toContain('setRole(role, [TLStacks721], true)');
    expect(panel).toContain('Your connected Admin wallet cannot grant this permission');
    expect(server).toContain('ownerMustGrantApprovedMintContract:!approvedMint');
  });
  it('audits mainnet bytecode, fees and roles without a write endpoint',()=>{
    expect(audit).toContain('exactPinnedImplementation');
    expect(audit).toContain('approvedMintContractForStacks721');
    expect(audit).toContain('historicalMintEventScanComplete:false');
    expect(audit).toContain('safeForMainnetWrites:false');
    expect(audit).not.toContain('writeContract');
    expect(audit).not.toContain('sendTransaction');
    expect(audit).not.toContain('setRole(');
    expect(panel).not.toContain('eth_sendTransaction');
  });
});