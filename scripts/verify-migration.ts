import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

// Entirely in memory. Never connects to Supabase or reads database credentials.
const migrationPath = process.argv[2] || 'supabase/migrations/20261021111911_core.sql';
const sql = await readFile(migrationPath, 'utf8');
const expected = [
  'app_sessions',
  'audit_logs',
  'auth_challenges',
  'collection_profiles',
  'collections',
  'media_assets',
  'mint_page_revisions',
  'mint_pages',
  'publication_records',
  'rate_limits',
].sort();
const results: { defaults: string; postgres: string; status: string }[] = [];
for (const defaults of ['supabase', 'broad', 'restricted']) {
  const db = new PGlite();
  try {
    await db.exec(
      'create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon,authenticated,service_role;',
    );
    if (defaults !== 'restricted') {
      // Mirror observed defaults; additionally test legacy PUBLIC grants in the broad profile.
      const roles =
        defaults === 'broad'
          ? 'public,anon,authenticated,service_role'
          : 'anon,authenticated,service_role';
      await db.exec(
        `alter default privileges in schema public grant all on tables to ${roles}; alter default privileges in schema public grant all on sequences to ${roles}; alter default privileges in schema public grant execute on functions to ${roles};`,
      );
    }
    await db.exec('begin');
    await db.exec(sql);
    await db.exec('rollback');
    assert.equal(
      (await db.query("select tablename from pg_tables where schemaname='public'")).rows.length,
      0,
      'DDL rollback must remove all new tables',
    );
    assert.equal(
      (await db.query("select oid from pg_proc where proname='tcm_command'")).rows.length,
      0,
      'DDL rollback must remove RPC',
    );
    await db.exec('begin');
    await db.exec(sql);
    await db.exec('commit');
    const tables = await db.query<{ relname: string; relrowsecurity: boolean }>(
      "select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by c.relname",
    );
    assert.deepEqual(
      tables.rows.map((t) => t.relname),
      expected,
    );
    assert(tables.rows.every((t) => t.relrowsecurity));
    assert.equal(
      (await db.query("select * from pg_policies where schemaname='public'")).rows.length,
      0,
    );
    const functions = await db.query<{ prosecdef: boolean; proconfig: string[] }>(
      "select prosecdef,proconfig from pg_proc where oid='public.tcm_command(text,jsonb)'::regprocedure",
    );
    assert.equal(functions.rows[0].prosecdef, false);
    assert.deepEqual(functions.rows[0].proconfig, ['search_path=pg_catalog, public']);
    const indexCount = await db.query<{ count: number }>(
      "select count(*)::int as count from pg_index i join pg_class t on t.oid=i.indrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='public' and not exists(select from pg_constraint c where c.conindid=i.indexrelid)",
    );
    assert.equal(indexCount.rows[0].count, 9, 'Explicit indexes');
    const foreignKeys = await db.query<{ count: number }>(
      "select count(*)::int as count from pg_constraint where connamespace='public'::regnamespace and contype='f'",
    );
    assert.equal(foreignKeys.rows[0].count, 6, 'Foreign key boundaries');
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const name of expected) {
        for (const privilege of [
          'SELECT',
          'INSERT',
          'UPDATE',
          'DELETE',
          'TRUNCATE',
          'REFERENCES',
          'TRIGGER',
          'MAINTAIN',
        ]) {
          const r = await db.query<{ allowed: boolean }>(
            'select has_table_privilege($1,$2,$3) as allowed',
            [role, 'public.' + name, privilege],
          );
          assert.equal(
            r.rows[0].allowed,
            role === 'service_role' && ['SELECT', 'INSERT', 'UPDATE', 'DELETE'].includes(privilege),
            `${role} ${name} ${privilege}`,
          );
        }
      }
      for (const privilege of ['USAGE', 'SELECT', 'UPDATE']) {
        const r = await db.query<{ allowed: boolean }>(
          'select has_sequence_privilege($1,$2,$3) as allowed',
          [role, 'public.audit_logs_id_seq', privilege],
        );
        assert.equal(
          r.rows[0].allowed,
          role === 'service_role' && privilege !== 'UPDATE',
          `${role} sequence ${privilege}`,
        );
      }
      const r = await db.query<{ allowed: boolean }>(
        "select has_function_privilege($1,'public.tcm_command(text,jsonb)','EXECUTE') as allowed",
        [role],
      );
      assert.equal(r.rows[0].allowed, role === 'service_role');
    }
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      for (const name of expected)
        await assert.rejects(db.query(`select * from public.${name}`), /permission denied/);
      await assert.rejects(
        db.query("select public.tcm_command('page_list','{}')"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select nextval('public.audit_logs_id_seq')"),
        /permission denied/,
      );
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    const command = async (op: string, p: Record<string, unknown>) =>
      (
        await db.query<{ result: any }>('select public.tcm_command($1,$2::jsonb) as result', [
          op,
          JSON.stringify(p),
        ])
      ).rows[0].result;
    const contract = '0x' + '1'.repeat(40);
    const page = await command('page_create', {
      actor: contract,
      baseline: 'test',
      draft: { chainId: 1, contract, tokenId: '1', slug: 'migration-test-one' },
    });
    await command('page_create', {
      actor: contract,
      baseline: 'test',
      draft: { chainId: 8453, contract, tokenId: '1', slug: 'migration-test-two' },
    });
    const first = await command('page_list', { chainId: 1, contract });
    const second = await command('page_list', { chainId: 8453, contract });
    assert.equal(first.length, 1);
    assert.equal(second.length, 1);
    assert.notEqual(first[0].id, second[0].id);
    assert.equal(await command('public_get', { slug: page.slug }), null);
    await assert.rejects(
      command('page_save', { id: page.id, expectedVersion: 2, actor: contract, draft: page.draft }),
      /VERSION_CONFLICT/,
    );
    assert.equal(
      (await command('audit', { id: page.id })).length,
      1,
      'Service RPC can use identity sequence',
    );
    await db.exec('reset role');
    const version = (await db.query<{ version: string }>('show server_version')).rows[0];
    results.push({ defaults, postgres: Object.values(version)[0], status: 'PASS' });
    console.log(
      `PASS migration with ${defaults} defaults: rollback, RLS, grants, RPC, sequence, chain isolation, unpublished privacy, version conflict`,
    );
  } finally {
    await db.close();
  }
}
await mkdir('docs/evidence', { recursive: true });
await writeFile(
  'docs/evidence/migration-verification.json',
  JSON.stringify(
    { migrationPath, sha256: createHash('sha256').update(sql).digest('hex'), results },
    null,
    2,
  ) + '\n',
);
