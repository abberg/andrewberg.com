# Builds the garden robot in Blender from scratch: run it in Blender's Python
# (Scripting tab, or exec(open(path).read())). Makes the mesh, the rig and the
# animations, and exports public/robot.glb next to this folder's package.
#
# Blender is z up and the robot faces +y, which the glTF exporter turns into
# three.js's y up, facing -z. 1 unit = 1 m; it stands about 4 m tall with its
# feet at the origin. Every part is rigid and follows one bone (skinned with
# a weight of 1), so the whole robot is a single mesh and a single draw call.
import math
import os
import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'robot.glb')

# Paint, until the 2k painted texture, sampled off the reference: olive
# khaki metal, yellow-green moss, and the face plate polished bronze (its own
# shiny material).
BRONZE = (0.53, 0.43, 0.14, 1)
BRONZE_DARK = (0.3, 0.24, 0.08, 1)
PLATE = (0.8, 0.6, 0.32, 1)
RING = (0.3, 0.28, 0.25, 1)
EYE = (0.06, 0.05, 0.04, 1)
MOSS = (0.56, 0.62, 0.22, 1)
LEAF = (0.3, 0.45, 0.15, 1)
FLOWER = (0.8, 0.38, 0.18, 1)

# Measured off the front reference's silhouette, scaled to 4 m tall.
# The arms and legs are stacks of equal slabs, a little taller than they're
# wide and shallow front to back: each arm a ball joint and seven links, the
# elbow at the third seam; each leg five links, the knee at the third.
ARM_LINK = (0.304, 0.26, 0.15)  # height, width, depth
LEG_LINK = (0.284, 0.27, 0.17)
HIP = 1.7           # hip joints
HIP_X = 0.27
LEG_TOP = 1.72
KNEE = LEG_TOP - 3 * LEG_LINK[0]
ANKLE = LEG_TOP - 5 * LEG_LINK[0]
SHOULDER = 3.22
SHOULDER_X = 0.72
SHOULDER_Y = 0.04   # 0.34 m in front of the back, over the hips
ARM_TOP = 3.08      # tucked under the shoulder ball
ELBOW = ARM_TOP - 3 * ARM_LINK[0]
WRIST = ARM_TOP - 7 * ARM_LINK[0]
NECK = 3.45


def clear():
    for collection in [c for c in bpy.data.collections if c.name == 'Robot']:
        for object in list(collection.objects):
            bpy.data.objects.remove(object)
        bpy.data.collections.remove(collection)
    for block in (bpy.data.meshes, bpy.data.armatures, bpy.data.actions):
        for item in [i for i in block if i.users == 0]:
            block.remove(item)


class Builder:
    """Collects every part into one bmesh, each face tagged with a bone and a colour."""

    def __init__(self):
        self.bm = bmesh.new()
        self.colour = self.bm.loops.layers.color.new('Col')
        self.group = self.bm.faces.layers.int.new('bone')
        self.bones = []
        # The material slot new faces go in: 0 the paint, 1 the polished face plate.
        self.material = 0

    def bone_index(self, bone):
        if bone not in self.bones:
            self.bones.append(bone)
        return self.bones.index(bone)

    def paint(self, faces, bone, colour, smooth=True):
        index = self.bone_index(bone)
        for face in faces:
            face[self.group] = index
            face.smooth = smooth
            face.material_index = self.material
            for loop in face.loops:
                loop[self.colour] = colour

    def lathe(self, profile, bone, colour, sides=12, sx=1.0, sy=1.0, at=(0, 0, 0), rotate=None, smooth=True, square=0.0):
        """A solid of revolution round local z: profile is [(radius, z)], bottom to top.
        sx, sy squash the rings into ellipses; square (0 to 1) pushes them towards
        rounded rectangles; rotate is a Matrix applied before moving to at."""
        power = 1 / (1 + 3 * square)
        shape = lambda c: math.copysign(abs(c) ** power, c)
        bm = self.bm
        rings = []
        for r, z in profile:
            ring = []
            for i in range(sides):
                a = 2 * math.pi * i / sides
                ring.append(bm.verts.new((r * sx * shape(math.cos(a)), r * sy * shape(math.sin(a)), z)))
            rings.append(ring)
        faces = []
        for lower, upper in zip(rings, rings[1:]):
            for i in range(sides):
                j = (i + 1) % sides
                faces.append(bm.faces.new((lower[i], lower[j], upper[j], upper[i])))
        caps = [bm.faces.new(list(reversed(rings[0]))), bm.faces.new(rings[-1])]
        verts = [v for ring in rings for v in ring]
        transform = Matrix.Translation(at) @ (rotate or Matrix.Identity(4))
        bmesh.ops.transform(bm, matrix=transform, verts=verts)
        self.paint(faces, bone, colour, smooth)
        self.paint(caps, bone, colour, False)
        return faces + caps

    def loft(self, rings, bone, colour, sides=28):
        """A body from (z, half width, back, front) cross-sections, bottom to top:
        each an ellipse spanning back to front, so the profile from the side
        needn't be symmetric."""
        bm = self.bm
        loops = []
        for z, w, back, front in rings:
            c, d = (back + front) / 2, (front - back) / 2
            loops.append([bm.verts.new((w * math.cos(a), c + d * math.sin(a), z))
                          for a in (2 * math.pi * i / sides for i in range(sides))])
        faces = [bm.faces.new((lower[i], lower[(i + 1) % sides], upper[(i + 1) % sides], upper[i]))
                 for lower, upper in zip(loops, loops[1:]) for i in range(sides)]
        caps = [bm.faces.new(list(reversed(loops[0]))), bm.faces.new(loops[-1])]
        self.paint(faces, bone, colour)
        self.paint(caps, bone, colour, False)
        return faces + caps

    def box(self, size, bone, colour, at=(0, 0, 0), rotate=None):
        result = bmesh.ops.create_cube(self.bm, size=1)
        verts = result['verts']
        transform = Matrix.Translation(at) @ (rotate or Matrix.Identity(4)) @ Matrix.Diagonal((*size, 1))
        bmesh.ops.transform(self.bm, matrix=transform, verts=verts)
        faces = list({f for v in verts for f in v.link_faces})
        self.paint(faces, bone, colour, False)
        return faces

    def blob(self, radius, bone, colour, at, squash=(1, 1, 1), subdivisions=1):
        result = bmesh.ops.create_icosphere(self.bm, subdivisions=subdivisions, radius=radius)
        verts = result['verts']
        bmesh.ops.transform(self.bm, matrix=Matrix.Translation(at) @ Matrix.Diagonal((*squash, 1)), verts=verts)
        faces = list({f for v in verts for f in v.link_faces})
        self.paint(faces, bone, colour, True)
        return faces


