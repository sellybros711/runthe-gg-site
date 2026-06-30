-- ============================================================================
-- 29_username_filter.sql — basic profanity/slur block on usernames
-- ============================================================================
-- Usernames are shown publicly on the leaderboard (profiles.username), and the
-- only validation today is format-only: 3-20 letters/numbers/underscores
-- (username_ok in 10_accounts.sql). Nothing stops someone picking an offensive
-- or slur username. This redefines username_ok to ALSO reject a blocklist of
-- common profanity/slurs, normalizing for the easy evasions (case, underscores,
-- basic leetspeak digit substitution) before checking.
--
-- Every caller of username_ok (username_available, set_username, the OAuth
-- handle_new_user trigger) picks this up automatically — no other file needs
-- to change.
--
-- Known limitation (the "Scunthorpe problem"): this is a substring blocklist,
-- so it can false-positive on an innocuous name that happens to contain a
-- blocked fragment. That's an accepted tradeoff for a casual game's public
-- username field, same as most consumer apps use. The blocklist below is a
-- starting set, not exhaustive — tune it in the Supabase SQL editor any time,
-- it's just a literal array in the function body.
--
-- Idempotent: safe to re-run. Apply in the Supabase SQL editor.
-- ----------------------------------------------------------------------------

create or replace function username_ok(p text)
returns boolean language plpgsql immutable as $$
declare
  norm text;
  blocked text[] := array[
    -- profanity
    'fuck','shit','bitch','cunt','asshole','dick','pussy','cock','whore','slut',
    'bastard','twat','wank','jizz',
    -- slurs (racial / ethnic / religious / homophobic / ableist)
    'nigger','nigga','chink','spic','kike','gook','wetback','beaner','tranny',
    'paki','retard','faggot','fag'
  ];
  term text;
begin
  if p is null or p !~ '^[A-Za-z0-9_]{3,20}$' then
    return false;
  end if;
  -- fold case, drop underscores, and fold common leetspeak digits so trivial
  -- evasions (e.g. "n1gg3r", "fuck_you") still get caught.
  norm := translate(lower(replace(p, '_', '')), '013457', 'oieast');
  foreach term in array blocked loop
    if position(term in norm) > 0 then
      return false;
    end if;
  end loop;
  return true;
end;
$$;
