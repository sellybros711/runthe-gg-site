-- Segue daily challenge: run after 67, 68 and 139 (see setlist/build/test/README.md).
--   psql -d seguetest -f setlist/build/test/test_daily.sql
\set ON_ERROR_STOP 0
select set_config('request.jwt.claims', '', false);
do $$
declare today text := to_char((now() at time zone 'America/New_York')::date, 'YYYY-MM-DD');
        old text := to_char((now() at time zone 'America/New_York')::date - 3, 'YYYY-MM-DD');
        id1 bigint; ok boolean;
begin
  id1 := segue_submit_run('goose', 858, 500, 180, 60, 118, array['cover','bustout','jamchart','bigjam'],
    1200, 7, 2, 1, 1, 1, 1, 1, 1400, 0, 8000, array['d1'],
    array['dt1:a','dt1:b','dt1:c','dt1:d','dt1:e','dt1:f','dt1:g' || floor(random()*1e9)::text], 'daily:' || today);
  if (select daily from segue_runs where id = id1) is distinct from today then raise exception 'FAIL daily column'; end if;
  raise notice 'ok  today''s daily files and carries its day';
  ok := false;
  begin
    perform segue_submit_run('goose', 858, 500, 180, 60, 118, array['cover','bustout','jamchart','bigjam'],
      1200, 7, 2, 1, 1, 1, 1, 1, 1400, 0, 8000, array['d1'],
      array['dt2:a','dt2:b','dt2:c','dt2:d','dt2:e','dt2:f','dt2:g'], 'daily:' || old);
  exception when others then ok := true; end;
  if not ok then raise exception 'FAIL an old daily was accepted'; end if;
  raise notice 'ok  a daily three days old is refused';
  if (select daily from segue_runs where id = (select max(id) from segue_runs where rng_seed is null)) is not null then
    raise exception 'FAIL ordinary night got a day'; end if;
  raise notice 'ok  an ordinary night has no day';
end $$;
