# Python port of convertData.js — used because `node` is not installed on this
# machine. Produces byte-for-byte the same data/players_all.json shape.
import csv, json, unicodedata, re, os

BASE = os.path.dirname(os.path.abspath(__file__))
IN_PATH  = os.path.join(BASE, 'data', 'world_cup_full_rosters_1966_2026_4.json')
OUT_PATH = os.path.join(BASE, 'data', 'players_all.json')

COUNTRY_CODES = {
    'England':'ENG','France':'FRA','Brazil':'BRA','Argentina':'ARG',
    'Germany':'GER','West Germany':'GER','Italy':'ITA','Spain':'ESP',
    'Netherlands':'NED','Portugal':'POR','Uruguay':'URU','Croatia':'CRO',
    'Belgium':'BEL','Mexico':'MEX','USA':'USA','Japan':'JPN','South Korea':'KOR',
    'Australia':'AUS','Denmark':'DEN','Switzerland':'SUI','Poland':'POL',
    'Senegal':'SEN','Morocco':'MAR','Ghana':'GHA','Cameroon':'CMR',
    'Saudi Arabia':'KSA','Iran':'IRN','Wales':'WAL','Ecuador':'ECU',
    'Qatar':'QAT','Serbia':'SRB','Tunisia':'TUN','Costa Rica':'CRC',
    'Canada':'CAN','Algeria':'ALG','Czechoslovakia':'TCH',
    'Soviet Union':'URS','Yugoslavia':'YUG','East Germany':'DDR',
    'Scotland':'SCO','Bulgaria':'BUL','Romania':'ROU','Hungary':'HUN',
    'Sweden':'SWE','Chile':'CHI','Colombia':'COL','Nigeria':'NGA',
    'Ivory Coast':'CIV','Togo':'TOG','Angola':'ANG','Trinidad':'TRI',
    'Trinidad and Tobago':'TRI','Honduras':'HON','Slovakia':'SVK',
    'Slovenia':'SVN','Greece':'GRE','Turkey':'TUR','Paraguay':'PAR',
    'Peru':'PER','Bolivia':'BOL','Republic of Ireland':'IRL',
    'Northern Ireland':'NIR','Russia':'RUS','Ukraine':'UKR','Norway':'NOR',
    'Austria':'AUT','New Zealand':'NZL','Cuba':'CUB','Egypt':'EGY',
    'Iraq':'IRQ','Kuwait':'KUW','North Korea':'PRK','Haiti':'HAI',
    'Zaire':'ZAI','El Salvador':'SLV','Israel':'ISR','Indonesia':'IDN',
    'Jamaica':'JAM','China':'CHN','South Africa':'RSA',
}
POSITION_MAP = {'GK':'GK','DF':'DEF','MF':'MID','FW':'FWD'}

def country_code(c):
    if c in COUNTRY_CODES: return COUNTRY_CODES[c]
    return re.sub(r'[^A-Za-z]', '', c)[:3].upper()

def strip_accents(s):
    return ''.join(ch for ch in unicodedata.normalize('NFD', s)
                   if unicodedata.category(ch) != 'Mn')

def last_name(name):
    parts = name.strip().split()
    last = parts[-1] if parts else name
    s = strip_accents(last).lower()
    s = re.sub(r'[^a-z0-9]+', '_', s)
    return s.strip('_')

def int_or_null(v):
    if v is None or v == '': return None
    try: return int(v)
    except (ValueError, TypeError): return None

def str_or_null(v):
    if v is None: return None
    t = str(v).strip()
    return None if t == '' else t

def award_or_null(v):
    t = str_or_null(v)
    if t is None: return None
    if '|' in t:
        return [s.strip() for s in t.split('|') if s.strip()]
    return t

def main():
    players = []
    id_counts = {}
    with open(IN_PATH, encoding='utf-8') as f:
        rows = json.load(f)  # clean JSON: real integers, null for blanks
    for row in rows:
        name = (row.get('player_name') or '').strip()
        if not name: continue
        country = (row.get('country') or '').strip()
        year = int_or_null(row.get('wc_year'))
        raw_pos = (row.get('position') or '').strip()
        position = POSITION_MAP.get(raw_pos, raw_pos)
        is_2026 = year == 2026

        base_id = f"{country_code(country)}_{year}_{last_name(name)}"
        if base_id in id_counts:
            id_counts[base_id] += 1
            pid = f"{base_id}_{id_counts[base_id]}"
        else:
            id_counts[base_id] = 1
            pid = base_id

        players.append({
            'player_id': pid,
            'name': name,
            'country': country,
            'year': year,
            'position': position,
            'height': None,
            # 2026 squads have not played: no goals, no result, no team rating.
            'appearances': int_or_null(row.get('career_caps_at_tournament')),
            'goals': None if is_2026 else int_or_null(row.get('tournament_goals')),
            'assists': None,
            'minutes': None,
            'clean_sheets': None,
            'goals_conceded': None,
            'saves': None,
            'save_pct': None,
            'tackles': None,
            'interceptions': None,
            'clearances': None,
            'pass_completion': None,
            'key_passes': None,
            'chances_created': None,
            'dribbles': None,
            'shots_per90': None,
            'shots_on_target_pct': None,
            'yellow_cards': None,
            'red_cards': None,
            'is_2026': is_2026,
            'club_league_tier': None,
            'is_captain': int_or_null(row.get('is_captain')) == 1,
            'wc_overall': int_or_null(row.get('wc_overall')),         # engine rating (60-99)
            'skill_rating': int_or_null(row.get('skill_rating')),     # fallback rating
            'wc_performance': int_or_null(row.get('wc_performance')), # not displayed during draft
            'team_overall': None if is_2026 else int_or_null(row.get('team_overall')),
            'tournament_result': None if is_2026 else str_or_null(row.get('tournament_result')),
            'age_at_tournament': int_or_null(row.get('age_at_tournament')),
            'birth_year': int_or_null(row.get('birth_year')),
            'club_at_tournament': str_or_null(row.get('club_at_tournament')),
            'award': award_or_null(row.get('award')),
        })

    years = sorted(set(p['year'] for p in players))
    countries = sorted(set(p['country'] for p in players))

    def confirm(nm, yr):
        p = next((x for x in players if nm in x['name'] and x['year'] == yr), None)
        return p['wc_overall'] if p else 'NOT FOUND'

    print('=== convertData (python port, dataset v2) ===')
    print('Total players converted:', len(players))
    print(f'Years covered ({len(years)}):', ', '.join(map(str, years)))
    print(f'Countries covered ({len(countries)}):', ', '.join(countries))
    print('wc_overall >= 90 (elite):', sum(1 for p in players if (p['wc_overall'] or 0) >= 90))
    print('wc_overall == 60 (floor):', sum(1 for p in players if p['wc_overall'] == 60))
    print('2026 players:', sum(1 for p in players if p['year'] == 2026))
    print('Pelé 1970 wc_overall:', confirm('Pelé', 1970))
    print('Maradona 1986 wc_overall:', confirm('Maradona', 1986))
    print('Messi 2022 wc_overall:', confirm('Messi', 2022))

    ids = [p['player_id'] for p in players]
    if len(set(ids)) == len(ids):
        print(f'All player_ids unique: YES ({len(ids)})')
    else:
        seen, dupes = set(), set()
        for i in ids:
            if i in seen: dupes.add(i)
            else: seen.add(i)
        print('All player_ids unique: NO — duplicates:', list(dupes)[:20])

    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(players, f, ensure_ascii=False, indent=2)
    print('Wrote', OUT_PATH)

main()
