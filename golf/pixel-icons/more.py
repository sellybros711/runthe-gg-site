"""The one colour icons that stand in for emoji (EMOJI_MAP in golf/index.html).

Same rules as icons.py: a silhouette in 'm', detail cut out as holes or laid in 'd' and 'h',
and bevel() lights the top of every thick run afterwards. Drawn for what the emoji MEANS on
the screen it is on, which is not always what it pictures: a putting green for the cup, a
polo rather than a tee shirt, a ballot box for the Player Advisory Council."""
import math
from draw import G
from icons import icon, S, M


@icon
def hourglass():
    return S(['',
              '..mmmmmmmmmmmmmm..',
              '..mmmmmmmmmmmmmm..',
              '...m..........m...',
              '...m..........m...',
              '....m.dddddd.m....',
              '.....m.dddd.m.....',
              '......m.dd.m......',
              '.......mddm.......',
              '.......mddm.......',
              '......m.dd.m......',
              '.....m..dd..m.....',
              '....m...dd...m....',
              '...m...dddd...m...',
              '...m.dddddddd.m...',
              '...mddddddddddm...',
              '..mmmmmmmmmmmmmm..',
              '..mmmmmmmmmmmmmm..'])


@icon
def news():
    g = G().rect(1, 2, 14, 15)
    g.rect(2, 3, 13, 14, '.')
    g.rect(3, 4, 12, 5)                       # the masthead
    g.rect(3, 7, 7, 10, 'd')                  # the photo
    for y in (7, 9):
        g.rect(9, y, 12, y)
    for y in (12, 14):
        g.rect(3, y, 12 if y == 12 else 9, y)
    g.rect(16, 4, 16, 16).rect(3, 17, 16, 17).put(15, 16).put(16, 17, '.')   # the page under it
    g.rect(15, 4, 15, 15, 'd')
    return g


@icon
def swirl():
    g = G()
    t = 0.0
    while t < 2.35 * 2 * math.pi:
        r = 0.9 + t * 0.52
        x = 8.5 + r * math.cos(t)
        y = 8.5 + r * math.sin(t)
        g.put(round(x), round(y))
        g.put(round(x + 0.45 * math.cos(t)), round(y + 0.45 * math.sin(t)))
        t += 0.04
    return g


@icon
def receipt():
    g = G().rect(3, 1, 14, 16)
    for x in range(3, 15):
        if (x - 3) % 2 == 1:
            g.put(x, 16, '.')
    g.rect(5, 4, 12, 4, '.').rect(5, 6, 10, 6, '.').rect(5, 8, 11, 8, '.')
    g.rect(5, 11, 7, 12, '.').rect(10, 11, 12, 12, '.')   # the total, and its figure
    g.rect(4, 1, 13, 1, 'h')
    return g


@icon
def infinity():
    g = G().ring(5.2, 9, 4.2, 2).ring(12.8, 9, 4.2, 2)
    return g


@icon
def ff():
    g = G()
    for ox in (2, 9):
        for i in range(11):
            w = min(i, 10 - i) + 1
            g.rect(ox, 4 + i, ox + w - 1, 4 + i)
    return g


@icon
def shirt():
    # a golf polo: a collar and a placket, because nobody on this tour plays in a tee shirt
    return M(['',
              '.....mmh.',
              '..mmmmm.d',
              '.mmmmmmmd',
              'mmmmmmmmd',
              'mmmmmmmmm',
              'mmmmmmmmm',
              '.mmmmmmmm',
              '...mmmmmm',
              '....mmmmm',
              '....mmmmm',
              '....mmmmm',
              '....mmmmm',
              '....mmmmm',
              '....mmmmm',
              '....mmmmm',
              '....mmmmm'])


@icon
def cards():
    g = G().rect(1, 1, 9, 13)
    g.put(1, 1, '.').put(9, 1, '.')
    g.rect(6, 3, 17, 17, '.')
    g.frame(7, 4, 15, 16).put(7, 4, '.').put(15, 4, '.').put(7, 16, '.').put(15, 16, '.')
    # the front card is a PLAYER card, so it carries a golfer rather than a suit
    g.stamp(['..mmm..',
             '..mmm..',
             '..mmm..',
             '.......',
             '.mmmmm.',
             'mmmmmmm',
             'mmmmmmm',
             'mmmmmmm'], 8, 6)
    return g


