# Rebuilds the character and renders preview sheets of it: run in Blender's
# Python with OUT set to a folder. Four views of the whole figure (full_*.png)
# and four each of the left hand and arm (hand_*.png, arm_*.png), from an orthographic camera.
import math
import os
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
path = os.path.join(HERE, 'character.py')
exec(compile(open(path).read(), path, 'exec'), {'__file__': path, '__name__': '__main__'})

scene = bpy.context.scene
camera = bpy.data.objects.get('PreviewCam')
if not camera:
    camera = bpy.data.objects.new('PreviewCam', bpy.data.cameras.new('PreviewCam'))
    scene.collection.objects.link(camera)
camera.data.type = 'ORTHO'
scene.camera = camera
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
# One grey for everything: the figure's black hides its form.
scene.display.shading.color_type = 'SINGLE'
scene.display.shading.single_color = (0.55, 0.55, 0.55)
scene.display.shading.show_cavity = True
scene.render.resolution_x, scene.render.resolution_y = 500, 700


def shot(name, target, direction, scale):
    direction = Vector(direction).normalized()
    camera.location = Vector(target) - direction * 5
    camera.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    camera.data.ortho_scale = scale
    scene.render.filepath = os.path.join(OUT, name + '.png')
    bpy.ops.render.render(write_still=True)


# Close ups: the left hand, the left arm and the torso.
CLOSE = {'hand': ((0.405, -0.01, 0.33), 0.5), 'arm': ((0.29, 0, 1.0), 0.85), 'torso': ((0, -0.05, 0.95), 1.0)}
VIEWS = {'front': (0, 1, 0), 'side': (1, 0, 0), 'back': (0, -1, 0)}
for name, direction in VIEWS.items():
    shot('full_' + name, (0, 0, 0.9), direction, 1.99)
    for part, (target, scale) in CLOSE.items():
        shot(f'{part}_{name}', target, (-direction[0], direction[1], 0), scale)
shot('full_three', (0, 0, 0.9), (0.6, 0.8, -0.25), 1.99)
for part, (target, scale) in CLOSE.items():
    shot(f'{part}_three', target, (-0.6, 0.8, -0.2), scale)
bpy.ops.wm.save_mainfile()
