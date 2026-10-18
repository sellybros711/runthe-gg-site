"""MakeHuman assets into Blender, without MakeHuman or MPFB code.

Reads the CC0 MakeHuman files as plain data: the hm08 base mesh (base.obj), macro targets
(.target), the MPFB2 game_engine rig and weights (json), and proxies (.mhclo + .obj + .mhmat
for eyes, brows, lashes, hair and clothes). Nothing in the asset folder is executed.

Units: the MakeHuman files are in decimetres, y up. Blender here is metres, z up, the
character facing -Y (MPFB's convention, so the rig json's rolls apply unchanged).
"""
import os, json, math
import numpy as np
import bpy, bmesh
from mathutils import Vector, Matrix

SCALE = 0.1


def to_blender(v):
    """MakeHuman obj coordinates (dm, y up, facing +z) to Blender (m, z up, facing -y)."""
    v = np.asarray(v, dtype=np.float64)
    return np.stack([v[..., 0], -v[..., 2], v[..., 1]], axis=-1) * SCALE


# ---------------------------------------------------------------- obj

def read_obj(path):
    """Vertices, uvs, faces (lists of (v, vt) pairs) and the group of each face."""
    verts, uvs, faces, groups = [], [], [], []
    g = None
    with open(path, encoding='utf-8', errors='replace') as fh:
        for line in fh:
            if line.startswith('v '):
                verts.append([float(x) for x in line.split()[1:4]])
            elif line.startswith('vt '):
                uvs.append([float(x) for x in line.split()[1:3]])
            elif line.startswith('f '):
                f = []
                for tok in line.split()[1:]:
                    p = tok.split('/')
                    f.append((int(p[0]) - 1, int(p[1]) - 1 if len(p) > 1 and p[1] else -1))
                faces.append(f)
                groups.append(g)
            elif line.startswith('g '):
                g = line.split(None, 1)[1].strip()
    return np.array(verts), np.array(uvs) if uvs else np.zeros((0, 2)), faces, groups


# ---------------------------------------------------------------- targets

def read_target(path):
    idx, d = [], []
    with open(path, encoding='utf-8', errors='replace') as fh:
        for line in fh:
            if not line.strip() or line[0] == '#':
                continue
            p = line.split()
            idx.append(int(p[0])); d.append([float(p[1]), float(p[2]), float(p[3])])
    return np.array(idx, dtype=np.int64), np.array(d).reshape(-1, 3)


def _tri(v, lo, mid, hi):
    """MakeHuman's macro interpolation: weights of the min/avg/max targets for a 0..1 slider."""
    if v < 0.5:
        return {lo: 1 - v / 0.5, mid: v / 0.5}
    return {mid: 1 - (v - 0.5) / 0.5, hi: (v - 0.5) / 0.5}


def macro_targets(tdir, age, muscle, weight, height, proportions=1.0, race=None):
    """(path, weight) for a male character. age: 0.5 = 25 years, 1.0 = 90 years (MakeHuman's scale)."""
    ages = {'young': 1 - (age - 0.5) / 0.5, 'old': (age - 0.5) / 0.5} if age >= 0.5 else {'young': 1.0}
    mus = _tri(muscle, 'minmuscle', 'averagemuscle', 'maxmuscle')
    wts = _tri(weight, 'minweight', 'averageweight', 'maxweight')
    out = []
    for a, wa in ages.items():
        for m, wm in mus.items():
            for w, ww in wts.items():
                base = wa * wm * ww
                if base <= 1e-4:
                    continue
                out.append((f'{tdir}/macrodetails/universal-male-{a}-{m}-{w}.target', base))
                if height > 0.5:
                    out.append((f'{tdir}/macrodetails/height/male-{a}-{m}-{w}-maxheight.target', base * (height - 0.5) / 0.5))
                elif height < 0.5:
                    out.append((f'{tdir}/macrodetails/height/male-{a}-{m}-{w}-minheight.target', base * (0.5 - height) / 0.5))
                if proportions > 0:
                    out.append((f'{tdir}/macrodetails/proportions/male-{a}-{m}-{w}-idealproportions.target', base * proportions))
        for r, wr in (race or {'caucasian': 1 / 3, 'african': 1 / 3, 'asian': 1 / 3}).items():
            if wr * wa > 1e-4:
                out.append((f'{tdir}/macrodetails/{r}-male-{a}.target', wr * wa))
    return out


