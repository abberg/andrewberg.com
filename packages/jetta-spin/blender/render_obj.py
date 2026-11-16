"""36-frame exterior spin of the Sketchfab model
"2010 Volkswagen Jetta (A5)" (https://skfb.ly/pEDnp) by BloxBloger, CC BY-NC 4.0.

Run:  blender --background --factory-startup --python render_obj.py -- <outdir> <preview|final> [frames]
"""
import bpy, bmesh, sys, os, math

COUNT = 36                              # pictures in the spin, one every 10 degrees

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = argv[0] if argv else os.path.join(HERE, '..', 'renders')
MODE = argv[1] if len(argv) > 1 else 'preview'
FRAMES = [int(f) for f in argv[2].split(',')] if len(argv) > 2 else list(range(COUNT))
ROT0 = -40

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
root = bpy.data.objects.new('Car', None)
scene.collection.objects.link(root)

class NT:
    def __init__(self, name):
        self.mat = bpy.data.materials.new(name)
        self.mat.use_nodes = True
        self.nt = self.mat.node_tree
        self.nt.nodes.clear()
        self.out = self.nt.nodes.new('ShaderNodeOutputMaterial')

    def m(self, op, a, b=None, c=None, clamp=False):
        n = self.nt.nodes.new('ShaderNodeMath')
        n.operation = op
        n.use_clamp = clamp
        for i, v in enumerate((a, b, c)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                self.nt.links.new(v, n.inputs[i])
        return n.outputs[0]

    def attr(self, name):
        n = self.nt.nodes.new('ShaderNodeAttribute')
        n.attribute_name = name
        return n.outputs['Fac']

    def inside(self, f, w=0.002):
        return self.m('MULTIPLY_ADD', f, -1.0 / w, 0.5, clamp=True)

    def bsdf(self, color, metallic=0.0, rough=0.5, coat=0.0, emit=0.0):
        n = self.nt.nodes.new('ShaderNodeBsdfPrincipled')
        n.inputs['Base Color'].default_value = (*color, 1)
        n.inputs['Metallic'].default_value = metallic
        n.inputs['Roughness'].default_value = rough
        for k, v in (('Coat Weight', coat), ('Coat Roughness', 0.03)):
            if k in n.inputs:
                n.inputs[k].default_value = v
        if emit and 'Emission Strength' in n.inputs:
            n.inputs['Emission Color'].default_value = (*color, 1)
            n.inputs['Emission Strength'].default_value = emit
        return n.outputs[0]

    def transparent(self):
        return self.nt.nodes.new('ShaderNodeBsdfTransparent').outputs[0]

    def mix(self, a, b, fac):
        n = self.nt.nodes.new('ShaderNodeMixShader')
        if isinstance(fac, (int, float)):
            n.inputs[0].default_value = fac
        else:
            self.nt.links.new(fac, n.inputs[0])
        self.nt.links.new(a, n.inputs[1])
        self.nt.links.new(b, n.inputs[2])
        return n.outputs[0]

    def objxyz(self):
        tc = self.nt.nodes.new('ShaderNodeTexCoord')
        sp = self.nt.nodes.new('ShaderNodeSeparateXYZ')
        self.nt.links.new(tc.outputs['Object'], sp.inputs[0])
        return sp.outputs

    def finish(self, sh):
        self.nt.links.new(sh, self.out.inputs['Surface'])
        return self.mat


def simple(name, color, metallic=0.0, rough=0.5, coat=0.0):
    n = NT(name)
    return n.finish(n.bsdf(color, metallic, rough, coat))



bpy.ops.wm.obj_import(filepath=os.path.join(HERE, 'model', 'Volkswagen_Jetta_A5_2010.obj'), forward_axis='Y', up_axis='Z')
for ob in list(scene.objects):
    if ob.type == 'MESH':
        ob.parent = root
        ob.data.polygons.foreach_set('use_smooth', [True] * len(ob.data.polygons))
root.scale = (0.01, 0.01, 0.01)
# the plates carry the model vendor's name; leave them off
for ob in list(scene.objects):
    if ob.type != 'MESH':
        continue
    idx = {i for i, sl in enumerate(ob.material_slots) if sl.material and sl.material.name.startswith('Material__')}
    if not idx:
        continue
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    doomed = [f for f in bm.faces if f.material_index in idx]
    print('PLATE FACES', ob.name, len(doomed), len(bm.faces))
    bmesh.ops.delete(bm, geom=doomed, context='FACES')
    bm.to_mesh(ob.data)
    bm.free()


def glass(name, tint, gloss_rough=0.02):
    n = NT(name)
    tr = n.nt.nodes.new('ShaderNodeBsdfTransparent')
    tr.inputs[0].default_value = (*tint, 1)
    gl = n.nt.nodes.new('ShaderNodeBsdfGlossy')
    gl.inputs['Roughness'].default_value = gloss_rough
    # Facing, not Fresnel: some lenses in the model have flipped normals, which Fresnel turns into a full mirror
    lw = n.nt.nodes.new('ShaderNodeLayerWeight')
    lw.inputs['Blend'].default_value = 0.2
    return n.finish(n.mix(tr.outputs[0], gl.outputs[0], n.m('MULTIPLY_ADD', lw.outputs['Facing'], 0.55, 0.04, clamp=True)))


def lensmat(name, color):
    n = NT(name)
    return n.finish(n.bsdf(color, 0, 0.08, 1.0, emit=0.25))


NEW = dict(
    carpaint=simple('carpaint', (0.60, 0.59, 0.565), 0.85, 0.30, 1.0),
    windowglass=glass('windowglass', (0.10, 0.13, 0.13)),
    clearglass=glass('clearglass', (0.92, 0.94, 0.95)),
    orangeglass=lensmat('orangeglass', (0.75, 0.25, 0.0)),
    redglass=lensmat('redglass', (0.45, 0.01, 0.012)),
    black=simple('black', (0.015, 0.015, 0.015), 0, 0.55),
    chrome=simple('chrome', (0.92, 0.92, 0.92), 1.0, 0.07),
    rim=simple('rim', (0.78, 0.78, 0.80), 1.0, 0.22),
    brakedisk=simple('brakedisk', (0.4, 0.4, 0.4), 1.0, 0.4),
    mattemetal=simple('mattemetal', (0.7, 0.7, 0.7), 0.9, 0.35),
    tire=simple('tire', (0.02, 0.02, 0.02), 0, 0.75),
    mirror=simple('mirror', (0.9, 0.9, 0.9), 1.0, 0.02),
    interior=simple('interior', (0.09, 0.09, 0.09), 0, 0.7),
    Material__1=simple('Material__1', (0.9, 0.9, 0.9), 0, 0.5),
    Material__2=simple('Material__2', (0.02, 0.02, 0.02), 0, 0.5),
    Material__3=simple('Material__3', (0.03, 0.03, 0.35), 0, 0.4),
    Material__4=simple('Material__4', (0.75, 0.5, 0.02), 0, 0.4),
)
for ob in scene.objects:
    if ob.type == 'MESH':
        for sl in ob.material_slots:
            base = sl.material.name.split('.')[0] if sl.material else ''
            if base in NEW and sl.material is not NEW[base]:
                sl.material = NEW[base]

# ---------------------------------------------------------------- stage
gm = simple('Ground', (0.8, 0.8, 0.8), 0, 0.6)
bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=30)
gme = bpy.data.meshes.new('Ground')
bm.to_mesh(gme)
bm.free()
gme.materials.append(gm)
ground = bpy.data.objects.new('Ground', gme)
scene.collection.objects.link(ground)
ground.is_shadow_catcher = True

