import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

// Entirely in memory. Never connects to Supabase or reads database credentials.
const migrationPath = process.argv[2] || 'supabase/migrations/20261021111911_core.sql';
const sql = await readFile(migrationPath, 'utf8');
const identitySql = await readFile('supabase/migrations/20261028100000_page_identity_drafts.sql', 'utf8');
const lifecycleSql = await readFile('supabase/migrations/20261030132000_token_first_mint_pages.sql','utf8');
const slugSql = await readFile('supabase/migrations/20261030150000_published_page_slug_aliases.sql','utf8');
const expected = [
  'app_sessions',
  'audit_logs',
  'auth_challenges',
  'collection_profiles',
  'collections',
  'media_assets',
  'mint_page_revisions',
  'mint_page_slug_aliases',
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
    await db.exec(identitySql);
    await db.exec(lifecycleSql);
    await db.exec(slugSql);
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
    await db.exec(identitySql);
    await db.exec(lifecycleSql);
    await db.exec(slugSql);
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
    assert.equal(indexCount.rows[0].count, 13, 'Explicit indexes');
    const foreignKeys = await db.query<{ count: number }>(
      "select count(*)::int as count from pg_constraint where connamespace='public'::regnamespace and contype='f'",
    );
    assert.equal(foreignKeys.rows[0].count, 7, 'Foreign key boundaries');
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
      const identityPriv = await db.query<{ allowed: boolean }>(
        "select has_function_privilege($1,'public.tcm_page_reidentify(jsonb)','EXECUTE') as allowed",
        [role],
      );
      assert.equal(identityPriv.rows[0].allowed, role === 'service_role');
      const lifecyclePriv=await db.query<{allowed:boolean}>(
        "select has_function_privilege($1,'public.tcm_page_lifecycle(jsonb)','EXECUTE') as allowed",[role]);
      assert.equal(lifecyclePriv.rows[0].allowed, role==='service_role');
      const slugPriv = await db.query<{allowed:boolean}>(
        "select has_function_privilege($1,'public.tcm_page_slug_edit(jsonb)','EXECUTE') as allowed",[role]);
      assert.equal(slugPriv.rows[0].allowed,role==='service_role');
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
        db.query("select public.tcm_page_reidentify('{}'::jsonb)"),
        /permission denied/,
      );
      await assert.rejects(db.query("select public.tcm_page_lifecycle('{}'::jsonb)"),/permission denied/);
      await assert.rejects(db.query("select public.tcm_page_slug_edit('{}'::jsonb)"),/permission denied/);
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
    await assert.rejects(command('page_create',{
      actor:contract,baseline:'test',
      draft:{chainId:1,contract,tokenId:'1',slug:'migration-sibling-token'}
    }),/duplicate key/);
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
    const revised = (
      await db.query<{ result: any }>(
        'select public.tcm_page_reidentify($1::jsonb) as result',
        [JSON.stringify({
          id: page.id, expectedVersion: page.version, actor: contract,
          baseline: 'different-nft-snapshot',
          draft: { ...page.draft, tokenId: '2', slug: 'migration-test-renamed' },
        })],
      )
    ).rows[0].result;
    assert.equal(revised.token_id, '2');
    assert.equal(revised.slug, 'migration-test-renamed');
    assert.equal(revised.version, 2);
    assert.equal((await command('revisions', { id: page.id })).length, 2);
    await assert.rejects(
      db.query('select public.tcm_page_reidentify($1::jsonb)', [JSON.stringify({
        id: page.id, expectedVersion: 1, actor: contract,
        draft: { ...page.draft, slug: 'stale-rename' },
      })]),
      /VERSION_CONFLICT/,
    );
    await db.exec("update public.mint_pages set state='PUBLISHED',published_revision=2 where id='"+revised.id+"'");
    const renamed = (await db.query<{result:any}>(
      'select public.tcm_page_slug_edit($1::jsonb) as result',
      [JSON.stringify({id:revised.id,expectedVersion:revised.version,
        expectedSlug:revised.slug,slug:'migration-renamed-live',actor:contract})]
    )).rows[0].result;
    assert.equal(renamed.token_id,'2');
    assert.equal(renamed.id,revised.id);
    assert.equal(renamed.published_revision,2,'Slug rename does not publish unsent content');
    assert.equal(renamed.version,3);
    const alias = await db.query<{slug:string,page_id:string}>(
      'select slug,page_id from public.mint_page_slug_aliases where page_id=$1',[revised.id]);
    assert.equal(alias.rows[0].slug,'migration-test-renamed');
    await assert.rejects(command('page_create',{
      actor:contract,baseline:'test',draft:{
        chainId:1,contract,tokenId:'3',slug:'migration-test-renamed'
      }
    }),/SLUG_RESERVED/);
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
