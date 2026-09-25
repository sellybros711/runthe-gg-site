"""A tiny pixel canvas for authoring 18x18 icons, plus the auto-bevel pass.

Characters: '.' empty, 'm' body, 'd' shade, 'h' highlight, 'k' outline (coloured set only),
and the fixed palette letters w b r y g the coloured renderer knows."""
import math

N = 18


class G:
    def __init__(self):
        self.a = [['.'] * N for _ in range(N)]

    def put(self, x, y, c='m'):
        if 0 <= x < N and 0 <= y < N:
            self.a[y][x] = c
        return self

    def get(self, x, y):
        return self.a[y][x] if 0 <= x < N and 0 <= y < N else '.'

    def rect(self, x0, y0, x1, y1, c='m'):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.put(x, y, c)
        return self

    def frame(self, x0, y0, x1, y1, c='m', w=1):
        for i in range(w):
            self.rect(x0 + i, y0 + i, x1 - i, y0 + i, c)
            self.rect(x0 + i, y1 - i, x1 - i, y1 - i, c)
            self.rect(x0 + i, y0 + i, x0 + i, y1 - i, c)
            self.rect(x1 - i, y0 + i, x1 - i, y1 - i, c)
        return self

    def disc(self, cx, cy, r, c='m'):
        for y in range(N):
            for x in range(N):
                if (x + .5 - cx) ** 2 + (y + .5 - cy) ** 2 <= r * r:
                    self.put(x, y, c)
        return self

    def ring(self, cx, cy, r, w=2, c='m'):
        for y in range(N):
            for x in range(N):
                d = math.hypot(x + .5 - cx, y + .5 - cy)
                if r - w < d <= r:
                    self.put(x, y, c)
        return self

    def line(self, x0, y0, x1, y1, c='m', t=1):
        n = max(abs(x1 - x0), abs(y1 - y0)) * 4 + 1
        for i in range(n + 1):
            x = x0 + (x1 - x0) * i / n
            y = y0 + (y1 - y0) * i / n
            for dx in range(t):
                for dy in range(t):
                    self.put(round(x) + dx, round(y) + dy, c)
        return self

    def poly(self, pts, c='m'):
        for y in range(N):
            for x in range(N):
                px, py = x + .5, y + .5
                inside = False
                j = len(pts) - 1
                for i in range(len(pts)):
                    xi, yi = pts[i]
                    xj, yj = pts[j]
                    if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
                        inside = not inside
                    j = i
                if inside:
                    self.put(x, y, c)
        return self

    def stamp(self, rows, ox=0, oy=0, keep_dot=True):
        for y, r in enumerate(rows):
            for x, ch in enumerate(r):
                if ch == ' ' or (keep_dot and ch == '.'):
                    continue
                self.put(ox + x, oy + y, ch)
        return self

    def mirror(self):
        """Copy the left half onto the right, for symmetric art."""
        for y in range(N):
            for x in range(N // 2):
                self.a[y][N - 1 - x] = self.a[y][x]
        return self

    def rows(self):
        return [''.join(r) for r in self.a]


def filled(ch):
    return ch != '.'


def bevel(rows, deep=3, only='m'):
    """Top of a thick run lights, bottom of a thick run shades. Thin strokes stay solid,
    which is what keeps a line icon a line icon rather than a gradient."""
    a = [list(r) for r in rows]
    out = [r[:] for r in a]
    for x in range(N):
        y = 0
        while y < N:
            if filled(a[y][x]):
                y0 = y
                while y < N and filled(a[y][x]):
                    y += 1
                y1 = y - 1
                if y1 - y0 + 1 >= deep:
                    if a[y0][x] == only:
                        out[y0][x] = 'h'
                    if a[y1][x] == only:
                        out[y1][x] = 'd'
            else:
                y += 1
    return [''.join(r) for r in out]


def outline(rows, c='k'):
    """A 1px outline round every filled cell (4 neighbours), for the coloured set."""
    a = [list(r) for r in rows]
    out = [r[:] for r in a]
    for y in range(N):
        for x in range(N):
            if a[y][x] == '.':
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < N and 0 <= yy < N and a[yy][xx] not in '.k':
                        out[y][x] = c
                        break
    return [''.join(r) for r in out]


def check(name, rows):
    assert len(rows) == N, (name, len(rows))
    for r in rows:
        assert len(r) == N, (name, r)
