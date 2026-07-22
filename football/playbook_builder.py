import json

S = json.load(open('/home/claude/play_level_stats.json'))

# Formation / tempo modifiers, measured earlier
MOD_UC_PASS  = {'sr':+1.0,'epa':+0.05,'ds':-2.0}
MOD_UC_DEEP  = {'sr':+6.4,'epa':+0.233,'ex':+8.6,'ds':-17.1}
MOD_UC_PA    = {'sr':+1.3,'epa':+0.030,'ex':+2.1}
MOD_SG_RUN   = {'sr':+1.7,'epa':+0.074,'yds':+0.55}
MOD_NOHUD    = {'sr':+3.4,'epa':+0.041}
MOD_NOHUD_R  = {'sr':+6.8,'epa':+0.070}
MOD_MOTION   = {'sr':+1.7,'epa':+0.020}
MOD_RPO      = {'sr':-1.0,'epa':-0.014,'yds':-0.55}
MOD_HEAVY_PA = {'sr':+0.6,'epa':+0.017}
PA_LIFT      = {'sr':+5.0,'epa':+0.130,'ex':+3.0,'ds':-8.0}   # PA vs non-PA, measured

def run_sig(gap):
    b = S['run_gap'][gap]
    return dict(sr=b['sr'], ex=b['ex'], ds=b['ds'], yds=b['yds'], epa=b['epa'],
                to=b['fum'], to_type='fumble', dist=S['run_gap_by_dist'][gap])

def pass_sig(band, loc, is_pa=False):
    # PA-SPLIT baseline: the play-action effect lives INSIDE these samples, so
    # we must not add a separate PA bonus on top. Doing that double-counted it
    # and pushed the sim to a 64.5% TD rate.
    b = S['pass_band_pa'][f'{band}|{"PA" if is_pa else "NOPA"}']
    dl = S['loc_delta'].get(f'{band}|{loc}', {})
    return dict(sr=round(b['sr']+dl.get('sr',0),1), ex=round(b['ex']+dl.get('ex',0),1),
                ds=b['ds'], yds=round(b['yds']+dl.get('yds',0),2), epa=b['epa'],
                to=round(b['intr']+dl.get('intr',0),2), to_type='int',
                dist=S['pass_band_by_dist'].get(band, {}))

