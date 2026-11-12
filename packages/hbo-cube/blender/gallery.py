# Greybox of the gallery from the HBO Imagine "Heist" cube: a square room seen through each of its four
# walls, with a few low-poly figures on a 12 s loop. Run inside Blender:
#   HBO_MODE=build   builds the scene, saves gallery.blend beside this file and renders one still per camera
#   HBO_MODE=render  renders the 288-frame loop from each camera as PNG sequences into tmp/hbo-cube/<cam>/
import bpy, bmesh, math, os
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.environ['HBO_HERE']
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OUT = os.path.join(REPO, 'tmp', 'hbo-cube')
BLEND = os.path.join(HERE, 'gallery.blend')

W = 9.0                 # room footprint, metres
H = W * 9 / 16          # ceiling height, so each wall is 16:9
HALF = W / 2
CAM_D = 11.0            # camera distance behind its wall
FPS, FRAMES = 24, 288   # 12 s loop
SIDES = ['S', 'E', 'N', 'W']   # wall k is the south wall turned k * 90 degrees


def build():
    for block in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.collections, bpy.data.actions):
        for item in list(block):
            block.remove(item)
    scene = bpy.context.scene
    root_coll = scene.collection

    def mat(name, color, rough=0.8, metal=0.0, emit=0.0, cull=False):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (*color, 1)
        b.inputs['Roughness'].default_value = rough
        b.inputs['Metallic'].default_value = metal
        if emit:
            b.inputs['Emission Color'].default_value = (*color, 1)
            b.inputs['Emission Strength'].default_value = emit
        m.use_backface_culling = cull
        return m

    g = lambda v: (v, v, v)
    M = {
        'wall': mat('wall', g(0.7), cull=True), 'floor': mat('floor', g(0.28), rough=0.5), 'ceiling': mat('ceiling', g(0.8)),
        'plinth': mat('plinth', g(0.88)), 'pillar': mat('pillar', g(0.3)), 'panel': mat('panel', g(0.85)),
        'dark': mat('dark', g(0.06)), 'mid': mat('mid', g(0.2)), 'light': mat('light', g(0.7)),
        'screen': mat('screen', g(0.75), emit=0.6), 'glow': mat('glow', g(1.0), emit=4.0),
        'gold': mat('gold', (0.83, 0.6, 0.2), rough=0.3, metal=1.0), 'gold_dark': mat('gold_dark', (0.45, 0.3, 0.08), rough=0.4, metal=1.0),
        'skin': mat('skin', g(0.38)), 'suit': mat('suit', g(0.035)), 'shirt': mat('shirt', g(0.85)),
        'grey': mat('grey', g(0.1)), 'tan': mat('tan', g(0.2)),
    }

    def obj(name, mesh, loc=(0, 0, 0), material=None, parent=None, coll=None):
        o = bpy.data.objects.new(name, mesh)
        o.location = loc
        if material and mesh:
            mesh.materials.append(M[material])
        (coll or root_coll).objects.link(o)
        if parent:
            o.parent = parent
        return o

    def box(name, sx, sy, z0, z1, loc=(0, 0, 0), material='plinth', s0=(1, 1), s1=(1, 1), **kw):
        x, y = sx / 2, sy / 2
        verts = [(sx_ * x * s[0], sy_ * y * s[1], z) for z, s in ((z0, s0), (z1, s1)) for sx_, sy_ in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(verts, [], faces)
        return obj(name, mesh, loc, material, **kw)

    def bm_obj(name, fill, loc=(0, 0, 0), material='plinth', **kw):
        bm = bmesh.new()
        fill(bm)
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        return obj(name, mesh, loc, material, **kw)

    def cyl(name, r, depth, segments=12, **kw):
        return bm_obj(name, lambda bm: bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=r, radius2=r, depth=depth), **kw)

    def empty(name, loc=(0, 0, 0), parent=None):
        return obj(name, None, loc, parent=parent)

    # Shell. Walls face inward and are backface-culled, so each camera sees through its own wall.
    plane = lambda name, verts, material: obj(name, (lambda m: (m.from_pydata(verts, [], [(0, 1, 2, 3)]), m)[1])(bpy.data.meshes.new(name)), material=material)
    plane('floor', [(-HALF, -HALF, 0), (HALF, -HALF, 0), (HALF, HALF, 0), (-HALF, HALF, 0)], 'floor')
    plane('ceiling', [(-HALF, -HALF, H), (-HALF, HALF, H), (HALF, HALF, H), (HALF, -HALF, H)], 'ceiling')

    sides = {}
    for k, side in enumerate(SIDES):
        pivot = empty(f'side_{side}')
        pivot.rotation_euler.z = k * math.pi / 2
        wall = plane(f'wall_{side}', [(-HALF, -HALF, 0), (-HALF, -HALF, H), (HALF, -HALF, H), (HALF, -HALF, 0)], 'wall')
        wall.parent = pivot
        coll = bpy.data.collections.new(f'exhibits_{side}')
        root_coll.children.link(coll)
        cam = bpy.data.objects.new(f'cam_{side}', bpy.data.cameras.new(f'cam_{side}'))
        root_coll.objects.link(cam)
        cam.parent = pivot
        cam.location = (0, -HALF - CAM_D, H / 2)
        cam.rotation_euler = (math.pi / 2, 0, 0)
        cam.data.sensor_width = 36
        cam.data.lens = 36 * CAM_D / W * 1.012
        cam.data.clip_end = 60
        sides[side] = (pivot, coll)

    # South: five gold urinals on a plinth.
    p, c = sides['S']
    kw = dict(parent=p, coll=c)
    box('urinal_plinth', 4.3, 0.9, 0, 0.32, (0.7, -3.95, 0), **kw)
    for i in range(5):
        x = 0.7 + (i - 2) * 0.78
        box('urinal', 0.6, 0.42, 0.32, 1.5, (x, -4.0, 0), 'gold', **kw)
        box('urinal_bowl', 0.44, 0.04, 0.5, 1.4, (x, -3.78, 0), 'gold_dark', **kw)
        box('urinal_lip', 0.6, 0.2, 0.32, 0.5, (x, -3.74, 0), 'gold', **kw)
        box('urinal_pipe', 0.07, 0.07, 1.5, 1.72, (x, -4.05, 0), 'gold', **kw)
        box('urinal_valve', 0.26, 0.07, 1.72, 1.79, (x, -4.05, 0), 'gold', **kw)

    # East: a row of slot machines.
    p, c = sides['E']
    kw = dict(parent=p, coll=c)
    box('slot_plinth', 7.2, 0.85, 0, 0.4, (0, -4.0, 0), **kw)
    for i in range(8):
        x = (i - 3.5) * 0.86
        box('slot_body', 0.68, 0.6, 0.4, 1.75, (x, -4.02, 0), 'mid', **kw)
        box('slot_crown', 0.68, 0.6, 1.75, 2.05, (x, -4.02, 0), 'dark', s1=(0.72, 0.9), **kw)
        box('slot_screen', 0.52, 0.03, 1.2, 1.66, (x, -3.71, 0), 'screen', **kw)
        box('slot_reels', 0.52, 0.03, 0.86, 1.12, (x, -3.71, 0), 'light', **kw)
        box('slot_tray', 0.56, 0.14, 0.62, 0.7, (x, -3.66, 0), 'dark', **kw)

    # North: the big painting, with a small plinth either side.
    p, c = sides['N']
    kw = dict(parent=p, coll=c)
    box('painting_frame', 3.0, 0.14, 0.55, 4.45, (0, -4.42, 0), 'gold_dark', **kw)
    box('painting_canvas', 2.7, 0.04, 0.7, 4.3, (0, -4.34, 0), 'dark', **kw)
    for i, (z0, z1) in enumerate(((3.25, 4.1), (2.1, 3.05), (0.9, 1.9))):
        box('painting_tier', 2.1 - i * 0.15, 0.03, z0, z1, (0, -4.31, 0), 'mid', s1=(0.8, 1) if i == 0 else (1, 1), **kw)
        box('painting_tier_inner', 1.5 - i * 0.15, 0.03, z0 + 0.18, z1 - 0.18, (0, -4.29, 0), 'grey', **kw)
    for x in (-3.1, 3.1):
        box('vitrine_plinth', 0.6, 0.6, 0, 1.05, (x, -3.9, 0), **kw)
        bm_obj('vitrine_object', lambda bm: bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.2), (x, -3.9, 1.27), 'gold', **kw)

    # West: a doorway, three arched frames, and a bench.
    p, c = sides['W']
    kw = dict(parent=p, coll=c)
    box('door', 1.7, 0.06, 0, 2.9, (2.7, -4.47, 0), 'dark', **kw)
    box('door_head', 2.0, 0.12, 2.9, 3.1, (2.7, -4.44, 0), 'plinth', **kw)
    for x in (1.75, 3.65):
        box('door_jamb', 0.16, 0.12, 0, 2.9, (x, -4.44, 0), 'plinth', **kw)
    for i in range(3):
        x = -2.6 + i * 1.25
        box('frame', 0.86, 0.08, 1.0, 2.3, (x, -4.45, 0), 'gold_dark', **kw)
        box('frame_top', 0.86, 0.08, 2.3, 2.62, (x, -4.45, 0), 'gold_dark', s1=(0.55, 1), **kw)
        box('frame_picture', 0.66, 0.03, 1.12, 2.24, (x, -4.4, 0), ('mid', 'light', 'grey')[i], **kw)
    box('bench', 2.0, 0.5, 0.36, 0.46, (-1.35, -3.7, 0), 'mid', **kw)
    for x in (-2.2, -0.5):
        box('bench_leg', 0.1, 0.42, 0, 0.36, (x, -3.7, 0), 'dark', **kw)

    # Two pillars with a diamond panel on each face.
    for px, py in ((-2.3, 1.9), (2.3, -1.9)):
        box('pillar_base', 0.76, 0.76, 0, 0.34, (px, py, 0), 'panel')
        box('pillar_shaft', 0.5, 0.5, 0.34, H - 0.34, (px, py, 0), 'panel')
        box('pillar_cap', 0.76, 0.76, H - 0.34, H, (px, py, 0), 'panel')
        for k in range(4):
            face = empty('pillar_face', (px, py, 0))
            face.rotation_euler.z = k * math.pi / 2
            box('pillar_panel', 0.34, 0.02, 0.6, 3.0, (0, -0.255, 0), 'pillar', parent=face)
            diamond = box('pillar_diamond', 0.2, 0.02, -0.1, 0.1, (0, -0.27, 1.8), 'panel', parent=face)
            diamond.rotation_euler.y = math.pi / 4
            box('pillar_panel_top', 0.34, 0.02, 3.2, H - 0.6, (0, -0.255, 0), 'pillar', parent=face)

    # Ceiling panels, their lights, and a chandelier.
    for x, y in ((0, -2.7), (0, 2.7), (-2.7, 0), (2.7, 0)):
        if True:
            box('ceiling_panel', 2.0, 2.0, H - 0.04, H - 0.01, (x, y, 0), 'glow')
            light = bpy.data.objects.new('ceiling_light', bpy.data.lights.new('ceiling_light', 'AREA'))
            light.data.size = 2.0
            light.data.energy = 300
            light.location = (x, y, H - 0.1)
            root_coll.objects.link(light)
    box('chandelier_stem', 0.05, 0.05, H - 1.0, H, (0, 0, 0), 'gold_dark')
    for r, z, n in ((0.75, H - 1.25, 10), (0.45, H - 1.0, 6)):
        bm_obj('chandelier_ring', lambda bm: bmesh.ops.create_cone(bm, cap_ends=False, segments=n * 2, radius1=r, radius2=r, depth=0.06), (0, 0, z), 'gold_dark')
        for i in range(n):
            a = i / n * math.tau
            box('chandelier_lamp', 0.07, 0.07, 0.03, 0.22, (r * math.cos(a), r * math.sin(a), z), 'glow')
    fill = bpy.data.objects.new('chandelier_light', bpy.data.lights.new('chandelier_light', 'POINT'))
    fill.data.energy = 250
    fill.data.shadow_soft_size = 0.6
    fill.location = (0, 0, H - 1.5)
    root_coll.objects.link(fill)

    # Figures: built facing +Y, limbs pivoting at hip, shoulder and neck.
    def head_mesh(bm):
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.12)
        for v in bm.verts:
            v.co = Vector((v.co.x * 0.95, v.co.y * 1.05, v.co.z * 1.2 + 0.15))

    def figure(name, top, bottom, skirt=False, cap=False, tray=False, height=1.0):
        root = empty(name)
        root.scale = (height,) * 3
        f = {'root': root, 'tray': tray}
        legs = 'skin' if skirt else bottom
        for side, x in (('l', -0.095), ('r', 0.095)):
            f[f'leg_{side}'] = box(f'{name}_leg_{side}', 0.15, 0.17, -0.9, 0, (x, 0, 0.9), legs, s0=(0.7, 0.8), parent=root)
            f[f'arm_{side}'] = box(f'{name}_arm_{side}', 0.1, 0.11, -0.62, 0, (x * 2.85, 0, 1.45), top, s0=(0.7, 0.7), parent=root)
        box(f'{name}_torso', 0.42, 0.22, 0.86, 1.48, (0, 0, 0), top, s0=(0.78, 0.9), parent=root)
        if skirt:
            box(f'{name}_skirt', 0.4, 0.26, 0.5, 0.95, (0, 0, 0), bottom, s0=(1.1, 1.15), s1=(0.85, 0.85), parent=root)
        box(f'{name}_neck', 0.09, 0.09, 1.48, 1.57, (0, 0, 0), 'skin', parent=root)
        f['head'] = bm_obj(f'{name}_head', head_mesh, (0, 0, 1.55), 'skin', parent=root)
        if cap:
            box(f'{name}_cap', 0.22, 0.25, 0.25, 0.31, (0, 0, 0), 'suit', parent=f['head'])
            box(f'{name}_brim', 0.2, 0.1, 0.22, 0.25, (0, 0.15, 0), 'suit', parent=f['head'])
        if tray:
            f['arm_r'].rotation_euler.x = math.radians(78)
            t = cyl(f'{name}_tray', 0.2, 0.02, loc=(0.02, 0.07, -0.66), material='light', parent=f['arm_r'])
            t.rotation_euler.x = math.radians(-78)
            for dx, dy in ((0.07, 0.05), (-0.08, 0.02), (0, -0.09)):
                box(f'{name}_glass', 0.05, 0.05, 0.01, 0.13, (dx, dy, 0), 'panel', parent=t)
        return f

    def wheelchair(name):
        root = empty(name)
        for x in (-0.3, 0.3):
            wheel = cyl(f'{name}_wheel', 0.3, 0.04, 14, loc=(x, -0.08, 0.3), material='dark', parent=root)
            wheel.rotation_euler.y = math.pi / 2
            box(f'{name}_caster', 0.04, 0.12, 0, 0.14, (x * 0.8, 0.42, 0), 'dark', parent=root)
        box(f'{name}_seat', 0.48, 0.46, 0.44, 0.5, (0, 0.02, 0), 'mid', parent=root)
        box(f'{name}_back', 0.48, 0.04, 0.5, 0.98, (0, -0.22, 0), 'mid', parent=root)
        box(f'{name}_torso', 0.42, 0.22, 0.5, 1.1, (0, -0.08, 0), 'grey', s0=(0.8, 0.9), parent=root)
        for x in (-0.1, 0.1):
            box(f'{name}_thigh', 0.15, 0.46, 0.5, 0.64, (x, 0.15, 0), 'suit', parent=root)
            box(f'{name}_shin', 0.12, 0.13, 0.1, 0.58, (x, 0.38, 0), 'suit', s0=(0.8, 1.3), parent=root)
            arm = box(f'{name}_arm', 0.1, 0.11, -0.5, 0, (x * 2.7, -0.08, 1.07), 'grey', s0=(0.7, 0.7), parent=root)
            arm.rotation_euler.x = math.radians(35)
        box(f'{name}_neck', 0.09, 0.09, 1.1, 1.19, (0, -0.08, 0), 'skin', parent=root)
        return {'root': root, 'head': bm_obj(f'{name}_head', head_mesh, (0, -0.08, 1.17), 'skin', parent=root)}

    smooth = lambda v: v * v * (3 - 2 * v)

    def trap(u, a=0.12):
        vmax = 1 / (1 - a)
        if u < a:
            return 0.5 * vmax * u * u / a
        if u > 1 - a:
            return 1 - 0.5 * vmax * (1 - u) ** 2 / a
        return vmax * (u - a / 2)

    def key(o, frame, loc=None, rot=None):
        if loc is not None:
            o.location = loc
            o.keyframe_insert('location', frame=frame)
        if rot is not None:
            o.rotation_euler = rot
            o.keyframe_insert('rotation_euler', frame=frame)

    def pace(f, a, b, walk, rest, offset=0.0, stride=1.35, swing=28):
        # Walk a to b, stand, turn, walk back, stand, turn. 2 * (walk + rest) must divide the loop.
        a, b = Vector(a), Vector(b)
        length = (b - a).length
        heading = math.atan2(b.y - a.y, b.x - a.x) - math.pi / 2
        period = 2 * (walk + rest)
        for frame in range(1, FRAMES + 2):
            c = ((frame - 1) / FPS + offset) % period
            leg = c >= walk + rest
            c -= (walk + rest) * leg
            if c < walk:
                u = trap(c / walk)
                turn, gait = 0.0, min(1, 5 * (c / walk), 5 * (1 - c / walk))
            else:
                u, gait = 1.0, 0.0
                turn = smooth(min(1, max(0, ((c - walk) / rest - 0.35) / 0.65)))
            along = 1 - u if leg else u
            pos = a + (b - a) * along
            phase = math.tau * (u * length + leg * length) / stride
            s = math.sin(phase) * gait
            key(f['root'], frame, (pos.x, pos.y, 0.018 * abs(math.cos(phase)) * gait), (0, 0, heading + math.pi * (leg + turn)))
            if 'leg_l' in f:
                key(f['leg_l'], frame, rot=(math.radians(swing) * s, 0, 0))
                key(f['leg_r'], frame, rot=(-math.radians(swing) * s, 0, 0))
                key(f['arm_l'], frame, rot=(-math.radians(swing * 0.7) * s, 0, 0))
                if not f.get('tray'):
                    key(f['arm_r'], frame, rot=(math.radians(swing * 0.7) * s, 0, 0))
            look = math.sin(math.tau * (frame - 1) / FRAMES * 2 + offset)
            key(f['head'], frame, rot=(0, 0, math.radians(25) * look * (1 - gait)))

    def idle(f, pos, facing, phase=0.0, look=22):
        for frame in range(1, FRAMES + 2):
            t = math.tau * (frame - 1) / FRAMES
            key(f['root'], frame, (pos[0], pos[1], 0), (0, 0, math.radians(facing) + math.radians(4) * math.sin(2 * t + phase)))
            key(f['head'], frame, rot=(math.radians(5) * math.sin(3 * t + phase), 0, math.radians(look) * math.sin(t + phase)))
            if 'arm_l' in f:
                key(f['arm_l'], frame, rot=(math.radians(6) * math.sin(2 * t + phase), 0, 0))

    pace(figure('guard', 'shirt', 'suit', cap=True, height=1.03), (3.1, -2.7), (3.1, 2.7), 4.8, 1.2)
    pace(figure('waiter', 'shirt', 'suit', skirt=True, tray=True, height=0.95), (-3.0, -1.0), (1.2, 1.1), 4.2, 1.8, offset=2.5, swing=22)
    pace(wheelchair('wheelchair'), (-2.9, -2.1), (0.3, -2.1), 3.8, 2.2, offset=6.0)
    idle(figure('viewer', 'suit', 'suit', height=1.02), (0.5, 2.6), 0, 0.0)
    idle(figure('patron', 'grey', 'suit'), (1.0, -2.95), 180, 1.3, look=30)
    idle(figure('talker_a', 'tan', 'grey', height=1.04), (-3.3, 2.7), -65, 2.1, look=12)
    idle(figure('talker_b', 'light', 'tan', skirt=True, height=0.94), (-2.65, 3.05), 115, 4.0, look=12)

    # Render settings.
    scene.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE_NEXT'
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 960, 540, 100
    scene.render.fps = FPS
    scene.frame_start, scene.frame_end = 1, FRAMES
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    for attr, value in (('taa_render_samples', 48), ('use_raytracing', True), ('use_gtao', True), ('use_shadows', True)):
        try:
            setattr(scene.eevee, attr, value)
        except Exception:
            pass
    world = scene.world or bpy.data.worlds.new('World')
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (1, 1, 1, 1)
    bg.inputs['Strength'].default_value = 0.35
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.exposure = -0.9
    scene.camera = bpy.data.objects['cam_S']
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)


def use_camera(side):
    scene = bpy.context.scene
    scene.camera = bpy.data.objects[f'cam_{side}']
    for other in SIDES:
        bpy.data.collections[f'exhibits_{other}'].hide_render = other == side


def stills(frame=70):
    scene = bpy.context.scene
    scene.frame_set(frame)
    for side in SIDES:
        use_camera(side)
        scene.render.filepath = os.path.join(OUT, f'still_{side}.png')
        bpy.ops.render.render(write_still=True)


def render():
    scene = bpy.context.scene
    for side in SIDES:
        use_camera(side)
        scene.render.filepath = os.path.join(OUT, side, '')
        bpy.ops.render.render(animation=True)
    open(os.path.join(OUT, 'done.txt'), 'w').write('done')


mode = os.environ.get('HBO_MODE', 'build')
if mode == 'build':
    build()
    stills()
elif mode == 'render':
    render()
elif mode == 'all':
    build()
    stills()
    render()
