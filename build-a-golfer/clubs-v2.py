#!/usr/bin/env python3
# CS416 — reorient ALL club heads to FACE THE CAMERA, with the club pointing down-and-away from the golfer.
# The shaft (grip) is kept the same diagonal so it stays in the hand; only the head (rows ~49-55) is redrawn
# as a frontal, face-on shape at the shaft end. Stock clubs paint with the body chrome chars (l/G/H/F/S);
# vintage/legendary clubs keep their own fixed palette (PXG_CLUB_PAL).
W, H = 44, 56
def blank(): return [['.' for _ in range(W)] for _ in range(H)]
def put(g, pts):
    for (x, y, c) in pts:
        if 0 <= x < W and 0 <= y < H: g[y][x] = c
def to_rows(g): return [''.join(r) for r in g]

# shared shaft down to the ground at ~ (40,50); head hangs at the end, presented face-on
SHAFT = [(34,40),(35,41),(35,42),(36,43),(36,44),(37,45),(37,46),(38,47),(39,48),(39,49),(40,50)]
def shaft(ch): return [(x,y,ch) for (x,y) in SHAFT]

# ---------- STOCK (body chrome chars: l shaft · H rim · F face · S hot spot · G dark/sole) ----------
driver = blank(); put(driver, shaft('l'))
put(driver, [
    (38,50,'H'),(39,50,'H'),(40,50,'H'),(41,50,'H'),
    (37,51,'H'),(38,51,'F'),(39,51,'F'),(40,51,'F'),(41,51,'F'),(42,51,'H'),
    (37,52,'H'),(38,52,'F'),(39,52,'S'),(40,52,'F'),(41,52,'F'),(42,52,'H'),
    (37,53,'H'),(38,53,'F'),(39,53,'F'),(40,53,'F'),(41,53,'F'),(42,53,'H'),
    (38,54,'H'),(39,54,'F'),(40,54,'F'),(41,54,'H'),
    (39,55,'G'),(40,55,'G'),
])
wood = blank(); put(wood, shaft('l'))
put(wood, [
    (38,51,'H'),(39,51,'H'),(40,51,'H'),(41,51,'H'),
    (38,52,'H'),(39,52,'F'),(40,52,'S'),(41,52,'F'),(42,52,'H'),
    (38,53,'H'),(39,53,'F'),(40,53,'F'),(41,53,'F'),(42,53,'H'),
    (39,54,'H'),(40,54,'H'),(41,54,'H'),
])
iron = blank(); put(iron, shaft('l'))
put(iron, [                                   # flat blade, grooves as horizontal lines
    (38,51,'S'),(39,51,'S'),(40,51,'S'),(41,51,'S'),
    (38,52,'G'),(39,52,'G'),(40,52,'G'),(41,52,'G'),
    (38,53,'S'),(39,53,'S'),(40,53,'S'),(41,53,'S'),
    (38,54,'G'),(39,54,'G'),(40,54,'G'),(41,54,'G'),
])
wedge = blank(); put(wedge, shaft('l'))
put(wedge, [                                  # taller face (more loft), more grooves
    (38,50,'S'),(39,50,'S'),(40,50,'S'),(41,50,'S'),
    (38,51,'G'),(39,51,'G'),(40,51,'G'),(41,51,'G'),
    (38,52,'S'),(39,52,'S'),(40,52,'S'),(41,52,'S'),
    (38,53,'G'),(39,53,'G'),(40,53,'G'),(41,53,'G'),
    (38,54,'S'),(39,54,'S'),(40,54,'S'),(41,54,'S'),
    (39,55,'G'),(40,55,'G'),
])
putter = blank(); put(putter, shaft('l'))
put(putter, [                                 # wide flat blade face toward camera, sight line on top
    (36,51,'l'),(37,51,'l'),(38,51,'l'),(39,51,'G'),(40,51,'l'),(41,51,'l'),(42,51,'l'),
    (36,52,'S'),(37,52,'S'),(38,52,'S'),(39,52,'S'),(40,52,'S'),(41,52,'S'),(42,52,'S'),
    (36,53,'F'),(37,53,'F'),(38,53,'F'),(39,53,'F'),(40,53,'F'),(41,53,'F'),(42,53,'F'),
    (36,54,'G'),(37,54,'G'),(38,54,'G'),(39,54,'G'),(40,54,'G'),(41,54,'G'),(42,54,'G'),
])

