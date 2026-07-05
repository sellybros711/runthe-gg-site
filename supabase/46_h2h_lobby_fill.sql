-- ============================================================================
-- 46_h2h_lobby_fill.sql  —  Fill a private "play with friends" lobby from the
--                           public pool OR with AI, so a short group is never stuck
-- ============================================================================
-- Owner ask: "if you have 2 of your friends in a foursome and nobody else to play,
-- press a button to join a public lobby where a waiting user or bot will join."
--
-- Two host-only actions on a private lobby that isn't full yet:
--   • h2h_open_public(match_id)  — flip the lobby to is_public so a Quick-Match
--       seeker (a real waiting human) fills the open seat(s). Uses the existing
--       h2h_quick matcher, which already scans open public lobbies.
--   • h2h_fill_bots(match_id)    — fill the remaining seats with AI opponents so
--       the match can start right now. Bots are REAL h2h_players rows (so every
--       human in the lobby sees them and the match resolves normally), but with
--       user_id = null and is_bot = true. Their draft is server-generated (so a
--       host can't stack the lobby with deliberately-weak bots to farm the board).
--
-- Schema: h2h_players.user_id is relaxed to NULLABLE and an is_bot flag added.
-- (Postgres treats NULLs as distinct in the unique(match_id,user_id) index, so
-- many bots coexist; the FK to auth.users only checks non-null rows.)
--
-- h2h_report is redefined to resolve on HUMAN consensus only — bots never call a
-- client, so they never report; they auto-agree, and never get a board record.
--
-- Idempotent; apply AFTER 41_h2h_phase1.sql (and 42/43/44 if used). Same posture
-- as the rest of h2h: writes flow through SECURITY DEFINER RPCs.
-- ----------------------------------------------------------------------------

alter table public.h2h_players add column if not exists is_bot boolean not null default false;
alter table public.h2h_players alter column user_id drop not null;

-- ---------------------------------------------------------------------------
-- believable server-generated bot build (70-88 base, 1-2 spikes), so a filled
-- seat plays like a drafted golfer and can't be gamed by the host
-- ---------------------------------------------------------------------------
create or replace function public._h2h_bot_skills() returns jsonb
language plpgsql volatile set search_path=public as $$
declare base int := 70 + floor(random()*17)::int; keys text[] := array['dist','acc','app','sht','scr','bnk','put','clu'];
  o jsonb := '{}'::jsonb; k text; v int; i int; spikes int := 1 + floor(random()*2)::int;
begin
  foreach k in array keys loop
    v := greatest(54, least(95, base + floor((random()*2-1)*9)::int));
    o := o || jsonb_build_object(k, v);
  end loop;
  for i in 1..spikes loop
    k := keys[1 + floor(random()*8)::int];
    v := least(97, (o->>k)::int + 5 + floor(random()*8)::int);
    o := o || jsonb_build_object(k, v);
  end loop;
  return o;
end $$;

-- a human-looking bot handle not already used in this match
create or replace function public._h2h_bot_name(p_match_id bigint) returns text
language plpgsql volatile set search_path=public as $$
declare names text[] := array['mike42','jenna23','tomh','kevin09','jmarshall','rgarcia','skelly','coledawg','marcusb',
  'thewill','dannyboy','sullyy','murph','gonzo','hutch','bez','SarahK','MattL','liamo','priyas','diego88','omarh',
  'chrisp','benji','natek','andyg','tsmith','moryan','hollyb','sammyc','leo23','dpatel','ginav','frankie','tonyd',
  'jaylen','ashw','colby7','ryanm','zachl','ellier','brandonk','pauly','hendo','robw','alexd','maxs','jessh',
  'danielk','gregp','oscarb','tylerj','vik','norah','yukit','bigtuna'];
  nm text; tries int := 0;
begin
  loop
    nm := names[1 + floor(random()*array_length(names,1))::int];
    if not exists(select 1 from public.h2h_players where match_id=p_match_id and lower(username)=lower(nm)) then return nm; end if;
    tries := tries + 1;
    if tries > 8 then return nm || floor(random()*90+10)::text; end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- host opens the private lobby to the public pool (Quick-Match seekers can join)
-- ---------------------------------------------------------------------------
create or replace function public.h2h_open_public(p_match_id bigint) returns void
language plpgsql security definer set search_path=public as $$
declare v_uid uuid := auth.uid(); m public.h2h_matches;
begin
  if v_uid is null then raise exception 'sign in'; end if;
  select * into m from public.h2h_matches where id=p_match_id for update;
  if m.id is null then raise exception 'no such match'; end if;
  if m.created_by <> v_uid then raise exception 'only the host can open the lobby'; end if;
  if m.status <> 'lobby' then raise exception 'the match already started'; end if;
  update public.h2h_matches set is_public=true where id=p_match_id;
end $$;

-- ---------------------------------------------------------------------------
-- host fills every remaining seat with AI, then begins the match
-- ---------------------------------------------------------------------------
create or replace function public.h2h_fill_bots(p_match_id bigint) returns int
language plpgsql security definer set search_path=public as $$
declare v_uid uuid := auth.uid(); m public.h2h_matches; cur int; need int; i int; v_slot int;
begin
  if v_uid is null then raise exception 'sign in'; end if;
  select * into m from public.h2h_matches where id=p_match_id for update;
  if m.id is null then raise exception 'no such match'; end if;
  if m.created_by <> v_uid then raise exception 'only the host can fill the lobby'; end if;
  if m.status <> 'lobby' then raise exception 'the match already started'; end if;
  select count(*) into cur from public.h2h_players where match_id=p_match_id;
  need := m.capacity - cur;
  if need <= 0 then return 0; end if;
  for i in 1..need loop
    select count(*) into v_slot from public.h2h_players where match_id=p_match_id;   -- next free slot
    insert into public.h2h_players(match_id,user_id,username,slot,wheel_seed,is_bot,draft,submitted_at)
      values (p_match_id, null, public._h2h_bot_name(p_match_id), v_slot, public._h2h_seed(), true,
              jsonb_build_object('skills', public._h2h_bot_skills(), 'look', '{}'::jsonb), now());
  end loop;
  perform public._h2h_begin_if_full(p_match_id);
  return need;
end $$;

-- ---------------------------------------------------------------------------
-- report the result — now resolves on HUMAN consensus (bots never report, they
-- auto-agree and never get a board record). Full-fill (incl. bots) still required.
-- ---------------------------------------------------------------------------
create or replace function public.h2h_report(p_match_id bigint, p_result jsonb)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_uid uuid := auth.uid();
  m public.h2h_matches;
  n_players int; n_human int; n_rep int; n_agree int; v_win int; v_kind text; did_transition int;
  rec record;
begin
  if v_uid is null then raise exception 'sign in'; end if;
  select * into m from public.h2h_matches where id=p_match_id for update;
  if m.id is null then raise exception 'no such match'; end if;
  if m.status = 'done' then return m.result; end if;         -- already resolved
  if m.status <> 'live' then raise exception 'match not live'; end if;
  if p_result is null or (p_result->>'win') is null then raise exception 'bad result'; end if;

  update public.h2h_players set reported_result = p_result
    where match_id=p_match_id and user_id=v_uid;
  if not found then raise exception 'you are not in this match'; end if;

  v_win  := (p_result->>'win')::int;
  v_kind := coalesce(p_result->>'kind', case when m.mode in ('bestball','scramble') then 'team' else 'slot' end);

  -- consensus among HUMAN players only; the lobby must still be full (bots included)
  select count(*),
         count(*) filter (where not is_bot),
         count(*) filter (where not is_bot and reported_result is not null),
         count(*) filter (where not is_bot and (reported_result->>'win')::int = v_win)
    into n_players, n_human, n_rep, n_agree
    from public.h2h_players where match_id=p_match_id;

  if n_players < m.capacity then return null; end if;         -- not full yet (shouldn't happen at live)
  if n_rep < n_human then return null; end if;                -- still waiting on the other human(s)
  if n_agree < n_human then
    update public.h2h_matches set status='void' where id=p_match_id and status='live';
    return jsonb_build_object('void',true);
  end if;

  -- atomically claim the resolve so records update exactly once
  update public.h2h_matches
     set status='done', resolved_at=now(),
         result = jsonb_build_object('win',v_win,'kind',v_kind,'detail',p_result)
   where id=p_match_id and status='live';
  get diagnostics did_transition = row_count;
  if did_transition = 0 then
    select result into p_result from public.h2h_matches where id=p_match_id;   -- lost the race; return official
    return p_result;
  end if;

  -- update each HUMAN player's per-mode W/L record (bots have no record)
  for rec in select user_id, slot, team from public.h2h_players
             where match_id=p_match_id and not is_bot and user_id is not null loop
    declare won boolean;
    begin
      won := case when v_kind='team' then rec.team = v_win else rec.slot = v_win end;
      insert into public.h2h_records(user_id,mode,wins,losses,streak,best_streak,updated_at)
        values (rec.user_id, m.mode, case when won then 1 else 0 end,
                case when won then 0 else 1 end, case when won then 1 else 0 end,
                case when won then 1 else 0 end, now())
      on conflict (user_id,mode) do update set
        wins   = public.h2h_records.wins   + case when won then 1 else 0 end,
        losses = public.h2h_records.losses + case when won then 0 else 1 end,
        streak = case when won then public.h2h_records.streak + 1 else 0 end,
        best_streak = greatest(public.h2h_records.best_streak,
                               case when won then public.h2h_records.streak + 1 else 0 end),
        updated_at = now();
    end;
  end loop;

  return (select result from public.h2h_matches where id=p_match_id);
end $$;

-- ---------------------------------------------------------------------------
-- grants
-- ---------------------------------------------------------------------------
grant execute on function public.h2h_open_public(bigint) to authenticated;
grant execute on function public.h2h_fill_bots(bigint)   to authenticated;
grant execute on function public.h2h_report(bigint,jsonb) to authenticated;
