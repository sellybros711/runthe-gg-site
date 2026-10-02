# Career simulator report

1000 careers (random, first, last), 7.8s, phase B.

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
| All-Star at least once | 38.5 | 22 to 35 | C | not yet |
| MVP at least once | 1.8 | 1 to 3 | C | in |
| a ring | 52.1 | 18 to 30 | C | not yet |
| Hall of Fame (any tier) | 35.0 | 18 to 28 | D | not yet |
| first ballot or better | 19.7 | 5 to 10 | D | not yet |
| distinct events per career | 47.6 | 70 to 110 | D | not yet |
| two careers' event overlap | 77.2 | 0 to 50 | D | not yet |
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
| journeyman | 29.9% |
| lifer | 13.0% |
| mixed | 57.1% |

| verdict | share |
|---|---|
| A good career | 32.2% |
| Journeyman | 18.3% |
| Hall of Famer | 15.3% |
| On the ballot | 14.5% |
| First ballot | 11.3% |
| Inner circle | 8.4% |

## Event coverage

| event | careers | per career, when dealt | most in one career |
|---|---|---|---|
| combine | 100.0% | 1.00 | 1 |
| workout | 100.0% | 1.00 | 1 |
| agent | 100.0% | 1.00 | 1 |
| training | 100.0% | 15.85 | 23 |
| after | 100.0% | 1.00 | 1 |
| night_out | 99.2% | 6.64 | 12 |
| film_session | 99.0% | 4.82 | 14 |
| charity | 98.1% | 5.02 | 11 |
| slump | 97.0% | 6.05 | 13 |
| ref_heat | 97.0% | 3.90 | 9 |
| fa | 96.5% | 2.59 | 6 |
| family_money | 96.5% | 4.70 | 11 |
| retire | 96.5% | 2.08 | 7 |
| moment | 95.9% | 6.86 | 16 |
| clutch | 95.9% | 4.96 | 18 |
| meet_someone | 95.1% | 2.33 | 8 |
| investment | 93.6% | 3.46 | 10 |
| local_ad | 93.2% | 4.74 | 11 |
| injury_tweak | 91.9% | 2.87 | 8 |
| rival_trash | 91.7% | 3.68 | 10 |
| teammate_fight | 90.9% | 2.76 | 8 |
| buzzer | 90.4% | 4.61 | 13 |
| online_beef | 90.3% | 4.35 | 12 |
| hot_streak | 90.2% | 5.57 | 14 |
| body_care | 86.2% | 1.00 | 1 |
| trade_rumor | 85.6% | 2.21 | 8 |
| heckler | 84.9% | 2.28 | 6 |
| teammate_touches | 82.6% | 2.95 | 9 |
| injury | 81.4% | 2.30 | 8 |
| presser | 79.2% | 2.86 | 13 |
| extension | 75.2% | 2.04 | 3 |
| media_day | 71.0% | 1.72 | 6 |
| shoe_deal | 66.7% | 1.00 | 1 |
| load_mgmt | 65.5% | 1.81 | 6 |
| playoff_guarantee | 61.5% | 1.75 | 6 |
| podcast | 59.0% | 1.00 | 1 |
| rehab_summer | 55.5% | 1.51 | 5 |
| christmas | 54.4% | 1.89 | 6 |
| docuseries | 52.8% | 1.00 | 1 |
| contract_year | 51.1% | 1.30 | 5 |
| hs_summer | 50.0% | 3.00 | 3 |
| offers | 50.0% | 1.00 | 1 |
| tank | 49.9% | 1.51 | 5 |
| coach_bench | 48.8% | 1.64 | 6 |
| agent_pitch | 48.3% | 1.00 | 1 |
| mentor_rookie | 46.9% | 1.36 | 5 |
| mixtape | 44.8% | 1.71 | 3 |
| propose | 43.1% | 1.23 | 4 |
| grades | 42.4% | 2.11 | 6 |
| summer_league | 41.8% | 2.07 | 6 |
| stuck | 41.4% | 1.43 | 7 |
| nooffer | 40.4% | 1.11 | 9 |
| declare | 38.5% | 1.81 | 3 |
| allstar | 38.5% | 8.99 | 17 |
| rap_album | 37.9% | 1.00 | 1 |
| amclutch | 34.6% | 1.54 | 4 |
| rival_school | 34.1% | 1.46 | 3 |
| double_team | 33.3% | 1.64 | 6 |
| young_star | 32.0% | 1.00 | 1 |
| wedding | 30.5% | 1.00 | 1 |
| signing | 28.3% | 1.00 | 1 |
| commit | 28.3% | 1.00 | 1 |
| nba_scouts | 27.2% | 1.58 | 4 |
| rival_tv | 27.1% | 1.52 | 5 |
| class_skip | 26.4% | 1.72 | 4 |
| vet_mentor | 26.2% | 1.00 | 1 |
| homecoming | 25.2% | 1.23 | 3 |
| coach_fired | 23.0% | 1.20 | 4 |
| freshman_wall | 21.7% | 1.00 | 1 |
| hometown_call | 21.6% | 1.00 | 1 |
| rivalry_col | 21.5% | 1.47 | 4 |
| street_agent | 21.4% | 1.00 | 1 |
| rookie_duty | 21.3% | 1.00 | 1 |
| baby | 21.2% | 1.89 | 4 |
| nil_deal | 19.6% | 1.64 | 4 |
| booster | 18.7% | 1.00 | 1 |
| coach_leaves | 17.9% | 1.00 | 1 |
| olympics | 16.4% | 1.38 | 3 |
| portal | 15.2% | 2.20 | 3 |
| growth | 14.7% | 1.00 | 1 |
| breakup | 12.8% | 1.27 | 3 |
| roommate | 11.4% | 1.00 | 1 |
| camp_invite | 11.1% | 1.12 | 2 |
| buyout | 11.0% | 1.00 | 1 |
| prep_transfer | 10.4% | 1.00 | 1 |
| superteam | 8.5% | 1.38 | 4 |
| coach_son | 6.6% | 1.02 | 2 |
| undrafted | 2.1% | 1.00 | 1 |
| investigation | 1.2% | 1.00 | 1 |

Repeated without being designed to recur (careers): declare 179, mentor_rookie 134, rival_tv 111, portal 98, olympics 51, breakup 27, superteam 25, camp_invite 13
