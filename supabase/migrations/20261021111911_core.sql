-- Service-only data API. Blockchain permission is checked server-side before every workspace operation.
create table if not exists public.collections (chain_id bigint not null, address text not null check(address ~ '^0x[0-9a-f]{40}$'), created_at timestamptz not null default now(), primary key(chain_id,address));
create table if not exists public.mint_pages (
 id uuid primary key default gen_random_uuid(), chain_id bigint not null, contract text not null, token_id text not null,
 slug text not null unique check(slug ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'), version integer not null default 1,
 state text not null default 'DRAFT' check(state in ('DRAFT','READY_FOR_REVIEW','PUBLISHING','PUBLISHED','PUBLISH_FAILED','OUT_OF_SYNC','ACTION_REQUIRED')),
 draft jsonb not null, baseline text not null, published_revision integer, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(chain_id,contract) references public.collections(chain_id,address)
);
create table if not exists public.mint_page_revisions(page_id uuid not null references public.mint_pages(id), version integer not null, draft jsonb not null, editor text not null, created_at timestamptz not null default now(), primary key(page_id,version));
create table if not exists public.audit_logs(id bigint generated always as identity primary key, page_id uuid references public.mint_pages(id), actor text not null, action text not null, detail jsonb not null default '{}', created_at timestamptz not null default now());
create table if not exists public.publication_records(id uuid primary key default gen_random_uuid(), page_id uuid references public.mint_pages(id), revision integer, actor text not null, chain_id bigint not null, contract text not null, payload jsonb not null, tx_hash text, status text not null default 'PREPARED', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(chain_id,tx_hash));
create table if not exists public.auth_challenges(id text primary key, message text not null, wallet text not null, chain_id bigint not null, expires_at timestamptz not null);
create table if not exists public.app_sessions(token_hash text primary key, wallet text not null, chain_id bigint not null, csrf_hash text not null, expires_at timestamptz not null);
create table if not exists public.rate_limits(key text primary key, hits integer not null, reset_at timestamptz not null);
create table if not exists public.collection_profiles(chain_id bigint not null,contract text not null,profile jsonb not null default '{}',primary key(chain_id,contract),foreign key(chain_id,contract) references public.collections(chain_id,address));
create table if not exists public.media_assets(id uuid primary key default gen_random_uuid(),chain_id bigint not null,contract text not null,uri text not null,mime_type text not null,content_hash text not null,created_at timestamptz not null default now(),foreign key(chain_id,contract) references public.collections(chain_id,address));
create index if not exists mint_pages_collection_idx on public.mint_pages(chain_id,contract);
create index if not exists audit_logs_page_idx on public.audit_logs(page_id,created_at);
create index if not exists publication_records_collection_idx on public.publication_records(chain_id,contract,created_at desc);
create index if not exists publication_records_page_idx on public.publication_records(page_id);
create index if not exists media_assets_collection_idx on public.media_assets(chain_id,contract);
create index if not exists publication_records_actor_idx on public.publication_records(actor,status);
-- Bound the cost of expiry cleanup as sessions/challenges/rate-limit keys grow.
create index if not exists auth_challenges_expiry_idx on public.auth_challenges(expires_at);
create index if not exists app_sessions_expiry_idx on public.app_sessions(expires_at);
create index if not exists rate_limits_reset_idx on public.rate_limits(reset_at);

alter table public.collections enable row level security;
alter table public.collection_profiles enable row level security;
alter table public.mint_pages enable row level security;
alter table public.mint_page_revisions enable row level security;
alter table public.media_assets enable row level security;
alter table public.publication_records enable row level security;
alter table public.audit_logs enable row level security;
alter table public.auth_challenges enable row level security;
alter table public.app_sessions enable row level security;
alter table public.rate_limits enable row level security;
-- No anon/authenticated policies: raw REST access to drafts, sessions, and audit records is denied.
-- Reset inherited/default object grants before granting the exact server permissions.
-- Supabase projects may still have broad table AND sequence default privileges.
revoke all on public.collections,public.collection_profiles,public.mint_pages,public.mint_page_revisions,public.media_assets,public.publication_records,public.audit_logs,public.auth_challenges,public.app_sessions,public.rate_limits from public,anon,authenticated,service_role;
revoke all on sequence public.audit_logs_id_seq from public,anon,authenticated,service_role;

create or replace function public.tcm_command(op text,p jsonb default '{}') returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r public.mint_pages; j jsonb; hit_count integer; pub public.publication_records;
begin
 case op
 when 'rate' then
  delete from public.rate_limits where reset_at<now()-interval '5 minutes';
  insert into public.rate_limits(key,hits,reset_at) values(p->>'key',1,now()+interval '1 minute') on conflict(key) do update set hits=case when rate_limits.reset_at<now() then 1 else rate_limits.hits+1 end,reset_at=case when rate_limits.reset_at<now() then now()+interval '1 minute' else rate_limits.reset_at end returning hits into hit_count;
  return jsonb_build_object('allowed',hit_count<=coalesce((p->>'limit')::integer,30));
 when 'challenge_create' then
  delete from public.auth_challenges where expires_at<now();
  insert into public.auth_challenges values(p->>'id',p->>'message',p->>'wallet',(p->>'chainId')::bigint,(p->>'expiresAt')::timestamptz);return p;
 when 'challenge_consume' then
  delete from public.auth_challenges where id=p->>'id' and expires_at>now() returning to_jsonb(auth_challenges) into j;return j;
 when 'session_create' then
  delete from public.app_sessions where expires_at<now();
  insert into public.app_sessions values(p->>'tokenHash',p->>'wallet',(p->>'chainId')::bigint,p->>'csrfHash',(p->>'expiresAt')::timestamptz);return '{}';
 when 'session_get' then select to_jsonb(s) into j from public.app_sessions s where token_hash=p->>'tokenHash' and expires_at>now();return j;
 when 'session_delete' then delete from public.app_sessions where token_hash=p->>'tokenHash';return '{}';
 when 'page_list' then select coalesce(jsonb_agg(to_jsonb(m) order by updated_at desc),'[]') into j from public.mint_pages m where chain_id=(p->>'chainId')::bigint and contract=lower(p->>'contract');return j;
 when 'page_get' then select to_jsonb(m) into j from public.mint_pages m where id=(p->>'id')::uuid;return j;
 when 'public_get' then select jsonb_build_object('page',to_jsonb(m),'revision',to_jsonb(v)) into j from public.mint_pages m join public.mint_page_revisions v on m.id=v.page_id and m.published_revision=v.version where m.slug=p->>'slug';return j;
 when 'page_create' then
  insert into public.collections(chain_id,address) values((p->'draft'->>'chainId')::bigint,lower(p->'draft'->>'contract')) on conflict do nothing;
  insert into public.mint_pages(chain_id,contract,token_id,slug,draft,baseline) values((p->'draft'->>'chainId')::bigint,lower(p->'draft'->>'contract'),p->'draft'->>'tokenId',p->'draft'->>'slug',p->'draft',p->>'baseline') returning * into r;
  insert into public.mint_page_revisions values(r.id,r.version,r.draft,p->>'actor',now());
  insert into public.audit_logs(page_id,actor,action) values(r.id,p->>'actor','DRAFT_CREATED');return to_jsonb(r);
 when 'page_save' then
  select * into r from public.mint_pages where id=(p->>'id')::uuid for update;
  if not found then raise exception 'NOT_FOUND';end if;
  if r.version<>(p->>'expectedVersion')::integer or r.state='PUBLISHING' then raise exception 'VERSION_CONFLICT';end if;
  if r.chain_id<>(p->'draft'->>'chainId')::bigint or r.contract<>lower(p->'draft'->>'contract') or r.token_id<>p->'draft'->>'tokenId' or r.slug<>p->'draft'->>'slug' then raise exception 'IMMUTABLE_IDENTITY';end if;
  update public.mint_pages set draft=p->'draft',version=version+1,state='DRAFT',updated_at=now() where id=r.id returning * into r;
  insert into public.mint_page_revisions values(r.id,r.version,r.draft,p->>'actor',now());
  insert into public.audit_logs(page_id,actor,action,detail) values(r.id,p->>'actor','DRAFT_SAVED',jsonb_build_object('version',r.version));return to_jsonb(r);
 when 'revisions' then select coalesce(jsonb_agg(to_jsonb(v) order by version desc),'[]') into j from public.mint_page_revisions v where page_id=(p->>'id')::uuid;return j;
 when 'audit' then select coalesce(jsonb_agg(to_jsonb(a) order by id desc),'[]') into j from (select * from public.audit_logs where page_id=(p->>'id')::uuid order by id desc limit 100) a;return j;
 when 'page_rebase' then
  update public.mint_pages set baseline=p->>'baseline',state='READY_FOR_REVIEW',updated_at=now() where id=(p->>'id')::uuid and version=(p->>'expectedVersion')::integer and state<>'PUBLISHING' returning * into r;
  if not found then raise exception 'VERSION_CONFLICT';end if;
  insert into public.audit_logs(page_id,actor,action,detail) values(r.id,p->>'actor','ONCHAIN_SNAPSHOT_ACCEPTED',jsonb_build_object('baseline',r.baseline));return to_jsonb(r);
 when 'intent_create' then
  if p->>'pageId' is not null then
   select * into r from public.mint_pages where id=(p->>'pageId')::uuid for update;
   if not found or r.version<>(p->>'revision')::integer or r.state='PUBLISHING' then raise exception 'VERSION_CONFLICT';end if;
   update public.mint_pages set state='READY_FOR_REVIEW' where id=r.id;
  end if;
  insert into public.publication_records(page_id,revision,actor,chain_id,contract,payload) values((p->>'pageId')::uuid,(p->>'revision')::integer,p->>'actor',(p->>'chainId')::bigint,lower(p->>'contract'),p->'payload') returning to_jsonb(publication_records) into j;return j;
 when 'intent_get' then select to_jsonb(i) into j from public.publication_records i where id=(p->>'id')::uuid;return j;
 when 'intent_list' then select coalesce(jsonb_agg(to_jsonb(i) order by created_at desc),'[]') into j from (select * from public.publication_records where chain_id=(p->>'chainId')::bigint and contract=lower(p->>'contract') order by created_at desc limit 50) i;return j;
 when 'intent_attach' then
  select * into pub from public.publication_records where id=(p->>'id')::uuid for update;
  if not found or pub.status not in ('PREPARED','SUBMITTED') then raise exception 'INTENT_STATE';end if;
  if pub.page_id is not null then
   select * into r from public.mint_pages where id=pub.page_id for update;
   update public.mint_pages set state=case when version=pub.revision then 'PUBLISHING' else 'ACTION_REQUIRED' end,updated_at=now() where id=pub.page_id;
  end if;
  update public.publication_records set tx_hash=lower(p->>'txHash'),payload=payload||jsonb_build_object('nonce',p->'nonce'),status='SUBMITTED',updated_at=now() where id=pub.id returning to_jsonb(publication_records) into j;return j;
 when 'intent_finish' then
  select * into pub from public.publication_records where id=(p->>'id')::uuid for update;
  if not found then raise exception 'NOT_FOUND';end if;
  if pub.status='CONFIRMED' then return to_jsonb(pub);end if;
  update public.publication_records set status=p->>'status',payload=payload||jsonb_build_object('receipt',p->'receipt'),updated_at=now() where id=pub.id returning to_jsonb(publication_records) into j;
  if pub.page_id is not null then
   update public.mint_pages set state=p->>'pageState',baseline=coalesce(p->>'baseline',baseline),published_revision=case when p->>'pageState'='PUBLISHED' then pub.revision else published_revision end,updated_at=now() where id=pub.page_id and version=pub.revision;
   insert into public.audit_logs(page_id,actor,action,detail) values(pub.page_id,p->>'actor',p->>'pageState',jsonb_build_object('txHash',pub.tx_hash,'intentId',pub.id,'version',pub.revision));
  end if;return j;
 when 'publish_content' then
  select * into r from public.mint_pages where id=(p->>'id')::uuid for update;
  if r.version<>(p->>'expectedVersion')::integer or r.state='PUBLISHING' then raise exception 'VERSION_CONFLICT';end if;
  update public.mint_pages set published_revision=version,state='PUBLISHED',baseline=p->>'baseline',updated_at=now() where id=r.id returning * into r;
  insert into public.audit_logs(page_id,actor,action,detail) values(r.id,p->>'actor','CONTENT_PUBLISHED',jsonb_build_object('version',r.version,'blockHash',p->>'blockHash'));return to_jsonb(r);
 else raise exception 'UNKNOWN_COMMAND';
 end case;
end $$;
revoke all on function public.tcm_command(text,jsonb) from public,anon,authenticated;
grant select,insert,update,delete on public.collections,public.collection_profiles,public.mint_pages,public.mint_page_revisions,public.media_assets,public.publication_records,public.audit_logs,public.auth_challenges,public.app_sessions,public.rate_limits to service_role;
grant usage,select on sequence public.audit_logs_id_seq to service_role;
grant execute on function public.tcm_command(text,jsonb) to service_role;
