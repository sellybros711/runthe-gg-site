-- ============================================================================
-- 47_runtour_feedback.sql  —  in-app player feedback (bugs / ideas / anything)
-- ============================================================================
-- Backs the in-game "Send Feedback" form. Anyone can submit (guest or signed in),
-- so the RPC is anon-callable. Nothing is read publicly — only the owner reads the
-- table from the Supabase dashboard (or a future admin view). Integrity posture
-- matches the guest leaderboard: no identity is trusted from the client beyond the
-- authenticated uid; the message is trimmed + length-capped; the category is
-- whitelisted; an emailed reply address is only stored if it looks like an email.
--
-- Apply in the Supabase SQL editor (idempotent, re-runnable). No client can read
-- this table — RLS is on with NO select/insert policy, so the only write path is
-- the SECURITY DEFINER function below, and only the service role / dashboard reads.
-- ----------------------------------------------------------------------------

create table if not exists public.runtour_feedback(
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  user_id    uuid references auth.users(id) on delete set null,   -- null for guests
  username   text,                                                 -- attributed server-side if signed in
  category   text not null default 'other',                       -- bug | idea | praise | other
  message    text not null,
  email      text,                                                 -- optional reply address (guests)
  context    jsonb,                                                -- screen/mode/year/ua for triage
  status     text not null default 'new'                           -- for your own triage (new/seen/done)
);

alter table public.runtour_feedback enable row level security;
-- (deliberately NO policies: anon/authenticated cannot select or insert directly;
--  the SECURITY DEFINER RPC is the only write path, the dashboard is the only read path.)

create index if not exists runtour_feedback_created_idx on public.runtour_feedback (created_at desc);
create index if not exists runtour_feedback_cat_idx     on public.runtour_feedback (category, created_at desc);

-- ---------------------------------------------------------------------------
-- submit — callable by anyone (guest or signed in). Returns the new row id.
-- ---------------------------------------------------------------------------
create or replace function public.runtour_feedback_submit(
  p_category text,
  p_message  text,
  p_email    text  default null,
  p_context  jsonb default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text;
  v_msg   text := left(trim(coalesce(p_message, '')), 4000);
  v_cat   text := lower(coalesce(p_category, 'other'));
  v_email text := nullif(left(trim(coalesce(p_email, '')), 200), '');
  v_id    bigint;
begin
  if length(v_msg) < 2 then
    raise exception 'feedback message is empty';
  end if;
  if v_cat not in ('bug', 'idea', 'praise', 'other') then
    v_cat := 'other';
  end if;
  if v_uid is not null then
    select username into v_name from profiles where id = v_uid;
  end if;
  insert into public.runtour_feedback(user_id, username, category, message, email, context)
  values (
    v_uid, v_name, v_cat, v_msg,
    -- only keep an email that actually looks like one
    case when v_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then v_email else null end,
    p_context)
  returning id into v_id;
  return v_id;
end; $$;

revoke all on function public.runtour_feedback_submit(text, text, text, jsonb) from public;
grant execute on function public.runtour_feedback_submit(text, text, text, jsonb) to anon, authenticated;
