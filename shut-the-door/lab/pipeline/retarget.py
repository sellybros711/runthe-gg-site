"""Fit a CMU BVH clip onto the MakeHuman game_engine rig, in Blender.

Every mapped bone takes the source bone's change of world rotation from its own rest pose,
applied on top of the target bone first swung to point the way the source bone points at rest
(the CMU rest is a T pose, the MakeHuman rest an A pose). The hips take the source's root path,
scaled by the ratio of hip heights. Fingers are not in the CMU data; each clip gets a fixed hand
shape instead. With mirror=True the motion is reflected left to right (a right handed batter's
swing becomes a left handed one) and the left and right bones swap sources.
"""
import math
import bpy
from mathutils import Matrix, Quaternion, Vector

MAP = {
    'pelvis': 'hip', 'spine_01': 'abdomen', 'spine_03': 'chest', 'neck_01': 'neck', 'head': 'head',
    'clavicle_l': 'lCollar', 'upperarm_l': 'lShldr', 'lowerarm_l': 'lForeArm', 'hand_l': 'lHand',
    'clavicle_r': 'rCollar', 'upperarm_r': 'rShldr', 'lowerarm_r': 'rForeArm', 'hand_r': 'rHand',
    'thigh_l': 'lThigh', 'calf_l': 'lShin', 'foot_l': 'lFoot',
    'thigh_r': 'rThigh', 'calf_r': 'rShin', 'foot_r': 'rFoot',
}
BLEND = {'spine_02': ('abdomen', 'chest', 0.5)}
MX = Matrix(((-1, 0, 0), (0, 1, 0), (0, 0, 1)))


def swap(name):
    if name.startswith('l') and name[1:2].isupper():
        return 'r' + name[1:]
    if name.startswith('r') and name[1:2].isupper():
        return 'l' + name[1:]
    return name


def rot3(m4):
    return m4.to_3x3().normalized()


def import_bvh(path):
    before = set(bpy.data.objects)
    bpy.ops.import_anim.bvh(filepath=path, global_scale=1.0, use_fps_scale=False, update_scene_fps=False,
                            update_scene_duration=False, rotate_mode='NATIVE', axis_forward='-Z', axis_up='Y')
    ob = [o for o in bpy.data.objects if o not in before][0]
    return ob


def face_minus_y(src):
    """Turn the source so its rest pose faces -Y like the MakeHuman body (its left side toward +X)."""
    bl, br = src.data.bones['lThigh'].head_local, src.data.bones['rThigh'].head_local
    left = Vector((bl.x - br.x, bl.y - br.y, 0)).normalized()
    ang = math.atan2(left.y, left.x)
    src.rotation_euler = (0, 0, -ang)
    bpy.context.view_layer.update()


def hand_shape(arm, shape):
    """Fixed finger curls (radians about each bone's own x axis), keyed into the current action."""
    curl = {'grip': (1.15, 1.25, 0.9, 0.55), 'fist': (1.3, 1.4, 1.0, 0.6), 'relaxed': (0.25, 0.35, 0.25, 0.15),
            'open': (0.08, 0.1, 0.06, 0.05)}
    out = {}
    for side in ('l', 'r'):
        s = shape[side] if isinstance(shape, dict) else shape
        c = curl[s]
        for f in ('index', 'middle', 'ring', 'pinky'):
            for k, j in enumerate(('01', '02', '03')):
                out[f'{f}_{j}_{side}'] = Quaternion((1, 0, 0), c[k])
        out[f'thumb_02_{side}'] = Quaternion((1, 0, 0), c[3])
        out[f'thumb_03_{side}'] = Quaternion((1, 0, 0), c[3])
    return out


