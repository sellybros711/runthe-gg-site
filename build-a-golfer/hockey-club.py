#!/usr/bin/env python3
# CS415 — "The Enforcer": a wooden ice-hockey stick used as a putter (Happy Gilmore). Legendary club.
# Authored on the golfer's lead hand like the other clubs (righty mirrors via !look.lefty). Long wood
# shaft with black tape wraps, an L-shaped blade lying along the ground with a taped toe.
W, H = 44, 56
def blank(): return [['.' for _ in range(W)] for _ in range(H)]
def put(g, pts):
    for (x, y, c) in pts:
        if 0 <= x < W and 0 <= y < H: g[y][x] = c
def to_rows(g): return [''.join(r) for r in g]

hockey = blank()
# long wooden shaft (same grip diagonal as the other clubs)
shaft = [(34,40),(35,41),(35,42),(36,43),(36,44),(37,45),(37,46),(38,47),(39,48),(40,49),(40,50),(40,51)]
put(hockey, [(x,y,'H') for (x,y) in shaft])
# black tape wraps on the shaft (grip + a band lower down)
put(hockey, [(35,41,'K'),(35,42,'K'),(37,46,'K')])
# heel where shaft meets blade
put(hockey, [(41,51,'W')])
# L-shaped hockey blade lying along the ground, toe pointing back toward the golfer (lower x)
put(hockey, [
    # blade top edge (rows 52) — wood
    (33,52,'W'),(34,52,'W'),(35,52,'W'),(36,52,'W'),(37,52,'W'),(38,52,'W'),(39,52,'W'),(40,52,'W'),(41,52,'W'),
    # blade body (row 53) — darker wood with a taped toe
    (32,53,'K'),(33,53,'w'),(34,53,'w'),(35,53,'w'),(36,53,'w'),(37,53,'w'),(38,53,'w'),(39,53,'w'),(40,53,'w'),(41,53,'w'),
    # bottom edge / tape line (row 54)
    (32,54,'K'),(33,54,'t'),(34,54,'K'),(35,54,'K'),(36,54,'K'),(37,54,'K'),(38,54,'K'),(39,54,'K'),(40,54,'w'),
])
HOCKEY_PAL = {'H':'#b5854a','K':'#171717','W':'#9a6327','w':'#6e451c','t':'#e8e2d2'}

def js_map(name, g): return '%s:[%s]' % (name, ','.join('"%s"' % r for r in to_rows(g)))
def js_pal(pal): return '{' + ','.join("'%s':'%s'" % (k, v) for k, v in pal.items()) + '}'

if __name__ == '__main__':
    import sys
    sc='/tmp/claude-0/-home-user-runthe-gg-site/ea414e14-3658-5c2f-a4bf-ac3fb35f2d97/scratchpad/'
    open(sc+'hockey.js.txt','w').write(js_map('hockey',hockey)+'\n\n'+'hockey_PAL: '+js_pal(HOCKEY_PAL)+'\n')
    try:
        from PIL import Image
    except Exception:
        print('no PIL'); sys.exit(0)
    scale=14; img=Image.new('RGB',(14*scale+8,18*scale+8),(18,30,22)); px=img.load()
    for y in range(38,56):
        for x in range(30,44):
            ch=hockey[y][x]
            if ch=='.': continue
            col=HOCKEY_PAL.get(ch)
            if not col: continue
            r=int(col[1:3],16); gg=int(col[3:5],16); b=int(col[5:7],16)
            sx=(x-30)*scale; sy=(y-38)*scale
            for dy in range(scale):
                for dx in range(scale):
                    if 0<=sx+dx<img.width and 0<=sy+dy<img.height: px[sx+dx,sy+dy]=(r,gg,b)
    out=sc+'hockey_preview.png'; img.save(out); print('wrote',out)
