"""The coloured set (PXI, PX_COINS, PX_TOKEN): body in m, shade d, light h, palette letters for
anything that is not the chip's own colour, and a 1px dark outline added last."""
import math
from draw import G, outline, check

P = {}


def layer(*grids):
    """Outline each grid on its own, then lay them over each other in order, so a coin in front
    keeps its own edge where it overlaps the coin behind it."""
    out = [['.'] * 18 for _ in range(18)]
    for g in grids:
        rows = outline(g.rows())
        for y in range(18):
            for x in range(18):
                if rows[y][x] != '.':
                    out[y][x] = rows[y][x]
    return [''.join(r) for r in out]


def star_pts(cx, cy, ro, ri, n=5, rot=-90):
    pts = []
    for i in range(n * 2):
        r = ro if i % 2 == 0 else ri
        a = math.radians(rot + i * 180 / n)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def coin(cx, cy, r, glyph=True):
    g = G().disc(cx, cy, r)
    g.ring(cx, cy, r, 1, 'd')
    g.ring(cx, cy, r - 1, 1, 'h')
    # the light only reaches the top left of the inner ring
    for y in range(18):
        for x in range(18):
            if g.get(x, y) == 'h' and (x + .5 - cx) + (y + .5 - cy) > -1:
                g.put(x, y, 'm')
    if glyph:
        ox, oy = round(cx) - 3, round(cy) - 4
        g.stamp(['...dd.',
                 '.dddd.',
                 'dd....',
                 '.ddd..',
                 '...ddd',
                 '....dd',
                 '.dddd.',
                 '..dd..'], ox, oy)
    return g


