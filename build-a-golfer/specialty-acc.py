#!/usr/bin/env python3
# CS418 — specialty accessories for Legendary Drop 1 step 5: a golden Laurel Wreath (headwear) and
# Prism Shades (rainbow-mirror eyewear). Emitted as 44x56 sprite maps aligned to the pixel golfer's head
# (crown region rows 4-10 cols 15-29; eye region rows 13-15 cols 13-30). Colours ride PXG_NOV.
W, H = 44, 56
def grid(): return [['.' for _ in range(W)] for _ in range(H)]
def put(g, pts):
    for (x, y, c) in pts:
        if 0 <= x < W and 0 <= y < H: g[y][x] = c
def rows(g): return [''.join(r) for r in g]

# ---- LAUREL WREATH (gold 4/5/6): two branches framing the head + a front brow band ----
laurel = grid()
# left branch leaves (curving up the temple), right branch mirrored about x=22
def leaf(x, y, c='4'): return [(x, y, c)]
L = []
# front brow band (sits at the hairline, rows 11-12)
for x in range(16, 29): L.append((x, 12, '5'))
for x in range(17, 28): L.append((x, 11, '4'))
L.append((22, 10, '6'))   # small front centerpiece jewel-ish highlight
# side leaves — left
L += [(15,11,'4'),(14,10,'5'),(15,9,'4'),(14,8,'6'),(15,7,'4'),(16,6,'5'),
      (13,11,'5'),(13,9,'4'),(13,7,'5')]
# side leaves — right (mirror x' = 44-1-x about center 22 → use 43-x offset around 22: x'=44-x)
for (x,y,c) in list(L):
    if x < 22:
        L.append((43-x, y, c))
put(laurel, L)

# ---- PRISM SHADES: PXG_SHADES frame (k) with a rainbow lens sweep (a/e/f/r/y) ----
prism = grid()
K = 'k'
# frame top
for x in range(14, 31): prism[13][x] = K
# row 14: frame + left lens + bridge + right lens + temple
prism[14][13] = K; prism[14][14] = K
for i,ch in enumerate('aefry'): prism[14][15+i] = ch
prism[14][20] = K; prism[14][21] = K
for i,ch in enumerate('aefry'): prism[14][22+i] = ch
for x in range(27, 31): prism[14][x] = K
# row 15: lens bottoms
for i,ch in enumerate('aefry'): prism[15][15+i] = ch
for i,ch in enumerate('aefry'): prism[15][22+i] = ch

NOV_ADD = {'a':'#ff5a5a','e':'#ffb43a','f':'#ffe14d','r':'#5ad07a','y':'#6aa9ff'}   # rainbow lens sweep

def js(name, g): return '%s:[%s]' % (name, ','.join('"%s"'%r for r in rows(g)))

if __name__ == '__main__':
    sc='/tmp/claude-0/-home-user-runthe-gg-site/ea414e14-3658-5c2f-a4bf-ac3fb35f2d97/scratchpad/'
    with open(sc+'specialty.js.txt','w') as f:
        f.write(js('PXG_LAUREL', laurel)+'\n\n')
        f.write(js('PXG_PRISM_SHADES', prism)+'\n\n')
        f.write('NOV_ADD '+repr(NOV_ADD)+'\n')
    # ascii preview
    for nm,g in [('LAUREL',laurel),('PRISM',prism)]:
        print('===',nm,'===')
        print('   '+''.join(str(i%10) for i in range(44)))
        for y,r in enumerate(rows(g)):
            if r.strip('.'): print('%2d '%y+r)
    print('wrote', sc+'specialty.js.txt')