@icon
def vs():
    g = G().rect(1, 4, 16, 13).put(1, 4, '.').put(16, 4, '.').put(1, 13, '.').put(16, 13, '.')
    v = ['x...x', 'x...x', 'x...x', '.x.x.', '.x.x.', '..x..']
    s_ = ['xxxx', 'x...', 'xxx.', '...x', '...x', 'xxx.']
    for y, r in enumerate(v):
        for x, c in enumerate(r):
            if c == 'x':
                g.put(3 + x, 6 + y, '.')
    for y, r in enumerate(s_):
        for x, c in enumerate(r):
            if c == 'x':
                g.put(10 + x, 6 + y, '.')
    return g


@icon
def bars():
    g = G().rect(2, 10, 5, 15).rect(7, 6, 10, 15).rect(12, 2, 15, 15).rect(1, 16, 16, 16)
    return g


@icon
def pencil():
    return S(['',
              '.............mm...',
              '............mhhm..',
              '...........mmmhmm.',
              '..........mddmmm..',
              '.........mmmmmm...',
              '........mmmmmd....',
              '.......mmmmmd.....',
              '......mmmmmd......',
              '.....mmmmmd.......',
              '....mmmmmd........',
              '...mmmmmd.........',
              '...mmmmd..........',
              '..m.mmd...........',
              '..mm.d............',
              '.mmmm.............',
              '.mm...............'])


@icon
def compass():
    g = G().ring(9, 9, 8.3, 2)
    g.poly([(13.2, 4.8), (10.4, 10.4), (7.6, 7.6)])
    g.poly([(4.8, 13.2), (7.6, 7.6), (10.4, 10.4)], 'd')
    g.put(8, 1, '.').put(9, 1, '.').rect(8, 0, 9, 0)
    return g


@icon
def info():
    g = G().disc(9, 9, 8.3)
    g.rect(8, 3, 9, 4, '.')
    g.rect(8, 7, 9, 13, '.').put(7, 7, '.').rect(6, 13, 11, 13, '.')
    return g


@icon
def megaphone():
    g = G().poly([(2, 6.5), (7, 6.5), (15, 1.5), (15, 16.5), (7, 11.5), (2, 11.5)])
    g.rect(15, 2, 16, 16).rect(15, 2, 15, 16, 'd')
    g.rect(4, 12, 6, 15)
    g.rect(1, 7, 1, 10)
    return g


@icon
def handshake():
    return S(['', '', '',
              'dd..............dd',
              'ddd.....mmmm...ddd',
              'dddm..mmmmmmm.mddd',
              'dddmmmmmmmmmmmmddd',
              '.ddmmmmm.mmmmmmdd.',
              '..dmmm.mmm.mmmmd..',
              '...mmmm.mmm.mmm...',
              '....mmmm.mmm.mm...',
              '.....mmmm.mmmm....',
              '......mmmmmmm.....',
              '.......mmmmm......'])


@icon
def warning():
    g = G().poly([(9, 0.5), (17.5, 16.6), (0.5, 16.6)])
    g.rect(8, 6, 9, 11, '.').rect(8, 13, 9, 14, '.')
    return g


@icon
def bell():
    return M(['',
              '........m',
              '.......mm',
              '.....mmmm',
              '....mmmmm',
              '....mmmmm',
              '...mmmmmm',
              '...mmmmmm',
              '...mmmmmm',
              '...mmmmmm',
              '..mmmmmmm',
              '..mmmmmmm',
              '.mmmmmmmm',
              'mmmmmmmmm',
              '.........',
              '.......mm',
              '........m'])


@icon
def door():
    g = G().rect(3, 1, 14, 16).rect(1, 17, 16, 17)
    g.frame(5, 3, 12, 8, 'd').frame(5, 10, 12, 15, 'd')
    g.rect(11, 9, 12, 9, '.').put(12, 9, 'h')
    g.put(11, 9, '.')
    return g


