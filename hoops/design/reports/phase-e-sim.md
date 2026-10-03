# Career simulator report

3000 careers (random, first, last), 449.9s, phase E.

## Invariants

- all hold: no crash, every career ends, no junk, no wrong-year draft line, no unplanned repeat

## Balance against NARRATIVE.md

| measure | now | band | due | |
|---|---|---|---|---|
| reaches the NBA (high school start) | 94.9 | 85 to 95 | D | in |
| route: college (high school start) | 69.1 | 55 to 70 | D | in |
| route: G League, overseas or gap year | 15.7 | 8 to 18 | D | in |
| lottery pick | 29.0 | 20 to 32 | D | in |
| second round or undrafted | 37.9 | 30 to 45 | D | in |
| All-Star at least once | 28.0 | 22 to 35 | C | in |
| MVP at least once | 2.5 | 1 to 3 | C | in |
| a ring | 26.6 | 18 to 30 | C | in |
| route: juco or walk-on | 8.8 | 4 to 10 | D | in |
| route: undrafted or rec league | 8.9 | 4 to 10 | D | in |
| Hall of Fame (any tier) | 26.3 | 18 to 28 | D | in |
| first ballot or better | 8.7 | 5 to 10 | D | in |
| GOAT debate ending | 0.7 | 0.3 to 1 | D | in |
| a secret ending | 3.2 | 1 to 4 | D | in |
| a legend event (switch on) | 35.4 | 30 to 45 | D | in |
| a legend event (switch off) | 0.0 | 0 to 0 | D | in |
| events in the catalog | 309.0 | 250 to Infinity | D | in |
| arcs met in the sweep | 47.0 | 40 to Infinity | D | in |
| routes met in the sweep | 27.0 | 15 to Infinity | D | in |
| endings in the catalog | 34.0 | 30 to Infinity | D | in |
| endings met in the sweep | 33.0 | 30 to Infinity | D | in |
| legend events met in the sweep | 26.0 | 20 to Infinity | D | in |
| distinct events per career | 80.8 | 70 to 110 | D | in |
| two careers' event overlap | 48.1 | 0 to 50 | D | in |
| median NBA seasons | 13.0 | 11 to 14 | C | in |
| events never dealt | 0.0 | 0 to 0 | 0 | in |
| unplanned repeats per career | 0.0 | 0 to 0 | C | in |
| E: generated road reaches the draft | 100.0 | 100 to 100 | E | in |
| E: generated roads that are distinct | 100.0 | 97 to 100 | E | in |
| E: Hall of Fame, generated, Normal | 21.3 | 14 to 30 | E | in |
| E: Hall of Fame, Easy over Normal | 9.3 | 2 to Infinity | E | in |
| E: Hall of Fame, Normal over Hard | 9.5 | 2 to Infinity | E | in |
| E: sons who start after their father retired | 100.0 | 100 to 100 | E | in |
| E: sons who name their father | 100.0 | 100 to 100 | E | in |
| E: challenges met in the sweep | 9.0 | 9 to Infinity | E | in |
| E: stories with every chapter | 100.0 | 100 to 100 | E | in |

## The story engine

| per career | value |
|---|---|
| arcs started | 9.8 |
| arcs resolved | 9.1 |
| traits revealed | 2.1 |
| people in the ledger | 17.1 |
| skill badges | 1.9 |
| signature move | 64.2 |
| nickname | 49.4 |
| goals met (share) | 40.8 |
| feed lines | 72.9 |

## Routes

| before the NBA | share |
|---|---|
| bg:oad | 50.0% |
| college | 34.6% |
| gap | 1.4% |
| gleague | 4.7% |
| juco | 3.7% |
| overseas | 3.2% |
| rec | 1.8% |
| walkon | 0.7% |

| draft slot | share |
|---|---|
| first | 33.1% |
| lottery | 29.0% |
| second | 35.2% |
| undrafted | 2.8% |

| in the NBA | share |
|---|---|
| journeyman | 11.0% |
| lifer | 13.0% |
| mixed | 73.4% |
| none | 2.6% |

| verdict | share |
|---|---|
| A good career | 39.9% |
| Journeyman | 18.2% |
| On the ballot | 16.4% |
| Hall of Famer | 11.8% |
| First ballot | 7.5% |
| Inner circle | 3.7% |
| Never made the league | 2.6% |

