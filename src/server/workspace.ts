import type { Address } from 'viem';
import { stacksAbi } from '../lib/abi';
import { command, identityPages } from './db';
import { authorize, inspect, currencyInfo, client, tokenInventory, verifyStacks } from './chain';
import {
  draftSchema,
  AppError,
  type PageRecord,
  type Draft,
  fingerprint,
  configFingerprint,
} from '../lib/domain';
import { requireSessionChain, type Session } from './auth';
export function baseline(info: Awaited<ReturnType<typeof inspect>>) {
  if (!info.sale)
    throw new AppError('STACKS_UNAVAILABLE', info.saleError || 'Stacks verification failed');
  return fingerprint({
    config: info.sale.configFingerprint,
    round: info.sale.round,
    fee: info.sale.fee,
    feeReceiver: info.sale.feeReceiver,
    paused: info.sale.paused,
    approved: info.sale.approved,
  });
}
export async function pageForAdmin(id: string, s: Session) {
  const page = (await command('page_get', { id })) as PageRecord | null;
  if (!page) throw new AppError('NOT_FOUND', 'Mint page not found', 404);
  requireSessionChain(s, page.chain_id);
  const info = await authorize(page.chain_id, page.contract, s.wallet, BigInt(page.token_id));
  return { page, info };
}

export async function mintInventory(chainId: number, contract: Address, start: number, s: Session) {
  requireSessionChain(s, chainId);
  const auth = await authorize(chainId, contract, s.wallet);
  const inventory = await tokenInventory(chainId, contract, start, 20) as {
    tokens: { id: string; created: boolean; locked: boolean; uri: string }[]; total: string
  };
  const pages = await identityPages(chainId, contract, inventory.tokens.map(t=>String(t.id)));
  const byId = new Map(pages.map(p=>[String(p.token_id), p]));
  // A block-anchored read prevents mixing state from different confirmations.
  const c = client(chainId);
  const stacks = await verifyStacks(c, chainId, auth.blockNumber);
  const rows = [];
  for (let i=0; i<inventory.tokens.length; i+=4) {
    const batch = inventory.tokens.slice(i,i+4);
    const resolved = await Promise.all(batch.map(async token => {
      const t=BigInt(token.id), page=byId.get(String(token.id));
      let dropType: number|null=null, phase: number|null=null, round: string|null=null;
      try {
        const [drop,p,r] = await Promise.all([
          c.readContract({address:stacks,abi:stacksAbi,functionName:'getDrop',args:[auth.address,t],blockNumber:auth.blockNumber}),
          c.readContract({address:stacks,abi:stacksAbi,functionName:'getDropPhase',args:[auth.address,t],blockNumber:auth.blockNumber}),
          c.readContract({address:stacks,abi:stacksAbi,functionName:'getDropRound',args:[auth.address,t],blockNumber:auth.blockNumber}),
        ]);
        dropType=Number((drop as {dropType:number}).dropType); phase=Number(p); round=String(r);
      } catch { /* Unknown is never interpreted as available. */ }
      const eligibility = !token.created ? 'NOT_CREATED'
        : token.locked ? 'TOKEN_LOCKED'
        : page ? page.archived_at ? 'RESTORE_CANONICAL' : 'MANAGE_PAGE'
        : dropType===null ? 'VERIFY_REQUIRED'
        : dropType!==0 ? 'EXTERNAL_DROP'
        : 'AVAILABLE';
      return { ...token,dropType,phase,round,eligibility,
        page:page?{id:page.id,slug:page.slug,state:page.state,
          archived:!!page.archived_at,published:page.published_revision!==null,
          title:page.draft?.content?.title}:null };
    }));
    rows.push(...resolved);
  }
  return {tokens:rows,total:inventory.total,observedBlock:String(auth.blockNumber),
    observedAt:new Date().toISOString()};
}
export async function changePageArchive(id:string,expectedVersion:number,action:'archive'|'restore',s:Session) {
  const {page,info}=await pageForAdmin(id,s);
  if(page.version!==expectedVersion) throw new AppError('VERSION_CONFLICT','Refresh the Mint Page first',409);
  if(action==='archive' && page.published_revision!==null
     && (!info.sale || info.sale.drop.dropType!==0 || info.sale.phase!==0))
    throw new AppError('DROP_MUST_BE_CLOSED',
      'Close the on-chain Stacks drop and verify it before archiving this published Mint Page.',409);
  return command('page_lifecycle',{id,expectedVersion,action,actor:s.wallet.toLowerCase(),
    closedDrop:info.sale?.drop.dropType===0 && info.sale.phase===0,
    reason:action==='archive'?'Archived by authorized collection operator':'Restored canonical Mint Page'});
}

