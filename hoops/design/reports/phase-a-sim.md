# Career simulator report

1000 careers (random, first, last), 7.9s, phase A.

## Invariants

- all hold: no crash, every career ends, no junk, no wrong-year draft line, no unplanned repeat

## Balance against NARRATIVE.md

| measure | now | band | due | |
|---|---|---|---|---|
| reaches the NBA (high school start) | 100.0 | 85 to 95 | D | not yet |
| route: college (high school start) | 77.0 | 55 to 70 | D | not yet |
| route: G League, overseas or gap year | 23.0 | 8 to 18 | D | not yet |
| lottery pick | 31.9 | 20 to 32 | D | in |
| second round or undrafted | 51.0 | 30 to 45 | D | not yet |
| All-Star at least once | 37.9 | 22 to 35 | C | not yet |
| MVP at least once | 1.8 | 1 to 3 | C | in |
| a ring | 51.2 | 18 to 30 | C | not yet |
| Hall of Fame (any tier) | 33.8 | 18 to 28 | D | not yet |
| first ballot or better | 20.1 | 5 to 10 | D | not yet |
| distinct events per career | 46.6 | 70 to 110 | D | not yet |
| two careers' event overlap | 76.9 | 0 to 50 | D | not yet |
| median NBA seasons | 16.0 | 11 to 14 | C | not yet |
| events never dealt | 0.0 | 0 to 0 | 0 | in |
| unplanned repeats per career | 0.6 | 0 to 0 | C | not yet |

## Routes

| before the NBA | share |
|---|---|
| bg:oad | 50.0% |
| college | 38.5% |
| gleague | 10.4% |
| overseas | 1.1% |

| draft slot | share |
|---|---|
| first | 17.1% |
| lottery | 31.9% |
| second | 48.9% |
| undrafted | 2.1% |

| in the NBA | share |
|---|---|
| journeyman | 29.6% |
| lifer | 11.8% |
| mixed | 58.6% |

| verdict | share |
|---|---|
| A good career | 32.5% |
| Journeyman | 18.4% |
| On the ballot | 15.3% |
| Hall of Famer | 13.7% |
| First ballot | 11.6% |
| Inner circle | 8.5% |

## Event coverage

| event | careers | per career, when dealt | most in one career |
|---|---|---|---|
| combine | 100.0% | 1.00 | 1 |
| workout | 100.0% | 1.00 | 1 |
| agent | 100.0% | 1.00 | 1 |
| training | 100.0% | 15.84 | 23 |
| after | 100.0% | 1.00 | 1 |
| night_out | 99.1% | 6.61 | 15 |
| film_session | 98.9% | 4.78 | 12 |
| charity | 97.7% | 5.04 | 12 |
| ref_heat | 96.9% | 3.90 | 10 |
| slump | 96.8% | 6.08 | 13 |
| fa | 96.6% | 2.59 | 5 |
| retire | 96.5% | 2.08 | 6 |
| family_money | 96.4% | 4.68 | 13 |
| clutch | 96.1% | 4.91 | 18 |
| meet_someone | 94.9% | 2.39 | 8 |
| injury_tweak | 93.9% | 2.86 | 8 |
| investment | 93.8% | 3.47 | 10 |
| local_ad | 93.1% | 4.77 | 11 |
| rival_trash | 91.6% | 3.60 | 10 |
| teammate_fight | 91.5% | 2.79 | 8 |
| buzzer | 90.6% | 4.70 | 12 |
| hot_streak | 90.2% | 5.59 | 13 |
| online_beef | 89.5% | 4.27 | 12 |
| body_care | 86.4% | 1.00 | 1 |
| trade_rumor | 85.3% | 2.17 | 8 |
| heckler | 84.7% | 2.30 | 7 |
| teammate_touches | 84.0% | 2.91 | 10 |
| injury | 80.9% | 2.31 | 8 |
| presser | 78.8% | 2.89 | 12 |
| extension | 75.2% | 2.06 | 3 |
| media_day | 69.5% | 1.68 | 5 |
| shoe_deal | 65.3% | 1.00 | 1 |
| load_mgmt | 64.8% | 1.88 | 6 |
| playoff_guarantee | 61.6% | 1.78 | 6 |
| podcast | 57.8% | 1.00 | 1 |
| christmas | 53.8% | 1.89 | 6 |
| rehab_summer | 53.4% | 1.52 | 5 |
| contract_year | 52.7% | 1.28 | 4 |
| tank | 52.2% | 1.47 | 4 |
| docuseries | 51.4% | 1.00 | 1 |
| hs_summer | 50.0% | 3.00 | 3 |
| offers | 50.0% | 1.00 | 1 |
| agent_pitch | 48.9% | 1.00 | 1 |
| coach_bench | 48.4% | 1.66 | 6 |
| mentor_rookie | 47.8% | 1.34 | 4 |
| mixtape | 44.8% | 1.71 | 3 |
| propose | 43.5% | 1.26 | 5 |
| grades | 42.4% | 2.11 | 6 |
| summer_league | 41.8% | 2.07 | 6 |
| stuck | 41.5% | 1.44 | 7 |
| nooffer | 41.2% | 1.12 | 9 |
| declare | 38.5% | 1.81 | 3 |
| allstar | 37.9% | 8.87 | 17 |
| rap_album | 37.4% | 1.00 | 1 |
| amclutch | 34.6% | 1.54 | 4 |
| rival_school | 34.1% | 1.46 | 3 |
| double_team | 33.3% | 1.64 | 6 |
| young_star | 32.0% | 1.00 | 1 |
| wedding | 29.9% | 1.00 | 1 |
| signing | 28.3% | 1.00 | 1 |
| commit | 28.3% | 1.00 | 1 |
| rival_tv | 27.6% | 1.48 | 5 |
| nba_scouts | 27.2% | 1.58 | 4 |
| class_skip | 26.4% | 1.72 | 4 |
| vet_mentor | 25.9% | 1.00 | 1 |
| homecoming | 25.2% | 1.23 | 3 |
| coach_fired | 24.5% | 1.18 | 3 |
| freshman_wall | 21.7% | 1.00 | 1 |
| rookie_duty | 21.7% | 1.00 | 1 |
| rivalry_col | 21.5% | 1.47 | 4 |
| street_agent | 21.4% | 1.00 | 1 |
| hometown_call | 21.2% | 1.00 | 1 |
| baby | 20.1% | 1.90 | 4 |
| nil_deal | 19.6% | 1.64 | 4 |
| booster | 18.7% | 1.00 | 1 |
| coach_leaves | 17.9% | 1.00 | 1 |
| olympics | 17.2% | 1.35 | 3 |
| portal | 15.2% | 2.20 | 3 |
| growth | 14.7% | 1.00 | 1 |
| breakup | 13.2% | 1.27 | 4 |
| buyout | 12.3% | 1.00 | 1 |
| roommate | 11.4% | 1.00 | 1 |
| camp_invite | 11.1% | 1.12 | 2 |
| prep_transfer | 10.4% | 1.00 | 1 |
| superteam | 9.3% | 1.30 | 3 |
| coach_son | 6.6% | 1.02 | 2 |
| undrafted | 2.1% | 1.00 | 1 |
| investigation | 1.2% | 1.00 | 1 |

Repeated without being designed to recur (careers): declare 179, mentor_rookie 129, rival_tv 102, portal 98, olympics 53, breakup 29, superteam 25, camp_invite 13

ok: 0 invariant problems, 0 targets due by phase A out of band
