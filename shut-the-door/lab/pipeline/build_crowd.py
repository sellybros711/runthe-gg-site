"""The crowd behind home plate: 40 seated MakeHuman people rendered (Cycles) into one sprite atlas.

  venv/bin/python -I shut-the-door/lab/pipeline/build_crowd.py ASSETS shut-the-door/lab/assets/crowd.webp

Each fan is a MakeHuman body with random proportions, one of the CC0 skins, a casual outfit in a
random colour and sometimes a cap, sat down by aiming the bones (no capture needed for a seat).
They are lit by the same HDRI and a low sun from the same side as the scene, rendered from the
front and slightly below (the pitcher's eye is lower than the stands), and blurred a little: the eye
is focused on the batter, 60 ft nearer.
"""
import os, sys, math, random
import numpy as np
import bpy
from mathutils import Vector, Matrix, Quaternion

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mh            # noqa: E402
import textures      # noqa: E402

ASSETS, OUT = sys.argv[1], sys.argv[2]
N = int(sys.argv[3]) if len(sys.argv) > 3 else 40
COLS, ROWS = 8, 5
CW, CH = 128, 192
MHA = f'{ASSETS}/makehuman'
PH = f'{ASSETS}/polyhaven-textures/files'
HDR = f'{ASSETS}/polyhaven-stadium_01/stadium_01_2k.hdr'
WORK = os.environ.get('CROWD_WORK', '/tmp/claude-0/std-3d-tools/crowd-work')
os.makedirs(WORK, exist_ok=True)

SKINS = ['young_caucasian_male', 'young_caucasian_male2', 'middleage_caucasian_male', 'young_african_male', 'middleage_african_male']
OUTFITS = ['male_casualsuit01', 'male_casualsuit02', 'male_casualsuit03', 'male_casualsuit04', 'male_casualsuit05', 'male_casualsuit06']
# shirt colours a ballpark crowd wears (in linear RGB): lots of home blue and white, some black and grey
SHIRTS = [(0.02, 0.12, 0.45), (0.02, 0.12, 0.45), (0.05, 0.2, 0.6), (0.8, 0.8, 0.8), (0.75, 0.75, 0.78), (0.02, 0.02, 0.025),
          (0.03, 0.04, 0.08), (0.3, 0.3, 0.32), (0.45, 0.04, 0.03), (0.6, 0.45, 0.25), (0.1, 0.25, 0.12), (0.02, 0.12, 0.45)]
PANTS = [(0.05, 0.08, 0.15), (0.1, 0.1, 0.11), (0.25, 0.22, 0.18), (0.04, 0.05, 0.1)]


def aim(arm, dirs):
    """Pose bones so each named bone points along the given world direction (minimal swing)."""
    bones = arm.data.bones
    order = []
    def visit(b):
        order.append(b.name)
        for c in b.children: visit(c)
    for b in bones:
        if b.parent is None: visit(b)
    Mw = {}
    for n in order:
        b = bones[n]; L = b.matrix_local
        base = L.copy() if b.parent is None else Mw[b.parent.name] @ b.parent.matrix_local.inverted() @ L
        if n in dirs:
            cur = (base.to_3x3() @ Vector((0, 1, 0))).normalized()
            q = cur.rotation_difference(Vector(dirs[n]).normalized())
            M = Matrix.Translation(base.translation) @ (q.to_matrix() @ base.to_3x3()).to_4x4()
        else:
            M = base
        Mw[n] = M
        B = (L.inverted() @ M) if b.parent is None else ((b.parent.matrix_local.inverted() @ L).inverted() @ Mw[b.parent.name].inverted() @ M)
        pb = arm.pose.bones[n]; pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = B.to_quaternion()
        if n == 'pelvis':
            pb.location = B.to_translation()


def sit(arm, rnd):
    lean = rnd.uniform(-0.15, 0.35)            # forward lean: some fans lean in
    spread = rnd.uniform(0.08, 0.3)
    arms = rnd.choice(['lap', 'lap', 'knees', 'crossed'])
    d = {
        'thigh_l': (spread, -1, -0.12), 'thigh_r': (-spread, -1, -0.12),
        'calf_l': (0.05, -0.25, -1), 'calf_r': (-0.05, -0.25, -1),
        'spine_01': (0, -lean * 0.5, 1), 'spine_02': (0, -lean * 0.6, 1), 'spine_03': (0, -lean * 0.7, 1),
        'neck_01': (0, -0.15, 1), 'head': (rnd.uniform(-0.15, 0.15), -0.1, 1),
    }
    if arms == 'lap':
        d.update({'upperarm_l': (0.15, -0.35, -1), 'upperarm_r': (-0.15, -0.35, -1), 'lowerarm_l': (-0.35, -1, -0.15), 'lowerarm_r': (0.35, -1, -0.15)})
    elif arms == 'knees':
        d.update({'upperarm_l': (0.1, -0.8, -1), 'upperarm_r': (-0.1, -0.8, -1), 'lowerarm_l': (0.05, -0.6, -1), 'lowerarm_r': (-0.05, -0.6, -1)})
    else:
        d.update({'upperarm_l': (0.2, -0.3, -1), 'upperarm_r': (-0.2, -0.3, -1), 'lowerarm_l': (-1, -0.5, 0.2), 'lowerarm_r': (1, -0.5, 0.3)})
    aim(arm, d)
    # drop him onto the seat: the pelvis goes to seat height (0.45 m), the feet find the floor
    bpy.context.view_layer.update()


