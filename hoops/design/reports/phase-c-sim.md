# Career simulator report

3000 careers (random, first, last), 33.0s, phase C.

## Invariants

- all hold: no crash, every career ends, no junk, no wrong-year draft line, no unplanned repeat

## Balance against NARRATIVE.md

| measure | now | band | due | |
|---|---|---|---|---|
| reaches the NBA (high school start) | 100.0 | 85 to 95 | D | not yet |
| route: college (high school start) | 78.6 | 55 to 70 | D | not yet |
| route: G League, overseas or gap year | 21.4 | 8 to 18 | D | not yet |
| lottery pick | 33.3 | 20 to 32 | D | not yet |
| second round or undrafted | 50.2 | 30 to 45 | D | not yet |
| All-Star at least once | 28.2 | 22 to 35 | C | in |
| MVP at least once | 2.7 | 1 to 3 | C | in |
| a ring | 26.8 | 18 to 30 | C | in |
| Hall of Fame (any tier) | 23.2 | 18 to 28 | D | in |
| first ballot or better | 11.9 | 5 to 10 | D | not yet |
| distinct events per career | 60.7 | 70 to 110 | D | not yet |
| two careers' event overlap | 78.3 | 0 to 50 | D | not yet |
| median NBA seasons | 13.0 | 11 to 14 | C | in |
| events never dealt | 0.0 | 0 to 0 | 0 | in |
| unplanned repeats per career | 0.0 | 0 to 0 | C | in |

## The story engine

| per career | value |
|---|---|
| arcs started | 2.9 |
| arcs resolved | 2.7 |
| traits revealed | 1.8 |
| people in the ledger | 17.7 |
| skill badges | 1.9 |
| signature move | 65.5 |
| nickname | 51.7 |
| goals met (share) | 39.3 |
| feed lines | 74.1 |

## Routes

| before the NBA | share |
|---|---|
| bg:oad | 50.0% |
| college | 39.3% |
| gleague | 9.5% |
| overseas | 1.2% |

| draft slot | share |
|---|---|
| first | 16.5% |
| lottery | 33.3% |
| second | 48.6% |
| undrafted | 1.6% |

| in the NBA | share |
|---|---|
| journeyman | 24.3% |
| lifer | 6.6% |
| mixed | 69.2% |

| verdict | share |
|---|---|
| A good career | 40.6% |
| Journeyman | 20.8% |
| On the ballot | 15.4% |
| Hall of Famer | 11.3% |
| First ballot | 7.6% |
| Inner circle | 4.3% |

## Event coverage

