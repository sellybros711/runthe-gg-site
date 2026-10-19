"""A baseball uniform, cut from the body itself: jersey, undershirt, pants, belt with loops, high socks,
batting gloves. Each garment is a region of the MakeHuman skin lifted off along its normals by a
garment's ease (a jersey hangs about a centimetre off the chest, its sleeves flare, the pants are
roomy at the knee), relaxed so it reads as cloth, and skinned with the body's own weights, so it
moves with the body bone for bone.

Colour is not baked. Every garment shares the body's UV layout, and one mask image in that layout
says where the trim goes: R the jersey's piping (collar, V, sleeve ends, the placket's two edges,
the buttons), G spare (a pants stripe, left out: it fell on a UV seam), B the white of the stirrup sock's slot and the glove's back.
The scene colours each team at run time (home whites or road greys, the club's colours, a generic
number), so one model dresses every club. No names, no logos, no real numbers.

Builds vary as morph targets: garment positions are a function of the body's vertices, so each
body shape key (heavier, leaner) gets the same garments recomputed on that body.
"""
import math
import numpy as np
import bpy
from PIL import Image

import mh
from mh import to_blender


def _from_blender(p):
    p = np.asarray(p, dtype=np.float64)
    return np.stack([p[..., 0], p[..., 2], -p[..., 1]], axis=-1) / mh.SCALE


class Cut:
    """The body's own geometry, for cutting garments. Positions in Blender metres."""

    def __init__(self, h):
        self.h = h
        self.faces = [f for f, g in zip(h.faces, h.groups) if g == 'body']
        self.tris = []
        for f in self.faces:
            ids = [i for i, _ in f]
            self.tris.append(ids[:3])
            if len(ids) == 4:
                self.tris.append([ids[0], ids[2], ids[3]])
        self.tris = np.array(self.tris)
        self.body = np.array(sorted({i for f in self.faces for i, _ in f}))
        self.inbody = np.zeros(len(h.v), bool); self.inbody[self.body] = True
        nb = {}
        for f in self.faces:
            ids = [i for i, _ in f]
            for a, b in zip(ids, ids[1:] + ids[:1]):
                nb.setdefault(a, set()).add(b); nb.setdefault(b, set()).add(a)
        self.nbrs = nb
        self.P, self.N = self.geom(h.v)
        W = h.wmat
        z = lambda name: to_blender(h.cube(name))
        self.j = {k: z(k) for k in ('joint-neck', 'joint-pelvis', 'joint-l-upper-leg', 'joint-r-upper-leg', 'joint-l-knee', 'joint-r-knee',
                                     'joint-l-ankle', 'joint-r-ankle', 'joint-l-shoulder', 'joint-r-shoulder', 'joint-l-elbow', 'joint-r-elbow',
                                     'joint-l-hand', 'joint-r-hand', 'joint-spine-1')}
        self.zHip = (self.j['joint-l-upper-leg'][2] + self.j['joint-r-upper-leg'][2]) / 2
        self.zBelt = self.zHip + 0.105
        self.zNeck = self.j['joint-neck'][2]
        self.zKnee = (self.j['joint-l-knee'][2] + self.j['joint-r-knee'][2]) / 2
        self.zAnkle = (self.j['joint-l-ankle'][2] + self.j['joint-r-ankle'][2]) / 2
        self.zHem = self.zKnee - 0.13          # pants end a hand below the knee: the high sock look
        n = len(h.v)
        self.w = lambda *names: sum((W[b] if b in W else np.zeros(n)) for b in names)
        # how far along each arm segment (0 at the shoulder or elbow, 1 at the elbow or wrist)
        self.t = {}
        for s in ('l', 'r'):
            for seg, a, b in (('upper', f'joint-{s}-shoulder', f'joint-{s}-elbow'), ('lower', f'joint-{s}-elbow', f'joint-{s}-hand')):
                A, B = self.j[a], self.j[b]
                ax = B - A
                self.t[(seg, s)] = ((self.P - A) @ ax) / (ax @ ax)

    def geom(self, V):
        P = to_blender(V)
        N = np.zeros_like(P)
        a, b, c = P[self.tris[:, 0]], P[self.tris[:, 1]], P[self.tris[:, 2]]
        fn = np.cross(b - a, c - a)
        for k in range(3):
            np.add.at(N, self.tris[:, k], fn)
        N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)
        return P, N