## Event coverage

| event | careers | per career, when dealt | most in one career |
|---|---|---|---|
| combine | 100.0% | 1.00 | 1 |
| workout | 100.0% | 1.00 | 1 |
| agent | 100.0% | 1.00 | 1 |
| after | 100.0% | 1.00 | 1 |
| training | 99.9% | 14.32 | 22 |
| goal | 97.3% | 10.96 | 19 |
| playoff_eve | 96.8% | 3.35 | 4 |
| injury_tweak | 96.8% | 2.94 | 3 |
| moment | 95.0% | 6.23 | 17 |
| meet_someone | 95.0% | 2.09 | 3 |
| retire | 94.7% | 2.59 | 7 |
| fa | 92.5% | 2.12 | 4 |
| night_out | 89.6% | 2.19 | 3 |
| clutch | 89.4% | 3.92 | 14 |
| slump | 88.5% | 2.06 | 3 |
| exit_interview | 84.7% | 1.88 | 4 |
| feud_start | 81.8% | 1.00 | 1 |
| playoff_guarantee | 81.3% | 1.83 | 2 |
| film_session | 80.9% | 1.58 | 2 |
| heckler_lou | 80.6% | 1.00 | 1 |
| body_care | 80.5% | 1.00 | 1 |
| hot_streak | 79.5% | 1.92 | 3 |
| family_money | 79.5% | 1.65 | 3 |
| buzzer | 77.1% | 1.78 | 3 |
| rival_trash | 77.0% | 1.52 | 2 |
| extension | 76.4% | 2.10 | 3 |
| injury | 76.0% | 2.16 | 8 |
| charity | 74.2% | 1.61 | 3 |
| mentor_rookie | 73.0% | 1.00 | 1 |
| presser | 72.7% | 1.92 | 9 |
| po_road | 72.5% | 1.00 | 1 |
| teammate_fight | 72.4% | 1.36 | 2 |
| ref_heat | 72.1% | 1.44 | 2 |
| local_ad | 70.8% | 1.48 | 2 |
| nickname | 68.9% | 1.59 | 5 |
| online_beef | 66.6% | 1.45 | 2 |
| arc_lou_2 | 64.3% | 1.00 | 1 |
| build_sig | 64.2% | 1.00 | 1 |
| shoe_deal | 62.8% | 1.00 | 1 |
| social_mistake | 61.3% | 1.00 | 1 |
| touch_tension | 60.7% | 1.00 | 1 |
| arc_touch_2 | 60.7% | 1.00 | 1 |
| arc_touch_3 | 59.6% | 1.00 | 1 |
| mom_game | 58.4% | 1.00 | 1 |
| tv_take | 57.7% | 1.00 | 1 |
| bb_rumor | 57.4% | 1.00 | 1 |
| arc_bb_2 | 57.3% | 1.00 | 1 |
| trade_rumor | 55.7% | 1.37 | 3 |
| arc_tv_2 | 55.1% | 1.00 | 1 |
| lg_cup | 54.3% | 1.00 | 1 |
| lr_split | 53.8% | 1.00 | 1 |
| arc_rift_2 | 53.8% | 1.00 | 1 |
| pre_interview_trap | 52.9% | 1.00 | 1 |
| podcast | 52.2% | 1.00 | 1 |
| investment | 51.9% | 1.27 | 3 |
| po_elim_presser | 50.1% | 1.00 | 1 |
| hs_summer | 50.0% | 2.97 | 3 |
| lm_rest | 48.5% | 1.00 | 1 |
| arc_lm_2 | 48.5% | 1.00 | 1 |
| arc_lm_3 | 48.5% | 1.00 | 1 |
| mom_house | 48.1% | 1.00 | 1 |
| susp_curfew | 46.9% | 1.00 | 1 |
| propose | 46.7% | 1.21 | 2 |
| arc_feud_2 | 46.6% | 1.00 | 1 |
| r_card_game | 44.3% | 1.00 | 1 |
| money_first_buy | 43.7% | 1.00 | 1 |
| arc_money_2 | 43.5% | 1.00 | 1 |
| boo_night | 43.0% | 1.00 | 1 |
| foundation | 40.8% | 1.00 | 1 |
| dn_mom_hug | 40.8% | 1.00 | 1 |
| arc_feud_3 | 40.7% | 1.00 | 1 |
| arc_promise_2 | 40.4% | 1.00 | 1 |
| arc_boo_2 | 40.3% | 1.00 | 1 |
| media_day | 40.1% | 1.19 | 3 |
| money_generational | 40.0% | 1.00 | 1 |
| build_arch | 39.7% | 1.11 | 3 |
| ep_family | 39.7% | 1.00 | 1 |
| sonny_pitch | 39.0% | 1.00 | 1 |
| teammate_touches | 39.0% | 1.18 | 2 |
| declare | 39.0% | 1.72 | 3 |
| load_mgmt | 38.8% | 1.20 | 3 |
| docuseries | 38.4% | 1.00 | 1 |
| r_road_roommate | 37.7% | 1.00 | 1 |
| pre_workout_heat | 36.4% | 1.00 | 1 |
| hs_dad_coach | 34.8% | 1.00 | 1 |
| hs_grades_warning | 34.7% | 1.00 | 1 |
| arc_gym_2 | 34.6% | 1.00 | 1 |
| amclutch | 34.4% | 1.58 | 5 |
| heckler | 34.4% | 1.15 | 2 |
| build_pos | 34.0% | 1.01 | 2 |
| commit | 34.0% | 1.25 | 2 |
| christmas | 33.8% | 1.27 | 3 |
| agent_pitch | 33.4% | 1.00 | 1 |
| mr_rookie | 33.4% | 1.00 | 1 |
| arc_mentor2_2 | 33.4% | 1.00 | 1 |
| contract_year | 32.8% | 1.17 | 3 |
| cy_pressure | 32.7% | 1.00 | 1 |
| coach_bench | 32.5% | 1.19 | 2 |
| critic_segment | 31.5% | 1.00 | 1 |
| offers | 31.4% | 1.00 | 1 |
| nooffer | 31.0% | 1.25 | 10 |
| wedding | 29.9% | 1.00 | 1 |
| homecoming | 29.8% | 1.00 | 1 |
| grades | 29.1% | 1.56 | 3 |
| r_jersey_number | 28.2% | 1.00 | 1 |
| allstar | 28.0% | 6.88 | 15 |
| pf_label | 28.0% | 1.00 | 1 |
| arc_pf_2 | 28.0% | 1.00 | 1 |
| arc_gym_3 | 27.6% | 1.00 | 1 |
| lg_deadline_day | 26.3% | 1.00 | 1 |
| mixtape | 26.0% | 1.18 | 2 |
| young_star | 25.8% | 1.00 | 1 |
| col_coach_yells | 25.2% | 1.00 | 1 |
| snub | 25.2% | 1.00 | 1 |
| arc_snub_2 | 24.8% | 1.00 | 1 |
| vet_mentor | 24.4% | 1.00 | 1 |
| sl_first_game | 24.0% | 1.00 | 1 |
| cameo_movie | 23.9% | 1.00 | 1 |
| booster | 23.4% | 1.00 | 1 |
| summer_league | 23.0% | 1.27 | 2 |
| max_eligible | 22.9% | 1.00 | 1 |
| freshman_wall | 22.8% | 1.00 | 1 |
| v_bench_coach | 22.5% | 1.00 | 1 |
| lg_lottery_show | 22.1% | 1.00 | 1 |
| arc_max_2 | 21.6% | 1.00 | 1 |
| arc_bb_3 | 21.4% | 1.00 | 1 |
| baby | 21.4% | 2.13 | 4 |
| susp_flagrant | 21.0% | 1.00 | 1 |
| double_team | 20.4% | 1.28 | 2 |
| arc_venture_2 | 20.1% | 1.00 | 1 |
| cs_target | 20.1% | 1.00 | 1 |
| arc_mentor2_3 | 19.8% | 1.00 | 1 |
| arc_costar_2 | 19.4% | 1.00 | 1 |
| stuck | 19.3% | 1.12 | 2 |
| pre_green_room | 19.0% | 1.00 | 1 |
| r_vet_tests | 18.5% | 1.00 | 1 |
| arc_room_2 | 18.5% | 1.00 | 1 |
| signing | 18.3% | 1.00 | 1 |
| street_agent | 18.2% | 1.00 | 1 |
| tank | 18.1% | 1.06 | 2 |
| v_smaller_role | 18.1% | 1.00 | 1 |
| rookie_duty | 18.0% | 1.00 | 1 |
| social_win | 17.8% | 1.00 | 1 |
| v_milestone | 17.4% | 1.00 | 1 |
| nba_scouts | 17.4% | 1.41 | 3 |
| coach_leaves | 17.2% | 1.00 | 1 |
| rv_meet | 16.8% | 1.00 | 1 |
| arc_venture_3 | 16.8% | 1.00 | 1 |
| family_courtside | 16.7% | 1.00 | 1 |
| arc_camp_2 | 16.6% | 1.00 | 1 |
| lg_lucky | 16.6% | 1.00 | 1 |
| arc_lucky_2 | 16.6% | 1.00 | 1 |
| mvp_ladder | 16.3% | 1.00 | 1 |
| arc_mvp_2 | 16.3% | 1.00 | 1 |
| hs_coach_son2 | 15.9% | 1.00 | 1 |
| r_wall | 15.2% | 1.00 | 1 |
| arc_wall_2 | 15.2% | 1.00 | 1 |
| col_injury | 15.0% | 1.00 | 1 |
| arc_camp_3 | 14.7% | 1.00 | 1 |
| arc_camp_4 | 14.7% | 1.00 | 1 |
| portal | 14.5% | 2.06 | 4 |
| union_voice | 14.3% | 1.00 | 1 |
| class_skip | 14.3% | 1.33 | 2 |
| pre_medical | 14.2% | 1.00 | 1 |
| sig_game | 14.1% | 1.00 | 1 |
| arc_sig_2 | 14.1% | 1.00 | 1 |
| rap_album | 14.0% | 1.00 | 1 |
| rival_tv | 13.9% | 1.11 | 2 |
| shoe_meeting | 13.8% | 1.00 | 1 |
| arc_shoe_2 | 13.8% | 1.00 | 1 |
| arc_shoe_3 | 13.8% | 1.00 | 1 |
| nil_first_check | 13.4% | 1.00 | 1 |
| rival_school | 13.0% | 1.11 | 2 |
| pre_shooting_coach | 13.0% | 1.00 | 1 |
| hometown_call | 12.2% | 1.00 | 1 |
| hs_injury_senior | 12.2% | 1.00 | 1 |
| hf_drives_you | 12.1% | 1.00 | 1 |
| hs_jersey_return | 11.7% | 1.00 | 1 |
| roommate | 11.6% | 1.00 | 1 |
| lg_rule_change | 11.4% | 1.00 | 1 |
| coach_fired | 11.3% | 1.03 | 2 |
| money_broke | 11.2% | 1.00 | 1 |
| nil_bidding | 11.1% | 1.00 | 1 |
| game_cover | 11.0% | 1.00 | 1 |
| arc_mentor_2 | 10.6% | 1.00 | 1 |
| col_senior_night | 10.5% | 1.00 | 1 |
| arc_tavi_2 | 10.5% | 1.00 | 1 |
| ori_hometown_resent | 10.0% | 1.00 | 1 |
| promise_broken | 9.9% | 1.00 | 1 |
| ep_head_coach | 9.9% | 1.00 | 1 |
| arc_prep_2 | 9.8% | 1.00 | 1 |
| buyout | 9.5% | 1.00 | 1 |
| hs_ranking_drop | 9.5% | 1.00 | 1 |
| v_rival_last | 9.2% | 1.00 | 1 |
| inj_comeback | 9.1% | 1.00 | 1 |
| arc_comeback_2 | 9.1% | 1.00 | 1 |
| aau_two_brands | 8.7% | 1.00 | 1 |
| fw_announce | 8.7% | 1.00 | 1 |
| arc_farewell_2 | 8.5% | 1.00 | 1 |
| arc_farewell_3 | 8.5% | 1.00 | 1 |
| bff_call | 8.1% | 1.00 | 1 |
| lg_mascot | 8.0% | 1.00 | 1 |
| growth | 7.9% | 1.00 | 1 |
| col_captain | 7.9% | 1.00 | 1 |
| nil_deal | 7.9% | 1.10 | 3 |
| ep_assistant | 7.8% | 1.00 | 1 |
| rivalry_col | 7.8% | 1.14 | 2 |
| ori_football_coach | 7.6% | 1.00 | 1 |
| v_hair_grey | 7.6% | 1.00 | 1 |
| arc_nil_2 | 7.4% | 1.00 | 1 |
| ori_jersey_99 | 7.4% | 1.00 | 1 |
| beat_feature | 7.1% | 1.00 | 1 |
| ori_old_jersey | 7.0% | 1.00 | 1 |
| arc_mascot_2 | 6.8% | 1.00 | 1 |
| prep_transfer | 6.8% | 1.00 | 1 |
| visit_host | 6.7% | 1.00 | 1 |
| ep_owner | 6.7% | 1.00 | 1 |
| agent_rift | 6.6% | 1.00 | 1 |
| rehab_summer | 6.4% | 1.02 | 2 |
| ori_federation | 6.3% | 1.00 | 1 |
| dn_stash | 6.2% | 1.00 | 1 |
| ori_passed_father | 6.1% | 1.00 | 1 |
| ori_town_return | 6.0% | 1.00 | 1 |
| ep_business | 5.9% | 1.00 | 1 |
| md_sore | 5.9% | 1.00 | 1 |
| ori_father_courtside | 5.8% | 1.00 | 1 |
| ep_gm | 5.7% | 1.00 | 1 |
| lg_new_arena | 5.6% | 1.00 | 1 |
| coach_son | 5.6% | 1.00 | 1 |
| hs_state_parade | 5.6% | 1.00 | 1 |
| arc_tavi_3 | 5.6% | 1.00 | 1 |
| arc_md_2 | 5.5% | 1.00 | 1 |
| ori_clumsy_year | 5.5% | 1.00 | 1 |
| bad_contract | 5.3% | 1.00 | 1 |
| cc_counsel | 5.3% | 1.00 | 1 |
| ori_draft_mlb | 5.3% | 1.00 | 1 |
| ori_language | 5.2% | 1.00 | 1 |
| camp_invite | 5.0% | 1.03 | 2 |
| ep_hs | 5.0% | 1.00 | 1 |
| arc_cc_2 | 4.9% | 1.00 | 1 |
| prep_new_coach | 4.9% | 1.00 | 1 |
| col_portal_old_team | 4.8% | 1.00 | 1 |
| fashion_week | 4.6% | 1.00 | 1 |
| ori_town_paper | 4.5% | 1.00 | 1 |
| lg_lockout | 4.5% | 1.00 | 1 |
| ori_county_gym | 4.4% | 1.00 | 1 |
| arc_sonny_2 | 4.4% | 1.00 | 1 |
| ep_broadcast | 4.4% | 1.00 | 1 |
| ori_city_rivalry | 4.3% | 1.00 | 1 |
| ep_comeback | 3.9% | 1.00 | 1 |
| td_unhappy | 3.9% | 1.00 | 1 |
| arc_aau_2 | 3.8% | 1.00 | 1 |
| lg_one_more_shot | 3.8% | 1.00 | 1 |
| glid_paycheck | 3.6% | 1.00 | 1 |
| arc_visit_2 | 3.5% | 1.00 | 1 |
| ep_college | 3.4% | 1.00 | 1 |
| col_return_senior | 3.4% | 1.00 | 1 |
| ep_podcast | 3.4% | 1.00 | 1 |
| lg_expansion | 3.3% | 1.00 | 1 |
| ori_new_position | 3.2% | 1.00 | 1 |
| glid_vet | 3.2% | 1.00 | 1 |
| juco_gym | 3.0% | 1.00 | 1 |
| arc_juco_2 | 3.0% | 1.00 | 1 |
| hs_all_american | 2.9% | 1.00 | 1 |
| col_portal_new_coach | 2.9% | 1.00 | 1 |
| coach_rumor | 2.8% | 1.00 | 1 |
| ori_fathers_coach | 2.8% | 1.00 | 1 |
| hs_first_dunk | 2.8% | 1.00 | 1 |
| arc_coachleft_2 | 2.8% | 1.00 | 1 |
| undrafted | 2.8% | 1.00 | 1 |
| v_ring_chase | 2.7% | 1.00 | 1 |
| ori_mixtape_famous | 2.7% | 1.00 | 1 |
| lg_midnight | 2.6% | 1.00 | 1 |
| juco_bus | 2.6% | 1.00 | 1 |
| ep_actor | 2.5% | 1.00 | 1 |
| ori_homesick | 2.4% | 1.00 | 1 |
| abr_first_practice | 2.4% | 1.00 | 1 |
| breakup | 2.2% | 1.02 | 2 |
| lg_comet | 2.1% | 1.00 | 1 |
| hs_reclass_offer | 2.1% | 1.00 | 1 |
| arc_comet_2 | 2.1% | 1.00 | 1 |
| ori_two_sport | 2.0% | 1.00 | 1 |
| olympics | 2.0% | 1.00 | 1 |
| ori_six_inches | 2.0% | 1.00 | 1 |
| arc_promise2_2 | 2.0% | 1.00 | 1 |
| lg_dream | 1.9% | 1.00 | 1 |
| lg_ellis_summer | 1.9% | 1.00 | 1 |
| ori_prep_dorm | 1.8% | 1.00 | 1 |
| ori_cut_varsity | 1.7% | 1.00 | 1 |
| arc_ellis_2 | 1.7% | 1.00 | 1 |
| ori_fathers_number | 1.7% | 1.00 | 1 |
| ori_u17 | 1.6% | 1.00 | 1 |
| ori_city_mural | 1.6% | 1.00 | 1 |
| lg_lazlo | 1.6% | 1.00 | 1 |
| arc_lazlo_2 | 1.6% | 1.00 | 1 |
| lg_curse | 1.5% | 1.00 | 1 |
| arc_curse_2 | 1.5% | 1.00 | 1 |
| investigation | 1.5% | 1.00 | 1 |
| ori_managers_job | 1.5% | 1.00 | 1 |
| abr_derby | 1.5% | 1.00 | 1 |
| arc_curse_3 | 1.4% | 1.00 | 1 |
| rec_day_job | 1.4% | 1.00 | 1 |
| po_hurt | 1.4% | 1.00 | 1 |
| lg_fortune | 1.3% | 1.00 | 1 |
| rec_proam | 1.3% | 1.00 | 1 |
| dy_ego | 1.2% | 1.00 | 1 |
| ep_politics | 1.2% | 1.00 | 1 |
| lg_four_point | 1.2% | 1.00 | 1 |
| abr_coach | 1.1% | 1.00 | 1 |
| arc_dynasty_2 | 1.1% | 1.00 | 1 |
| gap_alone | 1.0% | 1.00 | 1 |
| gap_forgotten | 1.0% | 1.00 | 1 |
| dn_hometown | 0.8% | 1.00 | 1 |
| lg_mask | 0.8% | 1.00 | 1 |
| superteam | 0.8% | 1.00 | 1 |
| ori_scout_lost | 0.8% | 1.00 | 1 |
| dn_slide | 0.7% | 1.00 | 1 |
| lg_apex | 0.7% | 1.00 | 1 |
| walkon_practice_squad | 0.7% | 1.00 | 1 |
| arc_walkon_2 | 0.7% | 1.00 | 1 |
| ori_prep_investor | 0.6% | 1.00 | 1 |
| ori_runner_offer | 0.6% | 1.00 | 1 |
| lg_ghost | 0.6% | 1.00 | 1 |
| ep_league | 0.5% | 1.00 | 1 |
| r_rookie_month | 0.4% | 1.00 | 1 |
| lg_dre9 | 0.4% | 1.00 | 1 |
| arc_trade_2 | 0.4% | 1.00 | 1 |
| arc_trade_3 | 0.4% | 1.00 | 1 |
| lg_exhibition | 0.3% | 1.00 | 1 |
| lg_cult_movie | 0.3% | 1.00 | 1 |
| arc_apex_2 | 0.3% | 1.00 | 1 |
| lg_relocation | 0.1% | 1.00 | 1 |

## Challenges, played as themselves on Easy

| challenge | met |
|---|---|
| One city | 43.0% of 300 |
| Two rings | 10.7% of 300 |
| The 30,000 club | 19.3% of 300 |
| Most valuable | 6.0% of 300 |
| Second round | 4.3% of 300 |
| Lockdown | 16.3% of 300 |
| Ten All-Star games | 13.0% of 300 |
| Iron man | 48.3% of 300 |
| The hard way | 16.0% of 300 |
