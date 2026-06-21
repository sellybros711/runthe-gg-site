-- 17_claim_draft.sql
-- Let a player take ownership of an anonymous draft they just finished as a guest.
--
-- When a guest completes a run, submit_draft() inserts the row with
-- user_id = NULL (anonymous). If they then sign in / sign up on the results
-- screen, we want that draft to count toward their NEW profile — its stats,
-- badges, name tier and "top drafts" are all derived from drafts owned by
-- auth.uid().
--
-- claim_draft() stamps the row with the caller's id + their profile name/flag,
-- but ONLY when the row is still unowned (user_id IS NULL). That guard makes it
-- impossible to steal another account's (or another guest's already-claimed)
-- draft.

create or replace function claim_draft(p_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_flag text;
  v_rows int;
begin
  if v_user is null then
    return false;                       -- not signed in → nothing to claim
  end if;

  select username::text, nullif(flag,'')
    into v_name, v_flag
  from profiles
  where id = v_user;

  update drafts
     set user_id = v_user,
         name    = coalesce(v_name, name),
         flag    = coalesce(v_flag, flag)
   where id = p_id
     and user_id is null;               -- only claim a still-anonymous row

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke all on function claim_draft(bigint) from public;
grant  execute on function claim_draft(bigint) to authenticated;
