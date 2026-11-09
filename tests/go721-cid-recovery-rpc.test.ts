import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {transientGo721RpcError} from '../src/server/go721-folder-pin';

describe('GO#|O pending CID retry does not silently hang or upload',()=>{
  it('classifies nested Ethereum RPC and timeout failures but not contract reverts',()=>{
    expect(transientGo721RpcError({name:'ResourceNotFoundRpcError'})).toBe(true);
    expect(transientGo721RpcError({name:'ContractFunctionExecutionError',
      cause:{name:'ResourceNotFoundRpcError'}})).toBe(true);
    expect(transientGo721RpcError({name:'HttpRequestError'})).toBe(true);
    expect(transientGo721RpcError({name:'TimeoutError'})).toBe(true);
    expect(transientGo721RpcError({name:'ContractFunctionRevertedError'})).toBe(false);
    expect(transientGo721RpcError({name:'AppError'})).toBe(false);
  });
  it('uses an independent fallback for GO#|O read-only role and prelaunch validation',()=>{
    const chain=readFileSync('src/server/chain.ts','utf8');
    const probe=readFileSync('src/server/erc721-probe.ts','utf8');
    const launch=readFileSync('src/server/go721-launch-state.ts','utf8');
    const creator=readFileSync('src/server/erc721-creator-mint.ts','utf8');
    expect(chain).toContain('export function go721ReadClient()');
    expect(chain).toContain('https://ethereum.reth.rs/rpc');
    expect(chain).toContain('transport:fallback([');
    expect(probe).toContain('? go721ReadClient():client(chainId)');
    expect(launch).toContain('chainId===1?go721ReadClient():client(chainId)');
    expect(creator).toContain('resilientRead&&chainId===1?go721ReadClient():client(chainId)');
    expect(chain).not.toContain('sendTransaction(');
  });
  it('shows accurate verifying-only UI and bounds the browser wait',()=>{
    const ui=readFileSync('src/components/erc721-sale-preparation.tsx','utf8');
    const api=readFileSync('src/lib/api-client.ts','utf8');
    expect(ui).toContain('Verifying existing presale CID');
    expect(ui).toContain('Verifying this CID');
    expect(ui).toContain('timeoutMs:90000');
    expect(ui).toContain("'verify_go721_metadata_folder'");
    expect(ui).toContain('replaceExisting:true');
    expect(api).toContain('AbortSignal.timeout(options.timeoutMs)');
    expect(api).toContain('CID_VERIFICATION_TIMEOUT');
  });
});
