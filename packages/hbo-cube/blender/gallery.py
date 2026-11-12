# Greybox of the gallery from the HBO Imagine "Heist" cube. One column stands in the room with a card suit on
# each face, and four cameras each frame one face of it with a different part of the gallery beyond:
#   S looks north at the club: the lettered partition with the slot machines behind it
#   E looks west at the spade: the big painting
#   N looks south at the heart: the gold urinals and the CASH wall
#   W looks east at the diamond: down the aisle of slot machines
# A few low-poly figures move on a 12 s loop. Run inside Blender:
#   HBO_MODE=build   builds the scene, saves tmp/hbo-cube/gallery.blend and renders one still per camera
#   HBO_MODE=render  renders the 288-frame loop from each camera as PNG sequences into tmp/hbo-cube/<cam>/
#   HBO_MODE=all     does both
import bpy, bmesh, math, os
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.environ.get('HBO_REPO') or os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OUT = os.path.join(REPO, 'tmp', 'hbo-cube')
BLEND = os.path.join(OUT, 'gallery.blend')

H = 5.5                 # ceiling height, metres
FPS, FRAMES = 24, 288   # 12 s loop
SIDES = ['S', 'E', 'N', 'W']
# Camera position and heading in degrees: 0 looks north, 90 west, 180 south, -90 east.
CAMERAS = {'S': ((2.0, -8.8), 0), 'E': ((6.5, -3.1), 90), 'N': ((-4.4, 6.8), 180), 'W': ((-3.4, 1.7), -95)}
SUITS = {'S': 'club', 'E': 'spade', 'N': 'heart', 'W': 'diamond'}