#  (name, kind, signature, formation, tags)
#  kind: R=run  P=pass  PA=play action  SNEAK
SCHEMES = {
 'AIR_RAID': dict(name='Air Raid', tagline='Spread them out, throw it now, never huddle.',
   box_draw=5.8, shotgun=92, backs=1, nohuddle=45,
   strength='Light boxes and tempo. Quick game hums.',
   weakness='No under-center play action, so deep shots run a high disaster rate.',
   plays=[
    ('Four Verts','P',('20+','left'),'SG',['no_huddle']),
    ('Y-Cross','P',('15-19','middle'),'SG',[]),
    ('Mesh','P',('0-4','middle'),'SG',['motion']),
    ('Shallow Cross','P',('0-4','left'),'SG',['motion']),
    ('Stick','P',('5-9','right'),'SG',['no_huddle']),
    ('Bubble Screen','P',('behind','left'),'SG',['motion']),
    ('Sail','P',('10-14','right'),'SG',[]),
    ('Six (Post-Wheel)','P',('20+','right'),'SG',[]),
    ('Quick Slant','P',('5-9','middle'),'SG',['no_huddle']),
    ('Tunnel Screen','P',('behind','right'),'SG',[]),
    ('QB Draw','R','guard','SG',['no_huddle']),
    ('Inside Zone Read','R','guard','SG',['rpo']),
   ]),
 'WEST_COAST': dict(name='West Coast', tagline='Timing, rhythm, take what they give you.',
   box_draw=6.2, shotgun=50, backs=1, nohuddle=10,
   strength='Highest floor in the game. Fewest disasters.',
   weakness='Low explosive rate. Slow to come from behind.',
   plays=[
    ('Slant-Flat','P',('5-9','left'),'SG',['motion']),
    ('Drive','P',('5-9','middle'),'UC',['motion']),
    ('Texas (RB Angle)','P',('0-4','middle'),'SG',[]),
    ('Curl-Flat','P',('10-14','right'),'UC',[]),
    ('Dagger','P',('15-19','left'),'SG',[]),
    ('Halfback Screen','P',('behind','right'),'SG',[]),
    ('Waggle','PA',('10-14','left'),'UC',['motion']),
    ('Naked Boot','PA',('5-9','right'),'UC',[]),
    ('Power O','R','guard','UC',[]),
    ('Inside Zone','R','guard','SG',[]),
    ('Toss Crack','R','end','UC',['motion']),
    ('Sneak','SNEAK',None,'UC',[]),
   ]),
 'SMASH_MOUTH': dict(name='Smash Mouth', tagline='Two backs, downhill, dare them to stop it.',
   box_draw=6.9, shotgun=18, backs=2, nohuddle=5,
   strength='Owns short yardage. Heavy-personnel play action is elite.',
   weakness='Draws 7+ boxes. Slow, burns clock.',
   plays=[
    ('Power','R','guard','UC',[]),
    ('Counter Trey','R','tackle','UC',['motion']),
    ('Iso','R','guard','UC',[]),
    ('Duo','R','guard','UC',[]),
    ('Lead Draw','R','tackle','SG',[]),
    ('QB Sneak','SNEAK',None,'UC',[]),
    ('Wham','R','tackle','UC',['motion']),
    ('Play Pass Post','PA',('15-19','middle'),'UC',['heavy_pa']),
    ('Boot Flood','PA',('5-9','right'),'UC',['heavy_pa','motion']),
    ('Y-Leak','PA',('10-14','left'),'UC',['heavy_pa']),
    ('Hitch','P',('5-9','right'),'UC',[]),
    ('Max Protect Shot','P',('20+','left'),'UC',[]),
   ]),
 'WIDE_ZONE': dict(name='Wide Zone', tagline='Stretch them sideline to sideline, then hit the boot.',
   box_draw=6.5, shotgun=30, backs=1, nohuddle=12,
   strength='Best access to the under-center deep shot.',
   weakness='Needs the run to sell it. Predictable if you abandon it.',
   plays=[
    ('Outside Zone','R','end','UC',['motion']),
    ('Wide Zone Split','R','end','UC',['motion']),
    ('Zone Cutback','R','tackle','SG',[]),
    ('Jet Sweep','R','end','UC',['motion']),
    ('Boot Over','PA',('10-14','middle'),'UC',['motion']),
    ('Naked Flood','PA',('5-9','right'),'UC',[]),
    ('Yankee','P',('20+','middle'),'UC',[]),
    ('Deep Over','P',('15-19','middle'),'UC',['motion']),
    ('Slide Screen','P',('behind','left'),'UC',[]),
    ('Drift','P',('5-9','left'),'UC',['motion']),
    ('Flat-Corner','P',('10-14','right'),'SG',[]),
    ('Sneak','SNEAK',None,'UC',[]),
   ]),
 'VERTICAL': dict(name='Vertical', tagline='Take shots. Live with the swings.',
   box_draw=6.0, shotgun=78, backs=1, nohuddle=15,
   strength='Highest explosive rate. One call ends the drive.',
   weakness='Highest disaster and interception rate. Brutal on 3rd and long.',
   plays=[
    ('Go Ball','P',('20+','left'),'SG',[]),
    ('Double Post','P',('20+','middle'),'SG',[]),
    ('Switch Verts','P',('20+','right'),'SG',['motion']),
    ('Deep Cross','P',('15-19','middle'),'UC',[]),
    ('Dig','P',('15-19','left'),'SG',[]),
    ('Deep Comeback','P',('15-19','right'),'SG',[]),
    ('Post-Dig','P',('10-14','middle'),'SG',[]),
    ('PA Deep Shot','PA',('20+','left'),'UC',[]),
    ('PA Seam','PA',('15-19','middle'),'UC',['motion']),
    ('Back Shoulder','P',('10-14','right'),'SG',[]),
    ('Hitch-Seam','P',('5-9','middle'),'SG',[]),
    ('Draw','R','guard','SG',[]),
   ]),
 'SPREAD_OPTION': dict(name='Spread Option', tagline='Make the quarterback a runner and play fast.',
   box_draw=5.9, shotgun=95, backs=1, nohuddle=40,
   strength='Shotgun run bonus plus tempo.',
   weakness='RPOs measure slightly negative. No under-center play action.',
   plays=[
    ('Zone Read','R','end','SG',['no_huddle']),
    ('QB Power','R','guard','SG',[]),
    ('Inverted Veer','R','end','SG',[]),
    ('Speed Option','R','end','SG',['no_huddle']),
    ('Glance RPO','P',('5-9','middle'),'SG',['rpo']),
    ('Bubble RPO','P',('behind','left'),'SG',['rpo','motion']),
    ('Pop Pass','P',('0-4','middle'),'SG',['rpo']),
    ('Snag','P',('5-9','right'),'SG',['no_huddle']),
    ('Jet Screen','P',('behind','right'),'SG',['motion']),
    ('PA Glance','PA',('10-14','left'),'SG',[]),
    ('Shot Post','P',('20+','middle'),'SG',[]),
    ('QB Sneak','SNEAK',None,'SG',[]),
   ]),
}

