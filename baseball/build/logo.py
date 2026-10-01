"""The Run The Diamond logo, cut out of the owner's artwork.

    python3 baseball/build/logo.py

logo-source.webp is the artwork exactly as it was supplied, on its own cream
stock. The page shows it on cream AND on the dark theme's charcoal, so the stock
has to go: a flood fill from the border takes every pale, low-saturation pixel
connected to the edge, which is the stock and the soft shadow under the sign.
The fill cannot reach inside the sign or the ball, because both are closed by a
dark outline and the ball's own cream never touches the border. Nothing inside
the artwork is recoloured.

It is written at 72% of the source, which is about twice the widest the home page
ever draws it, so a phone at ratio 2 or 3 still gets real pixels.

WebP at quality 90 is 40KB where the same image as a PNG is 294KB, and the
artwork is soft painted pixels rather than a hard grid, so lossy costs nothing
visible. Every browser this site supports reads WebP.
"""
from collections import deque
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
SRC, OUT, SCALE = HERE / 'logo-source.webp', HERE.parent / 'logo.webp', 0.72

def stock(p):
    r, g, b, _ = p
    return min(r, g, b) > 140 and max(r, g, b) - min(r, g, b) < 48

im = Image.open(SRC).convert('RGBA')
W, H = im.size
px = im.load()
seen = bytearray(W * H)
q = deque([(x, y) for x in range(W) for y in (0, H - 1)] + [(x, y) for y in range(H) for x in (0, W - 1)])
while q:
    x, y = q.popleft()
    i = y * W + x
    if seen[i] or not stock(px[x, y]):
        continue
    seen[i] = 1
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nx, ny = x + dx, y + dy
        if 0 <= nx < W and 0 <= ny < H and not seen[ny * W + nx]:
            q.append((nx, ny))
for i in range(W * H):
    if seen[i]:
        px[i % W, i // W] = (0, 0, 0, 0)
im = im.crop(im.getbbox())
out = im.resize((round(im.width * SCALE), round(im.height * SCALE)), Image.LANCZOS)
out.save(OUT, quality=90, method=6)
print(f'wrote {OUT.relative_to(HERE.parent.parent)} at {out.width}x{out.height}')