def build():
    for block in (bpy.data.objects, bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.collections, bpy.data.actions):
        for item in list(block):
            block.remove(item)
    scene = bpy.context.scene
    root_coll = scene.collection

    def mat(name, color, rough=0.8, metal=0.0, emit=0.0):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (*color, 1)
        b.inputs['Roughness'].default_value = rough
        b.inputs['Metallic'].default_value = metal
        if emit:
            b.inputs['Emission Color'].default_value = (*color, 1)
            b.inputs['Emission Strength'].default_value = emit
        return m

    g = lambda v: (v, v, v)
    M = {
        'wall': mat('wall', g(0.72)), 'floor': mat('floor', g(0.3), rough=0.5), 'ceiling': mat('ceiling', g(0.8)),
        'plinth': mat('plinth', g(0.88)), 'pillar': mat('pillar', g(0.3)), 'panel': mat('panel', g(0.85)),
        'dark': mat('dark', g(0.06)), 'mid': mat('mid', g(0.2)), 'light': mat('light', g(0.6)), 'relief': mat('relief', g(0.5)),
        'screen': mat('screen', g(0.75), emit=0.6), 'glow': mat('glow', g(1.0), emit=4.0),
        'gold': mat('gold', (0.83, 0.6, 0.2), rough=0.3, metal=1.0), 'gold_dark': mat('gold_dark', (0.45, 0.3, 0.08), rough=0.4, metal=1.0),
        'skin': mat('skin', g(0.38)), 'suit': mat('suit', g(0.035)), 'shirt': mat('shirt', g(0.85)),
        'grey': mat('grey', g(0.1)), 'tan': mat('tan', g(0.2)),
    }

    def obj(name, data, loc=(0, 0, 0), material=None, parent=None, turn=0.0):
        o = bpy.data.objects.new(name, data)
        o.location = loc
        o.rotation_euler.z = math.radians(turn)
        if material and data:
            data.materials.append(M[material])
        root_coll.objects.link(o)
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

    def empty(name, loc=(0, 0, 0), parent=None, turn=0.0):
        return obj(name, None, loc, parent=parent, turn=turn)

    def flat(name, shapes, **kw):
        # Flat polygons standing in the XZ plane, facing -Y.
        def fill(bm):
            for points in shapes:
                bm.faces.new([bm.verts.new((x, 0, z)) for x, z in points])
        return bm_obj(name, fill, **kw)

    def disc(cx, cz, r, n=16):
        return [(cx + r * math.cos(i / n * math.tau), cz + r * math.sin(i / n * math.tau)) for i in range(n)]

    def text(name, body, size, loc, material, turn=0.0):
        curve = bpy.data.curves.new(name, 'FONT')
        curve.body, curve.size, curve.extrude, curve.align_x = body, size, 0.03, 'CENTER'
        o = obj(name, curve, loc, material, turn=turn)
        o.rotation_euler.x = math.pi / 2
        return o

    # Shell: a 21 x 20 m hall.
    X0, X1, Y0, Y1 = -10.5, 10.5, -9.5, 10.5
    box('floor', X1 - X0, Y1 - Y0, -0.1, 0, ((X0 + X1) / 2, (Y0 + Y1) / 2, 0), 'floor')
    box('ceiling', X1 - X0, Y1 - Y0, H, H + 0.1, ((X0 + X1) / 2, (Y0 + Y1) / 2, 0), 'ceiling')
    box('wall_n', X1 - X0, 0.2, 0, H, (0, Y1 + 0.1, 0), 'wall')
    box('wall_s', X1 - X0, 0.2, 0, H, (0, Y0 - 0.1, 0), 'wall')
    box('wall_w', 0.2, Y1 - Y0, 0, H, (X0 - 0.1, (Y0 + Y1) / 2, 0), 'wall')
    box('wall_e', 0.2, Y1 - Y0, 0, H, (X1 + 0.1, (Y0 + Y1) / 2, 0), 'wall')

    # The column: one suit per face.
    box('column_base', 0.84, 0.84, 0, 0.45, material='panel')
    box('column_plinth', 0.72, 0.72, 0.45, 0.6, material='panel')
    box('column_shaft', 0.6, 0.6, 0.6, H, material='panel')
    box('column_belt', 0.7, 0.7, 2.0, 2.12, material='panel')
    box('column_block', 0.76, 0.76, 2.2, 3.2, material='panel')
    box('column_belt_top', 0.7, 0.7, 3.28, 3.4, material='panel')
    box('column_cap', 0.84, 0.84, H - 0.4, H, material='panel')
    heart = [disc(-0.22, 0.18, 0.25), disc(0.22, 0.18, 0.25), [(-0.455, 0.08), (0.455, 0.08), (0, -0.5)]]
    suits = {
        'diamond': [[(0, 0.5), (0.36, 0), (0, -0.5), (-0.36, 0)]],
        'heart': heart,
        'spade': [[(x, 0.08 - z) for x, z in shape] for shape in heart] + [[(-0.05, -0.1), (0.05, -0.1), (0.17, -0.5), (-0.17, -0.5)]],
        'club': [disc(0, 0.26, 0.22), disc(-0.24, -0.06, 0.22), disc(0.24, -0.06, 0.22), disc(0, 0.04, 0.15), [(-0.04, 0), (0.04, 0), (0.17, -0.5), (-0.17, -0.5)]],
    }
    for k, side in enumerate(SIDES):
        face = empty(f'column_face_{side}', turn=k * 90)
        box('column_panel', 0.42, 0.02, 0.75, 1.9, (0, -0.31, 0), 'pillar', parent=face)
        box('column_panel_top', 0.42, 0.02, 3.55, H - 0.55, (0, -0.31, 0), 'pillar', parent=face)
        flat('column_medallion', [disc(0, 0, 0.36, 8)], loc=(0, -0.385, 2.7), material='pillar', parent=face).rotation_euler.y = math.radians(22.5)
        flat(f'column_{SUITS[side]}', [[(x * 0.47, z * 0.47) for x, z in shape] for shape in suits[SUITS[side]]], loc=(0, -0.392, 2.7), material='panel', parent=face)

    # North-east: the aisle of slot machines, with a lettered partition backing the south row.
    def slot(x, y, turn):
        p = empty('slot', (x, y, 0.5), turn=turn)
        box('slot_body', 0.68, 0.6, 0, 1.35, material='mid', parent=p)
        box('slot_crown', 0.68, 0.6, 1.35, 1.65, material='dark', s1=(0.72, 0.9), parent=p)
        box('slot_screen', 0.52, 0.03, 0.8, 1.26, (0, -0.31, 0), 'screen', parent=p)
        box('slot_reels', 0.52, 0.03, 0.46, 0.72, (0, -0.31, 0), 'light', parent=p)
        box('slot_tray', 0.56, 0.14, 0.22, 0.3, (0, -0.36, 0), 'dark', parent=p)

    for name, x0, x1, y, turn in (('south', 1.0, 9.2, 0.55, 180), ('north', -0.5, 9.2, 3.3, 0)):
        box(f'slots_{name}_plinth', x1 - x0, 0.9, 0, 0.5, ((x0 + x1) / 2, y, 0))
        box(f'slots_{name}_stripe', x1 - x0 + 0.02, 0.92, 0.26, 0.31, ((x0 + x1) / 2, y, 0), 'gold')
        for i in range(int((x1 - x0 - 0.2) / 0.8)):
            slot(x0 + 0.5 + i * 0.8, y, turn)
    box('slots_end_plinth', 0.9, 1.85, 0, 0.5, (9.65, 1.925, 0))
    for y in (1.5, 2.35):
        slot(9.65, y, -90)
    box('partition', 8.4, 0.1, 0, 2.25, (5.2, 0.05, 0), 'plinth')
    for i in range(8):
        box('partition_letter', 0.5, 0.03, 0.95, 1.75, (2.0 + i * 0.78, -0.01, 0), 'relief')

    # South: the CASH wall with the urinals in front of it, and a short wall to its east for leaning on.
    box('cash_wall', 9.0, 0.2, 0, H, (-6.0, -5.0, 0), 'wall')
    text('cash_text', '$ CASH $', 1.0, (-6.6, -4.88, 3.3), 'relief', turn=180)
    box('lean_wall', 0.2, 4.5, 0, H, (4.0, -7.25, 0), 'wall')
    u = empty('urinals', (-7.4, -4.35, 0))
    box('urinal_plinth', 4.3, 0.9, 0, 0.32, parent=u)
    for i in range(5):
        x = (i - 2) * 0.78
        box('urinal', 0.6, 0.42, 0.32, 1.5, (x, -0.05, 0), 'gold', parent=u)
        box('urinal_bowl', 0.44, 0.04, 0.5, 1.4, (x, 0.17, 0), 'gold_dark', parent=u)
        box('urinal_lip', 0.6, 0.2, 0.32, 0.5, (x, 0.21, 0), 'gold', parent=u)
        box('urinal_pipe', 0.07, 0.07, 1.5, 1.72, (x, -0.1, 0), 'gold', parent=u)
        box('urinal_valve', 0.26, 0.07, 1.72, 1.79, (x, -0.1, 0), 'gold', parent=u)

    # West wall: the big painting.
    p = empty('painting', (-10.5, -2.4, 0), turn=90)
    box('painting_frame', 3.4, 0.12, 0.6, 4.8, (0, -0.06, 0), 'gold_dark', parent=p)
    box('painting_canvas', 3.05, 0.04, 0.78, 4.62, (0, -0.13, 0), 'dark', parent=p)
    for i, (z0, z1) in enumerate(((3.45, 4.4), (2.25, 3.25), (1.05, 2.05))):
        box('painting_tier', 2.4 - i * 0.15, 0.03, z0, z1, (0, -0.16, 0), 'mid', s1=(0.8, 1) if i == 0 else (1, 1), parent=p)
        box('painting_tier_inner', 1.7 - i * 0.15, 0.03, z0 + 0.18, z1 - 0.18, (0, -0.18, 0), 'relief', parent=p)
    box('sculpture_plinth', 0.6, 0.6, 0, 1.05, (-9.4, 0.6, 0))
    bm_obj('sculpture', lambda bm: bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.2), (-9.4, 0.6, 1.27), 'gold')

    # North and west walls: a tall dark piece, a gold plinth, a doorway and a bench.
    box('tall_frame', 1.7, 0.1, 0.8, 4.3, (-4.5, 10.44, 0), 'dark')
    box('tall_frame_inner', 0.5, 0.03, 1.5, 3.6, (-4.5, 10.38, 0), 'light')
    box('gold_plinth', 0.8, 0.8, 0, 1.2, (-7.4, 9.6, 0), 'gold')
    box('door', 0.06, 1.8, 0, 2.9, (-10.46, 5.5, 0), 'dark')
    box('bench', 0.5, 2.0, 0.36, 0.46, (-9.6, 3.0, 0), 'mid')
    for y in (2.15, 3.85):
        box('bench_leg', 0.42, 0.1, 0, 0.36, (-9.6, y, 0), 'dark')

    # Ceiling panels, their lights, and chandeliers.
    for x in (-7, 0, 7):
        for y in (-6.5, 0.5, 7.5):
            box('ceiling_panel', 3.0, 3.0, H - 0.04, H - 0.01, (x + 1.8, y + 1.5, 0), 'glow')
            light = bpy.data.objects.new('ceiling_light', bpy.data.lights.new('ceiling_light', 'AREA'))
            light.data.size = 3.0
            light.data.energy = 420
            light.location = (x + 1.8, y + 1.5, H - 0.1)
            root_coll.objects.link(light)
    for cx, cy in ((-4.5, 4.5), (4.5, -2.3), (4.5, 6.8), (-6.5, -1.5)):
        box('chandelier_stem', 0.05, 0.05, H - 1.0, H, (cx, cy, 0), 'gold_dark')
        for r, z, n in ((0.75, H - 1.25, 10), (0.45, H - 1.0, 6)):
            bm_obj('chandelier_ring', lambda bm: bmesh.ops.create_cone(bm, cap_ends=False, segments=n * 2, radius1=r, radius2=r, depth=0.06), (cx, cy, z), 'gold_dark')
            for i in range(n):
                a = i / n * math.tau
                box('chandelier_lamp', 0.07, 0.07, 0.03, 0.22, (cx + r * math.cos(a), cy + r * math.sin(a), z), 'glow')

    # Cameras.
    for side, ((x, y), heading) in CAMERAS.items():
        cam = bpy.data.objects.new(f'cam_{side}', bpy.data.cameras.new(f'cam_{side}'))
        root_coll.objects.link(cam)
        cam.location = (x, y, 1.5)
        cam.rotation_euler = (math.pi / 2, 0, math.radians(heading))
        cam.data.sensor_width = 36
        cam.data.lens = 24
        cam.data.clip_end = 80

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
        # facing in degrees: 0 north, 90 west, 180 south, -90 east.
        for frame in range(1, FRAMES + 2):
            t = math.tau * (frame - 1) / FRAMES
            key(f['root'], frame, (pos[0], pos[1], 0), (0, 0, math.radians(facing) + math.radians(4) * math.sin(2 * t + phase)))
            key(f['head'], frame, rot=(math.radians(5) * math.sin(3 * t + phase), 0, math.radians(look) * math.sin(t + phase)))
            if 'arm_l' in f:
                key(f['arm_l'], frame, rot=(math.radians(6) * math.sin(2 * t + phase), 0, 0))

    pace(figure('guard', 'shirt', 'suit', cap=True, height=1.03), (-6.0, -2.4), (-1.2, 2.6), 5.0, 1.0)
    pace(figure('waiter', 'suit', 'suit', skirt=True, tray=True, height=0.95), (2.6, -4.3), (-1.8, -2.2), 3.6, 2.4, offset=2.5, swing=22)
    pace(wheelchair('wheelchair'), (1.6, -1.5), (4.2, -1.5), 3.0, 3.0, offset=6.0)
    idle(figure('leaning_a', 'suit', 'suit', height=1.04), (3.65, -5.3), 75, 0.4, look=18)
    idle(figure('leaning_b', 'tan', 'grey', cap=True), (3.65, -6.2), 60, 2.6, look=14)
    idle(figure('host', 'shirt', 'suit'), (0.5, -2.4), 170, 1.0, look=30)
    idle(figure('viewer', 'suit', 'suit', height=1.02), (2.2, -3.5), 90, 0.0, look=10)
    idle(figure('aisle_a', 'suit', 'suit', skirt=True, height=0.95), (4.2, 2.1), 90, 3.1)
    idle(figure('aisle_b', 'grey', 'tan', skirt=True, height=0.93), (7.4, 1.7), 100, 5.0)
    idle(figure('patron', 'grey', 'suit'), (-7.8, -3.0), 180, 1.3, look=30)
    idle(figure('talker_a', 'tan', 'grey', height=1.04), (-2.2, 7.0), -65, 2.1, look=12)
    idle(figure('talker_b', 'light', 'tan', skirt=True, height=0.94), (-1.7, 7.4), 115, 4.0, look=12)

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
    bg.inputs['Strength'].default_value = 0.25
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.exposure = -0.8
    scene.camera = bpy.data.objects['cam_S']
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)


def use_camera(side):
    bpy.context.scene.camera = bpy.data.objects[f'cam_{side}']


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