# ---------- VINTAGE / LEGENDARY (own palettes) ----------
# PERSIMMON — round wood face with an ivory insert, brass sole
persimmon = blank(); put(persimmon, shaft('H'))
put(persimmon, [
    (38,50,'W'),(39,50,'W'),(40,50,'W'),(41,50,'W'),
    (37,51,'W'),(38,51,'W'),(39,51,'I'),(40,51,'I'),(41,51,'W'),(42,51,'w'),
    (37,52,'W'),(38,52,'I'),(39,52,'I'),(40,52,'I'),(41,52,'I'),(42,52,'w'),
    (37,53,'w'),(38,53,'W'),(39,53,'I'),(40,53,'I'),(41,53,'W'),(42,53,'w'),
    (38,54,'B'),(39,54,'B'),(40,54,'B'),(41,54,'B'),
    (39,55,'w'),(40,55,'w'),
])
PERSIMMON_PAL = {'H':'#7a5230','W':'#6b3f1c','w':'#4a2a10','I':'#efe4c4','B':'#c9a24a'}

# BLADE PUTTER — face-on milled steel blade
blade = blank(); put(blade, shaft('l'))
put(blade, [
    (36,51,'l'),(37,51,'l'),(38,51,'l'),(39,51,'n'),(40,51,'l'),(41,51,'l'),(42,51,'l'),
    (36,52,'F'),(37,52,'F'),(38,52,'F'),(39,52,'F'),(40,52,'F'),(41,52,'F'),(42,52,'F'),
    (36,53,'S'),(37,53,'S'),(38,53,'S'),(39,53,'S'),(40,53,'S'),(41,53,'S'),(42,53,'S'),
    (36,54,'G'),(37,54,'G'),(38,54,'G'),(39,54,'G'),(40,54,'G'),(41,54,'G'),(42,54,'G'),
])
BLADE_PAL = {'l':'#cfd3da','n':'#8a929e','S':'#cfd6df','F':'#f6f8fb','G':'#7f8894'}

# EXCALIBUR — sword pointing straight down-away, broad flat blade toward camera, gold guard + gem
excalibur = blank()
put(excalibur, [(34,40,'M'),(34,41,'P'),(35,42,'g'),(36,43,'g'),(36,44,'g'),(37,45,'g'),(38,46,'g'),(39,47,'g')])
put(excalibur, [
    (36,48,'X'),(37,48,'X'),(38,48,'X'),(39,48,'X'),(40,48,'X'),(41,48,'X'),   # crossguard
    (38,49,'M'),                                                                # gem in guard
    (37,50,'S'),(38,50,'l'),(39,50,'S'),
    (37,51,'S'),(38,51,'l'),(39,51,'S'),
    (37,52,'S'),(38,52,'l'),(39,52,'S'),
    (37,53,'s'),(38,53,'l'),(39,53,'S'),
    (38,54,'S'),(38,54,'S'),(37,54,'s'),(39,54,'S'),
    (38,55,'S'),                                                                # point
])
EXCALIBUR_PAL = {'P':'#e9c659','g':'#3a2b4a','X':'#e6b93c','M':'#37d0e0','S':'#dfe6ef','s':'#9aa6b6','l':'#f7fbff'}

# MAGIC WAND — star at the tip, pointing down-away
wand = blank(); put(wand, shaft('l'))
put(wand, [(36,43,'b'),(38,47,'b')])          # gold bands (override shaft)
put(wand, [
    (39,50,'T'),
    (38,51,'t'),(39,51,'T'),(40,51,'t'),
    (37,52,'t'),(38,52,'T'),(39,52,'T'),(40,52,'T'),(41,52,'t'),
    (38,53,'T'),(39,53,'T'),(40,53,'T'),
    (37,54,'t'),(39,54,'T'),(41,54,'t'),
    (36,53,'s'),(42,51,'s'),(41,55,'s'),
])
WAND_PAL = {'l':'#2b2438','b':'#e6b93c','T':'#ffe66b','t':'#f2b73a','s':'#bfe9ff'}