def catmull_rom(points, steps):
    """A closed smooth curve through points, steps points per span."""
    n, out = len(points), []
    for i in range(n):
        p0, p1, p2, p3 = (Vector(points[(i + k) % n]) for k in (-1, 0, 1, 2))
        for j in range(steps):
            t = j / steps
            out.append(tuple(0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                                    + (3 * p1 - p0 - 3 * p2 + p3) * t ** 3)))
    return out


def segment(height, r=0.13, bevel=0.03):
    """A rounded drum, one link of an arm or leg, bottom at z 0."""
    return [(r - bevel, 0), (r, bevel), (r, height - bevel), (r - bevel, height)]


def build_mesh(b):
    pitch = lambda a: Matrix.Rotation(a, 4, 'X')
    # Facing out of the surface at front-right (+) or front-left (-).
    facing = lambda s, a: Matrix.Rotation(-s * a, 4, 'Z') @ pitch(-math.pi / 2)

    # Body, measured off the front and side views: a cup of a pelvis, a
    # short waist, then the big torso, broad and flat across the shoulders. From
    # the side its back is nearly straight up from the pelvis and its front
    # slopes out to a deep chest, so it sits forward of the hips. Then a thin
    # neck and the small round head. No joint shows: parts just meet.
    b.loft([(1.72, 0.2, -0.17, 0.13), (1.76, 0.29, -0.22, 0.18), (1.9, 0.32, -0.29, 0.27), (2.02, 0.31, -0.32, 0.31),
            (2.08, 0.2, -0.2, 0.2)], 'hips', BRONZE, sides=20)
    # The U cut in the front of the pelvis, a groove of short dark bars.
    for i in range(9):
        a = math.pi * i / 8
        b.box((0.035, 0.03, 0.035), 'hips', BRONZE_DARK, at=(0.09 * math.cos(a), 0.29, 1.97 - 0.12 * math.sin(a)))
    for x in (-0.09, 0.09):
        b.box((0.035, 0.03, 0.06), 'hips', BRONZE_DARK, at=(x, 0.29, 1.995))
    b.loft([(2.04, 0.19, -0.18, 0.18), (2.3, 0.19, -0.16, 0.22)], 'spine', BRONZE, sides=16)
    b.loft([(2.06, 0.18, -0.17, 0.17), (2.08, 0.21, -0.2, 0.2), (2.1, 0.21, -0.2, 0.2), (2.12, 0.18, -0.17, 0.17)],
           'spine', BRONZE_DARK, sides=16)
    torso = [(2.25, 0.12, -0.08, 0.12), (2.29, 0.25, -0.16, 0.25), (2.36, 0.33, -0.23, 0.34), (2.44, 0.37, -0.27, 0.37),
             (2.58, 0.44, -0.31, 0.46), (2.73, 0.5, -0.33, 0.51), (2.87, 0.535, -0.336, 0.6), (3.02, 0.555, -0.336, 0.636),
             (3.16, 0.56, -0.327, 0.59), (3.24, 0.555, -0.29, 0.536), (3.31, 0.55, -0.236, 0.5), (3.38, 0.51, -0.155, 0.43),
             (3.44, 0.4, -0.06, 0.3), (3.47, 0.15, 0.05, 0.15)]
    b.loft(torso, 'spine', BRONZE)

    def surface(z, x):
        """Where the torso's front is at height z and across x, and which way it faces there."""
        for (z0, *low), (z1, *high) in zip(torso, torso[1:]):
            if z0 <= z <= z1:
                w, back, front = (l + (h - l) * (z - z0) / (z1 - z0) for l, h in zip(low, high))
        c, d = (back + front) / 2, (front - back) / 2
        cos = x / w
        sin = math.sqrt(1 - cos * cos)
        return c + d * sin, math.atan2(cos / w, sin / d)

    # The two tall oval hatches high on the chest, either side.
    for s in (-1, 1):
        y, turn = surface(3.05, 0.41)
        b.lathe([(0.0, 0), (0.2, 0), (0.2, 0.03), (0.0, 0.03)], 'spine', BRONZE_DARK, sides=18, sx=0.55,
                at=(s * 0.41, y - 0.01, 3.05), rotate=facing(s, turn))
        b.lathe([(0.0, 0), (0.18, 0.02), (0.16, 0.07), (0.0, 0.08)], 'spine', BRONZE, sides=18, sx=0.55,
                at=(s * 0.41, y - 0.01, 3.05), rotate=facing(s, turn))
    # The head: a bullet, round on top, on a thin neck, the same metal as the
    # body. Across its face a tilted plate of polished bronze, traced off the
    # close-up, carries a small eye, a big eye and a few dots.
    hy = 0.17
    # Wide and tall enough to carry the plate: straight sides, then a bullet's
    # nose (a tangent ogive) from just below the plate's top, blunted at the tip.
    R, BASE, NOSE = 0.21, 3.78, 0.29
    rho = (R * R + NOSE * NOSE) / (2 * R)
    nose = [math.sqrt(rho * rho - (NOSE * t) ** 2) + R - rho for t in (i / 10 for i in range(11))]
    shell = [(0.18, 3.56), (R, 3.58)] + [(r, BASE + NOSE * i / 10) for i, r in enumerate(nose) if r > 0.09]
    shell += [(0.065, shell[-1][1] + 0.02), (0.0, shell[-1][1] + 0.03)]
    b.lathe([(0.09, NECK - 0.02), (0.09, 3.62)], 'head', BRONZE_DARK, sides=10, at=(0, hy, 0))

    def radius(z):
        for (r0, z0), (r1, z1) in zip(shell, shell[1:]):
            if z0 <= z <= z1:
                return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
        return shell[-1][0]

    # The close-up's pixels to the face, as seen straight on: across (+x is
    # the viewer's left) and up.
    PX = 0.00064
    face = lambda px, py: (-(px - 390) * PX, 3.58 + (660 - py) * PX)

    # The plate is a flat shape just in front of the face, traced off the
    # close-up and extruded straight back into the head, so it stands proud
    # with a crisp edge, deeper at the sides where the head curves away. The
    # eyes and dots are sockets cut straight into it. The head and plate are
    # made as solids, the sockets cut out of both, then each face painted by
    # where it lies.
    outline = [(92, 420), (110, 350), (160, 310), (240, 290), (330, 255), (420, 195), (480, 165), (560, 150),
               (630, 165), (680, 220), (700, 300), (695, 390), (670, 460), (620, 510), (550, 535), (460, 545),
               (350, 548), (250, 545), (160, 525), (110, 480)]
    outline = [face(*p) for p in catmull_rom(outline, 6)]
    FRONT = hy + 0.21 + 0.008
    shape = Builder()
    shape.lathe(shell, 'head', BRONZE, sides=48, at=(0, hy, 0))
    solid = shape.bm
    front = [solid.verts.new((x, FRONT, z)) for x, z in outline]
    back = [solid.verts.new((x, hy, z)) for x, z in outline]
    n = len(outline)
    solid.faces.new(front)
    solid.faces.new(back)
    for i in range(n):
        solid.faces.new((front[i], front[(i + 1) % n], back[(i + 1) % n], back[i]))
    bmesh.ops.recalc_face_normals(solid, faces=solid.faces[-(n + 2):])

    # Sockets: (x px, y px, [(radius px, depth from the plate's face m)]) -
    # a wide shallow step, then a narrower deep hole.
    sockets = [(205, 410, [(58, 0.008), (24, 0.03)]), (545, 312, [(100, 0.012), (66, 0.06)]),
               (375, 350, [(13, 0.012)]), (380, 478, [(13, 0.012)]), (478, 518, [(24, 0.006), (15, 0.016)])]
    cutter = bmesh.new()
    holes = []
    for px, py, steps in sockets:
        x, z = face(px, py)
        holes.append((x, z, [(r * PX, d) for r, d in steps]))
        for r, d in steps:
            made = bmesh.ops.create_cone(cutter, cap_ends=True, segments=32, radius1=r * PX, radius2=r * PX, depth=d + 0.04)
            bmesh.ops.transform(cutter, matrix=Matrix.Translation((x, FRONT + 0.02 - d / 2, z)) @ pitch(-math.pi / 2),
                                verts=made['verts'])

    def carved(body, tool):
        """body with tool cut out of it, by Blender's exact boolean."""
        objects = []
        for name, bm in (('plate', body), ('sockets', tool)):
            mesh = bpy.data.meshes.new(f'robot-{name}')
            bm.to_mesh(mesh)
            objects.append(bpy.data.objects.new(f'robot-{name}', mesh))
            bpy.context.scene.collection.objects.link(objects[-1])
        cut = objects[0].modifiers.new('cut', 'BOOLEAN')
        cut.operation, cut.solver, cut.object, cut.use_self = 'DIFFERENCE', 'EXACT', objects[1], True
        result = objects[0].evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh().copy()
        for object in objects:
            mesh = object.data
            bpy.data.objects.remove(object)
            bpy.data.meshes.remove(mesh)
        return result

    result = carved(solid, cutter)
    bm = b.bm
    verts = [bm.verts.new(v.co) for v in result.vertices]
    for polygon in result.polygons:
        f = bm.faces.new([verts[i] for i in polygon.vertices])
        c = f.calc_center_median()
        lift = (c - Vector((0, hy, c.z))).length - radius(c.z)
        for x, z, steps in holes:
            depth = FRONT - c.y
            if 0.0015 < depth < steps[-1][1] + 0.003 and math.hypot(c.x - x, c.z - z) < steps[0][0] + 0.001:
                # In a socket: the deep hole black, the step a dark ring.
                colour, smooth = (EYE if len(steps) == 1 or depth > steps[0][1] + 0.002 else RING), False
                break
        else:
            # The head, smooth, or the plate, flat and crisp.
            colour, smooth = (BRONZE, lift > -0.003) if lift < 0.003 else (PLATE, False)
        b.material = 1 if colour == PLATE else 0
        b.paint([f], 'head', colour, smooth)
    b.material = 0
    bpy.data.meshes.remove(result)

    def links(bone, x, y, top, count, size):
        """A stack of count slabs hanging down from top, with thin dark seams between."""
        height, width, depth = size
        for i in range(count):
            z = top - (i + 1) * height
            b.lathe(segment(height - 0.02, 0.5, 0.06), bone, BRONZE, sides=20, sx=width, sy=depth, at=(x, y, z + 0.01), square=0.75)
            b.lathe([(0.42, -0.015), (0.42, 0.015)], bone, BRONZE_DARK, sides=12, sx=width, sy=depth, at=(x, y, z), square=0.75)

    for side, s in (('R', 1), ('L', -1)):
        x, y = s * SHOULDER_X, SHOULDER_Y
        # The arms hang flush off the torso's top corners, over the hips,
        # a ball joint and a long run of slabs down to big hands near the ground.
        upper = f'upperarm.{side}'
        b.lathe([(0.07, 0), (0.07, 0.15)], upper, BRONZE_DARK, sides=10, at=(s * 0.5, y, SHOULDER),
                rotate=Matrix.Rotation(s * math.pi / 2, 4, 'Y'))
        b.blob(0.17, upper, BRONZE, (x, y, SHOULDER), subdivisions=2)
        links(upper, x, y, ARM_TOP, 3, ARM_LINK)
        links(f'forearm.{side}', x, y, ELBOW, 4, ARM_LINK)
        # The hand: a broad flat palm facing in, three thick fingers across it
        # curling in towards the body, and a thumb at the front.
        hand = f'hand.{side}'
        b.lathe([(0.06, 0), (0.06, 0.1)], hand, BRONZE_DARK, sides=10, at=(x, y, WRIST - 0.08))
        b.lathe(segment(0.3, 0.5, 0.08), hand, BRONZE, sides=16, sx=0.32, sy=0.2, at=(x, y, WRIST - 0.35), square=0.6)
        # Tipped so the top meets the finger above and the tip turns in.
        curl = Matrix.Rotation(s * 0.45, 4, 'Y')
        for fx in (-0.1, 0.0, 0.1):
            b.lathe(segment(0.19, 0.055, 0.018), hand, BRONZE, sides=8, sy=1.3, at=(x + fx, y, WRIST - 0.51), square=0.4)
            b.lathe(segment(0.17, 0.052, 0.018), hand, BRONZE, sides=8, sy=1.3, at=(x + fx - s * 0.074, y, WRIST - 0.65),
                    rotate=curl, square=0.4)
        b.lathe(segment(0.22, 0.055, 0.018), hand, BRONZE, sides=8, at=(x - s * 0.1, y + 0.12, WRIST - 0.46),
                rotate=Matrix.Rotation(-s * 0.3, 4, 'Y') @ pitch(0.4), square=0.4)

        # The legs: long and straight, five slabs, then a flared ankle and a
        # broad flat foot running forward from the heel to a tapered toe.
        hx = s * HIP_X
        links(f'thigh.{side}', hx, 0, LEG_TOP, 3, LEG_LINK)
        links(f'shin.{side}', hx, 0, KNEE, 2, LEG_LINK)
        foot = f'foot.{side}'
        b.lathe([(0.6, 0.16), (0.56, 0.22), (0.5, ANKLE - 0.01)], foot, BRONZE, sides=20,
                sx=LEG_LINK[1], sy=LEG_LINK[2] * 1.2, at=(hx, 0, 0), square=0.75)
        b.lathe([(0.1, 0), (0.14, 0.04), (0.14, 0.3), (0.115, 0.45), (0.07, 0.54), (0.03, 0.57)], foot, BRONZE,
                sides=12, sx=1.35, sy=0.68, at=(hx, -0.1, 0.095), rotate=pitch(-math.pi / 2), square=0.3)

    # Moss draped over the top of the torso, ragged at its lower edge, with
    # a few small plants by the right shoulder.
    grow = lambda z, w, back, front, t=0.025: (z, w + t, back - t, front + t)
    cap = b.loft([grow(*ring) for ring in torso if ring[0] > 3.2] + [(3.5, 0.17, 0.02, 0.17)], 'spine', MOSS)
    ragged = lambda a: 0.3 * max(0.0, math.sin(3 * a + 0.4) * 0.6 + math.sin(7 * a + 1.3) * 0.5 + math.sin(13 * a) * 0.35)
    for vert in {v for f in cap for v in f.verts}:
        if vert.co.z < 3.28:
            vert.co.z -= ragged(math.atan2(vert.co.y - 0.15, vert.co.x))
    for x, y, z, h in ((0.3, 0.15, 3.45, 0.3), (0.42, 0.04, 3.42, 0.22), (0.2, 0.0, 3.47, 0.18)):
        for i in range(3):
            tilt = Matrix.Rotation(i * 2.1, 4, 'Z') @ Matrix.Rotation(0.5, 4, 'X')
            b.lathe([(0.0, 0), (0.05, h * 0.4), (0.0, h)], 'spine', LEAF, sides=4, sx=1, sy=0.25, at=(x, y, z), rotate=tilt)
        b.blob(0.035, 'spine', FLOWER, (x, y, z + h * 0.9))