def pxi():
    # medal on a two colour ribbon
    g = G().rect(5, 1, 12, 6, 'b').rect(8, 1, 9, 6, 'w').rect(5, 1, 5, 6, 'r').rect(12, 1, 12, 6, 'r')
    g.disc(9, 11.8, 5.3).ring(9, 11.8, 5.3, 1, 'd')
    g.stamp(['..ww..', 'wwwwww', '.wwww.', '.w..w.'], 6, 10)
    g.put(6, 8, 'h').put(5, 9, 'h').put(5, 10, 'h')
    P['medal'] = outline(g.rows())

    # the win cup
    g = G().poly([(4, 1), (14, 1), (13.6, 5.5), (11, 9), (7, 9), (4.4, 5.5)])
    for p in ((2, 2), (1, 3), (1, 4), (2, 5), (3, 6), (15, 2), (16, 3), (16, 4), (15, 5), (14, 6)):
        g.put(*p)
    g.rect(8, 9, 9, 11).rect(6, 12, 11, 12).rect(4, 13, 13, 15, 'd').rect(6, 14, 11, 14, 'y')
    g.rect(5, 2, 6, 5, 'h').rect(12, 2, 12, 5, 'd')
    P['cup'] = outline(g.rows())

    # a heater shield with a star, split light and shade down the middle
    g = G().poly([(2, 1), (16, 1), (16, 8), (14, 12.2), (9, 16.6), (4, 12.2), (2, 8)])
    for y in range(18):
        for x in range(9, 18):
            if g.get(x, y) == 'm':
                g.put(x, y, 'd')
    g.rect(3, 2, 8, 2, 'h')
    g.poly(star_pts(9, 8.4, 5.6, 2.3), 'w')
    P['shield'] = outline(g.rows())

    # star
    g = G().poly(star_pts(9, 9.6, 8.2, 3.5))
    for y in range(18):
        for x in range(18):
            if g.get(x, y) == 'm':
                if x < 9 and y < 9:
                    g.put(x, y, 'h')
                elif x >= 9 and y >= 10:
                    g.put(x, y, 'd')
    P['star'] = outline(g.rows())

    # crown with three stones
    g = G().poly([(1.5, 5), (5.5, 10), (9, 4), (12.5, 10), (16.5, 5), (16, 12), (2, 12)])
    g.disc(2, 4, 1.4).disc(9, 3, 1.5).disc(16, 4, 1.4)
    g.rect(2, 12, 15, 15, 'd').rect(2, 12, 15, 12, 'h')
    g.rect(4, 13, 5, 14, 'r').rect(8, 13, 9, 14, 'b').rect(12, 13, 13, 14, 'r')
    g.put(9, 5, 'h').put(8, 6, 'h').put(3, 6, 'h')
    P['crown'] = outline(g.rows())

    # the coin
    P['dollar'] = outline(coin(9, 9, 8.1).rows())

    # bullseye
    g = G().disc(9, 9, 8).disc(9, 9, 6, 'w').disc(9, 9, 4.2).disc(9, 9, 2.3, 'w').disc(9, 9, 1.2, 'r')
    for y in range(18):
        for x in range(18):
            if g.get(x, y) == 'm' and (x + .5 - 9) + (y + .5 - 9) > 7:
                g.put(x, y, 'd')
    P['target'] = outline(g.rows())

    # globe
    g = G().disc(9, 9, 8, 'b')
    g.stamp(['.....ggg..........',
             '....gggggg........',
             '...gggggggg..gg...',
             '...ggggggg...ggg..',
             '....gggg....gggggg',
             '.....ggg...ggggggg',
             '......gg...gggggg.',
             '.......g....gggg..',
             '...........ggg....',
             '....gg.....gg.....',
             '....ggg....g......',
             '.....gg...........'], 0, 2)
    for y in range(18):
        for x in range(18):
            if (x + .5 - 9) ** 2 + (y + .5 - 9) ** 2 > 64:
                g.put(x, y, '.')
    g.put(4, 4, 'w').put(5, 3, 'w').put(3, 5, 'w')
    P['globe'] = outline(g.rows())

    # rosette
    tails = G().poly([(4.5, 10), (8, 10), (7.5, 17), (6, 15.5), (4.5, 17)], 'd')
    tails.poly([(10, 10), (13.5, 10), (13.5, 17), (12, 15.5), (10.5, 17)], 'd')
    g = G().disc(9, 7.2, 6.2)
    for i in range(0, 360, 30):
        x = 9 + 6.2 * math.cos(math.radians(i + 15)) - .5
        y = 7.2 + 6.2 * math.sin(math.radians(i + 15)) - .5
        g.put(round(x), round(y), '.')
    g.disc(9, 7.2, 3.8, 'h').disc(9, 7.2, 2.2, 'y')
    P['ribbon'] = layer(tails, g)

    # podium
    g = G().rect(6, 4, 11, 16).rect(1, 8, 5, 16).rect(12, 10, 16, 16)
    g.rect(6, 4, 11, 4, 'h').rect(1, 8, 5, 8, 'h').rect(12, 10, 16, 10, 'h')
    g.rect(1, 9, 5, 16, 'd').rect(12, 11, 16, 16, 'd')
    g.rect(8, 7, 9, 12, 'w').put(7, 8, 'w').rect(7, 13, 10, 13, 'w')
    g.poly(star_pts(9, 1.6, 1.7, .8), 'y')
    P['podium'] = outline(g.rows())

    # cart
    g = G().rect(1, 2, 2, 2).put(2, 3).put(3, 4)
    g.poly([(3, 4), (16.5, 4), (15, 11), (5, 11)])
    g.rect(4, 4, 16, 4, 'h')
    for x in (7, 10, 13):
        for y in range(5, 11):
            if g.get(x, y) == 'm':
                g.put(x, y, 'd')
    g.rect(5, 7, 15, 7, 'd')
    g.rect(5, 12, 15, 12, 'd')
    g.disc(6.5, 14.7, 1.7, 'd').disc(13.5, 14.7, 1.7, 'd').put(6, 14, 'w').put(13, 14, 'w')
    P['cart'] = outline(g.rows())

    # gift with a gold ribbon and bow
    g = G().rect(2, 8, 15, 16).rect(1, 6, 16, 8, 'h')
    g.rect(2, 9, 15, 9, 'd')
    g.rect(8, 6, 9, 16, 'y')
    bow = G().stamp(['...yy......yy...',
                     '..y..y....y..y..',
                     '..y...y..y...y..',
                     '...yyy.yy.yyy...',
                     '.......yy.......'], 1, 1)
    P['gift'] = layer(g, bow)
    return P


def coins():
    back = coin(6.5, 6.5, 5.2, glyph=False)
    back.rect(5, 5, 7, 7, 'd')
    front = coin(11, 11, 6.2)
    return layer(back, front)


def token():
    g = G().disc(9, 9, 8).ring(9, 9, 8, 1, 'd').ring(9, 9, 7, 1, 'h')
    for y in range(18):
        for x in range(18):
            if g.get(x, y) == 'h' and (x + .5 - 9) + (y + .5 - 9) > -1:
                g.put(x, y, 'm')
    g.poly(star_pts(9, 9.5, 5.6, 2.3), 'y')
    g.put(7, 7, 'w')
    return outline(g.rows())


pxi()
from pxmore import build, EMBLEMS  # noqa: E402  the coloured stand-ins for emoji
build(P)
P['COINS'] = coins()
P['TOKEN'] = token()
for k, v in P.items():
    check(k, v)
