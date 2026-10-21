import type { Address } from 'viem';
import { command } from './db';
import { authorize, inspect, currencyInfo } from './chain';
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
export async function createPage(raw: unknown, s: Session) {
  const draft = draftSchema.parse(raw);
  requireSessionChain(s, draft.chainId);
  const info = await authorize(draft.chainId, draft.contract, s.wallet, BigInt(draft.tokenId));
  if (!info.token.created)
    throw new AppError('TOKEN_MISSING', 'Create this token on-chain before creating a mint page');
  await currencyInfo(draft.chainId, draft.sale.currencyAddress, info.blockNumber);
  return command('page_create', { draft, actor: s.wallet.toLowerCase(), baseline: baseline(info) });
}
export async function savePage(id: string, expectedVersion: number, raw: unknown, s: Session) {
  const draft = draftSchema.parse(raw);
  const { page } = await pageForAdmin(id, s);
  if (
    draft.chainId !== page.chain_id ||
    draft.contract.toLowerCase() !== page.contract ||
    draft.tokenId !== page.token_id ||
    draft.slug !== page.slug
  )
    throw new AppError(
      'IMMUTABLE_IDENTITY',
      'Create a new page to change chain, collection, token or slug',
      409,
    );
  return command('page_save', { id, expectedVersion, draft, actor: s.wallet.toLowerCase() });
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
