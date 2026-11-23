-- Altair Lite: one row per sandbox, the whole sandbox as a JSON document.
-- WHAT: table lite_sandboxes + two functions the app calls with the publishable key.
-- SHAPE: the table is closed to the API (RLS on, no grants); only lite_load / lite_save are exposed, and they
--        accept only a valid sandbox id and a bounded document, with optimistic concurrency on `version`.

create table if not exists public.lite_sandboxes (
  id text primary key check (id ~ '^[a-z0-9]{6,32}$'),
  data jsonb not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.lite_sandboxes enable row level security;
revoke all on table public.lite_sandboxes from public, anon, authenticated;

create or replace function public.lite_load(p_id text)
returns table (data jsonb, version integer)
language sql
stable
security definer
set search_path = ''
as $$
  select s.data, s.version from public.lite_sandboxes s where s.id = p_id;
$$;

create or replace function public.lite_save(p_id text, p_data jsonb, p_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v integer;
begin
  if p_id !~ '^[a-z0-9]{6,32}$' then raise exception 'invalid sandbox id'; end if;
  if octet_length(p_data::text) > 400000 then raise exception 'sandbox too large'; end if;
  if p_version = 0 then
    if (select count(*) from public.lite_sandboxes) >= 20000 then raise exception 'too many sandboxes'; end if;
    insert into public.lite_sandboxes (id, data, version) values (p_id, p_data, 1)
      on conflict (id) do nothing
      returning version into v;
    -- now and then, forget sandboxes nobody has touched for two weeks
    if random() < 0.02 then
      delete from public.lite_sandboxes where updated_at < now() - interval '14 days';
    end if;
    return coalesce(v, -1);
  end if;
  update public.lite_sandboxes
     set data = p_data, version = version + 1, updated_at = now()
   where id = p_id and version = p_version
  returning version into v;
  return coalesce(v, -1);
end;
$$;

revoke all on function public.lite_load(text) from public;
revoke all on function public.lite_save(text, jsonb, integer) from public;
grant execute on function public.lite_load(text) to anon;
grant execute on function public.lite_save(text, jsonb, integer) to anon;
