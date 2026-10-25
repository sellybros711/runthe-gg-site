"""The first person throwing arm (3d/firstperson.js): the throwing side's arm and hand from a Mixamo
pitch, baked into our own small glb (motion only, no mesh). Read in Blender as data by retarget.py's
reader (the raw FBX is never in the repo, see ../LICENSES.md).

  venv/bin/python -I shut-the-door/lab/pipeline/fparm.py "<ASSETS>/mixamo/Baseball Pitching.fbx" shut-the-door/3d/assets/fparm.glb

The capture is a right handed pitcher. Every joint is taken relative to his eyes, in a frame that
faces the plate (his stride's direction) with the world's up: what the pitcher sees of his own arm
with his eyes held on the target (his head's own motion is the scene camera's, park.js pitcherEye).
The axes are the first person camera's: x toward his arm side, y up, z back toward second base.
Lengths are scaled so the upper arm and forearm together are FP_ARM metres. The ball leaves his hand RELEASE_AHEAD in front of his head (a three quarter slot here); the clip's time 0 is RELEASE_PAD seconds
before it, and the scene's extras say where release is and the slot (Savant's arm angle: the
shoulder to the ball at release, degrees over the horizontal) the capture throws from.

Nodes (each keyed at FPS): shoulder, elbow (translation), hand (translation: the wrist; rotation:
the hand, fingers +y, the back of the hand +z, the thumb -x, as firstperson.js handModel).
"""
import json
import math
import os
import struct
import sys

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import retarget  # noqa: E402

SRC, OUT = sys.argv[1], sys.argv[2]
FPS = 60
RELEASE_PAD, AFTER = 0.5, 0.6        # seconds kept before and after release
RELEASE_AHEAD = 0.30                 # the hand in front of his head at release (m, the capture's)
FP_ARM = 0.57                        # his upper arm and forearm, metres
BALL = Vector((0, 0.105 + 0.055, -0.03))   # the ball from the wrist, in the hand's frame (handModel)

bpy.ops.wm.read_factory_settings(use_empty=True)
src = retarget.import_fbx(SRC)
sc = bpy.context.scene
act = src.animation_data.action
f0, f1 = act.frame_range
# the file's own rate (the importer keys it in the file's frames)
file_fps = 30 if f1 - f0 < 200 else 60
W = src.matrix_world
P = src.pose.bones
B = src.data.bones


def at(fr):
    sc.frame_set(int(fr), subframe=fr - int(fr))
    return {n: (W @ P[n].matrix) for n in ('Head', 'RightArm', 'RightForeArm', 'RightHand', 'RightHandMiddle1', 'RightHandIndex1', 'RightHandPinky1', 'LeftFoot', 'RightFoot')}


# the rest's forward (his left side crossed with up), carried by the head
lt = (W @ B['LeftUpLeg'].head_local.to_4d()).to_3d() - (W @ B['RightUpLeg'].head_local.to_4d()).to_3d()
fwd_rest = Vector((lt.x, lt.y, 0)).normalized().cross(Vector((0, 0, 1)))
head_rest = (W @ B['Head'].matrix_local).to_3x3()
head_fwd_local = head_rest.inverted() @ fwd_rest
head_up_local = head_rest.inverted() @ Vector((0, 0, 1))


def eye(m):
    r = m['Head'].to_3x3()
    return m['Head'].translation + 0.09 * (r @ head_up_local).normalized() + 0.09 * (r @ head_fwd_local).normalized()


# the plate's way: from his pivot foot at the set to his stride foot where it lands (the end of the
# clip's stride, taken at its hand's peak speed, well after foot strike)
step = 0.25
prev, peak = None, (0, f0)
fr = f0
while fr <= f1:
    h = at(fr)['RightHand'].translation.copy()
    if prev is not None and (h - prev).length * file_fps / step > peak[0]:
        peak = ((h - prev).length * file_fps / step, fr)
    prev = h
    fr += step
m0, mp = at(f0), at(peak[1])
d = mp['LeftFoot'].translation - m0['RightFoot'].translation
fwd = Vector((d.x, d.y, 0)).normalized()
up = Vector((0, 0, 1))
right = fwd.cross(up)
# the release: the ball leaves his hand when it is RELEASE_AHEAD metres in front of his head (the
# capture's hand speed peaks later, in the whip down after the ball has gone)
fr = f0
while fr < peak[1]:
    m = at(fr)
    if (m['RightHand'].translation - m['Head'].translation).dot(fwd) >= RELEASE_AHEAD:
        break
    fr += 1 / 16
rel_fr = fr
m1 = at(rel_fr)
best = peak