def cap_mesh(color, head_top, head_c):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.112, segments=24, ring_count=12, location=(head_c.x, head_c.y + 0.005, head_top - 0.095))
    c = bpy.context.active_object
    c.scale = (1.0, 1.08, 0.82)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.object.mode_set(mode='OBJECT')
    for v in c.data.vertices:
        if v.co.z < -0.01: v.co.z = -0.01
    bpy.ops.mesh.primitive_cylinder_add(radius=0.09, depth=0.006, location=(head_c.x, head_c.y - 0.11, head_top - 0.1))
    b = bpy.context.active_object; b.scale = (0.9, 0.85, 1); b.rotation_euler = (0.2, 0, 0)
    m = mh.principled('cap', color=color + (1,), rough=0.8)
    for o in (c, b): o.data.materials.append(m)
    return [c, b]


def build_fan(i, rnd):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    shape = dict(age=rnd.uniform(0.38, 0.85), muscle=rnd.uniform(0.3, 0.7), weight=rnd.uniform(0.35, 0.9), height=rnd.uniform(0.3, 0.7),
                 race={'caucasian': rnd.random(), 'african': rnd.random() * 0.6, 'asian': rnd.random() * 0.6})
    tot = sum(shape['race'].values()); shape['race'] = {k: v / tot for k, v in shape['race'].items()}
    h = mh.Human(MHA, mh.macro_targets(f'{MHA}/targets', **shape))
    arm = h.build_armature(f'{MHA}/rigs/standard/rig.game_engine.json', 'fan')
    h.load_weights(f'{MHA}/rigs/standard/weights.game_engine.json')
    outfit = rnd.choice(OUTFITS)
    shirt = rnd.choice(SHIRTS); pants = rnd.choice(PANTS)
    d = f'{MHA}/clothes/{outfit}'
    tex = textures.cloth(d, outfit, shirt, PH, 'cotton_jersey', WORK, color2=pants, size=512, tile=4)
    mat = mh.principled(outfit, base_tex=tex['color'], normal_tex=tex['normal'], rough=0.85)
    h.proxy(f'{d}/{outfit}.mhclo', outfit, mat)
    skin = rnd.choice(SKINS)
    st = textures.skin(f'{MHA}/skins/{skin}', WORK, 512)
    h.proxy(f'{MHA}/eyes/low-poly/low-poly.mhclo', 'eyes', mh.principled('eyes', base_tex=f'{MHA}/eyes/materials/brown_eye.png', rough=0.1), delete=False)
    h.proxy(f'{MHA}/eyebrows/eyebrow001/eyebrow001.mhclo', 'brows', delete=False)
    if rnd.random() < 0.8:
        hair = rnd.choice(['short02', 'short04'])
        h.proxy(f'{MHA}/hair/{hair}/{hair}.mhclo', 'hair', delete=False)
    body = h.body_object('body', mh.principled('skin', base_tex=st['color'], rough=0.5))
    sit(arm, rnd)
    bpy.context.view_layer.update()
    # where his head is now
    hb = arm.pose.bones['head']
    head = arm.matrix_world @ hb.head
    top = (arm.matrix_world @ hb.tail).z
    if rnd.random() < 0.38:
        cap_mesh(rnd.choice([(0.02, 0.1, 0.4), (0.02, 0.02, 0.02), (0.8, 0.8, 0.8), (0.03, 0.05, 0.12)]), top, head)
    pel = arm.matrix_world @ arm.pose.bones['pelvis'].head
    return h, arm, pel, head


def setup_render():
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 48
    sc.cycles.use_denoising = True
    try:
        sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    except Exception:
        pass
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y = CW * 2, CH * 2
    sc.view_settings.view_transform = 'AgX' if 'AgX' in [x.identifier for x in sc.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Filmic'
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    env = w.node_tree.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(HDR)
    w.node_tree.links.new(env.outputs['Color'], w.node_tree.nodes['Background'].inputs['Color'])
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.8
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.0; sun.color = (1.0, 0.88, 0.75); sun.angle = 0.05
    so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so)
    # the scene's sun comes from the third base side and a little behind the plate; the fans face the
    # field, so it reaches them from their left, a little from behind
    so.rotation_euler = (math.radians(70), 0, math.radians(-115))
    cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'; cam.ortho_scale = 0.93 * 1.0
    co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
    return co


def main():
    rnd = random.Random(20251101)
    atlas = np.zeros((ROWS * CH, COLS * CW, 4), np.float32)
    from PIL import Image, ImageFilter
    for i in range(min(N, COLS * ROWS)):
        h, arm, pel, head = build_fan(i, rnd)
        co = setup_render()
        # frame: 0.62 m wide, 0.93 m tall, bottom at the seat (pelvis height minus a little)
        seat = pel.z - 0.08
        cx = pel.x
        co.data.ortho_scale = 0.93
        el = math.radians(-6)
        target = Vector((cx, pel.y, seat + 0.465))
        co.location = target + Vector((0, -6 * math.cos(el), -6 * math.sin(el)))
        co.rotation_euler = (math.radians(90) + el, 0, 0)
        bpy.context.scene.render.filepath = f'{WORK}/fan_{i:02d}.png'
        bpy.ops.render.render(write_still=True)
        im = Image.open(f'{WORK}/fan_{i:02d}.png').convert('RGBA')
        # the render is 0.93 m wide too (square ortho on a 2:3 frame shows the long side): crop the middle
        im = im.resize((CW, CH), Image.LANCZOS).filter(ImageFilter.GaussianBlur(1.4))
        a = np.asarray(im).astype(np.float32) / 255
        r, c = divmod(i, COLS)
        atlas[r * CH:(r + 1) * CH, c * CW:(c + 1) * CW] = a
        print('fan', i, flush=True)
    img = Image.fromarray((atlas * 255).astype(np.uint8), 'RGBA')
    img.save(OUT, 'WEBP', quality=82, method=6)
    print('wrote', OUT, os.path.getsize(OUT))


main()
