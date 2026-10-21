import { AppError } from '../lib/domain';
import type { PGlite } from '@electric-sql/pglite';
let localPromise: Promise<PGlite> | undefined;
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
      return db;
    })();
  return localPromise;
}
export async function command(op: string, p: Record<string, unknown> = {}): Promise<any> {
  try {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { createClient } = await import('@supabase/supabase-js');
      const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await db.rpc('tcm_command', { op, p });
      if (error) throw error;
      return data;
    }
    const db = await localDb();
    const r = await db.query<{ result: unknown }>(
      'select public.tcm_command($1,$2::jsonb) as result',
      [op, JSON.stringify(p)],
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