# The rig. Every bone's local x is world x, so a positive turn about local x
# swings a hanging limb forward and tips an upright bone back.
BONES = {
    # name: (head, tail, parent)
    'root': ((0, 0, 0), (0, 0.6, 0), None),
    'hips': ((0, 0, HIP), (0, 0, 2.05), 'root'),
    'spine': ((0, 0, 2.05), (0, 0, NECK), 'hips'),
    'head': ((0, 0.17, NECK), (0, 0.17, 4.0), 'spine'),
}
for side, s in (('R', 1), ('L', -1)):
    x, y, hx = s * SHOULDER_X, SHOULDER_Y, s * HIP_X
    BONES.update({
        f'upperarm.{side}': ((x, y, SHOULDER), (x, y, ELBOW), 'spine'),
        f'forearm.{side}': ((x, y, ELBOW), (x, y, WRIST), f'upperarm.{side}'),
        f'hand.{side}': ((x, y, WRIST), (x, y, WRIST - 0.55), f'forearm.{side}'),
        f'thigh.{side}': ((hx, 0, HIP), (hx, 0, KNEE), 'hips'),
        f'shin.{side}': ((hx, 0, KNEE), (hx, 0, ANKLE), f'thigh.{side}'),
        f'foot.{side}': ((hx, 0, ANKLE), (hx, 0.45, 0.05), f'shin.{side}'),
    })