def cam(v):
    return Vector((v.dot(right), v.dot(up), -v.dot(fwd)))


ua = (m1['RightForeArm'].translation - m1['RightArm'].translation).length
fa = (m1['RightHand'].translation - m1['RightForeArm'].translation).length
k = FP_ARM / (ua + fa)

frames = []
n = int(round((RELEASE_PAD + AFTER) * FPS))
for i in range(n + 1):
    fr = rel_fr + (i / FPS - RELEASE_PAD) * file_fps
    m = at(fr)
    e = eye(m)
    S, E, Wr = (cam(m[b].translation - e) * k for b in ('RightArm', 'RightForeArm', 'RightHand'))
    y = (cam(m['RightHandMiddle1'].translation - m['RightHand'].translation)).normalized()
    th = cam(m['RightHandIndex1'].translation - m['RightHandPinky1'].translation).normalized()
    z = y.cross(th).normalized()
    x = y.cross(z).normalized()
    q = Matrix((x, y, z)).transposed().to_quaternion()
    frames.append((S, E, Wr, q))
# continuous quaternions
for i in range(1, len(frames)):
    if frames[i][3].dot(frames[i - 1][3]) < 0:
        S, E, Wr, q = frames[i]
        frames[i] = (S, E, Wr, -q)
r0 = frames[int(round(RELEASE_PAD * FPS))]
ball = r0[2] + r0[3] @ BALL
sh = r0[0]
slot = math.degrees(math.atan2(ball.y - sh.y, ball.x - sh.x))
print(f'  release at file frame {rel_fr:.2f} (peak hand speed {best[0]:.1f} m/s at {best[1]:.2f}), slot {slot:.1f} deg, scale {k:.3f}')
print(f'  at release (m, eye frame): shoulder {tuple(round(c, 3) for c in sh)} ball {tuple(round(c, 3) for c in ball)}')

# ---- the glb: three nodes and one animation, by hand (no mesh, nothing else)
times = [i / FPS for i in range(n + 1)]
blobs, views, accs = [], [], []


def add(vals, comps, typ, mm=False):
    raw = struct.pack('<%df' % len(vals), *vals)
    off = sum(len(b) for b in blobs)
    blobs.append(raw + b'\0' * (-len(raw) % 4))
    views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(raw)})
    a = {'bufferView': len(views) - 1, 'componentType': 5126, 'count': len(vals) // comps, 'type': typ}
    if mm:
        a['min'], a['max'] = [min(vals)], [max(vals)]
    accs.append(a)
    return len(accs) - 1


ti = add(times, 1, 'SCALAR', True)
ch, sa = [], []
for node, idx in (('shoulder', 0), ('elbow', 1), ('hand', 2)):
    vals = [round(c, 5) for f in frames for c in f[idx]]
    sa.append({'input': ti, 'output': add(vals, 3, 'VEC3'), 'interpolation': 'LINEAR'})
    ch.append({'sampler': len(sa) - 1, 'target': {'node': idx, 'path': 'translation'}})
qv = [round(c, 6) for f in frames for c in (f[3].x, f[3].y, f[3].z, f[3].w)]
sa.append({'input': ti, 'output': add(qv, 4, 'VEC4'), 'interpolation': 'LINEAR'})
ch.append({'sampler': len(sa) - 1, 'target': {'node': 2, 'path': 'rotation'}})
binary = b''.join(blobs)
src_name = os.path.basename(SRC).replace('_', ' ').rsplit('.', 1)[0]
doc = {
    'asset': {'version': '2.0', 'generator': 'shut-the-door lab/pipeline/fparm.py'},
    'scene': 0,
    'scenes': [{'nodes': [0, 1, 2], 'extras': {'release': RELEASE_PAD, 'slot': round(slot, 2), 'fps': FPS,
                                                'source': f'Mixamo {src_name}, file frames {rel_fr - RELEASE_PAD * file_fps:.1f}-{rel_fr + AFTER * file_fps:.1f} at {file_fps} fps'}}],
    'nodes': [{'name': 'shoulder'}, {'name': 'elbow'}, {'name': 'hand'}],
    'animations': [{'name': 'throw', 'channels': ch, 'samplers': sa}],
    'buffers': [{'byteLength': len(binary)}],
    'bufferViews': views,
    'accessors': accs,
}
js = json.dumps(doc, separators=(',', ':')).encode()
js += b' ' * (-len(js) % 4)
glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binary))
glb += struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(binary), 0x004E4942) + binary
with open(OUT, 'wb') as fh:
    fh.write(glb)
print(f'  wrote {OUT}: {len(glb)} bytes, {n + 1} frames')
