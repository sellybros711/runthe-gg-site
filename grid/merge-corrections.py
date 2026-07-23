#!/usr/bin/env python3
"""Merge audit corrections (scratchpad/audit/corrections-*.json) into
grid/data/corpus.json. Correction format per player id:
  {teams_add:[], teams_remove:[], jersey_add:[], jersey_remove:[], set:{}, note:''}
teams_add entries may be team ids (mlb_x) or full display names (no id existed);
display names are resolved against team entities, creating a minimal team
entity when none exists. Run, then: node grid/import-corpus.js
"""
import json, sys, glob, re, os

AUDIT_DIR = sys.argv[1] if len(sys.argv) > 1 else None
assert AUDIT_DIR, 'usage: merge-corrections.py <audit-dir>'
CORPUS = os.path.join(os.path.dirname(__file__), 'data', 'corpus.json')

corpus = json.load(open(CORPUS))
by_id = {e['id']: e for e in corpus}
team_by_name = {e['display_name'].lower(): e for e in corpus if e.get('entity_type') == 'team'}

LEAGUE_PREFIX = {'MLB':'mlb','NFL':'nfl','NBA':'nba','NHL':'nhl','WNBA':'wnba','Soccer':'soc'}

def slug(name): return re.sub(r'[^a-z0-9]+','-',name.lower()).strip('-')

def resolve_team(token, player_sport):
    if token in by_id and by_id[token].get('entity_type')=='team': return token
    if re.match(r'^[a-z0-9_]+$', token) and '_' in token:  # id-shaped but unknown: create shell
        tid = token
        nick = token.split('_',1)[1].replace('-',' ').title()
        by_id[tid] = {'id':tid,'entity_type':'team','display_name':nick,'sport':player_sport,
                      'fame_tier':2,'attributes':{'nickname':[nick]}}
        corpus.append(by_id[tid]); return tid
    t = team_by_name.get(token.lower())
    if t: return t['id']
    pref = LEAGUE_PREFIX.get(player_sport, slug(player_sport))
    tid = pref+'_'+slug(token)
    if tid not in by_id:
        by_id[tid] = {'id':tid,'entity_type':'team','display_name':token,'sport':player_sport,
                      'fame_tier':2,'attributes':{'nickname':[token]}}
        corpus.append(by_id[tid]); team_by_name[token.lower()]=by_id[tid]
    return tid

stats = {'players':0,'teams_add':0,'teams_remove':0,'jersey_add':0,'jersey_remove':0,'set':0,'new_teams':0,'skipped':[]}
teams_before = sum(1 for e in corpus if e.get('entity_type')=='team')

for path in sorted(glob.glob(os.path.join(AUDIT_DIR,'corrections-*.json'))):
    fixes = json.load(open(path))
    for pid, fx in fixes.items():
        e = by_id.get(pid)
        if not e: stats['skipped'].append(pid); continue
        a = e['attributes']; stats['players'] += 1
        teams = a.setdefault('teams', [])
        for t in fx.get('teams_add') or []:
            tid = resolve_team(t, e.get('sport',''))
            if tid not in teams: teams.append(tid); stats['teams_add'] += 1
        for t in fx.get('teams_remove') or []:
            tid = t if t in teams else next((x['id'] for x in [team_by_name.get(t.lower())] if x), t)
            if tid in teams: teams.remove(tid); stats['teams_remove'] += 1
        js = a.setdefault('jersey_number', [])
        for n in fx.get('jersey_add') or []:
            if n not in js: js.append(n); stats['jersey_add'] += 1
        for n in fx.get('jersey_remove') or []:
            if n in js: js.remove(n); stats['jersey_remove'] += 1
        for k, v in (fx.get('set') or {}).items():
            cur = a.get(k)
            a[k] = [v] if isinstance(cur, list) or cur is None else v
            if isinstance(a[k], list) and not isinstance(v, list): pass
            stats['set'] += 1

stats['new_teams'] = sum(1 for e in corpus if e.get('entity_type')=='team') - teams_before
if '--dry' in sys.argv:
    print('DRY RUN —', json.dumps(stats, indent=1))
else:
    json.dump(corpus, open(CORPUS,'w'), ensure_ascii=False, indent=1)
    print('MERGED —', json.dumps(stats, indent=1))
