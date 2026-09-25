"""The coloured icons that stand in for emoji (EMOJI_MAP in golf/index.html).

Same palette as pxi.py: the icon's own colour in m with d and h worked out from it, the fixed
letters w b r y g for anything else, and a 1px dark outline added last. build.py writes EMBLEMS
into the page as PX_EMBLEM, so the colour each one is drawn in lives here beside its drawing
rather than in a second table somewhere else."""
import math
from draw import G, outline

SUN = '#F7C948'      # the faces and hands: the one warm yellow emoji already taught everybody
EMBLEMS = {}         # name -> (PXI key, colour)


def em(name, col, key=None):
    EMBLEMS[name] = (key or name, col)


def lay(*grids):
    out = [['.'] * 18 for _ in range(18)]
    for g in grids:
        rows = outline(g.rows())
        for y in range(18):
            for x in range(18):
                if rows[y][x] != '.':
                    out[y][x] = rows[y][x]
    return [''.join(r) for r in out]


def S(rows, oy=0):
    g = G()
    g.stamp([r.ljust(18, '.') for r in rows], 0, oy)
    return g


def face(cy=9.0, r=8.3):
    g = G().disc(9, cy, r)
    for y in range(18):
        for x in range(18):
            if g.get(x, y) == 'm' and math.hypot(x + .5 - 7.4, y + .5 - (cy - 1.6)) > r + .2:
                g.put(x, y, 'd')
    g.put(4, int(cy) - 4, 'h').put(5, int(cy) - 5, 'h').put(4, int(cy) - 3, 'h')
    return g