class Garment:
    def __init__(self, cut, name, mask, ease, smooth=3):
        self.cut, self.name = cut, name
        self.mask = mask & cut.inbody
        self.faces = [f for f in cut.faces if all(self.mask[i] for i, _ in f)]
        used = sorted({i for f in self.faces for i, _ in f})
        self.used = np.array(used)
        cnt = {}
        for f in self.faces:
            ids = [i for i, _ in f]
            for a, b in zip(ids, ids[1:] + ids[:1]):
                e = (min(a, b), max(a, b)); cnt[e] = cnt.get(e, 0) + 1
        self.rim = np.array(sorted({i for e, c in cnt.items() if c == 1 for i in e}), dtype=np.int64)
        self.ease = ease
        self.smooth = smooth
        nb = {}
        for f in self.faces:
            ids = [i for i, _ in f]
            for a, b in zip(ids, ids[1:] + ids[:1]):
                nb.setdefault(a, set()).add(b); nb.setdefault(b, set()).add(a)
        rimset = set(self.rim.tolist())
        rn = {}
        for (a, b), k in cnt.items():
            if k == 1:
                rn.setdefault(a, []).append(b); rn.setdefault(b, []).append(a)
        self.rim_nb = {i: v for i, v in rn.items() if len(v) == 2}
        self.inner = [i for i in used if i not in rimset]
        self.inner_nb = [np.array(sorted(nb[i])) for i in self.inner]

    def positions(self, V):
        """Blender positions for every body vertex index (only the garment's are meaningful)."""
        if getattr(self, 'follow', None):
            # a patch on another garment: that garment's surface, a little proud of it
            base, extra = self.follow
            G = base.positions(V)
            _, N = self.cut.geom(V)
            return G + N * extra
        P, N = self.cut.geom(V)
        G = P + N * self.ease[:, None]
        # every opening relaxed along itself: a rim cut along the mesh's faces is a staircase
        if self.rim_nb:
            ids = np.array(list(self.rim_nb.keys())); nb = np.array(list(self.rim_nb.values()))
            for _ in range(8):
                G[ids] = G[ids] * 0.5 + (G[nb[:, 0]] + G[nb[:, 1]]) * 0.25
        if getattr(self, 'snap', None):
            self.snap(G)
        inner = np.array(self.inner, dtype=np.int64)
        for _ in range(self.smooth):
            avg = np.stack([G[nb].mean(0) for nb in self.inner_nb]) if len(inner) else np.zeros((0, 3))
            G[inner] = G[inner] * 0.5 + avg * 0.5
        return G

    def build(self, material):
        h = self.cut.h
        G = self.positions(h.v)
        ob = h._make_mesh(self.name, _from_blender(G), h.base_uv, self.faces, material, h.wmat)
        if getattr(self, 'planar', None):
            # seen from behind: u to the wearer's right (-x), v up, one unit = span metres, centred
            zc, span = self.planar
            me = ob.data
            uvl = me.uv_layers.active.data
            for loop in me.loops:
                co = me.vertices[loop.vertex_index].co
                uvl[loop.index].uv = (0.5 - co.x / span, 0.5 + (co.z - zc) / span)
        ob.parent = h.arm
        mod = ob.modifiers.new('Armature', 'ARMATURE'); mod.object = h.arm
        self.ob = ob
        return ob