def apply_bvh(arm, path, clip, a, b, mirror=False, hands='relaxed', speed=1.0):
    scene = bpy.context.scene
    src = import_bvh(path)
    face_minus_y(src)
    sb = src.pose.bones
    W = src.matrix_world

    def src_rest(name):
        return rot3(W @ src.data.bones[name].matrix_local)

    def src_dir(name):
        m = W @ src.data.bones[name].matrix_local
        return (m.to_3x3() @ Vector((0, 1, 0))).normalized()

    def src_world(name):
        return W @ sb[name].matrix

    def get(name):
        """Source name to use for a target bone's source, honouring the mirror."""
        return swap(name) if mirror else name

    def mir_rot(r):
        return MX @ r @ MX if mirror else r

    def mir_vec(v):
        return MX @ v if mirror else v

    bones = arm.data.bones
    order = []
    def visit(bn):
        order.append(bn.name)
        for c in bn.children: visit(c)
    for bn in bones:
        if bn.parent is None: visit(bn)

    # alignment of each target bone to its source's rest direction
    align = {}
    for t in order:
        tdir = (bones[t].matrix_local.to_3x3() @ Vector((0, 1, 0))).normalized()
        if t in MAP:
            sdir = mir_vec(src_dir(get(MAP[t])))
        elif t in BLEND:
            s1, s2, _ = BLEND[t]
            sdir = (mir_vec(src_dir(get(s1))) + mir_vec(src_dir(get(s2)))).normalized()
        else:
            continue
        align[t] = tdir.rotation_difference(sdir).to_matrix()

    # hip height ratio, from the first frame of the file (the T pose)
    scene.frame_set(int(src.animation_data.action.frame_range[0]))
    src_hip_h = src_world('hip').translation.z
    tgt_hip_h = bones['pelvis'].head_local.z
    k = tgt_hip_h / max(1e-6, src_hip_h)

    fingers = hand_shape(arm, hands)
    act = bpy.data.actions.new(clip)
    act.use_fake_user = True
    arm.animation_data_create()
    arm.animation_data.action = act
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'

    n = int(round((b - a) / speed))
    rest_src = {s: src_rest(s) for s in sb.keys()}
    for i in range(n + 1):
        fsrc = a + i * speed
        scene.frame_set(int(fsrc), subframe=fsrc - int(fsrc))
        Mw = {}
        for t in order:
            L = bones[t].matrix_local
            p = bones[t].parent
            if p is None:
                base = L.copy()
            else:
                base = Mw[p.name] @ p.matrix_local.inverted() @ L
            q = None
            if t in MAP:
                s = get(MAP[t])
                D = mir_rot(rot3(src_world(s)) @ rest_src[s].inverted())
                q = D @ align[t] @ L.to_3x3().normalized()
            elif t in BLEND:
                s1, s2, w = BLEND[t]
                D1 = mir_rot(rot3(src_world(get(s1))) @ rest_src[get(s1)].inverted()).to_quaternion()
                D2 = mir_rot(rot3(src_world(get(s2))) @ rest_src[get(s2)].inverted()).to_quaternion()
                q = D1.slerp(D2, w).to_matrix() @ align[t] @ L.to_3x3().normalized()
            if q is not None:
                pos = base.translation.copy()
                if t == 'pelvis':
                    pos = mir_vec(src_world(get('hip')).translation * k)
                M = Matrix.Translation(pos) @ q.to_4x4()
                if p is None:
                    B = L.inverted() @ M
                else:
                    B = (p.matrix_local.inverted() @ L).inverted() @ Mw[p.name].inverted() @ M
            else:
                B = Matrix.Identity(4)
                if t in fingers:
                    B = fingers[t].to_matrix().to_4x4()
                M = base @ B
            Mw[t] = M
            pb = arm.pose.bones[t]
            loc, rq, _ = B.decompose()
            pb.rotation_quaternion = rq
            pb.keyframe_insert('rotation_quaternion', frame=i + 1, group=t)
            if t == 'pelvis':
                pb.location = loc
                pb.keyframe_insert('location', frame=i + 1, group=t)
    # make quaternion keys continuous (no flips between frames)
    for fc in act.fcurves:
        pass
    _fix_quat_flips(act)
    arm.animation_data.action = None
    track = arm.animation_data.nla_tracks.new(); track.name = clip
    track.strips.new(clip, 1, act); track.mute = True
    sact = src.animation_data.action if src.animation_data else None
    bpy.data.objects.remove(src, do_unlink=True)
    if sact: bpy.data.actions.remove(sact)
    print(f'  clip {clip}: {n + 1} frames from {path.split("/")[-1]} {a}-{b}{" mirrored" if mirror else ""}')
    return act


def _fix_quat_flips(act):
    groups = {}
    for fc in act.fcurves:
        if fc.data_path.endswith('rotation_quaternion'):
            groups.setdefault(fc.data_path, [None] * 4)[fc.array_index] = fc
    for fcs in groups.values():
        if None in fcs: continue
        n = len(fcs[0].keyframe_points)
        prev = None
        for i in range(n):
            q = [fcs[c].keyframe_points[i].co[1] for c in range(4)]
            if prev is not None and sum(x * y for x, y in zip(q, prev)) < 0:
                q = [-x for x in q]
                for c in range(4): fcs[c].keyframe_points[i].co[1] = q[c]
            prev = q
        for c in range(4): fcs[c].update()
