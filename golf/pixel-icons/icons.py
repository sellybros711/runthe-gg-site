"""The one-colour UI icons (PXICONS), redrawn on the 18 grid.

Every icon is a silhouette in 'm' with holes cut for detail, then bevel() lights the top of
every thick run and shades the bottom. Explicit 'd' and 'h' are kept as drawn."""
import math
from draw import G, bevel, check

I = {}


def icon(fn):
    g = fn()
    rows = g.rows() if isinstance(g, G) else g
    I[fn.__name__.rstrip('_')] = rows
    return fn


def S(rows):
    """Pad a hand-drawn stamp to 18x18 (rows given from the top)."""
    rows = [r.ljust(18, '.') for r in rows]
    rows += ['.' * 18] * (18 - len(rows))
    return G().stamp(rows)


def M(half):
    """Mirror a 9-wide left half into an 18-wide symmetric icon."""
    return S([h + h[::-1] for h in half])


def rot_ccw(rows):
    return [''.join(rows[x][17 - y] for x in range(18)) for y in range(18)]


@icon
def ticket():
    g = G().rect(1, 3, 16, 13)
    for y in (6, 7, 8, 9, 10):
        w = 1 if y in (6, 10) else 2
        for i in range(w):
            g.put(1 + i, y, '.').put(16 - i, y, '.')
    for y in (4, 6, 8, 10, 12):
        g.put(12, y, '.')
    # a star stamped on the stub
    g.stamp(['..d..', 'ddddd', '.ddd.', '.d.d.'], 4, 6)
    return g


@icon
def skip():
    return S(['', '', '', '',
              '..m.....m.....mm..',
              '..mm....mm....mm..',
              '..mmm...mmm...mm..',
              '..mmmm..mmmm..mm..',
              '..mmmmm.mmmmm.mm..',
              '..mmmmm.mmmmm.mm..',
              '..mmmm..mmmm..mm..',
              '..mmm...mmm...mm..',
              '..mm....mm....mm..',
              '..m.....m.....mm..'])


@icon
def clock():
    g = G().ring(9, 10.5, 6.8, 2)
    g.rect(7, 1, 10, 1).rect(8, 2, 9, 3)
    g.put(14, 4).put(15, 3).put(15, 4)
    g.rect(8, 6, 9, 10).rect(10, 10, 12, 11).rect(8, 10, 9, 11, 'd')
    return g


def _arrow_up():
    return S(['',
              '',
              '........mm........',
              '.......mmmm.......',
              '......mmmmmm......',
              '.....mmmmmmmm.....',
              '....mmmmmmmmmm....',
              '...mmmmmmmmmmmm...',
              '.......mmmm.......',
              '.......mmmm.......',
              '.......mmmm.......',
              '.......mmmm.......',
              '.......mmmm.......',
              '.......mmmm.......',
              '.......mmmm.......',
              '.......mmmm.......'])


@icon
def arrowUp():
    return _arrow_up()


@icon
def arrowLeft():
    return rot_ccw(_arrow_up().rows())


@icon
def arrowUR():
    g = G().poly([(6, 2), (16, 2), (16, 12)])
    g.poly([(2, 13.5), (11, 4.5), (13.5, 7), (4.5, 16)])
    return g


@icon
def bag():
    # a backpack (the caddie and the gear), deliberately not a golf bag
    g = G().ring(9, 4, 3, 1.3)
    for y in range(4, 6):
        for x in range(7, 11):
            if g.get(x, y) == 'm':
                g.put(x, y, '.')
    g.rect(3, 5, 14, 16)
    for x, y in ((3, 5), (14, 5), (3, 16), (14, 16)):
        g.put(x, y, '.')
    g.frame(5, 10, 12, 15, 'd').rect(5, 10, 12, 11, 'd')
    g.rect(8, 12, 9, 12, 'h')
    return g


