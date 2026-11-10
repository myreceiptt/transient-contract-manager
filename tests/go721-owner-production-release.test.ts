import {afterEach,describe,expect,it,vi} from 'vitest';
import {GO721_CAMPAIGN_KEY} from '../src/lib/go721-launch';
import {GO_APPROVED_TERMS} from '../src/lib/erc721-sale-terms';
import {go721OperatorReleasePermission,go721CheckoutPermission,go721SigningPermission} from '../src/server/go721-transactions';
import {readFileSync} from 'node:fs';

afterEach(()=>vi.unstubAllEnvs());
const owner=GO_APPROVED_TERMS.presaleRecipient.toLowerCase();
const expires=()=>new Date(Date.now()+86400000).toISOString();
const policy=()=>JSON.stringify({
 release:'GO721_3_PLUS_27_OWNER_WALLET_APPROVAL',
 campaignKey:GO721_CAMPAIGN_KEY,
 expiresAt:expires(),
 maxNetworkFeeWei:'2000000000000000',
 maxProtocolFeeWei:'2000000000000000',
 maxQuantity:10,
});
function setRelease(){
 vi.stubEnv('GO721_OPERATOR_RELEASE_APPROVAL',policy());
 vi.stubEnv('VERCEL_ENV','production');
 vi.stubEnv('MAINNET_WRITES_ENABLED','false'); // GO1 cannot inherit this release
}
const tx={chainId:1,account:owner,to:GO_APPROVED_TERMS.collection,
 data:'0xd4bf502a',nonce:14,value:'0',gas:'155732',
 maximumNetworkFee:'20089481571808',expiresAt:new Date().toISOString()};
function review(type:'grant'|'configure'|'purchase',actor=owner){
 return {chain_id:1,actor,payload:{
  tx:{...tx,account:actor},campaignKey:GO721_CAMPAIGN_KEY,
  action:{type},round:type==='purchase'?1:undefined,
  protocolFeeWei:'900000000000000',quantity:type==='purchase'?3:0}};
}
describe('Bounded GO#|O self-service wallet confirmation release',()=>{
 it('never activates without the exact named, campaign-bound production policy',()=>{
   expect(go721OperatorReleasePermission()).toBeNull();
   expect(go721SigningPermission(review('grant'))).toBeNull();
   expect(go721CheckoutPermission(1,0n)).toBeNull();
   setRelease();
   expect(go721OperatorReleasePermission()).not.toBeNull();
   vi.stubEnv('VERCEL_ENV','preview');
   expect(go721OperatorReleasePermission()).toBeNull();
   vi.stubEnv('VERCEL_ENV','production');
   vi.stubEnv('GO721_OPERATOR_RELEASE_APPROVAL',
     JSON.stringify({...JSON.parse(policy()),campaignKey:'0x'+'00'.repeat(32)}));
   expect(go721OperatorReleasePermission()).toBeNull();
   vi.stubEnv('GO721_OPERATOR_RELEASE_APPROVAL',
     JSON.stringify({...JSON.parse(policy()),expiresAt:'2020-01-01T00:00:00.000Z'}));
   expect(go721OperatorReleasePermission()).toBeNull();
 });
 it('allows real Owner to confirm separately reviewed grant and configure actions only',()=>{
   setRelease();
   expect(go721SigningPermission(review('grant'))).not.toBeNull();
   expect(go721SigningPermission(review('configure'))).not.toBeNull();
   expect(go721SigningPermission(review('grant','0x0000000000000000000000000000000000000001'))).toBeNull();
   expect(go721SigningPermission({...review('grant'),payload:{...review('grant').payload,
     campaignKey:'0x'+'00'.repeat(32)}})).toBeNull();
   expect(go721SigningPermission({...review('grant'),payload:{...review('grant').payload,
     tx:{...tx,maximumNetworkFee:'2000000000000001'}}})).toBeNull();
   vi.stubEnv('VERCEL_ENV','preview');
   expect(go721SigningPermission(review('grant'))).toBeNull();
 });
 it('enables reviewed presale and public checkout only within fee and quantity caps',()=>{
   setRelease();
   expect(go721CheckoutPermission(1,900000000000000n)?.maxQuantity).toBe(10);
   expect(go721CheckoutPermission(2,900000000000000n)?.maxQuantity).toBe(10);
   expect(go721CheckoutPermission(1,2000000000000001n)).toBeNull();
   expect(go721CheckoutPermission(1,900000000000000n,31337)).toBeNull();
   expect(go721SigningPermission(review('purchase'))).not.toBeNull();
   expect(go721SigningPermission({...review('purchase'),payload:{...review('purchase').payload,
     quantity:11}})).toBeNull();
   // Protocol quote is still validated from live on-chain state in inspect().
   const server=readFileSync('src/server/go721-transactions.ts','utf8');
   expect(server).toContain('const fresh = await inspect(Number(i.chain_id), i.payload.action, s)');
   expect(server).toContain('GO721_STATE_CHANGED');
   expect(server).toContain('GO721_FEE_CHANGED');
   expect(server).toContain('if (i.status !== \'PREPARED\')');
 });
 it('requires a real wallet click; never sends a blockchain transaction from server',()=>{
   const reviewUI=readFileSync('src/components/go721-transaction-review.tsx','utf8');
   const launchUI=readFileSync('src/components/go721-launch-panel.tsx','utf8');
   expect(reviewUI).toContain('checked={checked}');
   expect(reviewUI).toContain('wallet.sendTransaction(');
   expect(reviewUI).toContain("preflight_go721");
   expect(launchUI).toContain('Continue Owner launch — review next transaction');
   expect(launchUI).toContain('fresh.proposedPresaleStart');
   const server=readFileSync('src/server/go721-transactions.ts','utf8');
   expect(server).not.toContain('sendTransaction(');
   expect(server).not.toContain('writeContract(');
 });
});