def apply_targets(verts, targets):
    v = verts.copy()
    for path, w in targets:
        if not os.path.exists(path):
            print('  missing target', os.path.basename(path)); continue
        idx, d = read_target(path)
        v[idx] += d * w
    return v


# ---------------------------------------------------------------- the body

class Human:
    def __init__(self, assets, targets):
        self.assets = assets
        self.base_v, self.base_uv, self.faces, self.groups = read_obj(f'{assets}/3dobjs/base.obj')
        self.v = apply_targets(self.base_v, targets)          # MakeHuman space, all 19158 incl. helpers
        self.group_verts = {}
        for f, g in zip(self.faces, self.groups):
            if g:
                self.group_verts.setdefault(g, set()).update(i for i, _ in f)
        # stand him on the ground: the rig's joint-ground cube goes to height 0
        self.v[:, 1] -= self.cube('joint-ground')[1]
        self.deleted = set()
        self.morphable = {}

    def cube(self, name):
        return self.v[sorted(self.group_verts[name])].mean(0)

    # -- rig
    def build_armature(self, rig_json, name):
        rig = json.load(open(rig_json))
        def pos(spec):
            if spec['strategy'] == 'CUBE':
                return to_blender(self.cube(spec['cube_name']))
            if spec['strategy'] == 'MEAN':
                return to_blender(self.v[spec['vertex_indices']].mean(0))
            if spec['strategy'] == 'VERTEX':
                return to_blender(self.v[spec['vertex_index']])
            raise ValueError(spec['strategy'])
        ad = bpy.data.armatures.new(name)
        ob = bpy.data.objects.new(name, ad)
        bpy.context.scene.collection.objects.link(ob)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.mode_set(mode='EDIT')
        order = []
        def visit(n):
            if n in order: return
            p = rig[n].get('parent')
            if p: visit(p)
            order.append(n)
        for n in rig: visit(n)
        for n in order:
            b = ad.edit_bones.new(n)
            b.head = Vector(pos(rig[n]['head'])); b.tail = Vector(pos(rig[n]['tail']))
            if (b.tail - b.head).length < 1e-4:
                b.tail = b.head + Vector((0, 0, 0.02))
            b.roll = rig[n].get('roll', 0.0)
            if rig[n].get('parent'):
                b.parent = ad.edit_bones[rig[n]['parent']]
                b.use_connect = bool(rig[n].get('use_connect')) and (b.parent.tail - b.head).length < 1e-4
        bpy.ops.object.mode_set(mode='OBJECT')
        self.arm = ob
        return ob

    def load_weights(self, weights_json):
        w = json.load(open(weights_json))['weights']
        self.weights = {b: (np.array([i for i, _ in l], dtype=np.int64), np.array([x for _, x in l])) for b, l in w.items() if l}
        n = len(self.v)
        self.wmat = {}
        for b, (i, x) in self.weights.items():
            col = np.zeros(n); col[i] = x; self.wmat[b] = col

    def add_twist_bones(self):
        """Twist bones in the upper arm and forearm (the game_engine rig has none). Linear blend
        skinning wrings the skin when a whole forearm's roll sits on the elbow joint; with a twist
        bone half way down each segment the roll is carried along the arm the way the radius and
        the humerus carry it. Weights are split along each segment: the elbow end keeps the
        segment's bone, the far end goes to its twist bone, blended over the middle."""
        arm = self.arm
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.mode_set(mode='EDIT')
        eb = arm.data.edit_bones
        spans = {}
        for side in ('l', 'r'):
            for seg, child in (('upperarm', 'lowerarm'), ('lowerarm', 'hand')):
                b = eb[f'{seg}_{side}']
                tw = eb.new(f'{seg}_twist_{side}')
                tw.head = b.head + (b.tail - b.head) * 0.5
                tw.tail = b.tail.copy()
                tw.roll = b.roll
                tw.parent = b
                tw.use_connect = False
                c = eb[f'{child}_{side}']
                c.parent = tw
                spans[f'{seg}_{side}'] = (np.array(b.head), np.array(b.tail))
        bpy.ops.object.mode_set(mode='OBJECT')
        vb = to_blender(self.v)
        for bone, (a, b) in spans.items():
            if bone not in self.wmat:
                continue
            axis = b - a
            t = ((vb - a) @ axis) / (axis @ axis)
            f = np.clip((t - 0.25) / 0.6, 0, 1)
            f = f * f * (3 - 2 * f)
            w = self.wmat[bone]
            side = bone[-1]; seg = bone[:-2]
            self.wmat[f'{seg}_twist_{side}'] = w * f
            self.wmat[bone] = w * (1 - f)

    def add_deltoid_bones(self, share=0.9, reach=0.4):
        """A helper bone at each shoulder joint, a sibling of the upper arm (child of the collar bone,
        same head, same rest), that the scene turns half as far as the upper arm. Linear blend
        skinning pulls the cap of the shoulder straight through the joint as the arm swings (the
        deltoid collapses with the arm down, pinches with it across the chest); skin carried by a
        bone that turns half as far stays out over the socket, as the muscle does. The upper arm's
        weight near the joint is shared with it: share at and above the joint, fading to none a
        third of the way down the arm."""
        arm = self.arm
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.mode_set(mode='EDIT')
        eb = arm.data.edit_bones
        spans = {}
        for side in ('l', 'r'):
            ua = eb[f'upperarm_{side}']
            d = eb.new(f'deltoid_{side}')
            d.head = ua.head.copy(); d.tail = ua.head + (ua.tail - ua.head) * 0.3
            d.roll = ua.roll
            d.parent = ua.parent
            d.use_connect = False
            spans[side] = (np.array(ua.head), np.array(ua.tail))
        bpy.ops.object.mode_set(mode='OBJECT')
        vb = to_blender(self.v)
        for side, (a, b) in spans.items():
            n = f'upperarm_{side}'
            if n not in self.wmat:
                continue
            axis = b - a
            t = ((vb - a) @ axis) / (axis @ axis)
            f = 1 - np.clip(t / reach, 0, 1)
            f = f * f * (3 - 2 * f) * share
            w = self.wmat[n]
            self.wmat[f'deltoid_{side}'] = w * f
            self.wmat[n] = w * (1 - f)

    def smooth_weights(self, bones, iterations=6, rate=0.5, below=None):
        """Relax the weights among a set of bones over the skin's own edges (Laplacian), only on
        vertices that use those bones (and, with below, only under that height). A sharp change of bone at a joint puts all of the joint's
        bend into one ring of edges; relaxed, it is shared by several rings."""
        if not hasattr(self, '_nbrs'):
            nb = {}
            for f, g in zip(self.faces, self.groups):
                if g != 'body': continue
                ids = [i for i, _ in f]
                for a_, b_ in zip(ids, ids[1:] + ids[:1]):
                    nb.setdefault(a_, set()).add(b_); nb.setdefault(b_, set()).add(a_)
            self._nbrs = {k: np.array(sorted(v)) for k, v in nb.items()}
        bones = [b for b in bones if b in self.wmat]
        M = np.stack([self.wmat[b] for b in bones], 1)
        total = M.sum(1)
        verts = [v for v in self._nbrs if total[v] > 1e-4]
        if below is not None:   # only under a height (MakeHuman units): keeps the face out of it
            verts = [v for v in verts if self.v[v][1] < below]
        for _ in range(iterations):
            N = M.copy()
            for v in verts:
                nb = self._nbrs[v]
                avg = M[nb].mean(0)
                s_ = avg.sum()
                if s_ > 1e-6:
                    N[v] = M[v] * (1 - rate) + (avg / s_ * total[v]) * rate
            M = N
        for j, b in enumerate(bones):
            self.wmat[b] = M[:, j]

    # -- meshes
    def body_object(self, name, material, keep_groups=('body',)):
        keep = [k for k, g in enumerate(self.groups) if g in keep_groups]
        faces = [self.faces[k] for k in keep if not any(i in self.deleted for i, _ in self.faces[k])]
        return self._make_mesh(name, self.v, self.base_uv, faces, material, self.wmat)

    def _make_mesh(self, name, v_mh, uv, faces, material, wmat):
        used = sorted({i for f in faces for i, _ in f})
        remap = {o: k for k, o in enumerate(used)}
        me = bpy.data.meshes.new(name)
        bm = bmesh.new()
        bv = [bm.verts.new(Vector(p)) for p in to_blender(v_mh[used])]
        bm.verts.ensure_lookup_table()
        uvl = bm.loops.layers.uv.new('UVMap')
        for f in faces:
            try:
                face = bm.faces.new([bv[remap[i]] for i, _ in f])
            except ValueError:
                continue
            for loop, (_, t) in zip(face.loops, f):
                if t >= 0 and len(uv):
                    loop[uvl].uv = uv[t]
        bm.to_mesh(me); bm.free()
        for p in me.polygons: p.use_smooth = True
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        me.materials.append(material)
        for b, col in wmat.items():
            vals = col[used]
            nz = np.nonzero(vals > 1e-4)[0]
            if not len(nz): continue
            vg = ob.vertex_groups.new(name=b)
            for k in nz:
                vg.add([int(k)], float(vals[k]), 'REPLACE')
        ob.parent = self.arm
        mod = ob.modifiers.new('Armature', 'ARMATURE'); mod.object = self.arm
        return ob

    def transfer_weights(self, pts):
        """Skin weights for a proxy from the body surface under it, the way Blender's Data
        Transfer does with "nearest face interpolated": each garment vertex finds the closest
        point on the skin's triangles (searched around its nearest skin vertex) and takes that
        point's barycentric blend of the three corners' weights. One surface point, one side of
        the body: the .mhclo reference triangles (and a plain nearest-k blend) reach across folds
        and between the legs, which wrung the collar and tore the crotch as the body turned."""
        from scipy.spatial import cKDTree
        if not hasattr(self, '_tri'):
            body = [f for f, g in zip(self.faces, self.groups) if g == 'body']
            tris = []
            for f in body:
                ids = [i for i, _ in f]
                tris.append(ids[:3])
                if len(ids) == 4: tris.append([ids[0], ids[2], ids[3]])
            self._tri = np.array(tris)
            self._vert_tris = {}
            for t, (a_, b_, c_) in enumerate(self._tri):
                for v in (a_, b_, c_): self._vert_tris.setdefault(int(v), []).append(t)
            bidx = np.array(sorted(self._vert_tris))
            self._bidx = bidx
            self._tree = cKDTree(self.v[bidx])
        W = np.stack([col for col in self.wmat.values()], 1)
        names = list(self.wmat.keys())
        out = np.zeros((len(pts), len(names)))
        _, nn = self._tree.query(pts, k=3)
        for i, p in enumerate(pts):
            best = None
            for cand in nn[i]:
                for t in self._vert_tris[int(self._bidx[cand])]:
                    a_, b_, c_ = self.v[self._tri[t]]
                    bary, d = _closest_on_tri(p, a_, b_, c_)
                    if best is None or d < best[0]:
                        best = (d, t, bary)
            _, t, bary = best
            out[i] = bary @ W[self._tri[t]]
        tot = out.sum(1, keepdims=True)
        out /= np.where(tot > 1e-6, tot, 1.0)
        return {n: out[:, j] for j, n in enumerate(names) if out[:, j].max() > 1e-4}

    # -- proxies (.mhclo)
    def proxy(self, mhclo_path, name, material=None, offset_scale=1.0, delete=True):
        d = os.path.dirname(mhclo_path)
        refs, scales, objf, mhmat, dels = [], {}, None, None, []
        mode = None
        for line in open(mhclo_path, encoding='utf-8', errors='replace'):
            if line.startswith('#') or not line.strip():
                continue
            p = line.split()
            if p[0] in ('x_scale', 'y_scale', 'z_scale'):
                scales[p[0][0]] = (int(p[1]), int(p[2]), float(p[3])); continue
            if p[0] == 'obj_file': objf = os.path.join(d, p[1]); continue
            if p[0] == 'material': mhmat = os.path.join(d, p[1]); continue
            if p[0] == 'verts': mode = 'verts'; continue
            if p[0] == 'delete_verts': mode = 'del'; continue
            if p[0] in ('weights', 'end', 'z_depth', 'name', 'uuid', 'tag', 'basemesh', 'max_pole', 'special_pose', 'license', 'author', 'version', 'description', 'homepage'):
                if p[0] in ('weights', 'end'): mode = None
                continue
            if mode == 'verts':
                if len(p) == 1:
                    refs.append(([int(p[0])] * 3, [1.0, 0, 0], [0.0, 0, 0]))
                elif len(p) >= 9:
                    refs.append(([int(x) for x in p[:3]], [float(x) for x in p[3:6]], [float(x) for x in p[6:9]]))
            elif mode == 'del':
                toks = line.split(); k = 0
                while k < len(toks):
                    if k + 2 < len(toks) and toks[k + 1] == '-':
                        dels.extend(range(int(toks[k]), int(toks[k + 2]) + 1)); k += 3
                    else:
                        dels.append(int(toks[k])); k += 1
        sc = []
        for ax, k in (('x', 0), ('y', 1), ('z', 2)):
            if ax in scales:
                a, b, ref = scales[ax]
                sc.append(abs(self.v[a][k] - self.v[b][k]) / ref)
            else:
                sc.append(1.0)
        sc = np.array(sc)
        pv, puv, pf, _ = read_obj(objf)
        idx = np.array([r[0] for r in refs]); w = np.array([r[1] for r in refs]); off = np.array([r[2] for r in refs])
        pos = (self.v[idx] * w[..., None]).sum(1) + off * sc * offset_scale

        def posfn(V, idx=idx, w=w, off=off, scales=dict(scales), osc=offset_scale):
            # the same fit on another body (a shape key): positions in MakeHuman space
            k_ = np.array([abs(V[a][k] - V[b][k]) / ref if ax in scales else 1.0
                           for ax, k in (('x', 0), ('y', 1), ('z', 2)) for (a, b, ref) in [scales.get(ax, (0, 0, 1))]])
            return (V[idx] * w[..., None]).sum(1) + off * k_ * osc
        wmat = self.transfer_weights(pos)
        if material is None:
            material = material_from_mhmat(mhmat, name)
        if delete and dels:
            # Hide the skin under the garment, but not near its openings: keep a band of skin about
            # 7 cm wide inside every collar, cuff and hem. Where the skin was cut right at the
            # opening, any difference in how skin and cloth bend showed the hole between them (the
            # neck seemed to come off the body in a swing).
            from scipy.spatial import cKDTree
            cnt = {}
            for f in pf:
                ids = [i for i, _ in f]
                for a_, b_ in zip(ids, ids[1:] + ids[:1]):
                    e = (min(a_, b_), max(a_, b_)); cnt[e] = cnt.get(e, 0) + 1
            rim = sorted({i for e, c in cnt.items() if c == 1 for i in e})
            if rim:
                tree = cKDTree(pos[rim])
                d, _ = tree.query(self.v[np.array(dels)], k=1)
                dels = [v for v, dd in zip(dels, d) if dd > 0.7]   # decimetres
            self.deleted.update(dels)
        ob = self._make_mesh(name, pos, puv, pf, material, wmat)
        used = sorted({i for f in pf for i, _ in f})
        self.morphable[ob.name] = lambda V, posfn=posfn, used=used: to_blender(posfn(V)[used])
        return ob

    def body_morph(self, ob, keep_groups=('body',)):
        keep = [k for k, g in enumerate(self.groups) if g in keep_groups]
        faces = [self.faces[k] for k in keep if not any(i in self.deleted for i, _ in self.faces[k])]
        used = sorted({i for f in faces for i, _ in f})
        self.morphable[ob.name] = lambda V, used=used: to_blender(V[used])

    def shape(self, targets):
        """Another body from the same base mesh (for a shape key), stood on the ground the same way."""
        v = apply_targets(self.base_v, targets)
        v[:, 1] -= v[sorted(self.group_verts['joint-ground'])].mean(0)[1]
        return v

    def add_shape_keys(self, shapes):
        """shapes: {name: V}. Every morphable object gets a key per shape."""
        for ob_name, fn in self.morphable.items():
            ob = bpy.data.objects.get(ob_name)
            if ob is None:
                continue
            ob.shape_key_add(name='Basis', from_mix=False)
            for n, V in shapes.items():
                k = ob.shape_key_add(name=n, from_mix=False)
                P = fn(V)
                if len(P) != len(k.data):
                    print('  shape key size mismatch', ob_name, len(P), len(k.data)); continue
                k.data.foreach_set('co', P.astype(np.float32).ravel())


