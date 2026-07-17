#!/usr/bin/env python3
# CS420 — golf bag cosmetic: a back-slung stand bag drawn BEHIND the golfer, so only the parts outside the
# body silhouette show — club heads poking over the trail shoulder, the bag body peeking out the trail side,
# and a shoulder strap loop. Authored on the TRAIL side (viewer-right for a righty), flipped by look.lefty.
# One shared shape (PXG_BAG); colour varies per bag via PXG_BAG_PAL.
W, H = 44, 56
def grid(): return [['.' for _ in range(W)] for _ in range(H)]
def put(g, pts):
    for (x, y, c) in pts:
        if 0 <= x < W and 0 <= y < H: g[y][x] = c
def rows(g): return [''.join(r) for r in g]

bag = grid()
# ---- 3 clubs poking up over the trail shoulder (shafts 'c', heads 'H') ----
put(bag, [
    (33,15,'H'),(34,15,'H'),(35,16,'H'),
    (33,16,'c'),(34,17,'c'),(35,17,'H'),(36,17,'H'),
    (33,17,'c'),(34,18,'c'),(35,18,'c'),
    (33,18,'c'),(34,19,'c'),(35,19,'c'),
    (33,19,'c'),(34,20,'c'),(35,20,'c'),
    (33,20,'c'),(34,21,'c'),(35,21,'c'),
])
# ---- bag body: a rounded tube peeking out the trail side (cols 34-39), rows 21-42 ----
body=[]
for y in range(22,42):
    for x in range(34,40):
        body.append((x,y,'B'))
put(bag, body)
# rounded top + bottom corners (trim off)
put(bag, [(34,22,'.'),(39,22,'.'),(34,41,'.'),(39,41,'.')])
# right-edge shadow
put(bag, [(39,y,'b') for y in range(23,41)])
put(bag, [(38,y,'b') for y in (23,40)])
# top rim (opening)
put(bag, [(35,21,'t'),(36,21,'t'),(37,21,'t'),(38,21,'t')])
# trim band
put(bag, [(x,27,'t') for x in range(34,40)])
put(bag, [(x,28,'t') for x in range(34,40)])
# side pocket
put(bag, [(35,32,'p'),(36,32,'p'),(37,32,'p'),
          (35,33,'p'),(36,33,'p'),(37,33,'p'),
          (35,34,'p'),(36,34,'p'),(37,34,'p')])
# feet (stand) at the bottom
put(bag, [(34,42,'c'),(39,42,'c')])
# ---- shoulder strap loop over the trail shoulder (behind body; the arc that clears the torso shows) ----
put(bag, [(31,23,'s'),(32,22,'s'),(33,22,'s'),(30,24,'s'),(30,25,'s'),(31,26,'s'),(32,27,'s'),(33,28,'s')])

def js(name,g): return '%s:[%s]'%(name, ','.join('"%s"'%r for r in rows(g)))

# per-bag palettes: B body, b shadow, t trim/band, p pocket, c club shaft (silver), H club head, s strap
PALS = {
  'red':    {'B':'#c0392b','b':'#8f271c','t':'#f2d24a','p':'#a52f22','c':'#cfd3da','H':'#2d323c','s':'#3a2f2a'},
  'navy':   {'B':'#274a7a','b':'#1a3253','t':'#d8dde6','p':'#20406a','c':'#cfd3da','H':'#2d323c','s':'#2a3444'},
  'forest': {'B':'#2f6b4f','b':'#1f4a37','t':'#e8e2c8','p':'#285c44','c':'#cfd3da','H':'#2d323c','s':'#2a3a30'},
  'champ':  {'B':'#e6b93c','b':'#b8901f','t':'#fff3c0','p':'#caa028','c':'#e8ebf0','H':'#3a2b12','s':'#5a4416'},
}

if __name__ == '__main__':
    sc='/tmp/claude-0/-home-user-runthe-gg-site/ea414e14-3658-5c2f-a4bf-ac3fb35f2d97/scratchpad/'
    with open(sc+'bag.js.txt','w') as f:
        f.write('const '+js('PXG_BAG',bag)+';\n\n')
        f.write('const PXG_BAG_PAL={ '+', '.join("%s:{%s}"%(k, ','.join("'%s':'%s'"%(kk,vv) for kk,vv in v.items())) for k,v in PALS.items())+' };\n')
    print('   '+''.join(str(i%10) for i in range(44)))
    for y,r in enumerate(rows(bag)):
        if r.strip('.'): print('%2d '%y+r)
    print('wrote', sc+'bag.js.txt')
