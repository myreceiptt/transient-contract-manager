-- Version-fenced collection profiles. No user may write directly to public tables.
-- Authorization is enforced at the Next.js server using fresh owner/admin role checks.
create or replace function public.tcm_collection_profile_op(p jsonb)
returns jsonb language plpgsql security invoker
set search_path=pg_catalog,public as $$
declare r public.collection_profiles; current_version integer; next_doc jsonb; payload jsonb;
begin
  if p->>'action'='read' then
    select * into r from public.collection_profiles
    where chain_id=(p->>'chainId')::bigint and contract=lower(p->>'contract');
    return coalesce(r.profile,jsonb_build_object('version',0,'data','{}'::jsonb));
  end if;
  if p->>'action'<>'write' then raise exception 'INVALID_PROFILE_OPERATION'; end if;
  if p->>'actor' !~ '^0x[0-9a-f]{40}$' then raise exception 'INVALID_ACTOR'; end if;
  payload:=p->'data';
  if jsonb_typeof(payload)<>'object' or octet_length(payload::text)>20000
    then raise exception 'INVALID_PROFILE_DATA'; end if;
  insert into public.collections(chain_id,address)
    values((p->>'chainId')::bigint,lower(p->>'contract')) on conflict do nothing;
  insert into public.collection_profiles(chain_id,contract,profile)
    values((p->>'chainId')::bigint,lower(p->>'contract'),
      jsonb_build_object('version',0,'data','{}'::jsonb))
    on conflict do nothing;
  select * into r from public.collection_profiles
    where chain_id=(p->>'chainId')::bigint and contract=lower(p->>'contract')
    for update;
  current_version:=coalesce((r.profile->>'version')::integer,0);
  if current_version<>(p->>'expectedVersion')::integer
    then raise exception 'PROFILE_VERSION_CONFLICT'; end if;
  next_doc:=jsonb_build_object('version',current_version+1,
     'data',payload,'updatedBy',p->>'actor','updatedAt',now());
  update public.collection_profiles set profile=next_doc
    where chain_id=r.chain_id and contract=r.contract;
  insert into public.audit_logs(page_id,actor,action,detail)
    values(null,p->>'actor','COLLECTION_PROFILE_UPDATED',
      jsonb_build_object('chainId',r.chain_id,'contract',r.contract,
        'version',current_version+1,'before',r.profile->'data','after',payload));
  return next_doc;
end $$;
revoke all on function public.tcm_collection_profile_op(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.tcm_collection_profile_op(jsonb) to service_role;
