-- Allow a private, never-published draft to change target token or page URL.
-- Critical identity rewrites remain separate from ordinary revision saves.
-- No browser role receives EXECUTE; only the server's service-role client can
-- call this narrow invoker function after SIWE + on-chain admin authorization.
create or replace function public.tcm_page_reidentify(p jsonb)
returns jsonb language plpgsql security invoker
set search_path=pg_catalog,public as $$
declare r public.mint_pages;
begin
 select * into r from public.mint_pages
 where id=(p->>'id')::uuid for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if r.version<>(p->>'expectedVersion')::integer
   then raise exception 'VERSION_CONFLICT'; end if;
 if r.state <> 'DRAFT' or r.published_revision is not null
   then raise exception 'IDENTITY_LOCKED'; end if;
 -- Do not change a token/slug after any publication intent has been
 -- generated, including failed or cancelled attempts. Keep its audit trail.
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
   jsonb_build_object('tokenId',r.token_id,'slug',r.slug,
     'version',r.version));
 return to_jsonb(r);
end $$;
revoke all on function public.tcm_page_reidentify(jsonb) from public,anon,authenticated;
grant execute on function public.tcm_page_reidentify(jsonb) to service_role;