cam_d = bpy.data.cameras.new('Cam')
cam_d.lens = 70
cam = bpy.data.objects.new('Cam', cam_d)
scene.collection.objects.link(cam)
cam.location = (0, -10.8, 1.55)
tgt = bpy.data.objects.new('Target', None)
scene.collection.objects.link(tgt)
tgt.location = (0, 0, 0.66)
tc = cam.constraints.new('TRACK_TO')
tc.target = tgt
tc.track_axis = 'TRACK_NEGATIVE_Z'
tc.up_axis = 'UP_Y'
scene.camera = cam


def area(name, loc, size, energy, target=(0, 0, 0.6)):
    ld = bpy.data.lights.new(name, 'AREA')
    ld.shape = 'RECTANGLE'
    ld.size, ld.size_y = size
    ld.energy = energy
    ob = bpy.data.objects.new(name, ld)
    scene.collection.objects.link(ob)
    ob.location = loc
    t = bpy.data.objects.new(name + 'T', None)
    scene.collection.objects.link(t)
    t.location = target
    c = ob.constraints.new('TRACK_TO')
    c.target = t
    c.track_axis = 'TRACK_NEGATIVE_Z'
    c.up_axis = 'UP_Y'


area('Top', (0, -0.5, 5.5), (8, 4), 300)
area('Key', (-6, -7, 3.5), (5, 2.5), 150)
area('Fill', (7, -5, 2.5), (4, 2), 50)