export async function createPage(raw: unknown, s: Session) {
  const draft = draftSchema.parse(raw);
  requireSessionChain(s, draft.chainId);
  const info = await authorize(draft.chainId, draft.contract, s.wallet, BigInt(draft.tokenId));
  if (!info.token.created)
    throw new AppError('TOKEN_MISSING', 'Create this token on-chain before creating a mint page');
  if (!info.sale || info.sale.drop.dropType !== 0)
    throw new AppError('EXTERNAL_DROP',
      'An on-chain Stacks drop is configured for this token. Close it before creating a Mint Page here.',409);
  await currencyInfo(draft.chainId, draft.sale.currencyAddress, info.blockNumber);
  return command('page_create', { draft, actor: s.wallet.toLowerCase(), baseline: baseline(info) });
}
export async function savePage(id: string, expectedVersion: number, raw: unknown, s: Session) {
  const draft = draftSchema.parse(raw);
  const { page } = await pageForAdmin(id, s);
  if(page.archived_at) throw new AppError('PAGE_ARCHIVED','Restore the canonical Mint Page before editing.',409);
  if (draft.chainId !== page.chain_id || draft.contract.toLowerCase() !== page.contract)
    throw new AppError('IMMUTABLE_IDENTITY',
      'Changing the blockchain or NFT contract requires a new Mint Page', 409);
  const identityChanged = draft.tokenId !== page.token_id || draft.slug !== page.slug;
  if (!identityChanged)
    return command('page_save', { id, expectedVersion, draft, actor: s.wallet.toLowerCase() });
  if (page.state !== 'DRAFT' || page.published_revision !== null)
    throw new AppError('IDENTITY_LOCKED',
      'Only an unpublished draft without publication history can change its token or URL. Create a separate Mint Page for this target.', 409);
  // Revalidate the NEW NFT, even if the old page was already authorized.
  // The database makes the identity rewrite, version, revision and audit atomic.
  const nextInfo = await authorize(draft.chainId, draft.contract, s.wallet, BigInt(draft.tokenId));
  if (!nextInfo.token.created)
    throw new AppError('TOKEN_MISSING',
      'The new Token ID must exist on-chain before the Mint Page can target it', 409);
  if (!nextInfo.sale || nextInfo.sale.drop.dropType !== 0)
    throw new AppError('EXTERNAL_DROP','The target Token ID already has an on-chain drop. Close it first.',409);
  await currencyInfo(draft.chainId, draft.sale.currencyAddress, nextInfo.blockNumber);
  return command('page_reidentify', {
    id, expectedVersion, draft, actor: s.wallet.toLowerCase(), baseline: baseline(nextInfo),
  });
}
export async function rebasePage(
  id: string,
  expectedVersion: number,
  accepted: string,
  s: Session,
) {
  const { page, info } = await pageForAdmin(id, s);
  const current = baseline(info);
  if (current !== accepted)
    throw new AppError(
      'SNAPSHOT_MOVED',
      'On-chain settings changed again; inspect the latest settings before accepting',
      409,
    );
  return command('page_rebase', {
    id,
    expectedVersion,
    baseline: current,
    actor: s.wallet.toLowerCase(),
  });
}
