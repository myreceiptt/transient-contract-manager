import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseEther } from 'viem';
import { approvalKey } from '../src/server/erc721-creator-mint';
import { GO721_CAMPAIGN_KEY } from '../src/lib/go721-launch';
import { GO721_COLLECTION, GO721_STACKS } from '../src/lib/go721-sale-engine';
import { go721CheckoutPermission, go721SigningPermission, assertGo721Transaction } from '../src/server/go721-transactions';
afterEach(() => vi.unstubAllEnvs());
const tx = { chainId: 1, account: GO721_COLLECTION, to: GO721_STACKS, data: '0x1234', nonce: 7, value: '0', maximumNetworkFee: '100000' };
const review = { chain_id: 1, actor: GO721_COLLECTION.toLowerCase(), payload: { tx, action: { type: 'configure' } } };
const tomorrow = () => new Date(Date.now() + 3600000).toISOString();
describe('GO721 isolated execution permission boundaries', () => {
  it('never inherits the GO1 mainnet switch or creator approval', () => {
    vi.stubEnv('MAINNET_WRITES_ENABLED', 'true');
    vi.stubEnv('ERC721_MINT_APPROVAL', JSON.stringify({key:approvalKey(tx),expiresAt:tomorrow(),maxNetworkFeeWei:'100000'}));
    vi.stubEnv('GO721_TRANSACTION_APPROVAL', ''); vi.stubEnv('GO721_CHECKOUT_APPROVAL', '');
    expect(go721SigningPermission(review)).toBeNull();
    expect(go721CheckoutPermission(1, 0n)).toBeNull();
  });
  it('binds exact admin calldata, sender, chain, nonce and value to an expiring approval', () => {
    vi.stubEnv('MAINNET_WRITES_ENABLED', 'true');
    vi.stubEnv('GO721_TRANSACTION_APPROVAL', JSON.stringify({key:approvalKey(tx),expiresAt:tomorrow(),maxNetworkFeeWei:'100000'}));
    expect(go721SigningPermission(review)).not.toBeNull();
    for (const change of [{nonce:8},{value:'1'},{data:'0xabcd'},{to:GO721_COLLECTION},{account:GO721_STACKS}])
      expect(go721SigningPermission({...review,payload:{...review.payload,tx:{...tx,...change}}})).toBeNull();
    vi.stubEnv('VERCEL_ENV','preview'); expect(go721SigningPermission(review)).toBeNull();
  });
  it('requires separate campaign and round-scoped checkout approval with fee ceilings', () => {
    vi.stubEnv('MAINNET_WRITES_ENABLED','true');
    const permission={campaignKey:GO721_CAMPAIGN_KEY,round:1,expiresAt:tomorrow(),maxNetworkFeeWei:'100000',maxProtocolFeeWei:parseEther('0.0009').toString(),maxQuantity:3};
    vi.stubEnv('GO721_CHECKOUT_APPROVAL',JSON.stringify(permission));
    expect(go721CheckoutPermission(1,parseEther('0.0009'))).not.toBeNull();
    expect(go721CheckoutPermission(2,parseEther('0.0009'))).toBeNull();
    expect(go721CheckoutPermission(1,parseEther('0.001'))).toBeNull();
    vi.stubEnv('GO721_CHECKOUT_APPROVAL',JSON.stringify({...permission,expiresAt:'2020-01-01T00:00:00.000Z'}));
    expect(go721CheckoutPermission(1,0n)).toBeNull();
  });
  it('cannot expose fork execution through a hosted or remote RPC environment', () => {
    vi.stubEnv('LOCAL_CHAIN_ENABLED','true');vi.stubEnv('LOCAL_RPC_URL','https://ethereum-rpc.publicnode.com');
    expect(go721CheckoutPermission(1,0n,31337)).toBeNull();
    vi.stubEnv('LOCAL_RPC_URL','http://127.0.0.1:8545');vi.stubEnv('VERCEL','1');
    expect(go721CheckoutPermission(1,0n,31337)).toBeNull();
  });
  it('rejects replacement hashes with a different payment, sender, call, nonce or chain', () => {
    const sent={from:tx.account,to:tx.to,input:tx.data,value:0n,nonce:7,chainId:1};
    expect(()=>assertGo721Transaction(review,sent)).not.toThrow();
    for(const change of [{from:GO721_STACKS},{to:GO721_COLLECTION},{input:'0x'},{value:1n},{nonce:8},{chainId:31337}])
      expect(()=>assertGo721Transaction(review,{...sent,...change})).toThrow('differs');
  });
});
