"""Fit a motion clip onto the MakeHuman game_engine rig, in Blender: a CMU BVH clip, or a Mixamo
FBX clip (the Mixamo skeleton, mixamorig:* bones; the raw files are never in the repo, only the
clips baked onto our rig inside our glb files ship, see ../LICENSES.md).

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

# A source skeleton: which of its bones drive ours, its limb segments for the rest alignment, its
# hip, its thighs (to face it -Y), and how its left and right names swap.
CMU = dict(map=MAP, blend=BLEND, hip='hip', thighs=('lThigh', 'rThigh'), seg={
    'clavicle_{s}': ('upperarm_{s}', '{S}Collar', '{S}Shldr'),
    'upperarm_{s}': ('lowerarm_{s}', '{S}Shldr', '{S}ForeArm'),
    'lowerarm_{s}': ('hand_{s}', '{S}ForeArm', '{S}Hand'),
    'thigh_{s}': ('calf_{s}', '{S}Thigh', '{S}Shin'),
    'calf_{s}': ('foot_{s}', '{S}Shin', '{S}Foot'),
}, side=('l', 'r'), hip_height='first')
_MXP = 'mixamorig:'
MIXAMO = dict(map={
    'pelvis': 'Hips', 'spine_01': 'Spine', 'spine_02': 'Spine1', 'spine_03': 'Spine2', 'neck_01': 'Neck', 'head': 'Head',
    'clavicle_l': 'LeftShoulder', 'upperarm_l': 'LeftArm', 'lowerarm_l': 'LeftForeArm', 'hand_l': 'LeftHand',
    'clavicle_r': 'RightShoulder', 'upperarm_r': 'RightArm', 'lowerarm_r': 'RightForeArm', 'hand_r': 'RightHand',
    'thigh_l': 'LeftUpLeg', 'calf_l': 'LeftLeg', 'foot_l': 'LeftFoot', 'ball_l': 'LeftToeBase',
    'thigh_r': 'RightUpLeg', 'calf_r': 'RightLeg', 'foot_r': 'RightFoot', 'ball_r': 'RightToeBase',
}, blend={}, hip='Hips', thighs=('LeftUpLeg', 'RightUpLeg'), seg={
    'clavicle_{s}': ('upperarm_{s}', '{S}Shoulder', '{S}Arm'),
    'upperarm_{s}': ('lowerarm_{s}', '{S}Arm', '{S}ForeArm'),
    'lowerarm_{s}': ('hand_{s}', '{S}ForeArm', '{S}Hand'),
    'thigh_{s}': ('calf_{s}', '{S}UpLeg', '{S}Leg'),
    'calf_{s}': ('foot_{s}', '{S}Leg', '{S}Foot'),
}, side=('Left', 'Right'), hip_height='rest')


def swap(name):
    if name.startswith('Left'):
        return 'Right' + name[4:]
    if name.startswith('Right'):
        return 'Left' + name[5:]
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


def face_minus_y(src, thighs=('lThigh', 'rThigh')):
    """Turn the source so its rest pose faces -Y like the MakeHuman body (its left side toward +X)."""
    bl, br = src.data.bones[thighs[0]].head_local, src.data.bones[thighs[1]].head_local
    left = Vector((bl.x - br.x, bl.y - br.y, 0)).normalized()
    ang = math.atan2(left.y, left.x)
    src.rotation_euler = (src.rotation_euler[0], src.rotation_euler[1], -ang)
    bpy.context.view_layer.update()


def hand_shape(arm, shape):
    """Fixed finger curls, keyed into the current action. Each finger bends about the knuckle line
    (index knuckle to little finger knuckle, measured on this rig) expressed in that bone's own
    frame. A bone's own x axis is only near that line for the index finger; bending the ring and
    little fingers about it twisted them sideways into their neighbours and tore the webbing."""
    curl = {'grip': (0.85, 0.95, 0.65, 0.4), 'fist': (0.85, 0.9, 0.55, 0.4), 'relaxed': (0.22, 0.3, 0.22, 0.12),
            'open': (0.08, 0.1, 0.06, 0.05)}
    B = arm.data.bones
    out = {}
    for side, sign in (('l', 1), ('r', -1)):
        s = shape[side] if isinstance(shape, dict) else shape
        c = curl[s]
        knuckles = (B[f'pinky_01_{side}'].head_local - B[f'index_01_{side}'].head_local).normalized() * sign
        for f in ('index', 'middle', 'ring', 'pinky'):
            for k, j in enumerate(('01', '02', '03')):
                n = f'{f}_{j}_{side}'
                ax = (B[n].matrix_local.to_3x3().inverted() @ knuckles).normalized()
                out[n] = Quaternion(ax, c[k])
        for j in ('02', '03'):
            out[f'thumb_{j}_{side}'] = Quaternion((1, 0, 0), c[3])
    return out


def import_fbx(path):
    """A Mixamo FBX, read as data by Blender's importer. Its names lose the mixamorig: prefix here."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path, use_anim=True, automatic_bone_orientation=False, ignore_leaf_bones=True)
    new = [o for o in bpy.data.objects if o not in before]
    ob = [o for o in new if o.type == 'ARMATURE'][0]
    for o in new:
        if o is not ob:
            bpy.data.objects.remove(o, do_unlink=True)
    for bn in ob.data.bones:
        if bn.name.startswith(_MXP):
            bn.name = bn.name[len(_MXP):]
    return ob