def main():
    clear()
    collection = bpy.data.collections.new('Robot')
    bpy.context.scene.collection.children.link(collection)

    builder = Builder()
    build_mesh(builder)
    mesh = bpy.data.meshes.new('Robot')
    builder.bm.to_mesh(mesh)
    robot = bpy.data.objects.new('Robot', mesh)
    collection.objects.link(robot)
    # Every face's bone becomes a vertex group with weight 1.
    groups = [robot.vertex_groups.new(name=name) for name in builder.bones]
    attribute = mesh.attributes['bone']
    for polygon in mesh.polygons:
        groups[attribute.data[polygon.index].value].add(list(polygon.vertices), 1.0, 'REPLACE')
    mesh.attributes.remove(attribute)
    mesh.color_attributes.active_color_index = 0

    data = bpy.data.armatures.new('RobotRig')
    rig = bpy.data.objects.new('RobotRig', data)
    collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for name, (head, tail, parent) in BONES.items():
        bone = data.edit_bones.new(name)
        bone.head, bone.tail = head, tail
        direction = Vector(tail) - Vector(head)
        # Roll so local x is world x.
        bone.align_roll(Vector((0, -1, 0)) if direction.z > 0.5 else Vector((0, 0, 1)) if abs(direction.z) < 0.5 else Vector((0, 1, 0)))
        if parent:
            bone.parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    robot.parent = rig
    modifier = robot.modifiers.new('Armature', 'ARMATURE')
    modifier.object = rig

    material = bpy.data.materials.get('RobotPaint') or bpy.data.materials.new('RobotPaint')
    material.use_nodes = True
    nodes = material.node_tree.nodes
    bsdf = nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 0.75
    bsdf.inputs['Metallic'].default_value = 0.15
    colour = nodes.get('Color Attribute') or nodes.new('ShaderNodeVertexColor')
    colour.layer_name = 'Col'
    material.node_tree.links.new(colour.outputs['Color'], bsdf.inputs['Base Color'])
    mesh.materials.append(material)
    # The face plate: polished bronze, its colour from the paint too.
    plate = bpy.data.materials.get('RobotPlate') or material.copy()
    plate.name = 'RobotPlate'
    plate.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.3
    plate.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value = 0.85
    mesh.materials.append(plate)
    return rig, robot