def _closest_on_tri(p, a, b, c):
    """Barycentric coordinates of the point on triangle abc closest to p, and the distance."""
    ab, ac, ap = b - a, c - a, p - a
    d1, d2 = ab @ ap, ac @ ap
    if d1 <= 0 and d2 <= 0: return np.array([1.0, 0, 0]), np.linalg.norm(ap)
    bp = p - b; d3, d4 = ab @ bp, ac @ bp
    if d3 >= 0 and d4 <= d3: return np.array([0, 1.0, 0]), np.linalg.norm(bp)
    vc = d1 * d4 - d3 * d2
    if vc <= 0 and d1 >= 0 and d3 <= 0:
        v = d1 / (d1 - d3); return np.array([1 - v, v, 0]), np.linalg.norm(p - (a + v * ab))
    cp = p - c; d5, d6 = ab @ cp, ac @ cp
    if d6 >= 0 and d5 <= d6: return np.array([0, 0, 1.0]), np.linalg.norm(cp)
    vb = d5 * d2 - d1 * d6
    if vb <= 0 and d2 >= 0 and d6 <= 0:
        w = d2 / (d2 - d6); return np.array([1 - w, 0, w]), np.linalg.norm(p - (a + w * ac))
    va = d3 * d6 - d5 * d4
    if va <= 0 and (d4 - d3) >= 0 and (d5 - d6) >= 0:
        w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return np.array([0, 1 - w, w]), np.linalg.norm(p - (b + w * (c - b)))
    den = 1.0 / (va + vb + vc); v = vb * den; w = vc * den
    return np.array([1 - v - w, v, w]), np.linalg.norm(p - (a + ab * v + ac * w))


