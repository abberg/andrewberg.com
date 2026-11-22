# Rebuilds the character and renders it beside the scan, for checking one
# against the other: run in Blender's Python with OUT set to a folder.
# Writes mine_*.png and ref_*.png, four views each.
import os
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
path = os.path.join(HERE, 'preview.py')
exec(compile(open(path).read(), path, 'exec'), {'__file__': path, 'OUT': OUT})

scene = bpy.context.scene
camera = scene.camera
VIEWS = {'front': (0, 1, 0), 'side': (1, 0, 0), 'back': (0, -1, 0), 'three': (0.6, 0.8, -0.25)}
character = bpy.data.collections['Character'].objects
scan = bpy.data.collections['Tripo'].objects


def shots(prefix):
    for name, direction in VIEWS.items():
        direction = Vector(direction).normalized()
        camera.location = Vector((0, 0, 0.9)) - direction * 5
        camera.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
        camera.data.ortho_scale = 1.99
        scene.render.filepath = os.path.join(OUT, f'{prefix}_{name}.png')
        bpy.ops.render.render(write_still=True)


shots('mine')
for object in character:
    object.hide_render = True
for object in scan:
    object.hide_render = False
    for polygon in object.data.polygons:
        polygon.use_smooth = True
shots('ref')
for object in scan:
    object.hide_render = True
for object in character:
    object.hide_render = False
bpy.ops.wm.save_mainfile()