# Animation. Everything is in place (the game moves the robot); the legs are
# solved from where the feet should be, so a clip played at the right rate for
# the robot's speed (stride metres a cycle) plants its feet without sliding.
FPS = 30
THIGH, SHIN = HIP - KNEE, KNEE - ANKLE
smoothstep = lambda e0, e1, x: (lambda t: t * t * (3 - 2 * t))(min(1, max(0, (x - e0) / (e1 - e0))))


def leg(hip, ankle_y, ankle_z, foot=0.0):
    """Thigh, shin and foot turns (about x) that put the ankle at (ankle_y,
    ankle_z) from a hip at height hip, knee forward, foot at pitch foot (toe up +)."""
    dy, dz = ankle_y, ankle_z - hip
    d = min(math.hypot(dy, dz), THIGH + SHIN - 1e-4)
    phi = math.atan2(dy, -dz)
    alpha = math.acos(max(-1, min(1, (THIGH ** 2 + d ** 2 - SHIN ** 2) / (2 * THIGH * d))))
    a1 = phi + alpha
    ky, kz = THIGH * math.sin(a1), hip - THIGH * math.cos(a1)
    a2 = math.atan2(ankle_y - ky, -(ankle_z - kz))
    return a1, a2 - a1, foot - a2


def arm(parent, shoulder, hand_y, hand_z, hand=0.0):
    """Upper arm, forearm and hand turns that put the wrist at (hand_y, hand_z)
    with the elbow back; parent is the spine's turn and shoulder its (y, z)."""
    upper, fore = SHOULDER - ELBOW, ELBOW - WRIST
    dy, dz = hand_y - shoulder[0], hand_z - shoulder[1]
    d = min(math.hypot(dy, dz), upper + fore - 1e-4)
    phi = math.atan2(dy, -dz)
    alpha = math.acos(max(-1, min(1, (upper ** 2 + d ** 2 - fore ** 2) / (2 * upper * d))))
    a1 = phi - alpha
    ey, ez = shoulder[0] + upper * math.sin(a1), shoulder[1] - upper * math.cos(a1)
    a2 = math.atan2(hand_y - ey, -(hand_z - ez))
    return a1 - parent, a2 - a1, hand - a2


