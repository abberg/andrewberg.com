"""The garden's creature: rigs and colours the fennec fox model.

blender/fox.obj is a free fennec fox model from Sketchfab (a plain mesh,
no bones or colours). This gives it a size, a skeleton and painted colours,
and exports public/creature.glb. src/creatureModel.ts poses the bones.

Run from the package: Blender -b --python blender/creature.py
(add "-- shots <dir>" to also render it from a few sides, to check it).
"""
import bpy, os, sys, math
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
SRC, OUT = os.path.join(HERE, 'fox.obj'), os.path.join(HERE, '..', 'public', 'creature.glb')
# Nose to tail tip, in metres.
LENGTH = 1.0

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=SRC, forward_axis='Y', up_axis='Z')
fox = bpy.context.selected_objects[0]
fox.name = 'Creature'
bpy.context.view_layer.objects.active = fox
mesh = fox.data

# As it comes: its nose towards +x, feet down, some way from the origin.
# Stood on the origin, nose towards -y (which exports as +z), a metre long.
xs = [v.co.x for v in mesh.vertices]; ys = [v.co.y for v in mesh.vertices]; zs = [v.co.z for v in mesh.vertices]
long, wide, tall = max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)
scale = LENGTH / long
# The hips, as a share of its length, are where it's stood.
HIPS = 0.38
for v in mesh.vertices:
    fx, fy, fz = (v.co.x - min(xs)) / long, (v.co.y - (min(ys) + max(ys)) / 2) / long, (v.co.z - min(zs)) / long
    v.co = Vector((fy * LENGTH, -(fx - HIPS) * LENGTH, fz * LENGTH))
TALL, WIDE = tall * scale, wide * scale
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=0.0005)
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.shade_smooth()

# A place on it, from the side: how far along (0 at the tail's tip, 1 at
# the nose) and how far up (0 at its feet, 1 at the tips of its ears).
def at(along, up, side=0.0):
    return Vector((side * WIDE, -(along - HIPS) * LENGTH, up * TALL))

# Colours: sandy, cream underneath and on the muzzle, a dark tip to the
# tail and the ears, dark eyes and nose.
SAND, CREAM, DARK, TIP = (0.93, 0.72, 0.42, 1), (1.0, 0.94, 0.8, 1), (0.1, 0.08, 0.08, 1), (0.36, 0.24, 0.18, 1)
colours = mesh.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
EYES = [at(0.945, 0.655, s) for s in (0.27, -0.27)]
NOSE = at(1.0, 0.615)
for v in mesh.vertices:
    along, up = HIPS - v.co.y / LENGTH, v.co.z / TALL
    c = SAND
    # Underneath: the belly, chest and throat, and the insides of the legs.
    if v.normal.z < -0.25 and along > 0.34 or (0.62 < along < 0.9 and up < 0.5 and v.normal.y < -0.2):
        c = CREAM
    if along > 0.93 and up < 0.63:
        c = CREAM
    if along < 0.1:
        c = TIP
    if up > 0.9:
        c = TIP
    if (v.co - NOSE).length < 0.022 or any((v.co - e).length < 0.02 for e in EYES):
        c = DARK
    colours.data[v.index].color = c
material = bpy.data.materials.new('Fur')
material.use_nodes = True
nodes = material.node_tree.nodes
shader = nodes.get('Principled BSDF')
attribute = nodes.new('ShaderNodeVertexColor'); attribute.layer_name = 'Col'
material.node_tree.links.new(attribute.outputs['Color'], shader.inputs['Base Color'])
shader.inputs['Roughness'].default_value = 1
mesh.materials.append(material)

# The skeleton. Everything hangs from the hips, so it can sit up on them.
rig = bpy.data.objects.new('CreatureRig', bpy.data.armatures.new('CreatureRig'))
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
def bone(name, head, tail, parent=None):
    b = rig.data.edit_bones.new(name)
    b.head, b.tail = head, tail
    if parent: b.parent = rig.data.edit_bones[parent]
    return b
bone('hips', at(0.40, 0.50), at(0.52, 0.50))
bone('spine', at(0.52, 0.50), at(0.74, 0.52), 'hips')
bone('neck', at(0.74, 0.52), at(0.86, 0.60), 'spine')
bone('head', at(0.86, 0.60), at(0.99, 0.62), 'neck')
for name, s in (('L', 1), ('R', -1)):
    bone('ear' + name, at(0.86, 0.69, s * 0.2), at(0.75, 0.97, s * 0.42), 'head')
    bone('fore' + name, at(0.76, 0.40, s * 0.24), at(0.77, 0.04, s * 0.24), 'spine')
    bone('hind' + name, at(0.37, 0.42, s * 0.26), at(0.355, 0.04, s * 0.26), 'hips')
tail = [(0.375, 0.515), (0.275, 0.55), (0.205, 0.69), (0.145, 0.85), (0.015, 0.89)]
for k in range(4):
    bone(f'tail{k + 1}', at(*tail[k]), at(*tail[k + 1]), f'tail{k}' if k else 'hips')
bpy.ops.object.mode_set(mode='OBJECT')
fox.select_set(True); rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
print('GROUPS', [g.name for g in fox.vertex_groups], 'unweighted', sum(1 for v in mesh.vertices if not v.groups), 'of', len(mesh.vertices))
print('SIZE', LENGTH, WIDE, TALL)

if 'shots' in sys.argv:
    out = sys.argv[sys.argv.index('shots') + 1]
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'; scene.display.shading.color_type = 'VERTEX'
    scene.render.resolution_x, scene.render.resolution_y = 800, 700
    camera = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scene.collection.objects.link(camera); scene.camera = camera
    camera.data.type = 'ORTHO'; camera.data.ortho_scale = 1.25
    def shoot(name):
        for n, v in {'side': (1, 0, 0), 'front': (0.5, -1, 0.25), 'top': (0, 0, 1), 'back': (-0.6, 1, 0.5)}.items():
            v = Vector(v).normalized()
            camera.location = v * 5 + Vector((0, -0.12, 0.33))
            camera.rotation_euler = (-v).to_track_quat('-Z', 'X' if n == 'top' else 'Z').to_euler()
            scene.render.filepath = os.path.join(out, f'{name}-{n}.png')
            bpy.ops.render.render(write_still=True)
    shoot('rest')
    # Posed, to see how the skin takes it: sat up, legs swung, tail down.
    pose = rig.pose.bones
    def pitch(name, angle):
        # About the model's sideways axis (x), whatever way the bone lies.
        b = pose[name]; b.rotation_mode = 'QUATERNION'
        axis = (b.bone.matrix_local.to_3x3().inverted() @ Vector((1, 0, 0))).normalized()
        from mathutils import Quaternion
        b.rotation_quaternion = Quaternion(axis, angle)
    pitch('hips', 0.8); pitch('hindL', -0.8); pitch('hindR', -0.8); pitch('foreL', 0.5); pitch('foreR', 0.5); pitch('neck', -0.6)
    shoot('sat')
    for name, a in (('hips', 0), ('hindL', 0.7), ('hindR', 0.7), ('foreL', -0.7), ('foreR', -0.7), ('neck', 0), ('tail2', -0.5), ('tail3', -0.5)):
        pitch(name, a)
    shoot('run')
    for b in pose: b.rotation_quaternion = (1, 0, 0, 0)

bpy.ops.object.select_all(action='DESELECT')
fox.select_set(True); rig.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animations=False, export_yup=True, export_vertex_color='ACTIVE', export_all_vertex_colors=True, export_active_vertex_color_when_no_material=True)
print('WROTE', OUT)