world = bpy.data.worlds.new('Studio')
world.use_nodes = True
scene.world = world
wn = world.node_tree
wn.nodes.clear()
tcn = wn.nodes.new('ShaderNodeTexCoord')
sp = wn.nodes.new('ShaderNodeSeparateXYZ')
mr = wn.nodes.new('ShaderNodeMapRange')
mr.inputs['From Min'].default_value = -1
ramp = wn.nodes.new('ShaderNodeValToRGB')
bg = wn.nodes.new('ShaderNodeBackground')
wo = wn.nodes.new('ShaderNodeOutputWorld')
wn.links.new(tcn.outputs['Generated'], sp.inputs[0])
wn.links.new(sp.outputs['Z'], mr.inputs['Value'])
wn.links.new(mr.outputs[0], ramp.inputs['Fac'])
wn.links.new(ramp.outputs['Color'], bg.inputs['Color'])
wn.links.new(bg.outputs[0], wo.inputs['Surface'])
els = ramp.color_ramp.elements
els[0].position, els[0].color = 0.0, (0.10, 0.10, 0.10, 1)
els[1].position, els[1].color = 1.0, (0.55, 0.57, 0.60, 1)
for pos, v in ((0.485, 0.30), (0.515, 1.0), (0.72, 0.8)):
    e = els.new(pos)
    e.color = (v, v, v, 1)
bg.inputs['Strength'].default_value = 0.6

# ---------------------------------------------------------------- render
r = scene.render
r.engine = 'CYCLES'
final = MODE == 'final'
r.resolution_x, r.resolution_y = (1200, 675) if final else (960, 540)
r.film_transparent = True
r.image_settings.file_format = 'PNG'
r.image_settings.color_mode = 'RGBA'
scene.cycles.samples = 160 if final else 40
scene.cycles.use_denoising = True
try:
    scene.view_settings.view_transform = 'Standard'
except Exception:
    pass
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'
    (getattr(prefs, 'refresh_devices', None) or prefs.get_devices)()
    for dv in prefs.devices:
        dv.use = True
    scene.cycles.device = 'GPU'
    print('DEVICES', [(dv.name, dv.type, dv.use) for dv in prefs.devices])
except Exception as e:
    print('GPU setup failed', e)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'jetta_obj.blend'))
os.makedirs(OUT, exist_ok=True)
prefix = 'spin' if final else 'preview'
for f in FRAMES:
    root.rotation_euler = (0, 0, math.radians(ROT0 + 360 / COUNT * f))
    r.filepath = os.path.join(OUT, '%s_%02d.png' % (prefix, f))
    bpy.ops.render.render(write_still=True)
    print('RENDERED', f, flush=True)
print('DONE', flush=True)