SNEAK = dict(sr=74.0, ex=20.0, ds=13.0, yds=1.70, epa=0.300, to=0.60,
             to_type='fumble', dist={'1-2':78.0,'3-6':45.0,'7-9':20.0,'10+':15.0})

def apply(base, mods):
    o = dict(base)
    for m in mods:
        for k, v in m.items():
            o[k] = round(o.get(k, 0) + v, 3)
    o['sr'] = max(5, min(92, o['sr']))
    o['ex'] = max(1, o['ex']); o['ds'] = max(1, o['ds'])
    return o

pb = {'meta': {'source': 'nflverse pbp 2016-2025 + FTN charting 2022-2025',
                'differentiation': 'per-play signatures: run gap x location, pass air-band x field location',
                'note': 'every play carries its own measured numbers; no two share a row unless they share a signature'},
      'schemes': {}}

for key, s in SCHEMES.items():
    plays = []
    for nm, kind, sig, loc, tags in s['plays']:
        if kind == 'SNEAK':   base = dict(SNEAK)
        elif kind == 'R':     base = run_sig(sig)
        else:                 base = pass_sig(sig[0], sig[1], is_pa=(kind=='PA'))
        mods = []
        if kind == 'PA':
            if loc == 'UC': mods.append(MOD_UC_PA)   # formation only; PA already in the baseline
        elif kind == 'P' and loc == 'UC':
            mods.append(MOD_UC_DEEP if sig[0] in ('20+', '15-19') else MOD_UC_PASS)
        if kind in ('R', 'SNEAK') and loc == 'SG': mods.append(MOD_SG_RUN)
        if 'no_huddle' in tags: mods.append(MOD_NOHUD_R if kind in ('R','SNEAK') else MOD_NOHUD)
        if 'motion' in tags and kind not in ('R','SNEAK'): mods.append(MOD_MOTION)
        if 'rpo' in tags: mods.append(MOD_RPO)
        if 'heavy_pa' in tags: mods.append(MOD_HEAVY_PA)
        st = apply(base, mods)
        arch = ('QB_SNEAK' if kind=='SNEAK' else 'RUN' if kind=='R'
                else 'PLAY_ACTION' if kind=='PA'
                else 'SCREEN' if sig[0]=='behind'
                else 'QUICK' if sig[0] in ('0-4','5-9')
                else 'INTERMEDIATE' if sig[0] in ('10-14','15-19') else 'DEEP')
        plays.append({'name': nm, 'archetype': arch,
            'signature': ('SNEAK' if kind=='SNEAK' else sig if kind=='R' else f'{sig[0]}|{sig[1]}'),
            'formation': 'Under Center' if loc=='UC' else 'Shotgun', 'tags': tags,
            'success_pct': round(st['sr'],1), 'explosive_pct': round(st['ex'],1),
            'disaster_pct': round(st['ds'],1), 'avg_yards': round(st['yds'],2),
            'epa': round(st['epa'],3), 'turnover_pct': st['to'], 'turnover_type': st['to_type'],
            'success_by_distance': st.get('dist', {})})
    pb['schemes'][key] = {k: v for k, v in s.items() if k != 'plays'}
    pb['schemes'][key]['plays'] = plays

json.dump(pb, open('/mnt/user-data/outputs/runthedrive_playbook.json','w'), indent=2)
json.dump(pb, open('/home/claude/playbook_data.json','w'), indent=2)

# report
for key, s in pb['schemes'].items():
    print(f"\n{'='*90}\n{s['name'].upper()} — {s['tagline']}")
    print(f"{'PLAY':20s} {'SIGNATURE':16s} {'FORM':13s} {'SR%':>5s} {'EX%':>5s} {'DS%':>5s} {'YDS':>5s} {'TO%':>5s} {'EPA':>7s}")
    for p in sorted(s['plays'], key=lambda x: -x['epa']):
        sg = p['signature'] if isinstance(p['signature'], str) else str(p['signature'])
        print(f"{p['name']:20s} {sg:16s} {p['formation']:13s} {p['success_pct']:5.1f} {p['explosive_pct']:5.1f} "
              f"{p['disaster_pct']:5.1f} {p['avg_yards']:5.2f} {p['turnover_pct']:5.2f} {p['epa']:+7.3f}")
    uniq = len({(p['success_pct'], p['explosive_pct'], p['disaster_pct']) for p in s['plays']})
    print(f"  -> {uniq}/{len(s['plays'])} statistically distinct plays")