@icon
def wave():
    return S(['',
              '........mm........',
              '.....mm.mm.mm.....',
              '.....mm.mm.mm.....',
              '.....mm.mm.mm.....',
              '.....mm.mm.mm.mm..',
              '.....mm.mm.mm.mm..',
              '..m..mm.mm.mm.mm..',
              '.m...mmmmmmmmmmm..',
              '.m...mmmmmmmmmmm..',
              '..m..mmmmmmmmmmm..',
              '..mm.mmmmmmmmmmm..',
              '...mmmmmmmmmmmmm..',
              '....mmmmmmmmmmm...',
              '.....mmmmmmmmm....',
              '......mmmmmmm.....',
              '.......mmmmmm.....',
              '.......mmmmmm.....'])


@icon
def shuffle():
    g = G()
    g.rect(0, 3, 4, 4).line(4, 4, 11, 12, 'm', 2).rect(11, 12, 14, 13)
    g.rect(0, 12, 4, 13).line(4, 12, 11, 4, 'm', 2).rect(11, 3, 14, 4)
    for y0 in (3, 12):
        g.stamp(['m...', 'mm..', 'mmm.', 'mmm.', 'mm..', 'm...'], 14, y0 - 2)
    return g


@icon
def gradcap():
    g = G().poly([(9, 2), (17.5, 6.5), (9, 11), (0.5, 6.5)])
    g.rect(4, 9, 13, 13).poly([(4, 13), (13, 13), (11, 15.5), (6, 15.5)])
    g.poly([(9, 2), (17.5, 6.5), (9, 11), (0.5, 6.5)])
    g.rect(5, 9, 12, 9, 'd')
    g.put(9, 6, 'd').rect(10, 7, 14, 7, 'd').rect(15, 7, 15, 12).rect(14, 13, 16, 15)
    return g


@icon
def ruler():
    g = G().poly([(1.5, 1), (1.5, 17), (17, 17)])
    g.poly([(4.5, 8.5), (4.5, 14), (10, 14)], '.')
    for x in (4, 7, 10, 13):
        g.put(x, 16, 'd')
    return g


@icon
def wind():
    return S(['',
              '..........mmm.....',
              '.........m...m....',
              '..............m...',
              '.............mm...',
              'mmmmmmmmmmmmmm....',
              'mmmmmmmmmmmmm.....',
              '',
              'mmmmmmmmmmmmmmmm..',
              'mmmmmmmmmmmmmmmmm.',
              '................mm',
              '.....mmmmmmmm...mm',
              '.....mmmmmmmmm.mm.',
              '.............mmm..',
              '.............m....',
              '..............mm..'])


@icon
def tv():
    g = G().rect(1, 5, 16, 15).put(1, 5, '.').put(16, 5, '.').put(1, 15, '.').put(16, 15, '.')
    g.rect(3, 7, 12, 13, '.')
    g.rect(14, 7, 14, 8, 'd').rect(14, 10, 14, 11, 'd')
    g.line(5, 1, 8, 4).line(12, 1, 9, 4)
    g.rect(3, 16, 4, 16).rect(13, 16, 14, 16)
    return g


@icon
def map_():
    g = G()
    g.poly([(0.5, 3), (6, 1), (6, 15), (0.5, 17)])
    g.poly([(6, 1), (12, 3), (12, 17), (6, 15)], 'd')
    g.poly([(12, 3), (17.5, 1), (17.5, 15), (12, 17)])
    g.put(3, 11, '.').put(4, 10, '.').put(7, 9, 'h').put(9, 8, 'h').put(10, 6, 'h')
    g.put(14, 6, '.').put(14, 5, '.').put(15, 6, '.').put(13, 6, '.').put(14, 7, '.')
    return g


