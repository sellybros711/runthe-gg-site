import json, sys
sys.path.insert(0,'scratchpad')
import swingfix2 as sf2
GR=json.load(open('scratchpad/swingfix_r.json'))   # CS499 righty (all 5 dirs, [A,B,D,C]+chip+putt)
# override E with the CS500 rotating swing
for ph in ['A','B','D','C']: GR['E'][ph]=sf2.frame_E(ph)
for ph in ['CH0','CH1']: GR['E'][ph]=sf2.frame_E_chip(ph)
for ph in ['PT0','PT1']: GR['E'][ph]=sf2.frame_E_putt(ph)
POSES=['A','B','D','C','CH0','CH1','PT0','PT1']; UNIQ=['N','NE','E','SE','S']
def js_dir(d): return d+':{'+','.join(ph+':['+','.join('"'+r+'"' for r in GR[d][ph])+']' for ph in POSES)+'}'
outR='const PXG_DIR8={'+','.join(js_dir(d) for d in UNIQ)+'};'
html='build-a-golfer/build-a-golfer.html'; src=open(html).read().split('\n')
for i,ln in enumerate(src):
    if ln.startswith('const PXG_DIR8={'): src[i]=outR; break
else: raise SystemExit('PXG_DIR8 not found')
open(html,'w').write('\n'.join(src))
# sanity: E frame dims
print('PXG_DIR8 re-emitted', len(outR),'bytes | E rows', len(GR['E']['A']),'cols', len(GR['E']['A'][0]))
