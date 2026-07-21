import json
d=json.load(open('scratchpad/swing4.json'))
fr=d['frames']; anch=d['anch']
def js_rows(rws): return '['+','.join('"'+r+'"' for r in rws)+']'
parts=[]
for dK in ['N','E','S','W']:
    poses=fr[dK]
    inner=','.join(f'{p}:{js_rows(poses[p])}' for p in ['A','B','C','cA','cB','pA','pB'])
    parts.append(f'{dK}:{{{inner}}}')
sw4='const PXG_SW4={'+','.join(parts)+'};'
an='const PXG_SW4_ANCH={'+','.join(f'{k}:[{anch[k][0]},{anch[k][1]}]' for k in ['N','E','S','W'])+'};'
open('scratchpad/swing4_const.js','w').write(sw4+'\n'+an+'\n')
print('len', len(sw4)+len(an))
print(an)