def gait(p, stride, duty, lift):
    """Where a foot is at phase p of a cycle: (y, height above standing, pitch).
    On the ground for the first duty of the cycle, sliding back at the body's speed."""
    reach = stride * duty / 2
    if p < duty:
        return reach - 2 * reach * p / duty, 0.0, 0.0
    q = (p - duty) / (1 - duty)
    return -reach + 2 * reach * smoothstep(0, 1, q), lift * math.sin(math.pi * q) ** 0.8, 0.25 * math.sin(math.pi * q)


def walking(seconds, speed, duty, lift, hip, bob, swing, lean):
    stride = speed * seconds
    reach = stride * duty / 2

    def pose(t):
        p = t / seconds
        result = {}
        # Highest over each planted foot, lowest as the weight changes feet.
        height = hip + bob * math.cos(4 * math.pi * (p - duty / 2))
        result['hips'] = {'location': (0, height - HIP, 0)}
        feet = {}
        for side, offset in (('R', 0), ('L', 0.5)):
            y, up, pitch = gait((p + offset) % 1, stride, duty, lift)
            feet[side] = y
            thigh, shin, foot = leg(height, y, ANKLE + up, pitch)
            result[f'thigh.{side}'] = {'rotation': (thigh, 0, 0)}
            result[f'shin.{side}'] = {'rotation': (shin, 0, 0)}
            result[f'foot.{side}'] = {'rotation': (foot, 0, 0)}
        # The shoulders turn against the hips, and each arm swings against its
        # leg, the forearm trailing.
        twist = -0.07 * feet['R'] / reach
        result['spine'] = {'rotation': (-lean, twist, 0)}
        result['head'] = {'rotation': (lean * 0.7, -twist * 0.8, 0)}
        for side in ('R', 'L'):
            later = gait((p - 0.06 + (0 if side == 'R' else 0.5)) % 1, stride, duty, lift)[0]
            angle = -swing * later / reach + lean
            result[f'upperarm.{side}'] = {'rotation': (angle, 0, 0)}
            result[f'forearm.{side}'] = {'rotation': (0.12 + 0.6 * max(0, angle - lean), 0, 0)}
            result[f'hand.{side}'] = {'rotation': (0.08, 0, 0)}
        return result
    return seconds, pose, stride