class Belt:
    """The belt: a band around the body at the belt line, cut from the body's own cross section there
    (the body's vertex rows are farther apart than a belt is wide), outside the pants, with six belt
    loops standing on it. Each band vertex is skinned like the body point under it."""
    name = 'belt'

    def __init__(self, c, zb, pants, width=0.036, ease=0.027, segs=48):
        self.cut, self.zb, self.pants, self.width, self.ease, self.segs = c, zb, pants, width, ease, segs
        self.rim = np.zeros(0, dtype=np.int64)

    def _ring(self, V):
        """The body's surface around the waist at zb (the pants' own rim is too ragged to slice), the
        belt standing ease off it: (point, body triangle, bary) per angle, for two heights."""
        c = self.cut
        G, _ = c.geom(V)
        _, N = c.geom(V)
        ctr = (c.j['joint-l-upper-leg'] + c.j['joint-r-upper-leg']) / 2
        tri = c.tris
        used = np.zeros(len(V), bool); used[self.pants.used] = True
        out = []
        for zz in (self.zb - self.width / 2, self.zb + self.width / 2):
            ring = []
            for k in range(self.segs):
                ang = 2 * math.pi * k / self.segs
                d = np.array([math.cos(ang), math.sin(ang), 0.0])
                # ray from the waist's centre outward at height zz: the farthest pants triangle it meets
                best = None
                for t in self._cand:
                    a, b, cc = G[tri[t, 0]], G[tri[t, 1]], G[tri[t, 2]]
                    o = np.array([ctr[0], ctr[1], zz])
                    e1, e2 = b - a, cc - a
                    pv = np.cross(d, e2); det = e1 @ pv
                    if abs(det) < 1e-12: continue
                    tv = o - a; u = (tv @ pv) / det
                    if u < 0 or u > 1: continue
                    qv = np.cross(tv, e1); v = (d @ qv) / det
                    if v < 0 or u + v > 1: continue
                    dist = (e2 @ qv) / det
                    if dist > 0 and (best is None or dist > best[0]):
                        best = (dist, t, np.array([1 - u - v, u, v]))
                if best is None:
                    ring.append(None); continue
                dist, t, bary = best
                p = np.array([ctr[0], ctr[1], zz]) + d * (dist + self.ease)
                ring.append((p, t, bary))
            out.append(ring)
        return out

    def positions(self, V):
        rings = self._ring(V)
        return [[r[0] if r else None for r in ring] for ring in rings]

    def build(self, material):
        c = self.cut; h = c.h
        tri = c.tris
        # candidate triangles: the trunk's, near the belt line (the hands hang at that height too)
        zs = c.P[tri].mean(1)[:, 2]
        arms = c.w(*[f'{b}_{s}' for s in ('l', 'r') for b in ('upperarm', 'upperarm_twist', 'lowerarm', 'lowerarm_twist', 'hand')])
        trunk = (arms[tri] < 0.05).all(1)
        self._cand = [int(t) for t in np.where((np.abs(zs - self.zb) < 0.06) & trunk)[0]]
        rings = self._ring(h.v)
        import bmesh
        me = bpy.data.meshes.new('belt'); bm = bmesh.new()
        ok = [k for k in range(self.segs) if rings[0][k] and rings[1][k]]
        vs = {}
        for r in (0, 1):
            for k in ok:
                vs[(r, k)] = bm.verts.new(rings[r][k][0])
        bm.verts.ensure_lookup_table()
        for i, k in enumerate(ok):
            k2 = ok[(i + 1) % len(ok)]
            if (k2 - k) % self.segs != 1: continue
            bm.faces.new([vs[(0, k)], vs[(0, k2)], vs[(1, k2)], vs[(1, k)]])
        # loops: six small tabs standing off the band
        loops = []
        for ang in (0.35, 1.15, 1.95, 4.33, 5.13, 5.93):
            k = int(round(ang / (2 * math.pi) * self.segs)) % self.segs
            if k not in ok: continue
            p0, p1 = rings[0][k][0], rings[1][k][0]
            ctr = (c.j['joint-l-upper-leg'] + c.j['joint-r-upper-leg']) / 2
            outw = p0 - np.array([ctr[0], ctr[1], p0[2]]); outw /= np.linalg.norm(outw)
            side = np.cross([0, 0, 1.0], outw) * 0.007
            q = [p0 - [0, 0, 0.006] + side, p0 - [0, 0, 0.006] - side, p1 + [0, 0, 0.006] - side, p1 + [0, 0, 0.006] + side]
            q = [np.array(x) + outw * 0.004 for x in q]
            loops.append((k, [bm.verts.new(x) for x in q]))
        for _, qv in loops:
            bm.faces.new(qv)
        bm.to_mesh(me); bm.free()
        for p in me.polygons: p.use_smooth = True
        ob = bpy.data.objects.new('belt', me); bpy.context.scene.collection.objects.link(ob)
        me.materials.append(material)
        # weights: each vertex from the body point under it (the triangle the ray met)
        W = {b: col for b, col in h.wmat.items()}
        order = [('band', r, k) for r in (0, 1) for k in ok] + [('loop', lk, j) for lk, qv in loops for j in range(4)]
        groups = {}
        for vi, key in enumerate(order):
            if key[0] == 'band':
                _, t, bary = rings[key[1]][key[2]]
            else:
                _, t, bary = rings[0][key[1]]
            ids = tri[t]
            for b, col in W.items():
                wv = float(bary @ col[ids])
                if wv > 1e-3:
                    if b not in groups: groups[b] = ob.vertex_groups.new(name=b)
                    groups[b].add([vi], wv, 'REPLACE')
        ob.parent = h.arm
        mod = ob.modifiers.new('Armature', 'ARMATURE'); mod.object = h.arm
        self.ob, self.order, self.ok, self.loops = ob, order, ok, loops
        return ob

    def morph_positions(self, V):
        rings = self._ring(V)
        base = self._ring(self.cut.h.v)
        out = []
        for vi, key in enumerate(self.order):
            # a ray that finds no surface on the other body keeps its point where it was
            if key[0] == 'band':
                r = rings[key[1]][key[2]]
                out.append(r[0] if r else np.array(self.ob.data.vertices[vi].co))
            else:
                k = key[1]
                r = rings[0][k]
                d = (r[0] - base[0][k][0]) if r else np.zeros(3)
                out.append(np.array(self.ob.data.vertices[vi].co) + d)
        return np.array(out)


