-- Public NFT collector intelligence: service-owned, resumable, on-chain event index.
-- Never infer that a partially indexed history represents the full holder set.
create table public.nft_index_progress (
  chain_id bigint not null,
  contract text not null,
  token_id text not null,
  backfill_to bigint not null,
  live_from bigint not null,
  observed_head bigint not null,
  updated_at timestamptz not null default now(),
  primary key(chain_id, contract, token_id),
  constraint nft_index_progress_ck check (chain_id>0 and contract ~ '^0x[0-9a-f]{40}$'
    and token_id ~ '^[1-9][0-9]*$' and backfill_to >= -1 and live_from > 0)
);
create table public.nft_index_events (
  chain_id bigint not null,
  contract text not null,
  token_id text not null,
  tx_hash text not null,
  log_index integer not null,
  block_number bigint not null,
  kind text not null check(kind in ('TRANSFER','PURCHASE')),
  from_wallet text,
  to_wallet text,
  amount numeric(78,0) not null check(amount>0),
  primary key(chain_id,contract,token_id,tx_hash,log_index,kind)
);
create index nft_index_activity_idx on public.nft_index_events(
  chain_id,contract,token_id,block_number desc,log_index desc);
create index nft_index_wallets_idx on public.nft_index_events(
  chain_id,contract,token_id,to_wallet);
alter table public.nft_index_progress enable row level security;
alter table public.nft_index_events enable row level security;
revoke all on public.nft_index_progress,public.nft_index_events from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.nft_index_progress to service_role;
grant select,insert,update,delete on public.nft_index_events to service_role;

create function public.tcm_nft_index_init(p jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r public.nft_index_progress;
begin
  insert into public.nft_index_progress(
    chain_id,contract,token_id,backfill_to,live_from,observed_head)
  values ((p->>'chainId')::bigint,p->>'contract',p->>'tokenId',
    (p->>'head')::bigint,(p->>'head')::bigint+1,(p->>'head')::bigint)
  on conflict do nothing;
  select * into r from public.nft_index_progress where
    chain_id=(p->>'chainId')::bigint and contract=p->>'contract'
    and token_id=p->>'tokenId';
  return to_jsonb(r);
end $$;

create function public.tcm_nft_index_ingest(p jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r public.nft_index_progress;
  item jsonb;
  lo bigint:=(p->>'from')::bigint;
  hi bigint:=(p->>'to')::bigint;
  mode text:=p->>'mode';
begin
  select * into r from public.nft_index_progress
    where chain_id=(p->>'chainId')::bigint and contract=p->>'contract'
      and token_id=p->>'tokenId' for update;
  if not found then raise exception 'INDEX_NOT_INITIALIZED'; end if;
  if lo<0 or hi<lo or hi-lo>10000 or jsonb_array_length(p->'events')>1000
    or mode not in ('backfill','live') then raise exception 'INDEX_INPUT_INVALID'; end if;
  if (mode='backfill' and r.backfill_to<>hi)
    or (mode='live' and r.live_from<>lo)
    then return jsonb_build_object('applied',false,'cursorChanged',true); end if;
  for item in select value from jsonb_array_elements(p->'events') loop
    if item->>'kind' not in ('TRANSFER','PURCHASE')
      or item->>'txHash' !~ '^0x[0-9a-f]{64}$'
      or (item->>'logIndex')::integer<0
      or (item->>'block')::bigint not between lo and hi
      or (item->>'amount')::numeric<=0 then
      raise exception 'INVALID_INDEX_EVENT'; end if;
    insert into public.nft_index_events(chain_id,contract,token_id,tx_hash,
      log_index,block_number,kind,from_wallet,to_wallet,amount)
    values(r.chain_id,r.contract,r.token_id,item->>'txHash',
      (item->>'logIndex')::integer,(item->>'block')::bigint,
      item->>'kind',item->>'fromWallet',item->>'toWallet',
      (item->>'amount')::numeric)
    on conflict do nothing;
  end loop;
  if mode='backfill' then
    update public.nft_index_progress set backfill_to=lo-1,updated_at=now()
      where chain_id=r.chain_id and contract=r.contract and token_id=r.token_id;
  else
    update public.nft_index_progress set live_from=hi+1,
      observed_head=hi,updated_at=now()
      where chain_id=r.chain_id and contract=r.contract and token_id=r.token_id;
  end if;
  return jsonb_build_object('applied',true,'cursorChanged',false);
end $$;

create function public.tcm_nft_index_read(p jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r public.nft_index_progress; activities jsonb; wallets jsonb;
begin
  select * into r from public.nft_index_progress
    where chain_id=(p->>'chainId')::bigint and contract=p->>'contract'
      and token_id=p->>'tokenId';
  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into activities
  from (
    select tx_hash as "txHash",log_index as "logIndex",
      block_number::text as "block",kind,
      from_wallet as "fromWallet",to_wallet as "toWallet",
      amount::text as amount
    from public.nft_index_events
    where chain_id=(p->>'chainId')::bigint and contract=p->>'contract'
      and token_id=p->>'tokenId'
    order by block_number desc,log_index desc,kind
    limit 25 offset least(greatest((p->>'activityOffset')::integer,0),10000)
  ) t;
  select coalesce(jsonb_agg(w.wallet),'[]'::jsonb) into wallets
  from (
    select distinct wallet from (
      select to_wallet as wallet from public.nft_index_events
        where chain_id=(p->>'chainId')::bigint and contract=p->>'contract'
          and token_id=p->>'tokenId' and kind='TRANSFER'
      union
      select from_wallet as wallet from public.nft_index_events
        where chain_id=(p->>'chainId')::bigint and contract=p->>'contract'
          and token_id=p->>'tokenId' and kind='TRANSFER'
    ) w
    where wallet is not null and wallet<>'0x0000000000000000000000000000000000000000'
    order by wallet
    limit 25 offset least(greatest((p->>'holderOffset')::integer,0),10000)
  ) w;
  return jsonb_build_object('progress',to_jsonb(r),
    'complete',coalesce(r.backfill_to=-1,false),'activities',activities,'wallets',wallets);
end $$;
revoke all on function public.tcm_nft_index_init(jsonb) from public,anon,authenticated;
revoke all on function public.tcm_nft_index_ingest(jsonb) from public,anon,authenticated;
revoke all on function public.tcm_nft_index_read(jsonb) from public,anon,authenticated;
grant execute on function public.tcm_nft_index_init(jsonb) to service_role;
grant execute on function public.tcm_nft_index_ingest(jsonb) to service_role;
grant execute on function public.tcm_nft_index_read(jsonb) to service_role;
