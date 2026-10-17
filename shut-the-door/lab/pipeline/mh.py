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
        wmat = {b: (col[idx] * w).sum(1) for b, col in self.wmat.items()}
        if material is None:
            material = material_from_mhmat(mhmat, name)
        if delete:
            self.deleted.update(dels)
        ob = self._make_mesh(name, pos, puv, pf, material, wmat)
        return ob


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
