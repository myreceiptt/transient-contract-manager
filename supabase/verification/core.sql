-- READ ONLY. Run against ztiegrqflrpoksuocrze after the approved migration.
-- Expected: ten tables, all with RLS, zero policies, one invoker RPC, nine explicit indexes.
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' order by c.relname;

select schemaname,tablename,policyname,roles,cmd from pg_policies where schemaname='public';

select p.oid::regprocedure::text as function_name,p.prosecdef as security_definer,p.proconfig
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='tcm_command';

select r.role,c.relname as table_name,
 has_table_privilege(r.role,c.oid,'SELECT') as select_allowed,
 has_table_privilege(r.role,c.oid,'INSERT') as insert_allowed,
 has_table_privilege(r.role,c.oid,'UPDATE') as update_allowed,
 has_table_privilege(r.role,c.oid,'DELETE') as delete_allowed,
 has_table_privilege(r.role,c.oid,'TRUNCATE') as truncate_allowed,
 has_table_privilege(r.role,c.oid,'REFERENCES') as references_allowed,
 has_table_privilege(r.role,c.oid,'TRIGGER') as trigger_allowed,
 has_table_privilege(r.role,c.oid,'MAINTAIN') as maintain_allowed
from (values('anon'),('authenticated'),('service_role')) r(role)
cross join pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' order by r.role,c.relname;

select r.role,
 has_sequence_privilege(r.role,'public.audit_logs_id_seq','USAGE') as usage_allowed,
 has_sequence_privilege(r.role,'public.audit_logs_id_seq','SELECT') as select_allowed,
 has_sequence_privilege(r.role,'public.audit_logs_id_seq','UPDATE') as update_allowed,
 has_function_privilege(r.role,'public.tcm_command(text,jsonb)','EXECUTE') as rpc_allowed
from (values('anon'),('authenticated'),('service_role')) r(role);

select tablename,indexname,indexdef from pg_indexes where schemaname='public' order by tablename,indexname;
select conrelid::regclass::text as table_name,conname,contype,pg_get_constraintdef(oid) as definition
from pg_constraint where connamespace='public'::regnamespace order by table_name,conname;

-- Exact post-migration row counts: all zero before any smoke-test writes.
select 'collections' as table_name,count(*) from public.collections
union all select 'mint_pages',count(*) from public.mint_pages
union all select 'mint_page_revisions',count(*) from public.mint_page_revisions
union all select 'audit_logs',count(*) from public.audit_logs
union all select 'publication_records',count(*) from public.publication_records
union all select 'auth_challenges',count(*) from public.auth_challenges
union all select 'app_sessions',count(*) from public.app_sessions
union all select 'rate_limits',count(*) from public.rate_limits
union all select 'collection_profiles',count(*) from public.collection_profiles
union all select 'media_assets',count(*) from public.media_assets;