def garments(h, who):
    """The garments for a batter or a catcher (the catcher wears no batting gloves)."""
    c = Cut(h)
    P, N, w, t = c.P, c.N, c.w, c.t
    n = len(P)
    z = P[:, 2]
    torso = w('spine_01', 'spine_02', 'spine_03', 'pelvis', 'clavicle_l', 'clavicle_r', 'deltoid_l', 'deltoid_r')
    neck = w('neck_01', 'head')
    out = {}

    # the jersey: the trunk and the upper arms to just above the elbow, tucked in below the belt line,
    # open at the neck in a shallow V
    sleeve = np.zeros(n, bool); sleeveT = np.zeros(n)
    for s in ('l', 'r'):
        arm = w(f'upperarm_{s}', f'upperarm_twist_{s}', f'deltoid_{s}')
        on = (arm > 0.3) & (t[('upper', s)] < 0.62)
        sleeve |= on
        sleeveT = np.where(on, np.clip(t[('upper', s)], 0, 1), sleeveT)
    vtop = c.zNeck - 0.035
    vcut = (N[:, 1] < -0.2) & (z > vtop - 0.085) & (np.abs(P[:, 0]) < (z - (vtop - 0.085)) * 0.75 + 0.012)
    jersey = ((torso > 0.45) | sleeve) & (z > c.zBelt - 0.06) & (neck < 0.3) & ~vcut & (w('head') < 0.05)
    jersey &= ~((w('thigh_l', 'thigh_r') > 0.3))
    # tucked: the tail hugs the body inside the pants (well under the pants' 2 cm)
    tuck = np.clip((c.zBelt + 0.03 - z) / 0.06, 0, 1)
    ease = (0.011 + 0.004 * (N[:, 1] > 0.3)) * (1 - tuck) + 0.005 * tuck + 0.012 * np.clip((sleeveT - 0.15) / 0.4, 0, 1) * sleeve
    jg = Garment(c, 'jersey', jersey, ease, smooth=3)
    # the V's edge runs along the mesh's faces: put its rim vertices on the V itself, so the opening
    # and its piping are straight lines, not a staircase
    vrim = np.array([i for i in jg.rim if N[i, 1] < -0.2 and z[i] > vtop - 0.095 and z[i] < vtop + 0.02], dtype=np.int64)

    def snap(G, vrim=vrim, vtop=vtop):
        if not len(vrim): return
        half = (G[vrim, 2] - (vtop - 0.085)) * 0.75 + 0.012
        G[vrim, 0] = np.sign(G[vrim, 0] + 1e-9) * np.maximum(half, 0.004)
    # (snapping only the rim to the V left the next ring of faces folded into a saw tooth; the rim
    # relaxed along itself, as every opening is, makes the cleaner V)
    out['jersey'] = jg

    # the number: a patch of the jersey's back, a millimetre proud of it, with its own flat UVs (the
    # body's UV layout splits the back down the spine). The scene draws the number into it
    zc = c.zNeck - 0.25
    patch = jersey & (N[:, 1] > 0.2) & (np.abs(P[:, 0]) < 0.17) & (np.abs(z - zc) < 0.16)
    g = Garment(c, 'number', patch, ease, smooth=0)
    g.follow = (out['jersey'], 0.003)
    g.planar = (zc, 0.3)
    out['number'] = g

    # the undershirt: long sleeves to the wrist, and a band at the neck that shows in the V
    under = np.zeros(n, bool)
    for s in ('l', 'r'):
        arm = w(f'upperarm_{s}', f'upperarm_twist_{s}', f'lowerarm_{s}', f'lowerarm_twist_{s}', f'deltoid_{s}')
        under |= (arm > 0.3) & (t[('lower', s)] < 0.93)
    under |= (torso > 0.3) & (z > c.zNeck - 0.16) & (neck < 0.55) & (w('head') < 0.05)
    out['undershirt'] = Garment(c, 'undershirt', under, np.full(n, 0.0035), smooth=1)

    # the pants: belt line to a hand below the knee, roomy through the thigh and knee
    legs = w('pelvis', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'spine_01')
    pants = (legs > 0.4) & (z < c.zBelt + 0.02) & (z > c.zHem)
    pease = 0.018 + 0.008 * np.clip((c.zHip - 0.05 - z) / 0.2, 0, 1)
    out['pants'] = Garment(c, 'pants', pants, pease, smooth=3)

    out['belt'] = Belt(c, c.zBelt - 0.004, out['pants'])

    # the socks: from inside the pants' hem down into the cleats
    calf = w('calf_l', 'calf_r', 'foot_l', 'foot_r')
    socks = (calf > 0.4) & (z < c.zHem + 0.06) & (z > c.zAnkle - 0.05)
    out['socks'] = Garment(c, 'socks', socks, np.full(n, 0.004), smooth=1)

    if who == 'batter':
        hand = np.zeros(n, bool)
        for s in ('l', 'r'):
            hw = sum(v for k, v in h.wmat.items() if k.endswith(f'_{s}') and (k.startswith('hand') or any(k.startswith(f) for f in ('index', 'middle', 'ring', 'pinky', 'thumb'))))
            hand |= (hw + w(f'lowerarm_twist_{s}') * (t[('lower', s)] > 0.9)) > 0.5
        out['gloves'] = Garment(c, 'gloves', hand, np.full(n, 0.0028), smooth=0)
    c.out = out
    return c, out