# HOCKEY STICK PUTTER — wooden blade face toward camera (the flat of the blade), taped toe
hockey = blank(); put(hockey, shaft('H'))
put(hockey, [(35,41,'K'),(35,42,'K'),(37,46,'K')])   # black tape wraps
put(hockey, [
    (37,51,'W'),(38,51,'W'),(39,51,'W'),(40,51,'W'),(41,51,'W'),
    (36,52,'W'),(37,52,'W'),(38,52,'W'),(39,52,'W'),(40,52,'W'),(41,52,'W'),
    (36,53,'w'),(37,53,'W'),(38,53,'W'),(39,53,'W'),(40,53,'W'),(41,53,'w'),
    (36,54,'K'),(37,54,'K'),(38,54,'K'),(39,54,'K'),(40,54,'K'),(41,54,'K'),
    (37,55,'t'),(38,55,'t'),(39,55,'t'),(40,55,'t'),
])
HOCKEY_PAL = {'H':'#b5854a','K':'#171717','W':'#9a6327','w':'#6e451c','t':'#e8e2d2'}

STOCK = {'driver':driver,'wood':wood,'iron':iron,'wedge':wedge,'putter':putter}
SPECIAL = {'persimmon':(persimmon,PERSIMMON_PAL),'excalibur':(excalibur,EXCALIBUR_PAL),
           'blade':(blade,BLADE_PAL),'wand':(wand,WAND_PAL),'hockey':(hockey,HOCKEY_PAL)}

def js_map(name, g): return '%s:[%s]' % (name, ','.join('"%s"' % r for r in to_rows(g)))
def js_pal(pal): return '{' + ','.join("'%s':'%s'" % (k, v) for k, v in pal.items()) + '}'

# preview palette for stock chars
STOCKPAL = {'l':'#cfd2d7','G':'#2d323c','H':'#525a68','F':'#cfd3da','S':'#e8ebf0'}

if __name__ == '__main__':
    import sys
    sc='/tmp/claude-0/-home-user-runthe-gg-site/ea414e14-3658-5c2f-a4bf-ac3fb35f2d97/scratchpad/'
    order=['driver','wood','iron','wedge','putter','persimmon','blade','excalibur','wand','hockey']
    with open(sc+'clubsv2.js.txt','w') as f:
        f.write('const PXG_CLUBS={'+', '.join(js_map(k, STOCK[k] if k in STOCK else SPECIAL[k][0]) for k in order)+'};\n\n')
        f.write('const PXG_CLUB_PAL={ '+', '.join('%s:%s'%(k,js_pal(SPECIAL[k][1])) for k in ['persimmon','excalibur','blade','wand','hockey'])+' };\n')
    try:
        from PIL import Image
    except Exception:
        print('no PIL'); sys.exit(0)
    scale=9; cw=W//2
    img=Image.new('RGB',(len(order)*cw*scale+8, 20*scale+8),(30,30,34)); px=img.load()
    for ci,k in enumerate(order):
        g = STOCK[k] if k in STOCK else SPECIAL[k][0]
        pal = STOCKPAL.copy();
        if k in SPECIAL: pal.update(SPECIAL[k][1])
        ox=ci*cw
        for y in range(37,56):
            for x in range(30,44):
                ch=g[y][x]
                if ch=='.': continue
                col=pal.get(ch)
                if not col: continue
                r=int(col[1:3],16); gg=int(col[3:5],16); b=int(col[5:7],16)
                sx=(ox+(x-30))*scale; sy=(y-37)*scale
                for dy in range(scale):
                    for dx in range(scale):
                        if 0<=sx+dx<img.width and 0<=sy+dy<img.height: px[sx+dx,sy+dy]=(r,gg,b)
    out=sc+'clubsv2_preview.png'; img.save(out); print('wrote',out); print(order)
