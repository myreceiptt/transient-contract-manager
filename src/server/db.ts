import { AppError } from '../lib/domain';
import type { PGlite } from '@electric-sql/pglite';
let localPromise: Promise<PGlite> | undefined;
async function remoteDb() {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url && !key) return undefined;
  if (!url || !key || !/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url))
    throw new AppError(
      'DATABASE_CONFIG',
      'Configure both isolated Supabase credentials securely',
      503,
    );
  if (process.env.VERCEL_ENV === 'preview' && url !== 'https://ztiegrqflrpoksuocrze.supabase.co')
    throw new AppError(
      'DATABASE_TARGET',
      'This preview requires the approved isolated database',
      503,
    );
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          redirect: 'error',
          signal: AbortSignal.any([
            AbortSignal.timeout(5000),
            ...(init?.signal ? [init.signal] : []),
          ]),
        }),
    },
  });
}

// Bounded reads use existing service-role grants; no migration/RPC changes.
export async function listRecords(
  kind: 'pages' | 'revisions' | 'audit' | 'history',
  p: {
    chainId?: number;
    contract?: string;
    id?: string;
    limit: number;
    offset: number;
  },
) {
  const specs = {
    pages: ['mint_pages', 'updated_at', 'id'],
    revisions: ['mint_page_revisions', 'version', 'version'],
    audit: ['audit_logs', 'id', 'id'],
    history: ['publication_records', 'created_at', 'id'],
  } as const;
  const [table, order, tie] = specs[kind];
  if (
    !Number.isInteger(p.limit) ||
    p.limit < 1 ||
    p.limit > 25 ||
    !Number.isInteger(p.offset) ||
    p.offset < 0 ||
    p.offset > 10000
  )
    throw new AppError('PAGINATION', 'Invalid page range');
  try {
    const remote = await remoteDb();
    if (remote) {
      let q = remote.from(table).select('*');
      q =
        kind === 'pages' || kind === 'history'
          ? q.eq('chain_id', p.chainId!).eq('contract', p.contract!.toLowerCase())
          : q.eq('page_id', p.id!);
      q = q.order(order, { ascending: false });
      if (tie !== order) q = q.order(tie, { ascending: false });
      const { data, error } = await q.range(p.offset, p.offset + p.limit - 1);
      if (error) throw error;
      return data;
    }
    const db = await localDb();
    const collection = kind === 'pages' || kind === 'history';
    const where = collection ? 'chain_id=$1 and contract=$2' : 'page_id=$1';
    const args = collection ? [p.chainId!, p.contract!.toLowerCase()] : [p.id!];
    const result = await db.query(
      `select * from public.${table} where ${where} order by ${order} desc${tie !== order ? `, ${tie} desc` : ''} limit $${args.length + 1} offset $${args.length + 2}`,
      [...args, p.limit, p.offset],
    );
    return result.rows;
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError('DATABASE_ERROR', 'Database list request failed', 503);
  }
}
export async function localDb() {
  if (process.env.NODE_ENV === 'production')
    throw new AppError(
      'DATABASE_REQUIRED',
      'Production requires a configured Supabase database',
      503,
    );
  if (!localPromise)
    localPromise = (async () => {
      const { PGlite } = await import('@electric-sql/pglite');
      const { readFile, mkdir } = await import('node:fs/promises');
      const dir = process.env.TCM_TEST_DB || '.local/database';
      await mkdir(dir, { recursive: true });
      const db = new PGlite(dir);
      await db.exec(
        "do $$ begin if not exists(select from pg_roles where rolname='anon') then create role anon;end if;if not exists(select from pg_roles where rolname='authenticated') then create role authenticated;end if;if not exists(select from pg_roles where rolname='service_role') then create role service_role;end if;end $$;",
      );
      await db.exec(await readFile('supabase/migrations/20261021111911_core.sql', 'utf8'));
      await db.exec(await readFile('supabase/migrations/20261028100000_page_identity_drafts.sql', 'utf8'));
      return db;
    })();
  return localPromise;
}
export async function command(op: string, p: Record<string, unknown> = {}): Promise<any> {
  try {
    const dbRemote = await remoteDb();
    if (dbRemote) {
      const db = dbRemote;
      const { data, error } = op === 'page_reidentify'
        ? await db.rpc('tcm_page_reidentify', { p })
        : await db.rpc('tcm_command', { op, p });
      if (error) throw error;
      return data;
    }
    const db = await localDb();
    const r = await db.query<{ result: unknown }>(
      op === 'page_reidentify'
        ? 'select public.tcm_page_reidentify($1::jsonb) as result'
        : 'select public.tcm_command($1,$2::jsonb) as result',
      op === 'page_reidentify' ? [JSON.stringify(p)] : [op, JSON.stringify(p)],
    );
    return r.rows[0]?.result;
  } catch (e) {
    if (e instanceof AppError) throw e;
    const msg = e instanceof Error ? e.message : String((e as any)?.message ?? e);
    if (msg.includes('VERSION_CONFLICT'))
      throw new AppError(
        'VERSION_CONFLICT',
        'This draft changed in another session. Reload the latest revision before saving.',
        409,
      );
    if (msg.includes('duplicate key'))
      throw new AppError('CONFLICT', 'That slug or transaction is already registered.', 409);
    if (msg.includes('IDENTITY_LOCKED'))
      throw new AppError('IDENTITY_LOCKED',
        'This page has publication history or is not an unpublished draft. Create a new page to target another token or URL.', 409);
    if (msg.includes('IMMUTABLE_IDENTITY'))
      throw new AppError(
        'IMMUTABLE_IDENTITY',
        'Chain, contract, token ID and slug cannot change after creation.',
        409,
      );
    throw new AppError(
      'DATABASE_ERROR',
      'Database operation failed. Check server configuration.',
      503,
    );
  }
}
