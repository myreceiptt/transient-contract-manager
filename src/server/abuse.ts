import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { AppError } from '../lib/domain';
import { command } from './db';

export const budgets = {
  intake: [180, 0],
  auth: [12, 120],
  public: [40, 240],
  inventory: [8, 48],
  metadata: [40, 160],
  media: [60, 240],
  workspace: [90, 600],
  transaction: [20, 120],
} as const;
export type Budget = keyof typeof budgets;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export function requestIdentity(req: Request) {
  if (process.env.VERCEL !== '1') {
    if (process.env.NODE_ENV === 'production')
      throw new AppError(
        'TRUSTED_PROXY_REQUIRED',
        'Hosted requests require the configured Vercel boundary',
        503,
      );
    return 'local'; // Never trust caller-supplied forwarding headers outside Vercel.
  }
  const ip = req.headers.get('x-vercel-forwarded-for')?.trim();
  if (!ip || !isIP(ip))
    throw new AppError('CLIENT_IP_REQUIRED', 'Trusted client IP is missing or invalid', 503);
  // Canonicalize IPv6 so textual aliases cannot create independent buckets.
  return isIP(ip) === 6 ? new URL(`http://[${ip}]`).hostname : ip;
}

export function operationBudget(op: string): Budget {
  if (['challenge', 'login', 'logout'].includes(op)) return 'auth';
  if (op === 'inventory' || op === 'mint_inventory') return 'inventory';
  if (op === 'metadata') return 'metadata';
  if (['inspect', 'currency', 'balance', 'public', 'public_collectors','collection_profile_read'].includes(op)) return 'public';
  if (
    [
      'preview_admin',
      'prepare_admin',
      'preview_collector_quote',
      'preview_publication',
      'prepare_publication',
      'prepare_mint',
      'preflight',
      'attach',
      'confirm',
      'cancel_replacement',
    ].includes(op)
  )
    return 'transaction';
  if (
    [
      'session',
      'pages',
      'page',
      'metadata_pin',
      'collection_profile_write',
      'collection_profile_pin',
      'page_create',
      'page_save',
      'page_rebase',
      'page_lifecycle',
      'page_slug_edit',
      'revisions',
      'audit',
      'publish_content',
      'intent',
      'history',
      'page_history',
    ].includes(op)
  )
    return 'workspace';
  throw new AppError('UNKNOWN_OPERATION', 'Unknown operation', 404);
}

export async function rateLimit(req: Request, budget: Budget, wallet?: string) {
  const [perClient, aggregate] = budgets[budget];
  const consume = async (key: string, limit: number) => {
    const result = await command('rate', { key: `v2:${budget}:${key}`, limit });
    if (result?.allowed !== true)
      throw new AppError('RATE_LIMIT', 'Too many requests. Please wait a minute.', 429);
  };
  // Reject an exhausted client before consuming any shared endpoint capacity.
  await consume(`ip:${digest(requestIdentity(req))}`, perClient);
  if (wallet) await consume(`wallet:${digest(wallet.toLowerCase())}`, perClient);
  if (aggregate) await consume('total', aggregate);
}

const inflight = new Map<string, number>();
export function acquireSlot(req: Request, lane: Budget | 'api') {
  const key = `${lane}:${digest(requestIdentity(req))}`;
  const total = inflight.get(lane) || 0,
    client = inflight.get(key) || 0;
  const [totalLimit, clientLimit] =
    lane === 'metadata' ? [8, 4] : lane === 'media' ? [12, 6] : [16, 6];
  if (total >= totalLimit || client >= clientLimit)
    throw new AppError('CONCURRENCY_LIMIT', 'Too many requests in progress. Please retry.', 429);
  inflight.set(lane, total + 1);
  inflight.set(key, client + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const k of [lane, key]) {
      const n = (inflight.get(k) || 1) - 1;
      if (n) inflight.set(k, n);
      else inflight.delete(k);
    }
  };
}