def build(P):
    # ---- the prize wheel: eight wedges, a hub, and the pointer that picks one
    g = G().disc(9, 9.6, 8.1)
    wedge = ['r', 'y', 'b', 'w', 'm', 'y', 'g', 'w']
    for y in range(18):
        for x in range(18):
            if g.get(x, y) == 'm':
                a = (math.degrees(math.atan2(y + .5 - 9.6, x + .5 - 9)) + 360 + 22.5) % 360
                g.put(x, y, wedge[int(a // 45) % 8])
    # the rim and its pegs are what make it a prize wheel rather than a beach ball
    g.ring(9, 9.6, 8.1, 1.2, 'd')
    for i in range(8):
        t = math.radians(i * 45)
        g.put(round(9 + 7.4 * math.cos(t) - .5), round(9.6 + 7.4 * math.sin(t) - .5), 'y')
    g.disc(9, 9.6, 2.0, 'k').rect(8, 9, 9, 9, 'y')
    ptr = G().stamp(['mmmmmm', '.mmmm.', '..mm..'], 6, 0)
    ptr.rect(7, 0, 8, 0, 'h')
    P['wheel'] = lay(g, ptr)
    em('wheel', '#d0433a')

    # ---- the jack o'lantern
    g = G()
    for y in range(18):
        for x in range(18):
            if ((x + .5 - 9) / 8.4) ** 2 + ((y + .5 - 11) / 6.3) ** 2 <= 1:
                g.put(x, y)
    for x in (5, 12):
        for y in range(6, 17):
            if g.get(x, y) == 'm':
                g.put(x, y, 'd')
    g.stamp(['yy.....yy', 'yyy...yyy'], 5, 8)
    g.stamp(['y.y.y.y', 'yyyyyyy', '.y.y.y.'], 6, 12)
    stem = G().rect(8, 1, 9, 5, 'g').put(10, 2, 'g').put(11, 2, 'g')
    P['pumpkin'] = lay(g, stem)
    em('pumpkin', '#e8801f')

    # ---- the turkey: a fan of feathers, a round body, a small head with its wattle
    tail = G()
    for y in range(18):
        for x in range(18):
            d = math.hypot(x + .5 - 9, y + .5 - 9.5)
            if d <= 8.4 and y <= 12:
                tail.put(x, y, 'r' if d > 6.7 else 'y' if d > 5 else 'd')
    body = G().disc(9, 12.2, 4.6)
    body.rect(7, 15, 7, 17, 'y').rect(11, 15, 11, 17, 'y')
    head = G().disc(9, 6.4, 2.3, 'h').put(8, 6, 'k').put(9, 8, 'y').put(10, 8, 'r').put(10, 9, 'r')
    P['turkey'] = lay(tail, body, head)
    em('turkey', '#9a5f2e')

    # ---- an autumn leaf
    g = G().poly([(1.5, 16), (2.5, 9), (6.5, 4), (15.5, 1.2), (16.8, 2.5), (14, 11.5), (9, 15.5), (2.5, 16.8)])
    g.line(3, 15, 15, 3, 'd')
    g.line(8, 10, 7, 6, 'd').line(11, 7, 13, 9, 'd').line(6, 12, 4, 10, 'd')
    g.line(0, 17, 2, 15, 'd')
    g.put(4, 8, 'h').put(5, 7, 'h').put(6, 6, 'h').put(7, 5, 'h')
    P['leaf'] = outline(g.rows())
    em('leaf', '#d8843a')

    # ---- a heart
    half = ['',
            '',
            '..mmmm...',
            '.mmmmmm..',
            'mmmmmmmm.',
            'mmmmmmmmm',
            'mmmmmmmmm',
            'mmmmmmmmm',
            '.mmmmmmmm',
            '..mmmmmmm',
            '...mmmmmm',
            '....mmmmm',
            '.....mmmm',
            '......mmm',
            '.......mm',
            '........m']
    g = S([h + h[::-1] for h in half])
    for y in range(18):
        for x in range(9, 18):
            if g.get(x, y) == 'm' and x + y > 17:
                g.put(x, y, 'd')
    g.put(3, 4, 'h').put(2, 5, 'h').put(2, 6, 'h').put(4, 3, 'h')
    P['heart'] = outline(g.rows())
    em('heart', '#d0433a')

    # ---- a painter's palette, with a thumb hole and five colours on it
    g = G().disc(9, 9.2, 8.2)
    g.disc(3.5, 15.5, 3.4, '.').disc(6.2, 12.3, 1.5, '.')
    for x, y, c in ((5, 5, 'r'), (9, 3, 'y'), (13, 5, 'b'), (14, 9, 'g'), (11, 12, 'w')):
        g.rect(x, y, x + 1, y + 1, c)
    for y in range(18):
        for x in range(18):
            if g.get(x, y) == 'm' and math.hypot(x + .5 - 7.6, y + .5 - 7.6) > 8.2:
                g.put(x, y, 'd')
    P['palette'] = outline(g.rows())
    em('palette', '#d6a45a')

    # ---- a sticking plaster
    g = G().poly([(1.5, 12.5), (12.5, 1.5), (16.5, 5.5), (5.5, 16.5)])
    g.poly([(5.5, 8.5), (8.5, 5.5), (12.5, 9.5), (9.5, 12.5)], 'h')
    for x, y in ((8, 8), (10, 8), (8, 10), (10, 10), (9, 9)):
        g.put(x, y, 'd')
    g.put(3, 12, 'd').put(12, 3, 'd').put(14, 5, 'd').put(5, 14, 'd')
    P['bandage'] = outline(g.rows())
    em('bandage', '#e3ae78')

    # ---- the two flags the cups are played under
    g = G()
    for y in range(3, 15):
        g.rect(1, y, 16, y, 'r' if (y - 3) % 2 == 0 else 'w')
    g.rect(1, 3, 8, 9, 'b')
    for x, y in ((2, 4), (4, 4), (6, 4), (3, 6), (5, 6), (7, 6), (2, 8), (4, 8), (6, 8)):
        g.put(x, y, 'w')
    P['flagUS'] = outline(g.rows())
    em('flagUS', '#d0433a')

    g = G().rect(1, 3, 16, 14, 'b')
    for i in range(12):
        a = math.radians(i * 30)
        g.put(round(8.5 + 4.1 * math.cos(a) - .5), round(8.5 + 4.1 * math.sin(a) - .5), 'y')
    P['flagEU'] = outline(g.rows())
    em('flagEU', '#3a6fb0')

    # ---- the faces the fans post with. One head, one light, different feelings.
    # crying
    g = face()
    g.rect(4, 7, 7, 7, 'k').put(4, 8, 'k').rect(10, 7, 13, 7, 'k').put(13, 8, 'k')
    g.rect(7, 10, 10, 13, 'k').rect(8, 12, 9, 12, 'r')
    for x in (5, 12):
        g.rect(x, 9, x, 16, 'b').put(x + (1 if x == 5 else -1), 15, 'b')
    P['faceCry'] = outline(g.rows())
    em('faceCry', SUN)

    # the devil grin
    g = face(cy=9.8, r=7.6)
    horns = G().poly([(1.5, 1), (5.5, 4.5), (3, 6)]).poly([(16.5, 1), (12.5, 4.5), (15, 6)])
    g.put(5, 6, 'k').put(6, 7, 'k').put(12, 6, 'k').put(11, 7, 'k')
    g.rect(6, 8, 6, 9, 'k').rect(11, 8, 11, 9, 'k')
    g.put(4, 11, 'k').rect(5, 12, 12, 12, 'k').put(13, 11, 'k').rect(6, 13, 11, 13, 'k')
    P['faceDevil'] = lay(horns, g)
    em('faceDevil', '#8b5cf6')

    # the salute
    g = face(cy=9.6, r=7.9)
    g.rect(5, 8, 6, 9, 'k').rect(11, 8, 12, 9, 'k')
    g.rect(6, 13, 11, 13, 'k')
    hand = G().poly([(8, 2), (16.8, 2.5), (16.8, 6.5), (9, 6)])
    hand.line(9, 4, 16, 4, 'd')
    P['faceSalute'] = lay(g, hand)
    em('faceSalute', SUN)

    # holding back tears
    g = face()
    for ex in (4, 10):
        g.rect(ex, 6, ex + 3, 9, 'w').rect(ex + 1, 7, ex + 2, 9, 'k').put(ex + 1, 7, 'w')
        g.rect(ex, 10, ex + 3, 10, 'b')
    g.put(7, 13, 'k').rect(8, 12, 9, 12, 'k').put(10, 13, 'k')
    P['facePlead'] = outline(g.rows())
    em('facePlead', SUN)

    # relieved
    g = face()
    g.put(4, 7, 'k').rect(5, 8, 6, 8, 'k').put(7, 7, 'k')
    g.put(10, 7, 'k').rect(11, 8, 12, 8, 'k').put(13, 7, 'k')
    g.put(6, 11, 'k').rect(7, 12, 10, 12, 'k').put(11, 11, 'k')
    g.rect(3, 10, 4, 10, 'r').rect(13, 10, 14, 10, 'r')
    P['faceCalm'] = outline(g.rows())
    em('faceCalm', SUN)

    # frozen
    g = face()
    g.rect(5, 6, 6, 8, 'k').rect(11, 6, 12, 8, 'k').put(5, 6, 'w').put(11, 6, 'w')
    g.rect(4, 10, 13, 13, 'k').rect(5, 11, 12, 12, 'w')
    for x in (7, 10):
        g.rect(x, 11, x, 12, 'k')
    g.rect(5, 1, 12, 1, 'w').put(4, 2, 'w').put(13, 2, 'w').put(6, 2, 'w').put(9, 2, 'w').put(11, 2, 'w')
    P['faceCold'] = outline(g.rows())
    em('faceCold', '#5bb8f0')

    # the grimace: a row of teeth
    g = face()
    g.rect(5, 6, 6, 8, 'k').rect(11, 6, 12, 8, 'k')
    g.rect(3, 10, 14, 14, 'k').rect(4, 11, 13, 13, 'w').rect(4, 12, 13, 12, 'k')
    for x in (6, 9, 11):
        g.rect(x, 11, x, 13, 'k')
    P['faceGrimace'] = outline(g.rows())
    em('faceGrimace', SUN)

    # laughing it off, with a bead of sweat
    base = face(cy=9.6, r=7.9)
    base.put(4, 8, 'k').put(5, 7, 'k').put(6, 7, 'k').put(7, 8, 'k')
    base.put(10, 8, 'k').put(11, 7, 'k').put(12, 7, 'k').put(13, 8, 'k')
    base.rect(5, 11, 12, 11, 'k').rect(5, 12, 12, 12, 'w').rect(6, 13, 11, 13, 'k').put(5, 12, 'k').put(12, 12, 'k')
    drop = G().stamp(['.b.', 'bbb', 'bbb', '.b.'], 14, 0)
    drop.put(14, 1, 'w')
    P['faceSweat'] = lay(base, drop)
    em('faceSweat', SUN)

    # a skull
    g = G().disc(9, 7.8, 7.6).rect(5, 12, 12, 16)
    g.rect(4, 6, 7, 9, 'k').rect(10, 6, 13, 9, 'k').put(4, 6, 'm').put(13, 6, 'm')
    g.rect(8, 10, 9, 11, 'k')
    g.rect(5, 14, 12, 14, 'k')
    for x in (6, 8, 10):
        g.rect(x + 1, 13, x + 1, 16, 'd')
    g.put(4, 3, 'h').put(5, 2, 'h')
    P['skull'] = outline(g.rows())
    em('skull', '#e8ebf0')

    # two eyes, looking over
    le, re_ = G(), G()
    for eg, cx in ((le, 5.2), (re_, 12.8)):
        for y in range(18):
            for x in range(18):
                if ((x + .5 - cx) / 3.6) ** 2 + ((y + .5 - 9) / 6.4) ** 2 <= 1:
                    eg.put(x, y)
        px = round(cx) + 1
        eg.rect(px - 1, 8, px, 11, 'k').put(px - 1, 8, 'w')
    P['eyes'] = lay(le, re_)
    em('eyes', '#f2f5f7')

    # ---- the hands
    # raised in celebration: two palms and the marks around them
    def palm(ox):
        return S(['',
                  '',
                  '',
                  '',
                  ' ' * ox + '.m.m.m.',
                  ' ' * ox + '.mmmmm.',
                  ' ' * ox + 'mmmmmmm',
                  ' ' * ox + 'mmmmmmm',
                  ' ' * ox + 'mmmmmmm',
                  ' ' * ox + 'mmmmmmm',
                  ' ' * ox + '.mmmmm.',
                  ' ' * ox + '..mmm..',
                  ' ' * ox + '..mmm..',
                  ' ' * ox + '..mmm..',
                  ' ' * ox + '..mmm..'])
    lh, rh = palm(1), palm(10)
    marks = G().put(1, 1, 'y').put(2, 2, 'y').put(8, 0, 'y').put(8, 1, 'y').put(9, 0, 'y').put(9, 1, 'y').put(16, 1, 'y').put(15, 2, 'y')
    P['handsUp'] = lay(lh, rh, marks)
    em('handsUp', SUN)


    # flexing
    g = S(['',
           '..........mmmm....',
           '.........mmmmmm...',
           '.........mmmmmm...',
           '..........mmmmm...',
           '...........mmmm...',
           '....mmm....mmmm...',
           '...mmmmm...mmmm...',
           '..mmmmmmm.mmmmm...',
           '.mmmmmmmmmmmmmm...',
           'mmmmmmmmmmmmmmm...',
           'mmmmmmmmmmmmmm....',
           'mmmmmmmmmmmmm.....',
           '.mmmmmmmmmmm......'])
    g.put(5, 7, 'h').put(4, 8, 'h').put(5, 8, 'h').put(3, 9, 'h')
    g.line(9, 9, 10, 8, 'd').rect(1, 13, 11, 13, 'd')
    g.rect(10, 3, 10, 3, 'd').rect(11, 4, 13, 4, 'd')
    P['flex'] = outline(g.rows())
    em('flex', SUN)

    # ---- popcorn: the striped carton and the pile over the top
    box = G().poly([(3, 7.5), (15, 7.5), (13.5, 17.5), (4.5, 17.5)])
    for y in range(18):
        for x in range(18):
            if box.get(x, y) == 'm' and (x // 2) % 2 == 1:
                box.put(x, y, 'w')
    corn = G()
    for cx, cy, c in ((4.5, 6.5, 'w'), (7.5, 5, 'w'), (11, 5.2, 'w'), (13.8, 6.6, 'w'),
                      (6, 3, 'w'), (9.4, 2.4, 'w'), (12.3, 3.2, 'w')):
        corn.disc(cx, cy, 1.9, c)
    for x, y in ((7, 5), (10, 2), (12, 6), (5, 6), (9, 5)):
        corn.put(x, y, 'y')
    P['popcorn'] = lay(corn, box)
    em('popcorn', '#d0433a')

    # the gift and the star are drawn in pxi.py; this is only the colour an emoji gets them in
    em('giftBox', '#d0433a', 'gift')
    em('starGold', '#F1D04A', 'star')
