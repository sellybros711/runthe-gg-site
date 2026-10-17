"""Soft gear made from the body itself: a region of the skin lifted off along its normals and given
thickness, skinned with the same weights, so it bends with the body. The catcher's chest protector
and shin guards, the umpire's chest protector under his shirt, the coach's jacket.

Rigid gear (helmets, masks, the bat, the mitt) is built in the browser (gear3d.js)."""
import numpy as np
import bpy, bmesh
from mathutils import Vector

import mh


def _weights(ob):
    names = {g.index: g.name for g in ob.vertex_groups}
    out = []
    for v in ob.data.vertices:
        out.append({names[g.group]: g.weight for g in v.groups})
    return out


def shell(h, arm, body, name, pick, offset, thickness, material, smooth=2):
    """pick(co, normal, weights) -> bool per body vertex (Blender space, rest pose)."""
    me = body.data
    W = _weights(body)
    keep = set(i for i, v in enumerate(me.vertices) if pick(v.co, v.normal, W[i]))
    faces = [p for p in me.polygons if all(i in keep for i in p.vertices)]
    used = sorted({i for p in faces for i in p.vertices})
    remap = {o: k for k, o in enumerate(used)}
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    src_uv = me.uv_layers.active.data
    vs = [bm.verts.new(me.vertices[i].co + me.vertices[i].normal * offset) for i in used]
    bm.verts.ensure_lookup_table()
    for p in faces:
        try:
            f = bm.faces.new([vs[remap[i]] for i in p.vertices])
        except ValueError:
            continue
        for loop, li in zip(f.loops, p.loop_indices):
            loop[uvl].uv = src_uv[li].uv
    # drop slivers: faces left hanging by one edge make spikes at the rim
    for _ in range(2):
        loose = [f for f in bm.faces if sum(1 for e in f.edges if e.is_boundary) >= 2]
        bmesh.ops.delete(bm, geom=loose, context='FACES')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    # relax the lifted surface so it reads as a moulded plate, not skin (the rim stays put)
    inner = [v for v in bm.verts if not any(e.is_boundary for e in v.link_edges)]
    for _ in range(smooth):
        bmesh.ops.smooth_vert(bm, verts=inner, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    n0 = len(bm.verts)
    nme = bpy.data.meshes.new(name)
    bm.to_mesh(nme); bm.free()
    for p in nme.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, nme)
    bpy.context.scene.collection.objects.link(ob)
    nme.materials.append(material)
    # weights: each lifted vertex keeps its source vertex's weights (found by nearest rest position)
    import numpy as _np
    src_co = _np.array([list(me.vertices[i].co + me.vertices[i].normal * offset) for i in used])
    groups = {}
    for k in range(len(nme.vertices)):
        d = _np.linalg.norm(src_co - _np.array(list(nme.vertices[k].co)), axis=1)
        src = used[int(d.argmin())]
        for g, w in W[src].items():
            if g not in groups: groups[g] = ob.vertex_groups.new(name=g)
            groups[g].add([k], w, 'REPLACE')
    ob.parent = arm
    mod = ob.modifiers.new('Armature', 'ARMATURE'); mod.object = arm
    return ob


def chest_protector(h, arm, body, color=(0.04, 0.07, 0.15, 1)):
    mat = mh.principled('chest_protector', color=color, rough=0.5)
    def pick(co, n, w):
        torso = sum(w.get(b, 0) for b in ('spine_01', 'spine_02', 'spine_03', 'pelvis', 'clavicle_l', 'clavicle_r'))
        return torso > 0.6 and n.y < -0.15 and abs(co.x) < 0.2 and co.z > 1.0
    return shell(h, arm, body, 'chest_protector', pick, 0.035, 0.025, mat, smooth=3)


def shin_guards(h, arm, body, color=(0.04, 0.07, 0.15, 1)):
    mat = mh.principled('shin_guards', color=color, rough=0.45)
    def pick(co, n, w):
        leg = w.get('calf_l', 0) + w.get('calf_r', 0)
        return leg > 0.55 and n.y < 0.25 and 0.14 < co.z < 0.56
    return shell(h, arm, body, 'shin_guards', pick, 0.03, 0.02, mat, smooth=2)


def ump_bulk(h, arm, body, color):
    """The umpire's chest protector, seen as bulk under his shirt: the shirt's colour, lifted."""
    mat = mh.principled('ump_chest', color=color, rough=0.85)
    def pick(co, n, w):
        torso = sum(w.get(b, 0) for b in ('spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r'))
        return torso > 0.6 and n.y < -0.1 and abs(co.x) < 0.19 and co.z > 1.05
    return shell(h, arm, body, 'ump_chest', pick, 0.05, 0.02, mat, smooth=4)
