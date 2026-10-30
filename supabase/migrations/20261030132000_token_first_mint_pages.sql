-- Token-first Mint Studio: preserve historical pages and make identity claims atomic.
-- Existing GO1 drafts are retired, never deleted. Published #4 keeps its canonical identity.
alter table public.mint_pages add column if not exists archived_at timestamptz;
alter table public.mint_pages add column if not exists archive_reason text;
alter table public.mint_pages add column if not exists identity_retained boolean not null default true;
alter table public.mint_pages add constraint mint_pages_archive_identity_ck
  check (identity_retained or archived_at is not null);

do $$
declare n integer;
begin
  -- Fail closed if the GO1 published edition has changed since the operator's review.
  if exists (
    select 1 from public.mint_pages
    where chain_id=1 and contract='0x5807e66182a38788a3854853225a2b6d8e0480f2'
      and slug='art-response-1'
      and (token_id <> '4' or state <> 'PUBLISHED' or published_revision is null)
  ) then raise exception 'GO1_PUBLISHED_PAGE_REVIEW_REQUIRED'; end if;
  if exists (
    select 1 from public.mint_pages m join public.publication_records i on i.page_id=m.id
    where m.chain_id=1 and m.contract='0x5807e66182a38788a3854853225a2b6d8e0480f2'
      and m.slug='art-response-1' and i.status in ('PREPARED','SUBMITTED')
  ) then raise exception 'GO1_TRANSACTION_STILL_PENDING'; end if;

  -- #10 has a prepared but unsigned transaction review. A review expires in
  -- five minutes; do not release the token if it was signed or is still valid.
  if exists (
    select 1 from public.mint_pages m join public.publication_records i on i.page_id=m.id
    where m.chain_id=1 and m.contract='0x5807e66182a38788a3854853225a2b6d8e0480f2'
      and m.slug='myreceipt-1'
      and (i.status <> 'PREPARED' or i.tx_hash is not null or
        coalesce((i.payload->'tx'->>'expiresAt')::timestamptz,'infinity'::timestamptz)>=now())
  ) then raise exception 'GO1_UNSIGNED_REVIEW_NOT_SAFE_TO_ARCHIVE'; end if;

  update public.publication_records i set status='EXPIRED',updated_at=now()
  from public.mint_pages m
  where i.page_id=m.id and m.chain_id=1
    and m.contract='0x5807e66182a38788a3854853225a2b6d8e0480f2'
    and m.slug='myreceipt-1'
    and i.status='PREPARED' and i.tx_hash is null
    and (i.payload->'tx'->>'expiresAt')::timestamptz < now();

  update public.mint_pages m
  set archived_at=now(), archive_reason='Operator-authorized token-first workspace reset 2026-10-30',
      identity_retained=false,updated_at=now()
  where m.chain_id=1 and m.contract='0x5807e66182a38788a3854853225a2b6d8e0480f2'
    and m.slug in ('myreceipt-1','minting-pacasila-vs-pancakaki','endhonesa-hahaha')
    and m.state in ('DRAFT','READY_FOR_REVIEW') and m.published_revision is null
    and not exists (select 1 from public.publication_records i where i.page_id=m.id
      and (i.tx_hash is not null or i.status not in ('EXPIRED')));

  update public.mint_pages m
  set archived_at=now(), archive_reason='Owner closed Stacks drop; retain permanent published identity',
      identity_retained=true,updated_at=now()
  where m.chain_id=1 and m.contract='0x5807e66182a38788a3854853225a2b6d8e0480f2'
    and m.slug='art-response-1' and m.token_id='4'
    and m.state='PUBLISHED' and m.published_revision is not null
    and exists (select 1 from public.publication_records i
                where i.page_id=m.id and i.status='CONFIRMED');

  insert into public.audit_logs(page_id,actor,action,detail)
    select id,'operator:2026-10-30-reset','MINT_PAGE_ARCHIVED',
      jsonb_build_object('retainedIdentity',identity_retained,'reason',archive_reason)
    from public.mint_pages
    where archive_reason in (
      'Operator-authorized token-first workspace reset 2026-10-30',
      'Owner closed Stacks drop; retain permanent published identity'
    )
    and not exists (select 1 from public.audit_logs a
      where a.page_id=mint_pages.id and a.action='MINT_PAGE_ARCHIVED'
        and a.actor='operator:2026-10-30-reset');
end $$;

-- The original slug constraint reserves historical drafts forever. Release only
-- draft-only archived slugs; permanent published URLs stay reserved.
alter table public.mint_pages drop constraint if exists mint_pages_slug_key;
create unique index if not exists mint_pages_canonical_token_idx
  on public.mint_pages(chain_id,contract,token_id) where identity_retained;
create unique index if not exists mint_pages_canonical_slug_idx
  on public.mint_pages(slug) where identity_retained;

create index if not exists mint_pages_inventory_idx
  on public.mint_pages(chain_id,contract,token_id,updated_at desc);