def idle():
    seconds = 4

    def pose(t):
        p = t / seconds
        breathe = math.sin(2 * math.pi * p)
        height = 1.6 + 0.012 * breathe
        result = {'hips': {'location': (0, height - HIP, 0)}}
        for side, y in (('R', 0.05), ('L', -0.05)):
            thigh, shin, foot = leg(height, y, ANKLE)
            result[f'thigh.{side}'] = {'rotation': (thigh, 0, 0)}
            result[f'shin.{side}'] = {'rotation': (shin, 0, 0)}
            result[f'foot.{side}'] = {'rotation': (foot, 0, 0)}
        result['spine'] = {'rotation': (-0.02 - 0.015 * breathe, 0, 0)}
        result['head'] = {'rotation': (0.02, 0.18 * math.sin(2 * math.pi * p), 0)}
        for side, s in (('R', 1), ('L', -1)):
            result[f'upperarm.{side}'] = {'rotation': (0.02 + 0.025 * math.sin(2 * math.pi * p + s), 0, 0)}
            result[f'forearm.{side}'] = {'rotation': (0.1 + 0.03 * breathe, 0, 0)}
            result[f'hand.{side}'] = {'rotation': (0.08, 0, 0)}
        return result
    return seconds, pose, 0


def turn():
    """Stepping on the spot, for turning in place: the game does the turning."""
    seconds = 1.4

    def pose(t):
        p = t / seconds
        height = 1.57 + 0.02 * math.cos(4 * math.pi * p)
        result = {'hips': {'location': (0, height - HIP, 0)}}
        for side, offset in (('R', 0), ('L', 0.5)):
            q = (p + offset) % 1
            up = 0.16 * math.sin(math.pi * q / 0.45) if q < 0.45 else 0
            thigh, shin, foot = leg(height, 0.03, ANKLE + up)
            result[f'thigh.{side}'] = {'rotation': (thigh, 0, 0)}
            result[f'shin.{side}'] = {'rotation': (shin, 0, 0)}
            result[f'foot.{side}'] = {'rotation': (foot, 0, 0)}
        result['spine'] = {'rotation': (-0.03, 0, 0.02 * math.sin(2 * math.pi * p))}
        result['head'] = {'rotation': (0.02, 0, 0)}
        for side, s in (('R', 1), ('L', -1)):
            result[f'upperarm.{side}'] = {'rotation': (0.05 + 0.06 * math.sin(2 * math.pi * p) * s, 0, 0)}
            result[f'forearm.{side}'] = {'rotation': (0.15, 0, 0)}
            result[f'hand.{side}'] = {'rotation': (0.08, 0, 0)}
        return result
    return seconds, pose, 0


