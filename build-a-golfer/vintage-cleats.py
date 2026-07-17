#!/usr/bin/env python3
# CS414 — Rocket Cleats: a footwear overlay that recolors both shoes into red/chrome rocket boots with
# flame licks at the ankles. Symmetric (no handedness flip). Painted over the shoe pixels (rows 53-55,
# left foot x13-21, right foot x23-31) plus small flames on the lower shin (rows 50-52) — all inside the
# body footprint, so it never collides with the club (viewer-left) or the ball (viewer-right).
W, H = 44, 56
def blank(): return [['.' for _ in range(W)] for _ in range(H)]
def put(g, pts):
    for (x, y, c) in pts:
        if 0 <= x < W and 0 <= y < H: g[y][x] = c
def to_rows(g): return [''.join(r) for r in g]

rocket = blank()

def boot(x0):
    # x0 = left edge of the shoe (13 or 23). Shoe spans x0..x0+8, rows 53-55.
    pts=[]
    # row 53: heel/instep — red body with a white flash
    for i,ch in enumerate(['R','R','R','W','W','C','C','C','C']):
        pts.append((x0+i,53,ch))
    # row 54: mid — red with chrome toe
    for i,ch in enumerate(['R','R','W','W','C','C','C','k','k']):
        pts.append((x0+i,54,ch))
    # row 55: sole — dark tread with a chrome edge
    for i,ch in enumerate(['k','k','k','k','k','k','k','k','C']):
        pts.append((x0+i,55,ch))
    return pts

put(rocket, boot(13))
put(rocket, boot(23))
# flame licks curling up the lower shin from each boot (rows 50-52)
put(rocket, [
    (15,52,'f'),(16,51,'F'),(16,52,'m'),(17,50,'f'),
    (25,52,'f'),(26,51,'F'),(26,52,'m'),(27,50,'f'),
])
ROCKET_PAL = {'R':'#d1352a','W':'#f4f6fb','C':'#c9d0da','k':'#2a2f38','f':'#ff8a2a','m':'#ffcf5a','F':'#ffe89a'}

CLEATS = {'rocket': (rocket, ROCKET_PAL)}

def js_map(name, g): return '%s:[%s]' % (name, ','.join('"%s"' % r for r in to_rows(g)))
def js_pal(pal): return '{' + ','.join("'%s':'%s'" % (k, v) for k, v in pal.items()) + '}'

if __name__ == '__main__':
    import sys
    sc='/tmp/claude-0/-home-user-runthe-gg-site/ea414e14-3658-5c2f-a4bf-ac3fb35f2d97/scratchpad/'
    with open(sc+'cleats.js.txt','w') as f:
        for k,(g,pal) in CLEATS.items():
            f.write(js_map(k,g)+'\n\n'); f.write('%s_PAL: %s\n\n'%(k,js_pal(pal)))
    try:
        from PIL import Image
    except Exception:
        print('no PIL'); sys.exit(0)
    scale=16; img=Image.new('RGB',(24*scale+8,8*scale+8),(18,30,22)); px=img.load()
    g,pal=CLEATS['rocket']
    for y in range(49,56):
        for x in range(11,35):
            ch=g[y][x]
            if ch=='.': continue
            col=pal.get(ch)
            if not col: continue
            r=int(col[1:3],16); gg=int(col[3:5],16); b=int(col[5:7],16)
            sx=(x-11)*scale; sy=(y-49)*scale
            for dy in range(scale):
                for dx in range(scale):
                    if 0<=sx+dx<img.width and 0<=sy+dy<img.height: px[sx+dx,sy+dy]=(r,gg,b)
    out=sc+'cleats_preview.png'; img.save(out); print('wrote',out)
