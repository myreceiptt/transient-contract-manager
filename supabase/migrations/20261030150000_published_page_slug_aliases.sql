-- Editable public Mint Page URLs without altering the permanent NFT identity.
-- A published page's historical slugs redirect to its current canonical URL.
create table if not exists public.mint_page_slug_aliases (
  slug text primary key check(slug ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'
    and char_length(slug) between 3 and 80),
  page_id uuid not null references public.mint_pages(id),
  created_at timestamptz not null default now(),
  created_by text not null
);
create index if not exists mint_page_slug_aliases_page_idx
  on public.mint_page_slug_aliases(page_id);

alter table public.mint_page_slug_aliases enable row level security;
revoke all on public.mint_page_slug_aliases from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.mint_page_slug_aliases to service_role;

-- Prevent future new pages and draft reidentification from claiming a URL
-- which was previously published by a different canonical Mint Page.
-- The per-slug advisory lock serializes cross-table slug claims.
create or replace function public.tcm_reject_reserved_slug()
returns trigger language plpgsql security invoker
set search_path=pg_catalog,public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.slug, 91876));
  if exists (
    select 1 from public.mint_page_slug_aliases a
    where a.slug=new.slug and a.page_id<>new.id
  ) then
    raise exception 'SLUG_RESERVED' using errcode='23505';
  end if;
  return new;
end $$;
revoke all on function public.tcm_reject_reserved_slug() from public,anon,authenticated;

drop trigger if exists tcm_mint_page_slug_claim on public.mint_pages;
create trigger tcm_mint_page_slug_claim
  before insert or update of slug on public.mint_pages
  for each row execute function public.tcm_reject_reserved_slug();

-- Even privileged service writes cannot create alias/canonical collisions.
create or replace function public.tcm_reject_alias_collision()
returns trigger language plpgsql security invoker
set search_path=pg_catalog,public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.slug, 91876));
  if exists (
    select 1 from public.mint_pages p
    where p.slug=new.slug and p.identity_retained and p.id<>new.page_id
  ) then
    raise exception 'SLUG_RESERVED' using errcode='23505';
  end if;
  return new;
end $$;
revoke all on function public.tcm_reject_alias_collision() from public,anon,authenticated;

drop trigger if exists tcm_slug_alias_claim on public.mint_page_slug_aliases;
create trigger tcm_slug_alias_claim
  before insert or update of slug on public.mint_page_slug_aliases
  for each row execute function public.tcm_reject_alias_collision();

-- Dedicated atomic identity-preserving rename; does NOT publish draft content.
create or replace function public.tcm_page_slug_edit(p jsonb)
returns jsonb language plpgsql security invoker
set search_path=pg_catalog,public as $$
declare
  r public.mint_pages;
  next_slug text := p->>'slug';
  old_slug text;
begin
  select * into r from public.mint_pages
  where id=(p->>'id')::uuid for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if r.version<>(p->>'expectedVersion')::integer
    or r.slug<>p->>'expectedSlug' then raise exception 'VERSION_CONFLICT'; end if;
  if r.archived_at is not null or r.published_revision is null or not r.identity_retained
    then raise exception 'SLUG_EDIT_REQUIRES_PUBLISHED_PAGE'; end if;
  if exists (
    select 1 from public.publication_records i
    where i.page_id=r.id and i.status in ('PREPARED','SUBMITTED')
  ) then raise exception 'PENDING_TRANSACTION'; end if;
  if next_slug is null or char_length(next_slug) not between 3 and 80
    or next_slug !~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'
    then raise exception 'INVALID_SLUG'; end if;
  if next_slug=r.slug then raise exception 'SLUG_UNCHANGED'; end if;

  old_slug:=r.slug;
  -- Deterministic lock order across multiple concurrent renames.
  perform pg_advisory_xact_lock(hashtextextended(least(old_slug,next_slug),91876));
  perform pg_advisory_xact_lock(hashtextextended(greatest(old_slug,next_slug),91876));

  if exists(select 1 from public.mint_pages m
    where m.slug=next_slug and m.id<>r.id and m.identity_retained)
    or exists(select 1 from public.mint_page_slug_aliases a
    where a.slug=next_slug and a.page_id<>r.id)
    then raise exception 'SLUG_RESERVED' using errcode='23505'; end if;

  -- Reverting to an old URL must never create a redirect loop.
  delete from public.mint_page_slug_aliases
    where slug=next_slug and page_id=r.id;

  update public.mint_pages
    set slug=next_slug,
        draft=jsonb_set(draft,'{slug}',to_jsonb(next_slug),false),
        version=version+1,
        updated_at=now()
    where id=r.id returning * into r;

  insert into public.mint_page_slug_aliases(slug,page_id,created_by)
    values(old_slug,r.id,p->>'actor')
    on conflict(slug) do nothing;

  -- Keep the existing published_revision unchanged: an unsent content draft
  -- must not be published as a side effect of renaming a URL.
  insert into public.mint_page_revisions(page_id,version,draft,editor)
    values(r.id,r.version,r.draft,p->>'actor');
  insert into public.audit_logs(page_id,actor,action,detail)
    values(r.id,p->>'actor','MINT_PAGE_SLUG_CHANGED',
      jsonb_build_object('oldSlug',old_slug,'newSlug',next_slug,
        'version',r.version,'publishedRevision',r.published_revision));
  return to_jsonb(r);
end $$;
revoke all on function public.tcm_page_slug_edit(jsonb) from public,anon,authenticated;
grant execute on function public.tcm_page_slug_edit(jsonb) to service_role;