def hide_skin(h, c, out, margin=0.03):
    """Skin under a garment is deleted (it would poke through as the body bends), except a band
    along every opening, so no gap shows between cloth and skin."""
    from scipy.spatial import cKDTree
    for name, g in out.items():
        if not len(g.rim) or name == 'belt':
            continue
        if name == 'number':
            continue
        m = margin if name not in ('socks', 'gloves', 'undershirt') else 0.012
        cand = g.used
        tree = cKDTree(c.P[g.rim])
        d, _ = tree.query(c.P[cand], k=1)
        h.deleted.update(int(i) for i, dd in zip(cand, d) if dd > m)


def paint_mask(c, out, path, size=1024):
    """The trim mask, texel by texel: each garment triangle's texels are placed on the body and
    tested against the garment's trim lines in 3D, so lines are as crisp as the texture allows
    (painting whole faces made the piping a staircase of 2 cm blocks)."""
    h = c.h
    img = np.zeros((size, size, 3), np.float32)
    uv = np.asarray(h.base_uv)
    jr = out['jersey']
    # the rim as a dense polyline (every 3 mm along each open edge): distance to the vertices alone
    # left the piping dotted
    cnt = {}
    for f in jr.faces:
        ids = [i for i, _ in f]
        for a_, b_ in zip(ids, ids[1:] + ids[:1]):
            e = (min(a_, b_), max(a_, b_)); cnt[e] = cnt.get(e, 0) + 1
    # where each garment really is, brought back onto the skin (the V's rim was moved onto the V)
    surf = {name: (g.positions(h.v) - c.N * g.ease[:, None]) if isinstance(g, Garment) and not getattr(g, 'follow', None) else c.P
            for name, g in out.items()}
    S = surf['jersey']
    seg = []
    for (a_, b_), k in cnt.items():
        if k != 1: continue
        A, B = S[a_], S[b_]
        m = max(2, int(np.linalg.norm(B - A) / 0.003))
        seg.append(A + (B - A) * np.linspace(0, 1, m)[:, None])
    rimP = np.concatenate(seg)
    rimP = rimP[rimP[:, 2] > c.zBelt + 0.03]           # not the tucked-in tail
    from scipy.spatial import cKDTree
    rimTree = cKDTree(rimP)
    vtop = c.zNeck - 0.035
    vbottom = vtop - 0.085

    # each leg's centre line (2 cm steps up the leg), for the pants' stripe
    pv = c.P[out['pants'].used]
    legz = np.arange(c.zHem, c.zBelt, 0.02)
    def centres(sel):
        q = pv[sel]
        return np.array([q[np.abs(q[:, 2] - zz) < 0.012][:, :2].mean(0) if (np.abs(q[:, 2] - zz) < 0.012).any() else [np.nan, np.nan] for zz in legz])
    legl, legr = centres(pv[:, 0] > 0.02), centres(pv[:, 0] < -0.02)
    for L in (legl, legr):
        for k in range(2):
            col = L[:, k]; ok = ~np.isnan(col)
            L[:, k] = np.interp(legz, legz[ok], col[ok])

    def fields(name, X, Nn):
        r = np.zeros(len(X)); g = np.zeros(len(X)); b = np.zeros(len(X))
        if name == 'jersey':
            d, _ = rimTree.query(X, k=1)
            r = np.maximum(r, (d < 0.009).astype(float))
            front = Nn[:, 1] < -0.4
            px = np.abs(X[:, 0])
            plk = front & (X[:, 2] < vbottom + 0.004) & (X[:, 2] > c.zBelt - 0.09) & (np.abs(px - 0.024) < 0.0055)
            r = np.maximum(r, plk.astype(float))
            # buttons down the middle
            for k in range(6):
                bz = vbottom - 0.012 - k * 0.085
                if bz < c.zBelt - 0.05: break
                r = np.maximum(r, (front & (np.hypot(X[:, 0], X[:, 2] - bz) < 0.0065)).astype(float))
        elif name == 'pants':
            # the outer seam: a band 1.6 cm wide around each leg's own centre at that height, on the
            # side away from the other leg (a band by normals came out ragged)
            sgn = np.sign(X[:, 0])
            cx = np.where(sgn > 0, np.interp(X[:, 2], legz, legl[:, 0]), np.interp(X[:, 2], legz, legr[:, 0]))
            cy = np.where(sgn > 0, np.interp(X[:, 2], legz, legl[:, 1]), np.interp(X[:, 2], legz, legr[:, 1]))
            dx, dy = X[:, 0] - cx, X[:, 1] - cy
            rr = np.hypot(dx, dy) + 1e-9
            ang = np.arctan2(dy, dx * sgn)               # 0 at the outer side
            # left out: the leg's UV seam runs right down the outer side, and a stripe on it came out
            # as a zig-zag. Many big league pants have no stripe; these have none (G stays empty)
            g = np.zeros(len(X)) * ang * rr
        elif name == 'socks':
            slot = (np.abs(Nn[:, 0]) > 0.72) & (X[:, 2] > c.zAnkle + 0.035) & (X[:, 2] < c.zHem - 0.01) & (np.abs(X[:, 0]) > 0.05)
            b = slot.astype(float)
        elif name == 'gloves':
            b = ((np.sign(X[:, 0]) * Nn[:, 0]) > 0.35).astype(float)
        return np.stack([r, g, b], 1)

    for name, gm in out.items():
        if name in ('belt', 'undershirt', 'number'):
            continue
        for f in gm.faces:
            ids = [i for i, _ in f]; tt = [t for _, t in f]
            for tri in ((0, 1, 2), (0, 2, 3)) if len(ids) == 4 else ((0, 1, 2),):
                vi = [ids[k] for k in tri]; ti = [tt[k] for k in tri]
                if min(ti) < 0: continue
                U = uv[ti] * [size, size]; U[:, 1] = size - U[:, 1]
                x0, y0 = np.floor(U.min(0)).astype(int); x1, y1 = np.ceil(U.max(0)).astype(int)
                x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, size - 1), min(y1, size - 1)
                if x1 < x0 or y1 < y0: continue
                xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
                pts = np.stack([xs.ravel(), ys.ravel()], 1)
                a, b, cc = U
                m = np.array([[b[0] - a[0], cc[0] - a[0]], [b[1] - a[1], cc[1] - a[1]]])
                if abs(np.linalg.det(m)) < 1e-9: continue
                l12 = np.linalg.solve(m, (pts - a).T).T
                bary = np.column_stack([1 - l12.sum(1), l12])
                inside = (bary >= -0.02).all(1)
                if not inside.any(): continue
                bary = bary[inside]; p = pts[inside].astype(int)
                X = bary @ surf[name][vi]
                Nn = bary @ c.N[vi]; Nn /= np.maximum(np.linalg.norm(Nn, axis=1, keepdims=True), 1e-9)
                img[p[:, 1], p[:, 0]] = np.maximum(img[p[:, 1], p[:, 0]], fields(name, X, Nn))
    Image.fromarray((img * 255).astype(np.uint8), 'RGB').save(path)
    return path


