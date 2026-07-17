#!/usr/bin/env python3
# CS414 — vintage/legendary CLUB sprites for the standing pixel golfer (44x56 overlay, authored on the
# golfer's left hand; a righty mirrors it). Each club has its OWN fixed palette (PXG_CLUB_PAL) so it
# never borrows the body's chrome. Shaft/grip aligned to the existing driver/putter grip pixels.
# Renders a preview PNG so the shapes can be eyeballed before wiring into the HTML.
W, H = 44, 56

def blank():
    return [['.' for _ in range(W)] for _ in range(H)]

def put(g, pts):
    for (x, y, c) in pts:
        if 0 <= x < W and 0 <= y < H:
            g[y][x] = c

def to_rows(g):
    return [''.join(r) for r in g]

# ---- shared shaft/grip: same diagonal the stock driver uses, so the hand grips it identically ----
# stock driver shaft: (34,40)(35,41)(35,42)(36,43)(36,44)(37,45)(37,46)(38,47)
SHAFT_SHORT = [(34,40),(35,41),(35,42),(36,43),(36,44),(37,45),(37,46),(38,47)]
# long shaft (putter/wand) continues to the ground
SHAFT_LONG  = SHAFT_SHORT + [(38,47),(39,48),(40,49),(40,50)]

def shaft(pts, ch):
    return [(x, y, ch) for (x, y) in pts]

# ============ PERSIMMON DRIVER (vintage wooden wood) ============
# 'H'=shaft(hickory), crown 'W'/'w' walnut, face insert 'I' ivory, sole 'B' brass, whip 'p' red neck
persimmon = blank()
put(persimmon, shaft(SHAFT_SHORT, 'H'))
put(persimmon, [(38,47,'p'),(39,47,'p')])                              # red whipping at the hosel
put(persimmon, [
    # crown (rows 48-49) rounded top
    (37,48,'W'),(38,48,'W'),(39,48,'W'),(40,48,'W'),(41,48,'w'),
    (36,49,'w'),(37,49,'W'),(38,49,'W'),(39,49,'W'),(40,49,'W'),(41,49,'W'),(42,49,'w'),
    # body (rows 50-52) with ivory face insert on the leading edge
    (36,50,'w'),(37,50,'W'),(38,50,'W'),(39,50,'W'),(40,50,'W'),(41,50,'I'),(42,50,'I'),
    (36,51,'w'),(37,51,'W'),(38,51,'W'),(39,51,'W'),(40,51,'W'),(41,51,'I'),(42,51,'I'),
    # sole (row 52-53) brass
    (37,52,'B'),(38,52,'B'),(39,52,'B'),(40,52,'B'),(41,52,'B'),
    (38,53,'B'),(39,53,'B'),(40,53,'B'),
])
PERSIMMON_PAL = {'H':'#7a5230','p':'#a4321f','W':'#6b3f1c','w':'#4a2a10','I':'#efe4c4','B':'#c9a24a'}

# ============ EXCALIBUR DRIVER (legendary sword) ============
# wrapped grip 'g', gold pommel 'P', gold crossguard 'X', gem 'M', silver blade 'S'/'s', fuller 'l'
excalibur = blank()
put(excalibur, [
    # grip wrap (upper) — where the hand holds it
    (34,40,'P'),(35,41,'g'),(35,42,'g'),(36,43,'g'),(36,44,'g'),(37,45,'g'),(37,46,'g'),
    # pommel gem at top
    (34,39,'M'),
    # crossguard (row 47) gold bar
    (35,47,'X'),(36,47,'X'),(37,47,'X'),(38,47,'X'),(39,47,'X'),(40,47,'X'),
    (37,48,'M'),                                                        # center gem set in guard
    # blade — long tapering silver, fuller down the middle
    (37,49,'S'),(38,49,'l'),(39,49,'S'),
    (37,50,'S'),(38,50,'l'),(39,50,'S'),
    (37,51,'S'),(38,51,'l'),(39,51,'S'),
    (37,52,'s'),(38,52,'l'),(39,52,'S'),
    (38,53,'s'),(38,53,'S'),
    (38,54,'S'),                                                        # point
])
EXCALIBUR_PAL = {'P':'#e9c659','g':'#3a2b4a','X':'#e6b93c','M':'#37d0e0','S':'#dfe6ef','s':'#9aa6b6','l':'#f7fbff'}

