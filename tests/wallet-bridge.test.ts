import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Providers, WalletButton, sendWalletTransaction } from '../src/components/providers';

describe('injected wallet bridge SSR', () => {
  it('renders a disconnected wallet selector without accessing window or SDKs at module load', () => {
    const markup = renderToStaticMarkup(
      createElement(Providers, null, createElement(WalletButton)),
    );
    expect(markup).toContain('Connect wallet');
    expect(markup).not.toContain('WalletConnect requires');
  });
});

describe('wallet transaction dispatch',()=>{
  const account='0x1111111111111111111111111111111111111111' as const;
  const to='0x2222222222222222222222222222222222222222' as const;
  const hash='0x'+'1'.repeat(64);
  it('preserves existing GO1 request fields and adds explicit reviewed ERC721 nonce/fee bounds',async()=>{
    let sent:any;
    const provider={request:async({method,params}:any)=>method==='eth_accounts'?[account]:
      method==='eth_chainId'?'0x1':(sent=params[0],hash)};
    await sendWalletTransaction(provider,account,1,{to,data:'0x1234',value:1n});
    expect(sent).toEqual({from:account,to,data:'0x1234',value:'0x1'});
    await sendWalletTransaction(provider,account,1,{to,value:0n,nonce:47,gas:100000n,maxFeePerGas:20n,maxPriorityFeePerGas:1n});
    expect(sent).toMatchObject({nonce:'0x2f',gas:'0x186a0',maxFeePerGas:'0x14',maxPriorityFeePerGas:'0x1'});
  });
  it('never opens signing after an account or network switch',async()=>{
    let sends=0;
    for(const [accounts,chain] of [[[to],'0x1'],[[account],'0x2105']]){
      const provider={request:async({method}:any)=>method==='eth_accounts'?accounts:
        method==='eth_chainId'?chain:(sends++,hash)};
      await expect(sendWalletTransaction(provider,account,1,{to})).rejects.toThrow(/changed/);
    }
    expect(sends).toBe(0);
  });
});
