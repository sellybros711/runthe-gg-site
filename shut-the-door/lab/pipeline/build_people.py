"""Build the lab's people as glTF: MakeHuman body, clothes, gear, and CMU motion fitted on.

  uv venv --python /usr/bin/python3.11 venv && uv pip install bpy==4.2.0 numpy
  venv/bin/python -I shut-the-door/lab/pipeline/build_people.py ASSETS OUT [who ...]

ASSETS holds the downloads (see LICENSES.md for every source):
  ASSETS/makehuman/...         the CC0 MakeHuman files (3dobjs, targets, rigs, skins, clothes, ...)
  ASSETS/cmu-bvh/...           the CMU BVH clips (the Poser friendly 2012 release, 30 fps)
  ASSETS/polyhaven-textures/files/...   the CC0 Poly Haven cloth and leather maps
OUT gets one raw .glb per person. pack.sh then compresses them (gltfpack, meshopt) into lab/assets.
who: batter catcher umpire (all three when left out).
"""
import os, sys, math, json
import numpy as np
import bpy
from mathutils import Vector, Matrix, Quaternion, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mh            # noqa: E402
import gear          # noqa: E402
import retarget      # noqa: E402
import textures      # noqa: E402
import uniform       # noqa: E402

ASSETS, OUT = sys.argv[1], sys.argv[2]
WHO = sys.argv[3:] or ['batter', 'catcher', 'umpire']
MHA = f'{ASSETS}/makehuman'
BVH = f'{ASSETS}/cmu-bvh'
PH = f'{ASSETS}/polyhaven-textures/files'
WORK = os.path.join(OUT, 'work')
os.makedirs(WORK, exist_ok=True)

# Team colours. The batter is a generic road team: grey with navy trim, no names or logos.
NAVY = (0.035, 0.06, 0.14, 1)
ROAD_GREY = (0.52, 0.53, 0.55, 1)
UMP_NAVY = (0.03, 0.035, 0.06, 1)
UMP_SLACKS = (0.22, 0.23, 0.25, 1)