@icon
def green():
    # the putting surface, with the cup cut in it and the flagstick standing in the cup
    g = G()
    for y in range(18):
        for x in range(18):
            if ((x + .5 - 9) / 8.7) ** 2 + ((y + .5 - 13) / 4.3) ** 2 <= 1:
                g.put(x, y)
    for y in range(18):
        for x in range(18):
            if ((x + .5 - 11.5) / 2.2) ** 2 + ((y + .5 - 13.5) / 1.2) ** 2 <= 1:
                g.put(x, y, '.')
    g.rect(11, 1, 11, 13).rect(12, 1, 15, 2).rect(12, 3, 14, 3).rect(12, 4, 12, 4)
    g.put(4, 12, 'h').put(5, 12, 'h').put(4, 13, 'h')
    return g


@icon
def bed():
    g = G().rect(1, 3, 2, 16).rect(1, 10, 16, 13).rect(15, 14, 16, 16)
    g.rect(3, 8, 6, 9).put(3, 8, '.').put(6, 8, '.')
    g.rect(8, 8, 16, 9).rect(8, 8, 16, 8, 'h')
    g.rect(3, 10, 16, 10, 'd')
    return g


@icon
def sunrise():
    g = G()
    for y in range(18):
        for x in range(18):
            if (x + .5 - 9) ** 2 + (y + .5 - 12) ** 2 <= 25 and y < 12:
                g.put(x, y)
    for a in (-160, -125, -90, -55, -20):
        r = math.radians(a)
        for d in (7.2, 8.2):
            g.put(round(8.5 + d * math.cos(r)), round(11.5 + d * math.sin(r)))
    g.rect(0, 12, 17, 13)
    g.rect(2, 15, 7, 15).rect(10, 15, 15, 15).rect(5, 17, 12, 17)
    return g


@icon
def ballot():
    g = G().rect(2, 9, 15, 16)
    g.rect(2, 9, 15, 9, 'h')
    g.rect(4, 11, 13, 11, 'd')
    g.rect(6, 1, 11, 8).rect(7, 2, 10, 7, '.')
    g.put(7, 5, 'm').put(8, 6, 'm').put(9, 5, 'm').put(10, 4, 'm')
    return g


@icon
def mic():
    g = G().rect(6, 1, 11, 9).put(6, 1, '.').put(11, 1, '.').put(6, 9, '.').put(11, 9, '.')
    for y in (3, 5, 7):
        g.rect(7, y, 10, y, 'd')
    for y in range(18):
        for x in range(18):
            d = math.hypot(x + .5 - 9, y + .5 - 7)
            if 5.3 < d <= 6.6 and y >= 7:
                g.put(x, y)
    g.rect(8, 13, 9, 15).rect(5, 16, 12, 17)
    return g


@icon
def install():
    # a phone with an arrow coming down onto its screen: Add to Home Screen
    g = G().rect(4, 0, 13, 17).put(4, 0, '.').put(13, 0, '.').put(4, 17, '.').put(13, 17, '.')
    g.rect(5, 2, 12, 14, '.')
    g.rect(8, 3, 9, 8)
    g.rect(6, 9, 11, 9).rect(7, 10, 10, 10).rect(8, 11, 9, 11)
    g.rect(6, 13, 11, 13)
    g.rect(8, 15, 9, 15, '.')
    return g


@icon
def dog():
    return S(['',
              '....mmmmmmmmmm....',
              '..mmmmmmmmmmmmmm..',
              '.ddmmmmmmmmmmmmdd.',
              'dddmmmmmmmmmmmmddd',
              'dddmm.mmmmmm.mmddd',
              'dddmm.mmmmmm.mmddd',
              'dddmmmmmmmmmmmmddd',
              'dd.mmmmmmmmmmmm.dd',
              'dd.mmmm....mmmm.dd',
              '.d..mmmm..mmmm..d.',
              '.....mmmmmmmm.....',
              '.....mm.mm.mm.....',
              '......mmmmmm......',
              '.......mmmm.......'])


@icon
def cricket():
    g = G().line(4, 16, 12, 5, 'm', 3)
    g.line(12, 5, 15, 1, 'm', 1).line(13, 5, 16, 1, 'm', 1)
    g.disc(4, 5, 2.6)
    g.put(3, 4, 'h')
    return g