create or replace function public.tcm_page_lifecycle(p jsonb)
returns jsonb language plpgsql security invoker
set search_path=pg_catalog,public as $$
declare r public.mint_pages; history_found boolean;
begin
  select * into r from public.mint_pages where id=(p->>'id')::uuid for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if r.version<>(p->>'expectedVersion')::integer then raise exception 'VERSION_CONFLICT'; end if;
  if exists(select 1 from public.publication_records i where i.page_id=r.id
    and (i.status='SUBMITTED' or
      (i.status='PREPARED' and (i.tx_hash is not null or
        coalesce((i.payload->'tx'->>'expiresAt')::timestamptz,
          'infinity'::timestamptz)>=now()))))
    then raise exception 'PENDING_TRANSACTION'; end if;
  update public.publication_records set status='EXPIRED',updated_at=now()
    where page_id=r.id and status='PREPARED' and tx_hash is null
    and (payload->'tx'->>'expiresAt')::timestamptz < now();
  if p->>'action'='archive' then
    if r.archived_at is not null then raise exception 'ALREADY_ARCHIVED'; end if;
    -- A published page can be hidden only after a fresh on-chain observation
    -- from the authenticated server confirms that its drop is not configured.
    if r.published_revision is not null and p->>'closedDrop' <> 'true'
      then raise exception 'DROP_MUST_BE_CLOSED'; end if;
    select exists(select 1 from public.publication_records i
      where i.page_id=r.id and
        (i.tx_hash is not null or i.status in ('SUBMITTED','CONFIRMED','REVERTED')))
      into history_found;
    update public.mint_pages set archived_at=now(),
      archive_reason=left(coalesce(p->>'reason','Archived by authorized operator'),240),
      identity_retained=(r.published_revision is not null or history_found), updated_at=now()
      where id=r.id returning * into r;
    insert into public.audit_logs(page_id,actor,action,detail)
      values(r.id,p->>'actor','MINT_PAGE_ARCHIVED',
        jsonb_build_object('identityRetained',r.identity_retained,'reason',r.archive_reason));
  elsif p->>'action'='restore' then
    if r.archived_at is null then raise exception 'NOT_ARCHIVED'; end if;
    if not r.identity_retained then raise exception 'RELEASED_DRAFT_CANNOT_RESTORE'; end if;
    update public.mint_pages set archived_at=null,archive_reason=null,updated_at=now()
      where id=r.id returning * into r;
    insert into public.audit_logs(page_id,actor,action,detail)
      values(r.id,p->>'actor','MINT_PAGE_RESTORED',
        jsonb_build_object('tokenId',r.token_id,'slug',r.slug));
  else raise exception 'INVALID_LIFECYCLE_ACTION'; end if;
  return to_jsonb(r);
end $$;
revoke all on function public.tcm_page_lifecycle(jsonb) from public,anon,authenticated;
grant execute on function public.tcm_page_lifecycle(jsonb) to service_role;

-- Keep the old draft-only identity-rewrite rules, now preventing archived edits.
create or replace function public.tcm_page_reidentify(p jsonb)
returns jsonb language plpgsql security invoker
set search_path=pg_catalog,public as $$
declare r public.mint_pages;
begin
 select * into r from public.mint_pages where id=(p->>'id')::uuid for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if r.version<>(p->>'expectedVersion')::integer then raise exception 'VERSION_CONFLICT'; end if;
 if r.archived_at is not null or r.state <> 'DRAFT' or r.published_revision is not null
   then raise exception 'IDENTITY_LOCKED'; end if;
 if exists(select 1 from public.publication_records where page_id=r.id)
   then raise exception 'IDENTITY_LOCKED'; end if;
 if (p->'draft'->>'chainId')::bigint <> r.chain_id
   or lower(p->'draft'->>'contract') <> r.contract
   then raise exception 'IMMUTABLE_IDENTITY'; end if;
 if (p->'draft'->>'tokenId') is null or (p->'draft'->>'slug') is null
   then raise exception 'INVALID_DRAFT'; end if;
 update public.mint_pages
   set token_id=p->'draft'->>'tokenId',
       slug=p->'draft'->>'slug',
       draft=p->'draft',
       baseline=p->>'baseline',
       version=version+1,
       state='DRAFT',
       updated_at=now()
 where id=r.id returning * into r;
 insert into public.mint_page_revisions(page_id,version,draft,editor)
 values(r.id,r.version,r.draft,p->>'actor');
 insert into public.audit_logs(page_id,actor,action,detail)
 values(r.id,p->>'actor','DRAFT_IDENTITY_CHANGED',
   jsonb_build_object('tokenId',r.token_id,'slug',r.slug,'version',r.version));
 return to_jsonb(r);
end $$;
revoke all on function public.tcm_page_reidentify(jsonb) from public,anon,authenticated;
grant execute on function public.tcm_page_reidentify(jsonb) to service_role;