# ============ BLADE PUTTER (classic milled blade) ============
# steel shaft 'l', blade head 'S' face / 'F' top / 'G' shadow, hosel 'n'
blade = blank()
put(blade, shaft(SHAFT_LONG, 'l'))
put(blade, [
    (39,51,'n'),(40,51,'n'),                                           # hosel bend
    # thin milled blade along the ground
    (34,52,'F'),(35,52,'F'),(36,52,'F'),(37,52,'F'),(38,52,'F'),(39,52,'F'),(40,52,'F'),(41,52,'F'),
    (34,53,'S'),(35,53,'S'),(36,53,'S'),(37,53,'S'),(38,53,'S'),(39,53,'S'),(40,53,'S'),(41,53,'S'),
    (35,54,'G'),(36,54,'G'),(37,54,'G'),(38,54,'G'),(39,54,'G'),(40,54,'G'),
])
BLADE_PAL = {'l':'#cfd3da','n':'#8a929e','S':'#e8ebf0','F':'#f6f8fb','G':'#7f8894'}

# ============ MAGIC WAND PUTTER (legendary) ============
# dark shaft 'l', gold bands 'b', star 'T' (bright) / 't' (mid), sparkle 's'
wand = blank()
put(wand, shaft(SHAFT_LONG, 'l'))
put(wand, [
    (36,43,'b'),(37,45,'b'),                                           # gold bands on the wand
    # star at the tip (bottom), 5-point-ish burst around x38,y52
    (38,49,'T'),
    (37,50,'t'),(38,50,'T'),(39,50,'t'),
    (36,51,'t'),(37,51,'T'),(38,51,'T'),(39,51,'T'),(40,51,'t'),
    (37,52,'T'),(38,52,'T'),(39,52,'T'),
    (36,53,'t'),(38,53,'T'),(40,53,'t'),
    (35,52,'s'),(41,50,'s'),(40,54,'s'),                               # loose sparkles
])
WAND_PAL = {'l':'#2b2438','b':'#e6b93c','T':'#ffe66b','t':'#f2b73a','s':'#bfe9ff'}

CLUBS = {
    'persimmon': (persimmon, PERSIMMON_PAL),
    'excalibur': (excalibur, EXCALIBUR_PAL),
    'blade':     (blade, BLADE_PAL),
    'wand':      (wand, WAND_PAL),
}

def js_map(name, g):
    rows = to_rows(g)
    return '%s:[%s]' % (name, ','.join('"%s"' % r for r in rows))

def js_pal(pal):
    return '{' + ','.join("'%s':'%s'" % (k, v) for k, v in pal.items()) + '}'

if __name__ == '__main__':
    import sys
    # emit JS
    with open('/tmp/claude-0/-home-user-runthe-gg-site/ea414e14-3658-5c2f-a4bf-ac3fb35f2d97/scratchpad/clubs.js.txt', 'w') as f:
        for k, (g, pal) in CLUBS.items():
            f.write(js_map(k, g) + '\n\n')
            f.write("%s_PAL: %s\n\n" % (k, js_pal(pal)))
    # preview PNG
    try:
        from PIL import Image
    except Exception:
        print('no PIL; JS emitted only'); sys.exit(0)
    scale = 10
    pad = 6
    cols = len(CLUBS)
    img = Image.new('RGB', (cols * (W//2) * scale + pad, 20 * scale + pad), (18, 30, 22))
    px = img.load()
    for ci, (k, (g, pal)) in enumerate(CLUBS.items()):
        ox = ci * (W//2)
        for y in range(38, 56):
            for x in range(30, 44):
                ch = g[y][x]
                if ch == '.':
                    continue
                col = pal.get(ch)
                if not col:
                    continue
                r = int(col[1:3], 16); gg = int(col[3:5], 16); b = int(col[5:7], 16)
                sx = (ox + (x - 30)) * scale
                sy = (y - 38) * scale
                for dy in range(scale):
                    for dx in range(scale):
                        if 0 <= sx+dx < img.width and 0 <= sy+dy < img.height:
                            px[sx+dx, sy+dy] = (r, gg, b)
    out = '/tmp/claude-0/-home-user-runthe-gg-site/ea414e14-3658-5c2f-a4bf-ac3fb35f2d97/scratchpad/clubs_preview.png'
    img.save(out)
    print('wrote', out)
    print(list(CLUBS.keys()))