def push():
    """The upper body only, laid over the walk: leaning in, both hands flat on
    what it's shoving at chest height, heaving."""
    seconds = 1.2
    pivot = 2.05

    def pose(t):
        p = t / seconds
        heave = math.sin(2 * math.pi * p)
        lean = 0.24 + 0.04 * heave
        result = {'spine': {'rotation': (-lean, 0, 0)}, 'head': {'rotation': (lean + 0.1, 0, 0)}}
        up = SHOULDER - pivot
        shoulder = (SHOULDER_Y * math.cos(lean) + up * math.sin(lean), pivot - SHOULDER_Y * math.sin(lean) + up * math.cos(lean))
        for side, s in (('R', 1), ('L', -1)):
            upper, fore, hand = arm(-lean, shoulder, 0.95 + 0.03 * heave * s, 2.3, 1.45)
            result[f'upperarm.{side}'] = {'rotation': (upper, 0, 0)}
            result[f'forearm.{side}'] = {'rotation': (fore, 0, 0)}
            result[f'hand.{side}'] = {'rotation': (hand, 0, 0)}
        return result
    return seconds, pose, 0


def step_over():
    """Lifting each leg over in turn while the game carries the robot up,
    across and down on its arc (see player.ts), 1.5 s, played once."""
    seconds = 1.5

    def pose(t):
        p = t / seconds
        height = 1.55
        result = {'hips': {'location': (0, height - HIP, 0)}}
        # The leading leg goes up and over, then the trailing one follows.
        for side, start in (('R', 0.05), ('L', 0.4)):
            q = smoothstep(start, start + 0.5, p)
            y = -0.25 * (side == 'L') * (1 - q) + 0.55 * math.sin(math.pi * q) * (1 - q) * 2
            up = 0.75 * math.sin(math.pi * q)
            thigh, shin, foot = leg(height, y, ANKLE + up, 0.4 * math.sin(math.pi * q))
            result[f'thigh.{side}'] = {'rotation': (thigh, 0, 0)}
            result[f'shin.{side}'] = {'rotation': (shin, 0, 0)}
            result[f'foot.{side}'] = {'rotation': (foot, 0, 0)}
        lean = 0.12 * math.sin(math.pi * p)
        result['spine'] = {'rotation': (-lean, 0, 0)}
        result['head'] = {'rotation': (lean, 0, 0)}
        for side, s in (('R', 1), ('L', -1)):
            # Arms out a little for balance.
            result[f'upperarm.{side}'] = {'rotation': (0.45 * math.sin(math.pi * p), 0, -s * 0.25 * math.sin(math.pi * p))}
            result[f'forearm.{side}'] = {'rotation': (0.15 + 0.4 * math.sin(math.pi * p), 0, 0)}
            result[f'hand.{side}'] = {'rotation': (0.08, 0, 0)}
        return result
    return seconds, pose, 0


CLIPS = {
    'idle': idle(),
    # speed m/s, share of the cycle each foot is down, foot lift, hip height,
    # bob, arm swing and forward lean.
    'walk': walking(1.1, 1.6, 0.62, 0.2, 1.49, 0.025, 0.28, 0.03),
    'run': walking(0.8, 3.0, 0.42, 0.34, 1.46, 0.05, 0.5, 0.12),
    'turn': turn(),
    'push': push(),
    'stepOver': step_over(),
}


def animate(rig):
    scene = bpy.context.scene
    scene.render.fps = FPS
    rig.animation_data_create()
    for track in list(rig.animation_data.nla_tracks):
        rig.animation_data.nla_tracks.remove(track)
    for bone in rig.pose.bones:
        bone.rotation_mode = 'XYZ'
    for name, (seconds, pose, stride) in CLIPS.items():
        action = bpy.data.actions.new(name)
        rig.animation_data.action = action
        frames = round(seconds * FPS)
        for frame in range(frames + 1):
            # The last frame matches the first, so loops close.
            keys = pose((frame % frames if name != 'stepOver' else frame) / FPS)
            for bone_name, key in keys.items():
                bone = rig.pose.bones[bone_name]
                if 'rotation' in key:
                    bone.rotation_euler = key['rotation']
                    bone.keyframe_insert('rotation_euler', frame=frame)
                if 'location' in key:
                    # Hips point up: local y is world z, local z is world -y.
                    x, z, y = key['location']
                    bone.location = (x, z, -y)
                    bone.keyframe_insert('location', frame=frame)
        action['stride'] = stride
        rig.animation_data.action = None
        track = rig.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 0, action)
        track.mute = True
        for bone in rig.pose.bones:
            bone.location = (0, 0, 0)
            bone.rotation_euler = (0, 0, 0)


def export(collection):
    for object in bpy.context.view_layer.objects:
        object.select_set(object.name in collection.objects)
    bpy.ops.export_scene.gltf(
        filepath=OUT, export_format='GLB', use_selection=True, export_animation_mode='NLA_TRACKS',
        export_extras=True, export_apply=False, export_yup=True)
    # The exporter leaves the rig in the last pose it sampled.
    for bone in bpy.data.objects['RobotRig'].pose.bones:
        bone.location = (0, 0, 0)
        bone.rotation_euler = (0, 0, 0)


if __name__ == '__main__':
    rig, robot = main()
    animate(rig)
    export(bpy.data.collections['Robot'])
