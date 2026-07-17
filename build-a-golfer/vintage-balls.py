#!/usr/bin/env python3
# CS414 — ball cosmetics rendered as a small teed ball beside the standing golfer (44x56 overlay).
# Authored on the golfer's TRAIL side (viewer-right for a righty) so it never collides with the club,
# which sits on the lead side and flips with handedness. Painted flip=look.lefty (opposite the club),
# so the ball and club always land on opposite sides of the golfer.
W, H = 44, 56

def blank():
    return [['.' for _ in range(W)] for _ in range(H)]
def put(g, pts):
    for (x, y, c) in pts:
        if 0 <= x < W and 0 <= y < H:
            g[y][x] = c
def to_rows(g):
    return [''.join(r) for r in g]

# ball body box ~ x35-38, rows 49-53 ; tee at row 53
def ball_body(g, o, hi, tee):
    put(g, [
        (36,49,o),(37,49,o),
        (35,50,o),(36,50,hi),(37,50,hi),(38,50,o),
        (35,51,o),(36,51,hi),(37,51,o),(38,51,o),
        (35,52,o),(36,52,o),(37,52,o),(38,52,o),
        (36,53,tee),(37,53,tee),
    ])

# FEATHERIE — hand-sewn tan leather ball
featherie = blank()
ball_body(featherie, 'o', 'h', 'T')
# a couple of seam stitches
put(featherie, [(36,51,'s'),(37,52,'s')])
FEATHERIE_PAL = {'o':'#b79a63','h':'#efe0bd','s':'#7c6033','T':'#caa76a'}

# COMET BALL — glowing fireball with a little tail streaking up-and-back
comet = blank()
ball_body(comet, 'o', 'h', 'T')
# fiery tail (up-right, trailing off the ball) + sparks
put(comet, [
    (38,49,'t'),(39,48,'t'),(40,47,'m'),
    (39,50,'m'),(40,49,'s'),(41,48,'s'),
    (38,52,'t'),
])
COMET_PAL = {'o':'#d24a1a','h':'#ffe08a','t':'#ff8a2a','m':'#ffb347','s':'#fff0b0','T':'#8a939e'}

BALLS = {'featherie': (featherie, FEATHERIE_PAL), 'comet': (comet, COMET_PAL)}

def js_map(name, g):
    return '%s:[%s]' % (name, ','.join('"%s"' % r for r in to_rows(g)))
def js_pal(pal):
    return '{' + ','.join("'%s':'%s'" % (k, v) for k, v in pal.items()) + '}'

if __name__ == '__main__':
    import sys
    sc='/tmp/claude-0/-home-user-runthe-gg-site/ea414e14-3658-5c2f-a4bf-ac3fb35f2d97/scratchpad/'
    with open(sc+'balls.js.txt', 'w') as f:
        for k, (g, pal) in BALLS.items():
            f.write(js_map(k, g) + '\n\n')
            f.write('%s_PAL: %s\n\n' % (k, js_pal(pal)))
    try:
        from PIL import Image
    except Exception:
        print('no PIL; JS emitted'); sys.exit(0)
    scale=16; img=Image.new('RGB',(2*10*scale+8, 8*scale+8),(18,30,22)); px=img.load()
    for ci,(k,(g,pal)) in enumerate(BALLS.items()):
        ox=ci*10
        for y in range(46,55):
            for x in range(34,44):
                ch=g[y][x]
                if ch=='.': continue
                col=pal.get(ch)
                if not col: continue
                r=int(col[1:3],16); gg=int(col[3:5],16); b=int(col[5:7],16)
                sx=(ox+(x-34))*scale; sy=(y-46)*scale
                for dy in range(scale):
                    for dx in range(scale):
                        if 0<=sx+dx<img.width and 0<=sy+dy<img.height: px[sx+dx,sy+dy]=(r,gg,b)
    out=sc+'balls_preview.png'; img.save(out); print('wrote',out); print(list(BALLS.keys()))
