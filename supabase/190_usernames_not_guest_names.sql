-- Run The Games: a new username may not look like a generated guest name.
-- Run once in the Supabase SQL editor. Idempotent: safe to re-run.
-- Order: after 10_accounts.sql and 188_guest_names_camel.sql. The words are read
-- from the generators when a name is checked, so 189's soccer words are covered
-- whether 189 runs before this or after.
--
-- WHY
-- Guests on the boards are filed under generated names: "SteadyScout42" on the
-- arcade (188, rtg_guest_name) and "SillyDragontail52" on Run The Pitch's Daily
-- (189, soccer_guest_name). Both are letters and two digits, which username_ok
-- allows. So a player could register one and pass as a guest, or as a given
-- guest. The owner left the call to the hub, and the hub chose to block it
-- (2026-11-26), so a guest name always means a guest.
--
-- WHAT
--   1. username_guest_like(text): true when a name is one adjective and one noun
--      from either generator's lists, run together, then two digits. Any letter
--      case. The words are read out of rtg_guest_name and soccer_guest_name
--      themselves, so a word added there is covered with nothing restated here.
--   2. username_available, set_username and handle_new_user (10's three) refuse
--      such a name. Otherwise their bodies are 10's, unchanged. username_ok is
--      not touched.
--   3. Existing accounts are untouched. A player who already holds such a name
--      keeps it, and can save it again (set_username allows the name the caller
--      already has).
--
-- The page shows a refused sign-up as "That username is taken. Try another."
-- (username_available answers false), and a refused rename with the message
-- below. No page changes.

-- ---------- 1) the pattern ----------------------------------------------------
-- The two generators' word lists, read from their own source text: the first
-- array literal in a function is its adjectives, the second its nouns.
create or replace function public.guest_name_words()
returns table(adj text[], noun text[])
language sql stable security definer set search_path = public, pg_catalog as $$
  select array_agg(distinct a) filter (where a is not null),
         array_agg(distinct n) filter (where n is not null)
    from (
      select case when m.k = 1 then lower(w) end as a,
             case when m.k = 2 then lower(w) end as n
        from pg_proc p
        join pg_namespace s on s.oid = p.pronamespace and s.nspname = 'public'
        cross join lateral (
          select x.k, x.m[1] as lit
            from regexp_matches(p.prosrc, 'array\[([^\]]+)\]', 'g') with ordinality as x(m, k)
        ) m
        cross join lateral regexp_split_to_table(m.lit, '\s*,\s*') as raw
        cross join lateral (select btrim(raw, E' \n\t''') as w) ww
       where p.proname in ('rtg_guest_name', 'soccer_guest_name')
         and m.k <= 2
    ) t;
$$;
revoke all on function public.guest_name_words() from public, anon, authenticated;

create or replace function public.username_guest_like(p text)
returns boolean
language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  v_adj text[]; v_noun text[]; s text; i int;
begin
  if p is null or lower(p) !~ '^[a-z]+[0-9]{2}$' then return false; end if;
  select adj, noun into v_adj, v_noun from public.guest_name_words();
  if v_adj is null or v_noun is null then return false; end if;
  s := substr(lower(p), 1, length(p) - 2);
  -- split the letters into an adjective then a noun, every way
  for i in 1 .. length(s) - 1 loop
    if substr(s, 1, i) = any (v_adj) and substr(s, i + 1) = any (v_noun) then
      return true;
    end if;
  end loop;
  return false;
end $$;
revoke all on function public.username_guest_like(text) from public;
grant execute on function public.username_guest_like(text) to anon, authenticated;

-- ---------- 2) 10's three, with the refusal -----------------------------------
create or replace function username_available(p_username text)
returns boolean
language sql security definer set search_path = public stable as $$
  select username_ok(p_username)
     and not public.username_guest_like(p_username)
     and not exists (select 1 from profiles where username = p_username);
$$;
revoke all on function username_available(text) from public;
grant  execute on function username_available(text) to anon, authenticated;

create or replace function set_username(p_username text)
returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'must be signed in';
  end if;
  if not username_ok(p_username) then
    raise exception 'username must be 3-20 letters, numbers or underscores';
  end if;
  -- a name in the guest style is kept for guests, unless it is already yours
  if public.username_guest_like(p_username)
     and not exists (select 1 from profiles where id = uid and username = p_username) then
    raise exception 'That name is kept for guests. Try another.';
  end if;
  insert into profiles (id, username) values (uid, p_username)
    on conflict (id) do update set username = excluded.username;
exception when unique_violation then
  raise exception 'username taken';
end;
$$;
revoke all on function set_username(text) from public;
grant  execute on function set_username(text) to authenticated;

create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare uname text := nullif(new.raw_user_meta_data->>'username','');
begin
  if uname is not null and username_ok(uname)
     and not public.username_guest_like(uname)
     and not exists (select 1 from profiles where username = uname) then
    insert into profiles (id, username) values (new.id, uname)
      on conflict (id) do nothing;
  else
    insert into profiles (id) values (new.id)
      on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