def paint_region(c, pred, path, size=256):
    """A grey mask in the body's UV layout: 1 where pred(points, normals) holds on the skin (the face's
    beard area, say). Texel by texel, like the trim mask."""
    h = c.h
    img = np.zeros((size, size), np.float32)
    uv = np.asarray(h.base_uv)
    for f in c.faces:
        ids = [i for i, _ in f]; tt = [t for _, t in f]
        for tri in ((0, 1, 2), (0, 2, 3)) if len(ids) == 4 else ((0, 1, 2),):
            vi = [ids[k] for k in tri]; ti = [tt[k] for k in tri]
            if min(ti) < 0: continue
            U = uv[ti] * [size, size]; U[:, 1] = size - U[:, 1]
            x0, y0 = np.floor(U.min(0)).astype(int); x1, y1 = np.ceil(U.max(0)).astype(int)
            x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, size - 1), min(y1, size - 1)
            if x1 < x0 or y1 < y0: continue
            xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
            pts = np.stack([xs.ravel(), ys.ravel()], 1)
            a, b, cc = U
            m = np.array([[b[0] - a[0], cc[0] - a[0]], [b[1] - a[1], cc[1] - a[1]]])
            if abs(np.linalg.det(m)) < 1e-9: continue
            l12 = np.linalg.solve(m, (pts - a).T).T
            bary = np.column_stack([1 - l12.sum(1), l12])
            inside = (bary >= -0.02).all(1)
            if not inside.any(): continue
            bary = bary[inside]; p = pts[inside].astype(int)
            X = bary @ c.P[vi]
            Nn = bary @ c.N[vi]; Nn /= np.maximum(np.linalg.norm(Nn, axis=1, keepdims=True), 1e-9)
            img[p[:, 1], p[:, 0]] = np.maximum(img[p[:, 1], p[:, 0]], pred(X, Nn).astype(np.float32))
    from PIL import ImageFilter
    im = Image.fromarray((img * 255).astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(size / 256 * 1.5))
    im.save(path)
    return path


def beard_mask(c, path):
    """Where facial hair grows: the jaw, chin, upper lip and lower cheeks (from the head's own joints:
    below the eyes' line, in front of the ears, above the neck's crease)."""
    head = c.j.get('joint-head') if 'joint-head' in c.j else None
    h = c.h
    jh = to_blender(h.cube('joint-head')); jn = c.j['joint-neck']
    W = c.w('head')
    def pred(X, Nn):
        # facing forward or to the side (not the back of the head), between the neck and the cheekbones
        zlo, zhi = jn[2] + 0.035, jh[2] + 0.035
        front = Nn[:, 1] < 0.15
        y_ok = X[:, 1] < jh[1] + 0.035              # in front of the ears
        return front & y_ok & (np.abs(X[:, 0]) < 0.085) & (X[:, 2] > zlo) & (X[:, 2] < zhi)
    return paint_region(c, pred, path)