@icon
def ball():
    g = G().disc(9, 9, 7.6)
    for y in range(18):
        for x in range(18):
            if g.get(x, y) != 'm':
                continue
            if ((x + .5 - 9) ** 2 + (y + .5 - 9) ** 2) > 30:
                continue
            if y % 3 == 1 and x % 3 == (0 if (y // 3) % 2 else 2):
                g.put(x, y, 'd')
    g.rect(5, 4, 6, 4, 'h').put(4, 5, 'h')
    return g


@icon
def bolt():
    return G().poly([(9.5, 0.5), (15, 0.5), (10.5, 7), (14.5, 7), (4.5, 17.5), (7.5, 10), (3.5, 10)])


@icon
def book():
    g = G().rect(1, 3, 16, 13)
    for p in ((1, 3), (2, 3), (15, 3), (16, 3), (8, 3), (9, 3)):
        g.put(*p, '.')
    g.rect(8, 4, 9, 13, 'd')
    for y in (6, 8, 10):
        g.rect(3, y, 6, y, 'd').rect(11, y, 14, y, 'd')
    g.rect(1, 14, 7, 14).rect(10, 14, 16, 14).rect(7, 15, 10, 15)
    return g


@icon
def brick():
    g = G().rect(1, 3, 16, 14)
    for x in range(1, 17):
        g.put(x, 6, '.').put(x, 10, '.')
    for y in (3, 4, 5, 11, 12, 13, 14):
        g.put(8, y, '.')
    for y in (7, 8, 9):
        g.put(4, y, '.').put(12, y, '.')
    return g


@icon
def bug():
    g = G().disc(9, 10.5, 5.6).disc(9, 4.6, 2.6)
    g.line(7, 2, 5, 0).line(10, 2, 12, 0)
    for a, b in (((4, 8), (1, 6)), ((3, 11), (0, 11)), ((4, 14), (1, 16))):
        g.line(a[0], a[1], b[0], b[1]).line(17 - a[0], a[1], 17 - b[0], b[1])
    g.rect(8, 7, 9, 15, 'd')
    g.rect(5, 9, 6, 10, 'd').rect(11, 9, 12, 10, 'd').rect(6, 12, 6, 13, 'd').rect(11, 12, 11, 13, 'd')
    return g


@icon
def building():
    return M(['........m',
              '.......mm',
              '.....mmmm',
              '...mmmmmm',
              '.mmmmmmmm',
              '.mmmmmmmm',
              '.........',
              '..mm..mm.',
              '..mm..mm.',
              '..mm..mm.',
              '..mm..mm.',
              '..mm..mm.',
              '..mm..mm.',
              '.........',
              '.mmmmmmmm',
              'mmmmmmmmm'])


@icon
def bulb():
    g = G().disc(9, 7, 5.8)
    g.rect(6, 12, 11, 12)
    g.rect(6, 13, 11, 13, 'd').rect(6, 14, 11, 14).rect(7, 15, 10, 15, 'd').rect(8, 16, 9, 16)
    g.put(7, 9, 'd').put(8, 8, 'd').put(9, 8, 'd').put(10, 9, 'd').rect(8, 10, 9, 11, 'd')
    g.put(5, 5, 'h').put(5, 6, 'h').put(6, 4, 'h')
    return g


@icon
def calendar():
    g = G().rect(2, 3, 15, 16)
    g.put(2, 16, '.').put(15, 16, '.')
    g.rect(3, 7, 14, 15, '.')
    g.rect(5, 1, 6, 4, 'd').rect(11, 1, 12, 4, 'd')
    for x in (4, 8, 12):
        for y in (8, 12):
            g.rect(x, y, x + 1, y + 1)
    g.rect(12, 12, 13, 13, 'd')
    return g


@icon
def cap():
    return S(['', '', '',
              '......m...........',
              '....mmmmmm........',
              '...mmmmmmmmm......',
              '..mmmmmmmmmmm.....',
              '.mmmmmmmmmmmmm....',
              '.mmmmmmmmmmmmm....',
              '.mmmmmmmmmmmmmm...',
              '.dddddddddddmmmmmm',
              '...........ddddddd'])


@icon
def cart():
    g = G().rect(0, 2, 1, 3).rect(2, 3, 2, 4)
    g.poly([(2, 4), (17, 4), (15, 11), (4.5, 11)])
    for y in (6, 8):
        for x in range(4, 16):
            if g.get(x, y) == 'm':
                g.put(x, y, 'd')
    for x in (7, 10, 13):
        for y in range(5, 11):
            if g.get(x, y) == 'm':
                g.put(x, y, 'd')
    g.rect(4, 12, 15, 12, 'd')
    g.disc(6.5, 14.5, 1.7).disc(13.5, 14.5, 1.7)
    return g


@icon
def charm():
    # a horseshoe, open end up, which is the lucky way to hang one
    rows = ['.mmmmm......mmmmm.',
            '.mmmmm......mmmmm.',
            '..mmmm......mmmm..',
            '..mmmm......mmmm..',
            '..mmmm......mmmm..',
            '.mmmm........mmmm.',
            '.mmmm........mmmm.',
            '.mmmm........mmmm.',
            '.mmmm........mmmm.',
            '.mmmm........mmmm.',
            '.mmmm........mmmm.',
            '..mmmm......mmmm..',
            '..mmmmm....mmmmm..',
            '...mmmmmmmmmmmm...',
            '.....mmmmmmmm.....']
    g = S([''] * 2 + rows)
    for y in (4, 8, 11):
        g.put(2 if y != 4 else 3, y, 'd').put(15 if y != 4 else 14, y, 'd')
    g.rect(1, 2, 5, 2, 'h').rect(12, 2, 16, 2, 'h')
    return g


@icon
def chartup():
    g = G().rect(1, 16, 16, 16).rect(1, 2, 1, 16)
    g.rect(3, 12, 5, 15).rect(7, 10, 9, 15).rect(11, 7, 13, 15)
    g.line(3, 9, 7, 6, 'm', 1).line(7, 6, 9, 7).line(9, 7, 14, 2)
    g.rect(12, 1, 15, 1).rect(15, 1, 15, 4)
    return g


@icon
def chat():
    g = G().rect(1, 2, 16, 12)
    for p in ((1, 2), (16, 2), (1, 12), (16, 12)):
        g.put(*p, '.')
    g.poly([(3.5, 12), (8, 12), (2.5, 16.5)])
    for x in (4, 8, 12):
        g.rect(x, 6, x + 1, 7, '.')
    return g


@icon
def checkered():
    g = G().rect(2, 1, 3, 17)
    g.rect(4, 2, 16, 11)
    for y in range(3, 11):
        for x in range(5, 16):
            if ((x - 5) // 2 + (y - 3) // 2) % 2:
                g.put(x, y, '.')
    return g


@icon
def clipboard():
    g = G().rect(3, 3, 14, 16)
    g.put(3, 16, '.').put(14, 16, '.')
    g.rect(5, 6, 12, 15, 'h')
    for y in (8, 10, 12):
        g.rect(6, y, 11 if y != 12 else 9, y, 'd')
    g.rect(6, 2, 11, 5).rect(8, 1, 9, 1).rect(8, 3, 9, 3, '.')
    return g


@icon
def cloud():
    g = G().disc(6, 10.5, 3.8).disc(10.5, 7.8, 4.6).disc(13.6, 11, 3.1).rect(3, 11, 15, 13)
    for x in range(18):
        for y in range(14, 18):
            g.put(x, y, '.')
    return g


@icon
def crown():
    g = G().poly([(1.5, 5), (5.5, 10), (9, 3.5), (12.5, 10), (16.5, 5), (16, 13), (2, 13)])
    g.disc(2, 4, 1.3).disc(9, 2.5, 1.3).disc(16, 4, 1.3)
    g.rect(2, 13, 15, 15)
    g.rect(2, 12, 15, 12, 'd')
    g.put(4, 14, 'h').put(8, 14, 'd').put(9, 14, 'd').put(13, 14, 'h')
    return g


@icon
def driver():
    g = G().line(8, 11, 15, 1, 'm', 2)
    g.rect(14, 0, 16, 3, 'd')
    g.stamp(['.....mmm..',
             '...mmmmmm.',
             '..mmmmmmmm',
             '.mmmmmmmmm',
             '.mmmmmmmm.',
             '..mmmmmm..'], 0, 10)
    g.put(3, 12, 'h').put(4, 12, 'h').put(2, 13, 'h')
    return g


@icon
def fire():
    return S(['........m.........',
              '........mm........',
              '.......mmm........',
              '.......mmmm.......',
              '......mmmmm..m....',
              '.....mmmmmmm.mm...',
              '....mmmmmmmmmmm...',
              '...mmmmmmmmmmmmm..',
              '...mmmmmmhmmmmmm..',
              '..mmmmmmhhmmmmmm..',
              '..mmmmmhhhhmmmmm..',
              '..mmmmhhhhhmmmmm..',
              '..mmmmhhhhhhmmmm..',
              '...mmmhhhhhhmmm...',
              '....mmmhhhhmmm....',
              '......mmmmmm......'])


@icon
def flag():
    g = G().rect(4, 1, 5, 14)
    g.poly([(6, 1), (16, 4.5), (6, 8)])
    g.rect(1, 15, 12, 15).rect(3, 16, 10, 16)
    g.rect(4, 15, 5, 15, 'd')
    g.put(1, 15, '.').put(12, 15, '.')
    return g


@icon
def gear():
    g = G().disc(9, 9, 6.2)
    g.rect(8, 1, 9, 2).rect(8, 15, 9, 16).rect(1, 8, 2, 9).rect(15, 8, 16, 9)
    g.rect(3, 3, 4, 4).rect(13, 3, 14, 4).rect(3, 13, 4, 14).rect(13, 13, 14, 14)
    g.disc(9, 9, 2.3, '.')
    return g


@icon
def gem():
    g = G().poly([(5, 2.5), (13, 2.5), (16.5, 6.5), (1.5, 6.5)])
    g.poly([(1.5, 6.5), (16.5, 6.5), (9, 16.5)])
    g.rect(2, 6, 15, 6, 'd')
    g.line(6, 3, 7, 5, 'd').line(11, 3, 10, 5, 'd')
    g.line(6, 7, 8, 14, 'd').line(11, 7, 9, 14, 'd')
    g.rect(3, 4, 4, 5, 'h')
    return g


@icon
def globe():
    g = G().ring(9, 9, 7.6, 1.6)
    g.rect(2, 8, 15, 9)
    for y in range(1, 17):
        for x in range(2, 16):
            v = (x + .5 - 9) ** 2 / 12 + (y + .5 - 9) ** 2 / 52
            if 0.72 <= v <= 1.08:
                g.put(x, y)
    g.rect(8, 2, 9, 15)
    return g


@icon
def glove():
    g = S(['',
           '',
           '.......mm.mm......',
           '....mm.mm.mm......',
           '....mm.mm.mm.mm...',
           '....mm.mm.mm.mm...',
           '....mm.mm.mm.mm...',
           '....mm.mm.mm.mm...',
           '....mmmmmmmmmmm...',
           '.m..mmmmmmmmmmm...',
           '.mm.mmmmmmmmmmm...',
           '.mmmmmmmmmmmmmm...',
           '..mmmmmmmmmmmmm...',
           '...mmmmmmmmmmm....',
           '....mmmmmmmmm.....',
           '....ddddddddd.....',
           '....mmmmmmmmm.....'])
    g.rect(9, 10, 11, 12, 'd').rect(10, 11, 10, 11, 'h')
    return g


@icon
def goat():
    return M(['..m......',
              '..mm.....',
              '...mm....',
              '...mmm...',
              'mmm.mmmmm',
              '.mmmmmmmm',
              '...mmmmmm',
              '...mm.mmm',
              '....mmmmm',
              '....mmmmm',
              '.....mmmm',
              '.....mmmm',
              '......mm.',
              '......mmm',
              '.......mm',
              '........m'])


@icon
def golfer():
    return S(['..............m...',
              '.......mmm...mm...',
              '......mmmmm.mm....',
              '......mmmmmmm.....',
              '.......mmmmm......',
              '.....mmmmmmm......',
              '....mmmmmmmm......',
              '....m.mmmmmm......',
              '......mmmmmm......',
              '......mmmmmm......',
              '......mmm.mmm.....',
              '.....mmm...mmm....',
              '.....mm.....mm....',
              '....mmm......mm...',
              '....mm.......mm...',
              '...mmm.......mmm..',
              '..mmmm......mmmm..'])


@icon
def grit():
    g = G().disc(9, 9.5, 6.6)
    g.line(4, 6, 7, 7, '.').line(13, 6, 10, 7, '.')
    g.rect(6, 8, 7, 9, '.').rect(10, 8, 11, 9, '.')
    g.rect(6, 12, 11, 13, '.').rect(7, 12, 7, 13, 'd').rect(10, 12, 10, 13, 'd').rect(8, 12, 9, 13, 'd')
    for x, y in ((0, 11), (1, 10), (0, 9), (17, 11), (16, 10), (17, 9)):
        g.put(x, y, 'h')
    return g


@icon
def haptic():
    g = G().rect(6, 2, 11, 15)
    g.put(6, 2, '.').put(11, 2, '.').put(6, 15, '.').put(11, 15, '.')
    g.rect(7, 4, 10, 12, '.').rect(8, 14, 9, 14, 'd')
    for y in (5, 6, 7):
        g.put(3, y).put(14, y)
    for y in (10, 11, 12):
        g.put(3, y).put(14, y)
    for y in (7, 8, 9, 10):
        g.put(1, y).put(16, y)
    return g


@icon
def home():
    g = G().poly([(9, 0.5), (17.5, 9), (0.5, 9)])
    g.rect(13, 2, 14, 6)
    g.rect(3, 8, 14, 16)
    g.rect(7, 11, 10, 16, '.')
    g.put(9, 13, 'd')
    return g


@icon
def jug():
    g = S(['',
           '.....mmmmmmm......',
           '......mmmmm.......',
           '......mmmmm.......',
           '.....mmmmmmm.mmm..',
           '....mmmmmmmmm..m..',
           '....mmmmmmmmm..m..',
           '...mmmmmmmmmmm.m..',
           '...mmmmmmmmmmm.m..',
           '...mmmmmmmmmmmmm..',
           '...mmmmmmmmmmm....',
           '....mmmmmmmmm.....',
           '....mmmmmmmmm.....',
           '.....mmmmmmm......',
           '......mmmmm.......',
           '.....mmmmmmm......',
           '....mmmmmmmmm.....'])
    g.rect(5, 8, 11, 8, 'd').rect(5, 10, 11, 10, 'h')
    return g


@icon
def key():
    g = G().disc(5.5, 5.5, 4.3).disc(5.5, 5.5, 1.6, '.')
    g.line(8, 8, 15, 15, 'm', 2)
    g.line(11, 13, 13, 11, 'm', 2).line(14, 16, 16, 14, 'm', 1)
    return g


def _lock(g, x0=3, x1=14):
    cx = (x0 + x1 + 1) / 2
    g.ring(cx, 8, 4.8, 2)
    for y in range(8, 18):
        for x in range(18):
            if g.get(x, y) == 'm' and y > 7:
                g.put(x, y, '.')
    g.rect(x0, 8, x1, 16)
    g.put(x0, 16, '.').put(x1, 16, '.')
    return g, cx


@icon
def lock():
    g, cx = _lock(G())
    g.disc(cx, 11.4, 1.5, '.').rect(8, 12, 9, 14, '.')
    return g


@icon
def lockkey():
    g, cx = _lock(G(), 1, 10)
    g.disc(cx, 11.4, 1.4, '.').rect(5, 12, 6, 14, '.')
    g.disc(14.5, 8.5, 2.6).disc(14.5, 8.5, 1, '.')
    g.rect(14, 11, 15, 17).rect(16, 13, 16, 13).rect(16, 16, 16, 16)
    return g


@icon
def mail():
    g = G().rect(1, 3, 16, 14)
    g.put(1, 3, '.').put(16, 3, '.').put(1, 14, '.').put(16, 14, '.')
    g.line(1, 4, 8, 10, '.').line(16, 4, 9, 10, '.')
    g.line(2, 4, 8, 9, 'd').line(15, 4, 9, 9, 'd')
    return g


@icon
def money():
    g = G().disc(9, 11.5, 6.2)
    g.rect(7, 4, 10, 5).rect(5, 1, 6, 2).rect(11, 1, 12, 2).rect(7, 2, 10, 3)
    g.rect(6, 5, 11, 5, 'd')
    s = ['.xxx', 'x...', '.xx.', '...x', 'xxx.']
    for yy, r in enumerate(s):
        for xx, ch in enumerate(r):
            if ch == 'x':
                g.put(7 + xx, 9 + yy, '.')
    g.put(8, 8, '.').put(9, 14, '.')
    return g


@icon
def party():
    g = G().poly([(1, 17), (5, 6), (12, 13)])
    g.line(3, 11, 6, 14, 'd').line(4, 8, 9, 13, 'd')
    for x, y, c in ((10, 2, 'm'), (14, 5, 'm'), (8, 5, 'h'), (15, 11, 'h'), (12, 8, 'm'), (16, 2, 'h')):
        g.rect(x, y, x + 1, y + 1, c)
    g.line(8, 7, 10, 4, 'm').line(11, 10, 15, 8, 'm')
    return g


@icon
def pawn():
    g = G().disc(9, 4.2, 2.7)
    g.rect(6, 7, 11, 7)
    g.poly([(7, 8), (11, 8), (12.5, 13), (5.5, 13)])
    g.rect(4, 13, 13, 14).rect(3, 15, 14, 16)
    return g


@icon
def pennant():
    g = G().rect(3, 1, 4, 16).rect(2, 16, 5, 16)
    g.poly([(5, 2), (16.5, 5.5), (5, 9)])
    return g


@icon
def pin():
    g = G().disc(9, 7, 5.9)
    g.poly([(3.6, 8.5), (14.4, 8.5), (9, 16.8)])
    g.disc(9, 7, 2.2, '.')
    return g


@icon
def putter():
    g = G().line(11, 1, 8, 11, 'm', 2)
    g.rect(11, 0, 12, 3, 'd')
    g.stamp(['...mm......',
             'mmmmmmmmmmm',
             'mmmmmmmmmmm',
             '.mmmmmmmmm.'], 2, 12)
    return g


@icon
def repeat():
    g = G().rect(3, 3, 12, 5).rect(2, 5, 4, 10)
    g.poly([(11.5, 0.5), (16.5, 4), (11.5, 7.5)])
    g.rect(5, 12, 14, 14).rect(13, 7, 15, 12)
    g.poly([(6.5, 9.5), (1.5, 13), (6.5, 16.5)])
    return g


@icon
def ribbon():
    g = G().poly([(4, 10), (8, 10), (7.5, 17), (5.5, 15), (3.5, 17)])
    g.poly([(10, 10), (14, 10), (14.5, 17), (12.5, 15), (10.5, 17)])
    g.disc(9, 7, 6.2)
    for i in range(0, 360, 30):
        x = 9 + 6.4 * math.cos(math.radians(i)) - .5
        y = 7 + 6.4 * math.sin(math.radians(i)) - .5
        g.put(round(x), round(y), '.')
    g.disc(9, 7, 3.2, 'h').disc(9, 7, 2, 'm')
    return g


@icon
def rock():
    g = G().poly([(1.5, 16), (1, 11), (4, 6.5), (8, 4), (12.5, 4.5), (16, 8), (17, 14), (16, 16)])
    g.line(8, 6, 7, 9, 'd').line(7, 9, 9, 12, 'd').line(12, 7, 14, 10, 'd')
    g.rect(5, 7, 6, 7, 'h')
    return g


@icon
def scales():
    return M(['........m',
              '.......mm',
              '.mmmmmmmm',
              '..m....mm',
              '.m.m...mm',
              '.m.m...mm',
              'm...m..mm',
              'm...m..mm',
              'mmmmm..mm',
              '.mmm...mm',
              '.......mm',
              '.......mm',
              '.......mm',
              '.......mm',
              '....mmmmm',
              '...mmmmmm'])


@icon
def scissors():
    g = G().ring(4.5, 4.5, 3.4, 1.5).ring(4.5, 13.5, 3.4, 1.5)
    g.line(7, 6, 16, 13, 'm', 2).line(7, 11, 16, 4, 'm', 2)
    g.put(11, 8, 'd').put(12, 9, 'd')
    return g


@icon
def scroll():
    g = G().rect(4, 3, 13, 14)
    g.rect(2, 1, 15, 3).rect(2, 14, 15, 16)
    g.put(2, 1, '.').put(15, 1, '.').put(2, 16, '.').put(15, 16, '.')
    g.rect(3, 2, 3, 2, 'd').rect(14, 15, 14, 15, 'd')
    for y in (6, 8, 10, 12):
        g.rect(6, y, 11 if y != 12 else 9, y, 'd')
    return g


@icon
def shades():
    g = M(['',
           '',
           '',
           '',
           '',
           'mmmmmmmmm',
           '.mmmmmm..',
           '.mmmmmmmm',
           '.mmmmmm..',
           '..mmmmm..',
           '...mmm...'])
    g.put(2, 7, 'h').put(3, 7, 'h').put(2, 8, 'h').put(11, 7, 'h').put(12, 7, 'h').put(11, 8, 'h')
    return g


@icon
def shield():
    g = G().poly([(2, 1.5), (16, 1.5), (16, 8), (14, 12.5), (9, 16.8), (4, 12.5), (2, 8)])
    g.line(5, 8, 7, 10, '.', 2).line(8, 10, 12, 5, '.', 2)
    return g


@icon
def shoe():
    g = G().poly([(1, 13), (1.5, 9), (5, 8.5), (7, 4.5), (11, 4.5), (11.5, 8), (16.5, 10), (17, 13)])
    g.rect(1, 13, 17, 14, 'd')
    for x in (2, 5, 8, 11, 14):
        g.put(x, 15)
    g.put(8, 6, '.').put(9, 7, '.').put(10, 8, '.')
    return g


@icon
def slot():
    g = G().rect(1, 3, 13, 16).rect(2, 1, 12, 3)
    g.put(1, 3, '.').put(13, 3, '.')
    for x in (3, 6, 9):
        g.rect(x, 6, x + 1, 11, '.')
        g.rect(x, 8, x + 1, 9, 'h')
    g.rect(3, 13, 11, 14, 'd')
    g.rect(15, 5, 15, 11).disc(15.5, 3.5, 1.4).rect(14, 11, 14, 11)
    return g


@icon
def snake():
    g = G().line(3, 15, 12, 15, 'm', 2).line(12, 15, 14, 13, 'm', 2).line(14, 13, 12, 11, 'm', 2)
    g.line(12, 11, 6, 11, 'm', 2).line(6, 11, 4, 9, 'm', 2).line(4, 9, 6, 7, 'm', 2)
    g.line(6, 7, 11, 7, 'm', 2)
    g.disc(12.5, 6, 2.6)
    g.put(12, 5, '.').line(15, 6, 17, 5, 'd').put(17, 7, 'd')
    return g


@icon
def snow():
    g = G().rect(8, 1, 9, 16)
    g.line(2, 4, 14, 12, 'm', 2).line(14, 4, 2, 12, 'm', 2)
    for (x, y) in ((6, 1), (11, 1), (6, 16), (11, 16)):
        g.put(x, y).put(x + (1 if x < 9 else -1), y + (1 if y < 9 else -1))
    g.disc(9, 9, 1.3, 'h')
    return g


@icon
def sound():
    g = G().rect(1, 6, 4, 11)
    g.poly([(4, 6), (9, 1.5), (9, 16.5), (4, 12)])
    for y in range(18):
        for x in range(11, 18):
            d = ((x + .5 - 8) ** 2 + (y + .5 - 9) ** 2) ** .5
            if 3.6 < d <= 5 or 6.6 < d <= 8:
                if abs(y + .5 - 9) < d * .78:
                    g.put(x, y)
    return g


@icon
def sparkle():
    g = G().poly([(7, 1), (8.8, 6.2), (14, 8), (8.8, 9.8), (7, 15), (5.2, 9.8), (0, 8), (5.2, 6.2)])
    g.stamp(['.m.', 'mmm', '.m.'], 13, 1)
    g.stamp(['.h.', 'hmh', '.h.'], 13, 13)
    g.put(7, 7, 'h').put(7, 8, 'h')
    return g


@icon
def sprout():
    g = G().rect(8, 8, 9, 16)
    g.poly([(8.5, 10), (2, 8.5), (0.5, 3.5), (5, 3.5), (8.5, 7)])
    g.poly([(9.5, 9), (11, 3.5), (16.5, 1.5), (17, 6), (10.5, 10)])
    g.line(3, 5, 7, 8, 'd').line(15, 3, 11, 7, 'd')
    g.rect(4, 16, 13, 16, 'd')
    return g


@icon
def sun():
    g = G().disc(9, 9, 4.4)
    g.rect(8, 0, 9, 2).rect(8, 15, 9, 17).rect(0, 8, 2, 9).rect(15, 8, 17, 9)
    for a, b in ((2, 3), (14, 3), (2, 14), (14, 14)):
        g.rect(a, b, a + 1, b).rect(a + (1 if a < 9 else 0), b + (1 if b < 9 else -1), a + (1 if a < 9 else 0), b + (1 if b < 9 else -1))
    return g


@icon
def swap():
    g = G().rect(2, 4, 12, 5).poly([(12, 1.5), (16.5, 5), (12, 8.5)])
    g.rect(5, 12, 15, 13).poly([(6, 9.5), (1.5, 13), (6, 16.5)])
    return g


@icon
def swords():
    g = G().line(1, 1, 10, 10, 'm', 2).line(9, 14, 14, 9, 'm', 2).line(13, 13, 15, 15, 'm', 2)
    rows = g.rows()
    out = G().stamp(rows)
    for y in range(18):
        for x in range(18):
            if rows[y][x] != '.':
                out.put(17 - x, y, rows[y][x])
    return out


@icon
def target():
    g = G().ring(9, 9, 8.2, 2).ring(9, 9, 4.8, 2).disc(9, 9, 1.6)
    return g


@icon
def trophy():
    g = G().poly([(3, 1.5), (15, 1.5), (14.2, 6.5), (11, 10), (7, 10), (3.8, 6.5)])
    g.rect(0, 2, 2, 2).rect(0, 3, 0, 5).put(1, 6).put(2, 7)
    g.rect(15, 2, 17, 2).rect(17, 3, 17, 5).put(16, 6).put(15, 7)
    g.rect(8, 10, 9, 12)
    g.rect(5, 13, 12, 13).rect(4, 14, 13, 16)
    g.rect(6, 15, 11, 15, 'd')
    g.rect(5, 3, 5, 6, 'h')
    return g


@icon
def user():
    return S(['',
              '.......mmmm.......',
              '......mmmmmm......',
              '.....mmmmmmmm.....',
              '.....mmmmmmmm.....',
              '.....mmmmmmmm.....',
              '......mmmmmm......',
              '.......mmmm.......',
              '',
              '.....mmmmmmmm.....',
              '...mmmmmmmmmmmm...',
              '..mmmmmmmmmmmmmm..',
              '.mmmmmmmmmmmmmmmm.',
              '.mmmmmmmmmmmmmmmm.',
              '.mmmmmmmmmmmmmmmm.'])


from more import *  # noqa: E402,F401  the icons that stand in for emoji


for k, v in list(I.items()):
    check(k, v)
    I[k] = bevel(v)