| event | careers | per career, when dealt | most in one career |
|---|---|---|---|
| combine | 100.0% | 1.00 | 1 |
| workout | 100.0% | 1.00 | 1 |
| agent | 100.0% | 1.00 | 1 |
| training | 100.0% | 14.80 | 21 |
| after | 100.0% | 1.00 | 1 |
| goal | 99.1% | 11.09 | 19 |
| playoff_eve | 99.0% | 3.61 | 4 |
| injury_tweak | 99.0% | 2.96 | 3 |
| night_out | 98.9% | 2.93 | 3 |
| film_session | 98.5% | 1.96 | 2 |
| charity | 98.5% | 2.87 | 3 |
| ref_heat | 97.7% | 1.93 | 2 |
| family_money | 97.5% | 2.85 | 3 |
| slump | 96.8% | 2.92 | 3 |
| retire | 96.7% | 2.81 | 7 |
| meet_someone | 96.5% | 2.21 | 3 |
| trade_rumor | 96.3% | 2.53 | 3 |
| investment | 96.3% | 2.55 | 3 |
| moment | 95.8% | 6.26 | 18 |
| teammate_fight | 95.8% | 1.89 | 2 |
| fa | 94.5% | 2.31 | 5 |
| rival_trash | 93.9% | 1.93 | 2 |
| local_ad | 93.7% | 1.94 | 2 |
| clutch | 92.7% | 4.02 | 15 |
| body_care | 92.1% | 1.00 | 1 |
| hot_streak | 90.8% | 2.84 | 3 |
| buzzer | 90.8% | 2.77 | 3 |
| online_beef | 89.7% | 1.90 | 2 |
| feud_start | 89.6% | 1.00 | 1 |
| exit_interview | 89.0% | 2.00 | 4 |
| heckler | 89.0% | 1.69 | 2 |
| media_day | 87.5% | 1.82 | 3 |
| playoff_guarantee | 86.1% | 1.88 | 2 |
| teammate_touches | 84.9% | 1.74 | 2 |
| mentor_rookie | 83.7% | 1.00 | 1 |
| load_mgmt | 81.0% | 1.77 | 3 |
| contract_year | 80.7% | 1.67 | 4 |
| injury | 77.9% | 2.18 | 9 |
| extension | 74.6% | 2.03 | 3 |
| nickname | 69.4% | 1.56 | 5 |
| christmas | 69.4% | 2.52 | 4 |
| presser | 67.8% | 1.96 | 13 |
| shoe_deal | 66.3% | 1.00 | 1 |
| build_sig | 65.5% | 1.00 | 1 |
| podcast | 64.7% | 1.00 | 1 |
| coach_bench | 62.2% | 1.45 | 2 |
| rehab_summer | 56.2% | 1.57 | 4 |
| tank | 54.3% | 1.25 | 2 |
| arc_gym_2 | 53.1% | 1.00 | 1 |
| docuseries | 52.1% | 1.00 | 1 |
| arc_feud_2 | 51.1% | 1.00 | 1 |
| hs_summer | 50.0% | 3.00 | 3 |
| offers | 50.0% | 1.00 | 1 |
| agent_pitch | 49.6% | 1.00 | 1 |
| arc_venture_2 | 49.2% | 1.00 | 1 |
| arc_gym_3 | 47.3% | 1.00 | 1 |
| young_star | 46.1% | 1.00 | 1 |
| stuck | 45.9% | 1.25 | 2 |
| arc_feud_3 | 45.1% | 1.00 | 1 |
| mixtape | 44.9% | 1.60 | 2 |
| rap_album | 44.5% | 1.00 | 1 |
| grades | 44.4% | 2.16 | 3 |
| propose | 44.3% | 1.18 | 2 |
| summer_league | 43.3% | 1.66 | 2 |
| critic_segment | 43.3% | 1.00 | 1 |
| arc_promise_2 | 42.1% | 1.00 | 1 |
| coach_fired | 40.9% | 1.20 | 2 |
| build_arch | 40.0% | 1.10 | 3 |
| declare | 39.3% | 1.85 | 3 |
| rival_tv | 39.1% | 1.54 | 2 |
| arc_venture_3 | 39.1% | 1.00 | 1 |
| nooffer | 36.4% | 1.13 | 10 |
| rival_school | 36.3% | 1.43 | 3 |
| double_team | 35.6% | 1.49 | 2 |
| build_pos | 35.6% | 1.01 | 2 |
| amclutch | 33.8% | 1.58 | 6 |
| wedding | 31.5% | 1.00 | 1 |
| mom_game | 29.9% | 1.00 | 1 |
| signing | 28.9% | 1.00 | 1 |
| arc_prep_2 | 28.3% | 1.00 | 1 |
| allstar | 28.2% | 6.85 | 15 |
| commit | 27.8% | 1.00 | 1 |
| nba_scouts | 26.1% | 1.88 | 3 |
| vet_mentor | 26.0% | 1.00 | 1 |
| baby | 25.7% | 2.46 | 4 |
| homecoming | 24.8% | 1.00 | 1 |
| buyout | 23.7% | 1.00 | 1 |
| class_skip | 23.7% | 1.53 | 2 |
| coach_leaves | 23.6% | 1.00 | 1 |
| hometown_call | 21.8% | 1.00 | 1 |
| nil_deal | 20.8% | 1.63 | 4 |
| street_agent | 20.6% | 1.00 | 1 |
| rookie_duty | 20.2% | 1.00 | 1 |
| olympics | 19.5% | 1.32 | 3 |
| booster | 19.2% | 1.00 | 1 |
| beat_feature | 16.8% | 1.00 | 1 |
| breakup | 16.5% | 1.21 | 2 |
| rivalry_col | 16.4% | 1.44 | 3 |
| portal | 15.7% | 2.30 | 3 |
| growth | 14.2% | 1.00 | 1 |
| agent_rift | 13.2% | 1.00 | 1 |
| freshman_wall | 13.1% | 1.00 | 1 |
| camp_invite | 11.7% | 1.13 | 2 |
| prep_transfer | 11.3% | 1.00 | 1 |
| arc_mentor_2 | 11.1% | 1.00 | 1 |
| roommate | 10.8% | 1.00 | 1 |
| superteam | 9.7% | 1.09 | 2 |
| coach_son | 7.0% | 1.00 | 1 |
| bff_call | 4.0% | 1.00 | 1 |
| undrafted | 1.6% | 1.00 | 1 |
| investigation | 1.5% | 1.00 | 1 |
