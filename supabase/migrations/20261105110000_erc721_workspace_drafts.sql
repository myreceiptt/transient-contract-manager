-- ERC721TL workspace drafts, isolated from GO1 ERC1155 mint_page and publication records.
-- Source migration only. Must NOT be applied to any remote database without approval.
-- Service-role RPC only; authorization and on-chain role/ownerOf checks are in the API server.
create table if not exists public.erc721_workspace_drafts (
  id uuid primary key default gen_random_uuid(),
  chain_id bigint not null,
  contract text not null check(contract ~ '^0x[0-9a-f]{40}$'),
  kind text not null check(kind in ('ARTWORK','MINT_PAGE','AUCTION')),
  identity text not null check(length(identity) between 1 and 150),
  actor text not null check(actor ~ '^0x[0-9a-f]{40}$'),
  draft jsonb not null default '{}'::jsonb check(jsonb_typeof(draft)='object'),
  version integer not null default 1 check(version >= 1),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(chain_id,contract,kind,identity),
  check ((kind='MINT_PAGE' and identity='collection') or
         (kind='AUCTION' and identity ~ '^[1-9][0-9]*:0x[0-9a-f]{40}$') or
         (kind='ARTWORK' and identity ~ '^[0-9a-f-]{36}$'))
);
create table if not exists public.erc721_workspace_draft_revisions (
  draft_id uuid not null references public.erc721_workspace_drafts(id),
  version integer not null,
  editor text not null,
  draft jsonb not null,
  created_at timestamptz not null default now(),
  primary key(draft_id,version)
);
create index if not exists erc721_drafts_collection_idx on public.erc721_workspace_drafts
  (chain_id,contract,kind,updated_at desc);
create index if not exists erc721_drafts_actor_idx on public.erc721_workspace_drafts
  (actor,kind,updated_at desc);
alter table public.erc721_workspace_drafts enable row level security;
alter table public.erc721_workspace_draft_revisions enable row level security;
revoke all on public.erc721_workspace_drafts,public.erc721_workspace_draft_revisions
  from public,anon,authenticated,service_role;

-- A server-only RPC supplies an atomic revision check and append-only version snapshot.
-- An API caller cannot choose allowCollection, actor, kind, or target scope without
-- an authenticated session and authoritative chain-side role check.
create or replace function public.tcm_erc721_draft_op(p jsonb)
 returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
  action text:=p->>'action';
  actor_wallet text:=lower(p->>'actor');
  collection text:=lower(p->>'contract');
  draft_kind text:=p->>'kind';
  can_share boolean:=coalesce((p->>'allowCollection')::boolean,false);
  found_draft public.erc721_workspace_drafts;
  result jsonb;
begin
  if actor_wallet is null or actor_wallet !~ '^0x[0-9a-f]{40}$'
     or collection is null or collection !~ '^0x[0-9a-f]{40}$'
     or draft_kind not in ('ARTWORK','MINT_PAGE','AUCTION')
     or (p->>'chainId')::bigint not in (1,4663,8453,360)
  then raise exception 'INVALID_DRAFT_SCOPE';end if;
  if draft_kind='AUCTION' and can_share then raise exception 'AUCTION_PRIVATE';end if;
  if action='list' then
    select coalesce(jsonb_agg(to_jsonb(d) order by d.updated_at desc),'[]'::jsonb)
      into result from (
        select * from public.erc721_workspace_drafts
        where chain_id=(p->>'chainId')::bigint and contract=collection and kind=draft_kind
          and archived_at is null and (can_share or actor=actor_wallet)
        order by updated_at desc,id desc limit 25
      ) d;
    return result;
  end if;
  if action='create' then
    if not can_share and draft_kind<>'AUCTION' then raise exception 'ADMIN_REQUIRED';end if;
    if (p->>'identity') is null or (p->>'identity')='' or
       octet_length((p->'data')::text)>20000 then raise exception 'INVALID_DRAFT';end if;
    if draft_kind='MINT_PAGE' and p->>'identity'<>'collection' then raise exception 'MINT_SCOPE';end if;
    if draft_kind='AUCTION' and p->>'identity'<> (p->'data'->>'tokenId')||':'||actor_wallet
      then raise exception 'AUCTION_IDENTITY';end if;
    insert into public.erc721_workspace_drafts
      (chain_id,contract,kind,identity,actor,draft)
    values ((p->>'chainId')::bigint,collection,draft_kind,p->>'identity',
      actor_wallet,p->'data')
    returning * into found_draft;
    insert into public.erc721_workspace_draft_revisions
      (draft_id,version,editor,draft)
    values(found_draft.id,found_draft.version,actor_wallet,found_draft.draft);
    return to_jsonb(found_draft);
  end if;
  select * into found_draft from public.erc721_workspace_drafts
   where id=(p->>'id')::uuid and chain_id=(p->>'chainId')::bigint
     and contract=collection and kind=draft_kind
     and (can_share or actor=actor_wallet)
   for update;
  if not found then raise exception 'NOT_FOUND';end if;
  if action='get' then return to_jsonb(found_draft);end if;
  if found_draft.archived_at is not null then raise exception 'DRAFT_ARCHIVED';end if;
  if (p->>'expectedVersion')::integer<>found_draft.version
    then raise exception 'VERSION_CONFLICT';end if;
  if draft_kind<>'AUCTION' and not can_share then raise exception 'ADMIN_REQUIRED';end if;
  if action='save' then
    if octet_length((p->'data')::text)>20000 then raise exception 'INVALID_DRAFT';end if;
    if draft_kind='AUCTION' and
       found_draft.identity<>(p->'data'->>'tokenId')||':'||actor_wallet
       then raise exception 'AUCTION_IDENTITY';end if;
    update public.erc721_workspace_drafts
      set draft=p->'data',version=version+1,updated_at=now()
      where id=found_draft.id returning * into found_draft;
    insert into public.erc721_workspace_draft_revisions(draft_id,version,editor,draft)
      values(found_draft.id,found_draft.version,actor_wallet,found_draft.draft);
    return to_jsonb(found_draft);
  end if;
  if action='archive' then
    update public.erc721_workspace_drafts
      set archived_at=now(),version=version+1,updated_at=now()
      where id=found_draft.id returning * into found_draft;
    insert into public.erc721_workspace_draft_revisions(draft_id,version,editor,draft)
      values(found_draft.id,found_draft.version,actor_wallet,found_draft.draft);
    return to_jsonb(found_draft);
  end if;
  raise exception 'UNKNOWN_DRAFT_OPERATION';
end $$;
revoke all on function public.tcm_erc721_draft_op(jsonb) from public,anon,authenticated;
grant select,insert,update,delete on public.erc721_workspace_drafts,
 public.erc721_workspace_draft_revisions to service_role;
grant execute on function public.tcm_erc721_draft_op(jsonb) to service_role;