def apply_bvh(arm, path, clip, a, b, mirror=False, hands='relaxed', speed=1.0):
    return apply_src(arm, import_bvh(path), CMU, path, clip, a, b, mirror, hands, speed)


def apply_fbx(arm, path, clip, a, b, mirror=False, hands='relaxed', speed=2.0, fingers=False):
    """A Mixamo clip (keyed at 60 fps): frames a..b, every second frame by default (our clips run
    at 30 fps)."""
    return apply_src(arm, import_fbx(path), MIXAMO, path, clip, a, b, mirror, hands, speed)


def apply_src(arm, src, spec, path, clip, a, b, mirror=False, hands='relaxed', speed=1.0):
    scene = bpy.context.scene
    MAPS, BLENDS = spec['map'], spec['blend']
    face_minus_y(src, spec['thighs'])
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

    # Rest alignment. Both rests stand upright facing -Y; they differ in the limbs (CMU's T pose,
    # MakeHuman's A pose). So the trunk, neck, head and feet take no alignment at all: a zero
    # source rotation is the target's own rest. Limb bones are swung, from the target's segment
    # (joint to next joint) onto the source's segment, measured between joint positions (never
    # between Blender's bone tails, which for the BVH root point at the average of its children and
    # once turned the pelvis 110 degrees off its rest, tearing the skin at the waist and neck).
    SEG = spec['seg']  # target bone: (target next joint, source joint, source next joint)
    def sjoint(name):
        return mir_vec((W @ src.data.bones[name].head_local.to_4d()).to_3d())
    align = {t: Matrix.Identity(3) for t in order}
    for side, S in (('l', spec['side'][0]), ('r', spec['side'][1])):
        for tk, (tn, ja, jb) in SEG.items():
            t = tk.format(s=side)
            sa_, sb_ = get(ja.format(S=S)), get(jb.format(S=S))
            tdir = (bones[tn.format(s=side)].head_local - bones[t].head_local).normalized()
            sdir = (sjoint(sb_) - sjoint(sa_)).normalized()
            align[t] = tdir.rotation_difference(sdir).to_matrix()
        align[f'hand_{side}'] = align[f'lowerarm_{side}']

    # hip height ratio: from the first frame of the file (a CMU file starts in its T pose) or from
    # the skeleton's rest (a Mixamo clip starts in the motion)
    if spec['hip_height'] == 'rest':
        src_hip_h = (W @ src.data.bones[spec['hip']].head_local.to_4d()).z
    else:
        scene.frame_set(int(src.animation_data.action.frame_range[0]))
        src_hip_h = src_world(spec['hip']).translation.z
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
        local = {}
        for t in order:
            L = bones[t].matrix_local
            p = bones[t].parent
            if p is None:
                base = L.copy()
            else:
                base = Mw[p.name] @ p.matrix_local.inverted() @ L
            q = None
            if t in MAPS:
                s = get(MAPS[t])
                D = mir_rot(rot3(src_world(s)) @ rest_src[s].inverted())
                q = D @ align[t] @ L.to_3x3().normalized()
            elif t in BLENDS:
                s1, s2, w = BLENDS[t]
                D1 = mir_rot(rot3(src_world(get(s1))) @ rest_src[get(s1)].inverted()).to_quaternion()
                D2 = mir_rot(rot3(src_world(get(s2))) @ rest_src[get(s2)].inverted()).to_quaternion()
                q = D1.slerp(D2, w).to_matrix() @ align[t] @ L.to_3x3().normalized()
            if q is not None:
                pos = base.translation.copy()
                if t == 'pelvis':
                    pos = mir_vec(src_world(get(spec['hip'])).translation * k)
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
            loc, rq, _ = B.decompose()
            local[t] = rq
            if t == 'pelvis':
                pelvis_loc = loc
        limit_and_spread(local, bones)
        for t in order:
            pb = arm.pose.bones[t]
            pb.rotation_quaternion = local[t]
            pb.keyframe_insert('rotation_quaternion', frame=i + 1, group=t)
            if t == 'pelvis':
                pb.location = pelvis_loc
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