# ---------------------------------------------------------------- materials

def _img(path, colorspace='sRGB'):
    im = bpy.data.images.load(path, check_existing=True)
    im.colorspace_settings.name = colorspace
    return im


def principled(name, color=(0.8, 0.8, 0.8, 1), rough=0.6, base_tex=None, normal_tex=None, rough_tex=None,
               alpha_clip=False, metallic=0.0, normal_strength=1.0, uv_scale=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metallic
    uvn = None
    if uv_scale:
        tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping')
        mp.inputs['Scale'].default_value = (uv_scale, uv_scale, 1)
        nt.links.new(tc.outputs['UV'], mp.inputs['Vector']); uvn = mp.outputs['Vector']
    if base_tex:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = _img(base_tex) if isinstance(base_tex, str) else base_tex
        if uvn: nt.links.new(uvn, t.inputs['Vector'])
        if color[:3] != (0.8, 0.8, 0.8) and color[:3] != (1, 1, 1):
            mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
            mix.inputs['Factor'].default_value = 1.0
            nt.links.new(t.outputs['Color'], mix.inputs[6]); mix.inputs[7].default_value = color
            nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
        else:
            nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
        if alpha_clip:
            nt.links.new(t.outputs['Alpha'], bsdf.inputs['Alpha'])
            m.blend_method = 'CLIP'; m.alpha_threshold = 0.5
    if normal_tex:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = _img(normal_tex, 'Non-Color') if isinstance(normal_tex, str) else normal_tex
        if uvn: nt.links.new(uvn, t.inputs['Vector'])
        nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = normal_strength
        nt.links.new(t.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    if rough_tex:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = _img(rough_tex, 'Non-Color')
        if uvn: nt.links.new(uvn, t.inputs['Vector'])
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(t.outputs['Color'], sep.inputs['Color']); nt.links.new(sep.outputs[1], bsdf.inputs['Roughness'])
    return m


def material_from_mhmat(path, name):
    d = os.path.dirname(path); kv = {}
    for line in open(path, encoding='utf-8', errors='replace'):
        if line.startswith('#') or not line.strip(): continue
        p = line.split(None, 1)
        if len(p) == 2: kv[p[0]] = p[1].strip()
    diff = kv.get('diffuseTexture'); nrm = kv.get('normalmapTexture')
    transparent = kv.get('transparent', 'False').lower() == 'true'
    return principled(name, base_tex=os.path.join(d, diff) if diff else None,
                      normal_tex=os.path.join(d, nrm) if nrm and os.path.exists(os.path.join(d, nrm)) else None,
                      alpha_clip=transparent, rough=0.7)