def _lin(hexs):
    c = [int(hexs[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple((x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c) + (1,)


# soft gear and trim baked into a model (none of the three uses either now: the uniform is coloured
# per club at run time) take a neutral navy
TEAM = NAVY


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 30


def skin_material(name, skin, size):
    tex = textures.skin(f'{MHA}/skins/{skin}', WORK, size)
    m = mh.principled(name, base_tex=tex['color'], rough=0.52, normal_tex=tex.get('normal'), normal_strength=0.6)
    return m


def cloth_material(name, color, mhclo_dir, base, pattern='jogging_melange', uv_scale=6.0, rough=0.85, color2=None):
    """The proxy's own normal map (its folds) with a flat team colour, its fabric weave from Poly Haven
    tinted. Trims are painted later, once the mesh exists (paint_trim)."""
    tex = textures.cloth(mhclo_dir, base, color, PH, pattern, WORK, color2=color2)
    m = mh.principled(name, base_tex=tex['color'], normal_tex=tex['normal'], rough=rough, normal_strength=1.0)
    m['color_png'] = tex['color']
    return m


def tuck_shirt(ob, waist=None):
    """This outfit's shirt hangs to the hip and flares out when the body bends; a jersey is tucked
    in. Drop the shirt faces below the belt (the shirt is the part of the UV map above v 0.55)."""
    import bmesh as _bm
    me = ob.data
    zs = [v.co.z for v in me.vertices]
    waist = waist or (min(zs) + (max(zs) - min(zs)) * 0.64)
    bm = _bm.new(); bm.from_mesh(me)
    uvl = bm.loops.layers.uv.active
    shirt = [f for f in bm.faces if all(l[uvl].uv[1] > 0.55 for l in f.loops)]
    kill = [f for f in shirt if all(l.vert.co.z < waist for l in f.loops)]
    print(f'  tuck: {len(kill)} of {len(shirt)} shirt faces below {waist:.2f} m (shirt from {min(l.vert.co.z for f in shirt for l in f.loops):.2f})')
    _bm.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(me); bm.free()


def paint_trim(ob, trim, placket=False, width=0.022):
    """Navy piping where a road jersey has it: the collar and the sleeve ends (the mesh's open edges
    above the waist), and down the front placket."""
    import bmesh as _bm
    me = ob.data
    bm = _bm.new(); bm.from_mesh(me)
    bnd = [v for v in bm.verts if any(e.is_boundary for e in v.link_edges) and v.co.z > 1.15]
    pts = np.array([list(v.co) for v in bnd]) if bnd else np.zeros((0, 3))
    bm.free()
    def pred(c, p):
        if len(pts) and np.min(np.linalg.norm(pts - np.array(c), axis=1)) < width:
            return True
        return placket and abs(c.x) < 0.007 and p.normal.y < -0.5 and 0.98 < c.z < 1.5
    png = me.materials[0]['color_png']
    textures.paint_faces(png, ob, pred, trim)
    for im in bpy.data.images:
        if im.filepath and os.path.abspath(bpy.path.abspath(im.filepath)) == os.path.abspath(png):
            im.reload()


def _white_png():
    from PIL import Image as _I
    p = os.path.join(WORK, 'white_1px.png')
    _I.new('RGB', (1, 1), (255, 255, 255)).save(p)
    return p


def body(cfg):
    h = mh.Human(MHA, mh.macro_targets(f'{MHA}/targets', **cfg['shape']))
    arm = h.build_armature(f'{MHA}/rigs/standard/rig.game_engine.json', cfg['name'])
    h.load_weights(f'{MHA}/rigs/standard/weights.game_engine.json')
    h.add_twist_bones()
    h.add_deltoid_bones()
    # wide, smooth joints where the swing bends hardest: the neck, the elbows
    # the neck band only: up to the skull's base (the jaw line), never into the face
    h.smooth_weights(['spine_03', 'neck_01', 'head'], iterations=8, below=h.cube('joint-head')[1] + 0.1)
    for side in ('l', 'r'):
        h.smooth_weights([f'upperarm_twist_{side}', f'lowerarm_{side}'], iterations=6)
        # the shoulder: collar bone, helper and arm blended over several rings (no seam at the socket)
        h.smooth_weights([f'clavicle_{side}', f'deltoid_{side}', f'upperarm_{side}'], iterations=4)
        h.smooth_weights([f'lowerarm_twist_{side}', f'hand_{side}'], iterations=4)
    parts = []
    if cfg.get('uniform'):
        # the uniform, cut from the body (uniform.py); colours come at run time from the trim mask
        c_, out = uniform.garments(h, cfg['name'])
        mask = uniform.paint_mask(c_, out, os.path.join(WORK, f'uniform_mask_{cfg["name"]}.png'))
        mats = {
            'jersey': mh.principled('uniform', base_tex=mask, rough=0.8),
            'pants': None, 'undershirt': mh.principled('undershirt', color=(0.05, 0.07, 0.15, 1), rough=0.75),
            'belt': mh.principled('belt', color=(0.02, 0.02, 0.02, 1), rough=0.45),
            'socks': mh.principled('socks', base_tex=mask, rough=0.85),
            'gloves': mh.principled('gloves', base_tex=mask, rough=0.6),
            # a texture (one white pixel) keeps the patch's UVs through gltfpack, which drops the
            # UVs of an untextured material; the scene draws the number there
            'number': mh.principled('number', base_tex=_white_png(), rough=0.6),
        }
        mats['pants'] = mats['jersey']
        for name, g in out.items():
            ob = g.build(mats[name])
            if name == 'belt':
                h.morphable[ob.name] = (lambda V, g=g: g.morph_positions(V))
            else:
                h.morphable[ob.name] = (lambda V, g=g: g.positions(V)[g.used])
            parts.append(ob)
        uniform.hide_skin(h, c_, out)
        if cfg['name'] == 'batter':
            # facial hair and the darker skin, for the scene to vary every hitter's look
            from PIL import Image as _I
            bm = uniform.beard_mask(c_, os.path.join(WORK, 'beard_mask.png'))
            _I.open(bm).save(os.path.join(HERE, '..', 'assets', 'tex', 'beard_mask.webp'), 'WEBP', quality=80, method=6)
            dark = textures.skin(f'{MHA}/skins/young_african_male', WORK, 512)['color']
            _I.open(dark).convert('RGB').save(os.path.join(HERE, '..', 'assets', 'tex', 'skin_dark.webp'), 'WEBP', quality=72, method=6)
    for c in cfg.get('clothes', []):
        d = f'{MHA}/clothes/{c["id"]}'
        mat = None if c.get('own') else cloth_material(c['id'], c['color'], d, c['id'], c.get('pattern', 'jogging_melange'), color2=c.get('color2'))
        ob = h.proxy(f'{d}/{c["id"]}.mhclo', c['id'], mat, offset_scale=c.get('offset', 1.0))
        if c['id'] == 'male_casualsuit06':
            tuck_shirt(ob)
        if c.get('trim'):
            paint_trim(ob, TEAM if c['trim'] == 'TEAM' else c['trim'], placket=c.get('placket', False))
        parts.append(ob)
    eyes = mh.principled('eyes', base_tex=f'{MHA}/eyes/materials/brown_eye.png', rough=0.05)
    parts.append(h.proxy(f'{MHA}/eyes/high-poly/high-poly.mhclo', 'eyes', eyes, delete=False))
    for p in cfg.get('hairs', ['eyebrows/eyebrow001/eyebrow001', 'eyelashes/eyelashes02/eyelashes02']):
        parts.append(h.proxy(f'{MHA}/{p}.mhclo', os.path.basename(p), delete=False))
    if cfg.get('hair'):
        parts.append(h.proxy(f'{MHA}/{cfg["hair"]}.mhclo', 'hair', delete=False))
    skin = skin_material('skin', cfg['skin'], cfg.get('skin_size', 1024))
    bo = h.body_object('body', skin)
    h.body_morph(bo)
    parts.insert(0, bo)
    if cfg.get('morphs'):
        # builds: each shape key is the whole body (and everything fitted to it) on another shape
        h.add_shape_keys({n: h.shape(mh.macro_targets(f'{MHA}/targets', **sh)) for n, sh in cfg['morphs'].items()})
    for p in parts:
        if p.data.materials and p.data.materials[0].blend_method == 'CLIP':
            pass
    return h, arm, parts


def shrink_images():
    """Textures at the size a phone shows them: a player is about 300 px tall on screen and his
    face about 30, so a 512 px body map is already more than the screen can use. Normal maps and
    small parts (eyes, brows, lashes, hair) go smaller still."""
    for im in bpy.data.images:
        if not im.size[0]:
            continue
        n = im.name.lower()
        if any(k in n for k in ('eye', 'brow', 'lash')):
            cap = 128
        elif 'mask' in n:
            cap = 1024
        elif 'normal' in n or any(k in n for k in ('hair', 'short0', 'shoes')):
            cap = 256
        else:
            cap = 512
        w, h = im.size
        if max(w, h) > cap:
            k = cap / max(w, h)
            im.scale(max(1, int(w * k)), max(1, int(h * k)))


def export(name):
    shrink_images()
    path = os.path.join(OUT, f'{name}.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_image_format='WEBP',
                              export_animations=True, export_animation_mode='ACTIONS',
                              export_force_sampling=True, export_frame_step=1,
                              export_optimize_animation_size=True, export_def_bones=False,
                              export_skins=True, export_morph=True, export_morph_normal=False, export_yup=True,
                              export_apply=False, export_texcoords=True, export_normals=True,
                              export_tangents=False, export_materials='EXPORT', export_cameras=False,
                              export_lights=False, export_image_quality=72)
    print('wrote', path, os.path.getsize(path))


PEOPLE = {
    # Daulton Varsho's side (bats left, from the Yamamoto pack). Generic body and face.
    # One body for every hitter: a big league build at its base, a heavier and a leaner build as
    # shape keys (the scene mixes them from each batter's real height and weight), the uniform cut
    # from it. Generic face, no likeness.
    'batter': dict(
        name='batter', skin='young_caucasian_male2', skin_size=1024,
        shape=dict(age=0.52, muscle=0.78, weight=0.55, height=0.78, race={'caucasian': 0.6, 'african': 0.2, 'asian': 0.2}),
        morphs={'heavy': dict(age=0.55, muscle=0.85, weight=0.95, height=0.78, race={'caucasian': 0.6, 'african': 0.2, 'asian': 0.2}),
                'lean': dict(age=0.5, muscle=0.7, weight=0.25, height=0.78, race={'caucasian': 0.6, 'african': 0.2, 'asian': 0.2})},
        hair='hair/short02/short02',
        uniform=True,
        clothes=[dict(id='shoes01', own=True, color=(0.03, 0.03, 0.03, 1))],
        gear=[],
        clips=[('swing', '124/124_07.bvh', 22, 140, True, 'grip')],
    ),
    'catcher': dict(
        name='catcher', skin='young_african_male', skin_size=1024,
        shape=dict(age=0.55, muscle=0.72, weight=0.68, height=0.6, race={'african': 0.6, 'caucasian': 0.3, 'asian': 0.1}),
        hair='hair/short04/short04',
        uniform=True,
        clothes=[dict(id='shoes01', own=True, color=(0.03, 0.03, 0.03, 1))],
        gear=[],
        clips=[('idle', '120/120_21.bvh', 90, 280, False, {'l': 'grip', 'r': 'relaxed'})],
    ),
    'umpire': dict(
        name='umpire', skin='middleage_caucasian_male', skin_size=1024,
        shape=dict(age=0.68, muscle=0.5, weight=0.72, height=0.7, race={'caucasian': 0.7, 'african': 0.2, 'asian': 0.1}),
        hair='hair/short02/short02',
        clothes=[
            dict(id='male_casualsuit06', color=UMP_NAVY, color2=UMP_SLACKS, pattern='cotton_jersey'),
            dict(id='shoes01', own=True, color=(0.03, 0.03, 0.03, 1)),
        ],
        gear=[],
        clips=[('idle', '142/142_03.bvh', 90, 280, False, 'relaxed')],
    ),
}


def build(who):
    cfg = PEOPLE[who]
    reset()
    h, arm, parts = body(cfg)
    if cfg.get('gear'):
        # soft gear is lifted off the whole skin, including what the clothes hide
        saved, h.deleted = h.deleted, set()
        full = h.body_object('full_tmp', parts[0].data.materials[0])
        h.deleted = saved
        for g in cfg['gear']:
            fn = getattr(gear, g)
            fn(h, arm, full, color=UMP_NAVY if g == 'ump_bulk' else TEAM)
        bpy.data.objects.remove(full, do_unlink=True)
    for (clip, path, a, b, mirror, hands) in cfg['clips']:
        retarget.apply_bvh(arm, f'{BVH}/{path}', clip, a, b, mirror=mirror, hands=hands)
    export(who)
    # the model's own height, for the scene to scale each player to his real one
    fn = os.path.join(HERE, '..', 'assets', 'uniform.json')
    data = json.load(open(fn)) if os.path.exists(fn) else {}
    data[who] = {'heightM': round(float(max(v.co.z for v in parts[0].data.vertices)), 4)}
    json.dump(data, open(fn, 'w'), indent=1)

if __name__ == '__main__':
    for w in WHO:
        build(w)
