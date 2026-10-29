"""The scene's environment light, cut down from Poly Haven's stadium_01 (CC0).

  python3 -I shut-the-door/lab/pipeline/prep_env.py ASSETS/polyhaven-stadium_01-1k/stadium_01_1k.hdr shut-the-door/lab/assets/env_256.hdr

The HDRI only lights the scene (the background is never shown), and a prefiltered environment for
rough surfaces needs very little resolution: 256 x 128 keeps the sun's direction and the sky's
colour and is 1/16 of the 1k file. Area averaged, so the sun's energy is kept, not lost between
samples. Written as plain (flat) RGBE.
"""
import sys
import numpy as np

SRC, OUT = sys.argv[1], sys.argv[2]
W2, H2 = 256, 128


def read_hdr(path):
    data = open(path, 'rb').read()
    i = data.index(b'\n\n') + 2
    j = data.index(b'\n', i)
    res = data[i:j].decode().split()          # -Y H +X W
    h, w = int(res[1]), int(res[3])
    p = j + 1
    img = np.zeros((h, w, 4), np.uint8)
    for y in range(h):
        if data[p] == 2 and data[p + 1] == 2 and (data[p + 2] << 8 | data[p + 3]) == w:
            p += 4
            for c in range(4):
                x = 0
                while x < w:
                    n = data[p]; p += 1
                    if n > 128:
                        n -= 128; img[y, x:x + n, c] = data[p]; p += 1
                    else:
                        img[y, x:x + n, c] = np.frombuffer(data[p:p + n], np.uint8); p += n
                    x += n
        else:
            img[y] = np.frombuffer(data[p:p + w * 4], np.uint8).reshape(w, 4); p += w * 4
    e = img[..., 3].astype(np.int32)
    f = np.where(e > 0, np.ldexp(1.0, e - 136), 0.0)
    return img[..., :3].astype(np.float64) * f[..., None]


def write_hdr(path, rgb):
    h, w, _ = rgb.shape
    m = rgb.max(-1)
    mant, ex = np.frexp(m)
    scale = np.where(m > 1e-32, mant * 256.0 / np.maximum(m, 1e-32), 0)
    out = np.zeros((h, w, 4), np.uint8)
    out[..., :3] = np.clip(rgb * scale[..., None], 0, 255).astype(np.uint8)
    out[..., 3] = np.where(m > 1e-32, ex + 128, 0).astype(np.uint8)
    with open(path, 'wb') as f:
        f.write(b'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n' + f'-Y {h} +X {w}\n'.encode())
        f.write(out.tobytes())


src = read_hdr(SRC)
h, w, _ = src.shape
small = src.reshape(H2, h // H2, W2, w // W2, 3).mean((1, 3))
write_hdr(OUT, small)
print('wrote', OUT, small.shape, 'energy kept', round(small.mean() / src.mean(), 4))