Y = Vector((0, 1, 0))
DEG = math.pi / 180
# anatomical limits per joint (degrees): twist about the bone's own axis, swing off it
LIMITS = {'spine_01': (15, 30), 'spine_02': (15, 30), 'spine_03': (15, 30), 'neck_01': (32, 38), 'head': (28, 20)}


def swing_twist(q):
    """q = swing @ twist, twist about the bone's own (local y) axis. Returns (swing, twist angle)."""
    tw = Quaternion((q.w, 0.0, q.y, 0.0))
    if tw.magnitude < 1e-8:
        return q.copy(), 0.0
    tw.normalize()
    ang = 2 * math.atan2(tw.y, tw.w)
    if ang > math.pi: ang -= 2 * math.pi
    if ang < -math.pi: ang += 2 * math.pi
    return q @ tw.inverted(), ang


def clamp_swing(sw, lim):
    ang = 2 * math.acos(max(-1.0, min(1.0, abs(sw.w))))
    if ang <= lim or ang < 1e-6:
        return sw
    return Quaternion((1, 0, 0, 0)).slerp(sw if sw.w >= 0 else -sw, lim / ang)


def limit_and_spread(local, bones):
    """Spread twist the way a body does and keep every joint inside its range.

    A capture puts a swing's whole trunk rotation on one or two joints (CMU's abdomen; its neck).
    Linear blend skinning wrings the skin between two bones turned far apart, so the twist is
    shared: across the three spine segments evenly, between neck (40%) and head (60%), and the
    forearm's twist half into the wrist. Each joint is then clamped to its limit."""
    parts = {}
    for n in LIMITS:
        if n in local:
            parts[n] = swing_twist(local[n])
    spine = [n for n in ('spine_01', 'spine_02', 'spine_03') if n in parts]
    total = sum(parts[n][1] for n in spine)
    for n in spine:
        tw_lim, sw_lim = LIMITS[n]
        each = max(-tw_lim * DEG, min(tw_lim * DEG, total / len(spine)))
        local[n] = clamp_swing(parts[n][0], sw_lim * DEG) @ Quaternion(Y, each)
    if 'neck_01' in parts and 'head' in parts:
        # nodding and tilting are shared too: the head's swing beyond its range goes to the neck
        hsw = parts['head'][0]
        hang = 2 * math.acos(max(-1.0, min(1.0, abs(hsw.w))))
        if hang > LIMITS['head'][1] * DEG:
            keep = clamp_swing(hsw, LIMITS['head'][1] * DEG)
            rest_ = keep.inverted() @ hsw
            parts['neck_01'] = (parts['neck_01'][0] @ rest_, parts['neck_01'][1])
            parts['head'] = (keep, parts['head'][1])
        total = parts['neck_01'][1] + parts['head'][1]
        total = max(-70 * DEG, min(70 * DEG, total))
        for n, share in (('neck_01', 0.5), ('head', 0.5)):
            tw_lim, sw_lim = LIMITS[n]
            local[n] = clamp_swing(parts[n][0], sw_lim * DEG) @ Quaternion(Y, max(-tw_lim * DEG, min(tw_lim * DEG, total * share)))
    # the arms' roll goes to their twist bones: the elbow is a hinge, the forearm rolls; the
    # shoulder keeps a little of the upper arm's roll, the twist bone the rest
    for side in ('l', 'r'):
        for seg, keep in (('upperarm', 0.4), ('lowerarm', 0.0)):
            n, tn = f'{seg}_{side}', f'{seg}_twist_{side}'
            if n not in local or tn not in local:
                continue
            sw, tw = swing_twist(local[n])
            local[n] = sw @ Quaternion(Y, tw * keep)
            local[tn] = Quaternion(Y, tw * (1 - keep)) @ local[tn]


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
