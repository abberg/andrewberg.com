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
from mathutils import Euler, Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'robot.glb')

# Paint, until the 2k painted texture, sampled off the reference: dark olive
# brown metal, muted grey-green moss (both matched in the game's warm sun
# to Andrew's film still, so greyer here than they look), and the face plate
# polished bronze (its own shiny material).
BRONZE = (0.256, 0.257, 0.167, 1)
BRONZE_DARK = (0.145, 0.144, 0.095, 1)
PLATE = (0.8, 0.6, 0.32, 1)
RING = (0.3, 0.28, 0.25, 1)
LIGHT = (0.9, 0.12, 0.06, 1)
EYE = (0.06, 0.05, 0.04, 1)
MOSS = (0.335, 0.44, 0.272, 1)

# Measured off the front reference's silhouette, scaled to 4 m tall.
# The arms and legs are stacks of equal slabs, a little taller than they're
# wide and shallow front to back: each arm a ball joint and seven links, the
# elbow at the third seam; each leg five links, the knee at the third.
ARM_LINK = (0.304, 0.26, 0.15)  # height, width, depth
LEG_LINK = (0.284, 0.27, 0.17)
HIP = 1.7           # hip joints
HIP_X = 0.27
LEG_TOP = 1.72
LEG_SLABS = 5
ANKLE = LEG_TOP - LEG_SLABS * LEG_LINK[0]
# The shoulder ball (0.2 m across) is set into the torso's top outer corner,
# just under the moss, and the arm hangs from under it, a little further out,
# its inner edge against the torso.
SHOULDER = 3.21
SHOULDER_BALL_X = 0.61
SHOULDER_X = 0.68
SHOULDER_Y = 0.04   # 0.34 m in front of the back, over the hips
ARM_TOP = 3.14      # the top slab tucked up under the ball
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

    # Body, measured off the front and side views: a cup of a pelvis, a
    # short waist, then the big torso, broad and flat across the shoulders. From
    # the side its back is nearly straight up from the pelvis and its front
    # slopes out to a deep chest, so it sits forward of the hips. Then a thin
    # neck and the small round head. No joint shows: parts just meet.
    # The pelvis cup has a flat top. Set into its front, hanging from that
    # top, is half a capsule, cut off flush with it.
    PELVIS_TOP = 2.06
    # Its underside is a deep round bowl that hangs down between the legs' tops.
    b.loft([(1.6, 0.08, -0.08, 0.06), (1.63, 0.17, -0.15, 0.11), (1.68, 0.24, -0.2, 0.16), (1.75, 0.29, -0.25, 0.21),
            (1.84, 0.315, -0.29, 0.26), (1.95, 0.32, -0.31, 0.29), (2.02, 0.31, -0.32, 0.31), (PELVIS_TOP, 0.31, -0.32, 0.31)],
           'hips', BRONZE, sides=24)
    r, straight = 0.065, 0.14
    half = [(r * math.sin(a), -straight - r * math.cos(a)) for a in (math.pi / 2 * i / 5 for i in range(1, 6))] + [(r, 0.0)]
    b.lathe(half, 'hips', BRONZE, sides=20, sy=0.7, at=(0, 0.285, PELVIS_TOP))
    b.loft([(2.04, 0.19, -0.18, 0.18), (2.3, 0.19, -0.16, 0.22)], 'spine', BRONZE, sides=16)
    b.loft([(2.06, 0.18, -0.17, 0.17), (2.08, 0.21, -0.2, 0.2), (2.1, 0.21, -0.2, 0.2), (2.12, 0.18, -0.17, 0.17)],
           'spine', BRONZE_DARK, sides=16)
    torso = [(2.25, 0.12, -0.08, 0.12), (2.29, 0.25, -0.16, 0.25), (2.36, 0.33, -0.23, 0.34), (2.44, 0.37, -0.27, 0.37),
             (2.58, 0.44, -0.31, 0.46), (2.73, 0.5, -0.33, 0.51), (2.87, 0.535, -0.336, 0.6), (3.02, 0.555, -0.336, 0.636),
             (3.16, 0.56, -0.327, 0.59), (3.24, 0.555, -0.29, 0.536), (3.31, 0.55, -0.236, 0.5), (3.38, 0.51, -0.155, 0.43),
             (3.44, 0.4, -0.06, 0.3), (3.47, 0.15, 0.05, 0.15)]

    def section(z, inset=0.0):
        """The torso's cross-section at height z, shrunk by inset all round."""
        for (z0, *low), (z1, *high) in zip(torso, torso[1:]):
            if z0 <= z <= z1:
                w, back, front = (l + (h - l) * (z - z0) / (z1 - z0) for l, h in zip(low, high))
                return z, w - inset, back + inset, front - inset

    # It's two shells, upper and lower, meeting at a seam at the chest
    # capsules' middle: each rolls in a little at the seam, with a dark band
    # set back between them.
    SEAM = 3.04
    b.loft([ring for ring in torso if ring[0] < SEAM - 0.015] + [section(SEAM - 0.015), section(SEAM - 0.008, 0.01)],
           'spine', BRONZE)
    b.loft([section(SEAM + 0.008, 0.01), section(SEAM + 0.015)] + [ring for ring in torso if ring[0] > SEAM + 0.015],
           'spine', BRONZE)
    b.loft([section(SEAM - 0.01, 0.012), section(SEAM + 0.01, 0.012)], 'spine', BRONZE_DARK)

    def surface(z, x):
        """Where the torso's front is at height z and across x, and which way it faces there."""
        for (z0, *low), (z1, *high) in zip(torso, torso[1:]):
            if z0 <= z <= z1:
                w, back, front = (l + (h - l) * (z - z0) / (z1 - z0) for l, h in zip(low, high))
        c, d = (back + front) / 2, (front - back) / 2
        cos = x / w
        sin = math.sqrt(1 - cos * cos)
        return c + d * sin, math.atan2(cos / w, sin / d)

    # The two tall capsules high on the chest, 0.32 m either side of the
    # middle (measured off the front view): solid pieces, upright, a bit
    # flattened front to back and sunk about halfway into the chest.
    r, tall = 0.13, 0.38
    ends = [(r * math.cos(t), tall / 2 - r + r * math.sin(t)) for t in (math.pi / 2 * i / 5 for i in range(6))]
    capsule = [(rr, -z) for rr, z in ends][::-1] + ends
    for s in (-1, 1):
        y, turn = surface(3.0, 0.32)
        b.lathe(capsule[1:-1], 'spine', BRONZE, sides=20, sy=0.7, at=(s * 0.32 - s * 0.02 * math.sin(turn), y - 0.02 * math.cos(turn), 3.0),
                rotate=Matrix.Rotation(-s * turn, 4, 'Z'))
    # A small red light in the middle of the chest, between them, on the
    # upper shell above the seam.
    y, _ = surface(3.12, 0.0)
    b.blob(0.025, 'spine', LIGHT, (0, y, 3.12), squash=(1, 0.6, 1))

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

    def prism(bone, x, outline, half):
        """A flat-sided block: outline [(y, z)] round its side, counter-clockwise seen from +x,
        half(y, z) its half width across x. Every face flat, so its edges are crisp."""
        bm = b.bm
        right = [bm.verts.new((x + half(y, z), y, z)) for y, z in outline]
        left = [bm.verts.new((x - half(y, z), y, z)) for y, z in outline]
        n = len(outline)
        faces = [bm.faces.new(right), bm.faces.new(list(reversed(left)))]
        faces += [bm.faces.new((right[(i + 1) % n], right[i], left[i], left[(i + 1) % n])) for i in range(n)]
        b.paint(faces, bone, BRONZE, False)

    def links(bone, x, y, top, count, size, dome=0.0, bow=0.0):
        """A stack of count slabs hanging down from top, with thin dark seams between. With
        dome, the top slab's top is rounded over, rising dome above top. With bow, the slabs
        follow a gentle outward curve from the shoulder to the wrist, bow at its widest."""
        height, width, depth = size
        span = ARM_TOP - WRIST
        for i in range(count):
            z = top - (i + 1) * height
            t = (ARM_TOP - (z + height / 2)) / span
            out = math.copysign(bow * math.sin(math.pi * t), x)
            lean = Matrix.Rotation(-math.copysign(math.atan(bow * math.pi * math.cos(math.pi * t) / span), x), 4, 'Y')
            profile = segment(height - 0.02, 0.5, 0.06)
            if i == 0 and dome:
                profile = profile[:2] + [(0.5 * math.cos(t), height - 0.02 + dome * math.sin(t))
                                         for t in (math.pi / 2 * k / 6 for k in range(6))]
            b.lathe(profile, bone, BRONZE, sides=20, sx=width, sy=depth, at=(x + out, y, z + 0.01), rotate=lean, square=0.75)
            seam = math.copysign(bow * math.sin(math.pi * (ARM_TOP - z) / span), x)
            b.lathe([(0.42, -0.015), (0.42, 0.015)], bone, BRONZE_DARK, sides=12, sx=width, sy=depth, at=(x + seam, y, z), square=0.75)

    for side, s in (('R', 1), ('L', -1)):
        x, y = s * SHOULDER_X, SHOULDER_Y
        # The arms hang off the torso's top corners, over the hips: a ball
        # half sunk into the corner, then a long run of slabs, the first
        # rounded over on top under the ball, down to big hands near the ground.
        upper = f'upperarm.{side}'
        b.blob(0.1, upper, BRONZE, (s * SHOULDER_BALL_X, y, SHOULDER), squash=(1, 1, 1.1), subdivisions=2)
        links(upper, x, y, ARM_TOP, 3, ARM_LINK, dome=0.06, bow=0.04)
        links(f'forearm.{side}', x, y, ELBOW, 4, ARM_LINK, bow=0.04)
        # The hand, measured off the front view: a wrist band, a palm of two
        # slabs as wide as the arm, four fingers side by side across its width
        # hanging down and curling a little in towards the body, and a thumb
        # off the inner side of the palm, angled down and in.
        hand = f'hand.{side}'
        b.lathe([(0.06, 0), (0.06, 0.07)], hand, BRONZE_DARK, sides=10, at=(x, y, WRIST - 0.06))
        palm = WRIST - 0.04
        for top in (palm, palm - 0.14):
            b.lathe(segment(0.13, 0.5, 0.06), hand, BRONZE, sides=16, sx=0.23, sy=0.13, at=(x, y, top - 0.13), square=0.7)

        def digit(base, joints, width, depth, tilt=0.0, forward=0.0):
            """A finger from base downwards: joints [(length, bend in)], each bending further in to the body."""
            at, angle = Vector(base), tilt
            for length, bend in joints:
                angle += bend
                turn = Matrix.Rotation(s * angle, 4, 'Y') @ Matrix.Rotation(forward, 4, 'X') @ Matrix.Rotation(math.pi, 4, 'X')
                b.lathe(segment(length - 0.01, 0.5, 0.15), hand, BRONZE, sides=8, sx=width, sy=depth,
                        at=at, rotate=turn, square=0.5)
                at = at + (turn @ Vector((0, 0, length, 0))).xyz
        tips = palm - 0.27
        for i, fx in enumerate((-0.08, -0.027, 0.027, 0.08)):
            # The inner fingers a little longer.
            longer = 0.02 * (3 - i if s > 0 else i) / 3
            digit((x + fx, y, tips), [(0.15 + longer, 0.08), (0.13, 0.2)], 0.052, 0.11)
        digit((x - s * 0.1, y + 0.01, palm - 0.1), [(0.11, 0.0), (0.1, -0.2)], 0.06, 0.08, tilt=0.35, forward=0.08)

        # The legs: long and straight, five slabs, then a flared ankle and a
        # foot in two pieces, heel and forefoot.
        hx = s * HIP_X
        # The top slab is rounded over on top and rises up beside the pelvis
        # cup, which sits in front of it.
        # Each slab is its own joint, so the leg bends along its length in
        # one long arc rather than breaking at a knee.
        for i in range(LEG_SLABS):
            links(f'leg{i + 1}.{side}', hx, 0, LEG_TOP - i * LEG_LINK[0], 1, LEG_LINK, dome=0.14 if i == 0 else 0.0)
        foot = f'foot.{side}'
        b.lathe([(0.55, 0.2), (0.52, 0.24), (0.5, ANKLE - 0.01)], foot, BRONZE, sides=20,
                sx=LEG_LINK[1], sy=LEG_LINK[2] * 1.2, at=(hx, 0, 0), square=0.75)
        # Two crisp, flat-sided pieces: a heel block under the ankle, then a
        # forefoot wedge sloping down to a blunt toe. Both flare out towards
        # the ground, and the forefoot narrows a little to the toe.
        flare = lambda y, z: 0.17 - 0.1 * z - 0.03 * max(0.0, y - 0.13) / 0.39
        prism(foot, hx, [(-0.13, 0.0), (0.125, 0.0), (0.125, 0.2), (-0.1, 0.2), (-0.13, 0.17)], flare)
        prism(foot, hx, [(0.133, 0.0), (0.52, 0.0), (0.52, 0.045), (0.133, 0.18)], flare)

    # Moss draped over him like a cape: ragged down his back to about the
    # seam, over both shoulders, and open at the front, where the metal shows in a dome
    # from the neck down to the seam. On his right it's only a thin band over
    # the shoulder; on his left it comes down the chest to the capsule's top
    # and out over the shoulder ball. Around the loft's angle a: 0 his right
    # side, 90 the front, 180 his left side, 270 the back.
    hem = [(0, 3.27), (30, 3.32), (60, 3.39), (85, 3.45), (92, 3.4), (99, 3.28), (106, 3.2), (115, 3.17), (145, 3.16), (162, 3.08),
           (180, 3.06), (210, 3.08), (270, 3.1), (330, 3.12), (360, 3.27)]
    # Ragged downwards, more so where it hangs loose down the back.
    loose = [(0, 0.04), (60, 0.02), (100, 0.02), (150, 0.05), (200, 0.09), (270, 0.11), (340, 0.08), (360, 0.04)]

    def keyed(keys, a):
        for (a0, v0), (a1, v1) in zip(keys, keys[1:]):
            if a0 <= a <= a1:
                t = (a - a0) / (a1 - a0)
                t = t * t * (3 - 2 * t)
                return v0 + (v1 - v0) * t

    def ragged(a):
        r = math.radians(a)
        n = math.sin(3 * r + 0.4) * 0.6 + math.sin(7 * r + 1.3) * 0.5 + math.sin(13 * r) * 0.35 + math.sin(23 * r + 2.0) * 0.2
        return keyed(loose, a) * max(0.0, 0.4 + 0.6 * n)

    TOP, sides, rows = 3.47, 56, 14
    edge = []
    for i in range(sides):
        a = 360 * i / sides
        z = keyed(hem, a) - ragged(a)
        r = math.radians(a)
        # Kept above the chest's capsules, so they show whole.
        x = math.cos(r) * 0.5
        if 30 < a < 150 and abs(abs(x) - 0.32) < 0.17:
            z = max(z, 3.215)
        edge.append(z)

    def on_torso(z, a, t):
        _, w, back, front = section(z)
        r = math.radians(a)
        c, d = (back + front) / 2, (front - back) / 2
        # Thicker towards a loose hem down the back.
        return Vector(((w + t) * math.cos(r), c + (d + t) * math.sin(r), z))

    bm = b.bm
    grid = []
    for k in range(rows + 1):
        u = k / rows
        grid.append([bm.verts.new(on_torso(edge[i] + (TOP - edge[i]) * u ** 0.8, 360 * i / sides,
                                           0.025 + 0.015 * (1 - u) * max(0.0, -math.sin(2 * math.pi * i / sides))))
                     for i in range(sides)])
    # The hem tucked back in against the body, so it's closed from below.
    lip = [bm.verts.new(on_torso(edge[i], 360 * i / sides, -0.005)) for i in range(sides)]
    neck = [bm.verts.new((0.17 * math.cos(a), 0.095 + 0.075 * math.sin(a), 3.5))
            for a in (2 * math.pi * i / sides for i in range(sides))]
    loops = [lip] + grid + [neck]
    faces = [bm.faces.new((lower[i], lower[(i + 1) % sides], upper[(i + 1) % sides], upper[i]))
             for lower, upper in zip(loops, loops[1:]) for i in range(sides)]
    faces.append(bm.faces.new(neck))
    b.paint(faces, 'spine', MOSS)
    # Over his left shoulder ball, a cap of moss (it turns with the arm).
    b.blob(0.112, 'upperarm.L', MOSS, (-SHOULDER_BALL_X, SHOULDER_Y, SHOULDER + 0.035), squash=(1.05, 1.08, 0.72), subdivisions=2)

    # And a little patch of it on his right chest, grown out of the seam and
    # trailing down to a point inboard of the capsule.
    patch = [(3.028, 0.07, 0.24), (3.0, 0.08, 0.23), (2.97, 0.1, 0.215), (2.94, 0.115, 0.19), (2.91, 0.12, 0.165),
             (2.885, 0.13, 0.15), (2.865, 0.138, 0.142)]
    across = 6

    def out(z, x, t):
        y, turn = surface(z, x)
        return Vector((x + t * math.sin(turn), y + t * math.cos(turn), z))

    front_ = [[bm.verts.new(out(z, x0 + (x1 - x0) * j / across, 0.014)) for j in range(across + 1)] for z, x0, x1 in patch]
    back_ = [[bm.verts.new(out(z, x0 + (x1 - x0) * j / across, -0.01)) for j in range(across + 1)] for z, x0, x1 in patch]
    faces = []
    for g, flip in ((front_, False), (back_, True)):
        for upper, lower in zip(g, g[1:]):
            for j in range(across):
                quad = (lower[j], lower[j + 1], upper[j + 1], upper[j])
                faces.append(bm.faces.new(quad[::-1] if flip else quad))
    ring = [(r, 0) for r in range(len(patch))] + [(len(patch) - 1, j) for j in range(1, across + 1)]
    ring += [(r, across) for r in range(len(patch) - 2, -1, -1)] + [(0, j) for j in range(across - 1, 0, -1)]
    for (r0, j0), (r1, j1) in zip(ring, ring[1:] + ring[:1]):
        faces.append(bm.faces.new((front_[r0][j0], back_[r0][j0], back_[r1][j1], front_[r1][j1])))
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    b.paint(faces, 'spine', MOSS)


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
        **{f'leg{i + 1}.{side}': ((hx, 0, LEG_TOP - i * LEG_LINK[0]), (hx, 0, LEG_TOP - (i + 1) * LEG_LINK[0]),
                                   f'leg{i}.{side}' if i else 'hips') for i in range(LEG_SLABS)},
        f'foot.{side}': ((hx, 0, ANKLE), (hx, 0.45, 0.05), f'leg{LEG_SLABS}.{side}'),
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
smoothstep = lambda e0, e1, x: (lambda t: t * t * (3 - 2 * t))(min(1, max(0, (x - e0) / (e1 - e0))))


# How a leg's bend is shared among its four slab joints when it bends at the
# knee (the third seam) rather than in an even arc.
KNEE = (0.25, 0.45, 2.85, 0.45)


def leg(side, hip, ankle_y, ankle_z, foot=0.0, roll=0.0, level=False, knee=0.0):
    """Keys for one leg's slabs and foot that put the ankle at (ankle_y, ankle_z) from the hips
    at height hip: the bend shared evenly between the slab joints, so the leg is an arc bowed
    forward (knee, 0 to 1, gathers it towards the knee instead), and the foot at pitch foot
    (toe up +). roll swings the whole leg in across; level keeps the foot flat whatever the
    leg does."""
    top = hip + LEG_TOP - HIP
    dy, dz = ankle_y, ankle_z - top
    n, h = LEG_SLABS, LEG_LINK[0]
    d = math.hypot(dy, dz)
    phi = math.atan2(dy, -dz)
    weights = [1 - knee + knee * w for w in KNEE]

    def reach(bend):
        """Hip to ankle with the joints bent by bend times their weights, the
        first slab hanging straight down: (forward, down)."""
        angle, y, z = 0.0, 0.0, 0.0
        for i in range(n):
            y += h * math.sin(angle)
            z += h * math.cos(angle)
            if i < n - 1:
                angle -= bend * weights[i]
        return y, z

    # The bend whose chord spans hip to ankle.
    low, high = 0.0, 2 * math.pi / n / max(weights) - 1e-3
    if d < n * h:
        for _ in range(40):
            bend = (low + high) / 2
            if math.hypot(*reach(bend)) > d:
                low = bend
            else:
                high = bend
    bend = (low + high) / 2 if d < n * h else 0.0
    y, z = reach(bend)
    first = phi - math.atan2(y, z)
    keys = {f'leg1.{side}': {'rotation': (first, 0, roll)}}
    for i in range(2, n + 1):
        keys[f'leg{i}.{side}'] = {'rotation': (-bend * weights[i - 2], 0, 0)}
    keys[f'foot.{side}'] = {'level': foot} if level else {'rotation': (foot - (first - bend * sum(weights)), 0, 0)}
    return keys


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


# The foot, from the ankle: heel and toe where they meet the ground.
HEEL = (-0.13, -ANKLE)
TOE = (0.5, -ANKLE)


def pivoted(ground, point, pitch):
    """The ankle (y, height) of a foot pitched by pitch (toe up +) about point
    (HEEL or TOE), with that point on the ground where a flat foot's ankle
    would be at y ground."""
    py, pz = point
    c, s = math.cos(pitch), math.sin(pitch)
    return ground + py - (py * c - pz * s), -(py * s + pz * c)


def rolling(p, stride, lift, strike=0.2, push=0.45, off=0.62):
    """Where a foot is at phase p of a straight-legged, heel-to-toe gait: (y,
    height above standing, pitch, and how much its leg bends at the knee). It
    lands on its heel toe up (strike), rolls flat, then lifts its heel and
    pivots on its toe (to push) far behind, leaves the ground at off of the
    cycle (less than half: the run, with both feet up between steps) and
    swings low through to the next heel strike. On the ground it slides back
    at the body's speed, flat under the hips 0.4 of the way through its time
    down."""
    heel, flat, middle = 0.13 * off, 0.68 * off, 0.4 * off
    ground = lambda q: stride * (middle - q)

    def planted(q):
        if q < heel:
            pitch = strike * (1 - smoothstep(0, heel, q))
            return (*pivoted(ground(q), HEEL, pitch), pitch)
        if q < flat:
            return ground(q), ANKLE, 0.0
        pitch = -push * smoothstep(flat, off, q)
        return (*pivoted(ground(q), TOE, pitch), pitch)

    if p < off:
        y, z, pitch = planted(p)
        return y, z - ANKLE, pitch, smoothstep(0.84 * off, off, p)
    q = (p - off) / (1 - off)
    (y0, z0, a0), (y1, z1, a1) = planted(off), planted(0.0)
    e = smoothstep(0, 1, q)
    y, z, pitch = y0 + (y1 - y0) * e, z0 + (z1 - z0) * q + lift * math.sin(math.pi * q), a0 + (a1 - a0) * e
    # Lifted enough that neither toe nor heel scuffs the ground on the way.
    low = min(-(py * math.sin(pitch) + pz * math.cos(pitch)) for py, pz in (HEEL, TOE)) - ANKLE
    z += max(0.0, 0.02 * math.sin(math.pi * q) - (z + low))
    return y, z - ANKLE, pitch, 1 - smoothstep(0.3, 1, q)


def walking(seconds, speed, duty, lift, hip, bob, swing, lean, sway=0.0, track=HIP_X, tilt=0.0, roll=None, elbow=0.05):
    """A gait cycle. sway shifts the hips sideways over each planted foot, track is how far
    out from the middle the feet land (less than the hips' width puts them nearly in a line),
    and tilt rolls the torso towards the planted side. roll, if given, is the share of the
    cycle each foot is down in the heel-to-toe gait (rolling) instead of the plain one; a
    negative bob puts the hips lowest over the planted foot (running). elbow is how bent
    the forearms hang."""
    stride = speed * seconds
    reach = stride * duty / 2
    foot = (lambda p: rolling(p, stride, lift, off=roll)) if roll else (lambda p: gait(p, stride, duty, lift))
    middle = 0.4 * roll if roll else duty / 2

    def pose(t):
        p = t / seconds
        result = {}
        # Highest over each planted foot, lowest as the weight changes feet,
        # and swayed across over whichever foot is down.
        height = hip + bob * math.cos(4 * math.pi * (p - middle))
        across = sway * math.cos(2 * math.pi * (p - middle))
        result['hips'] = {'location': (across, height - HIP, 0)}
        feet = {}
        for side, offset, s in (('R', 0, 1), ('L', 0.5, -1)):
            y, up, pitch, *knee = foot((p + offset) % 1)
            feet[side] = y
            # The leg angles in from the hip to where the foot lands, and is
            # solved in that slanted plane.
            out = s * track - (s * HIP_X + across)
            drop = height + LEG_TOP - HIP - (ANKLE + up)
            roll = math.atan2(-out, drop)
            # The foot is kept flat, whatever the leg's angle.
            result.update(leg(side, ANKLE + up + math.hypot(drop, out) - (LEG_TOP - HIP), y, ANKLE + up, pitch, roll, level=True,
                              knee=knee[0] if knee else 0.0))
        # The shoulders turn against the hips and the torso rolls over the
        # planted foot; the head stays nearly level. Each arm swings against
        # its leg, the forearm trailing.
        twist = -0.07 * feet['R'] / reach
        lean_over = tilt * across / sway if sway else 0.0
        result['spine'] = {'rotation': (-lean, twist, -lean_over)}
        result['head'] = {'rotation': (lean * 0.7, -twist * 0.8, lean_over * 0.8)}
        for side in ('R', 'L'):
            later = foot((p - 0.06 + (0 if side == 'R' else 0.5)) % 1)[0]
            angle = -swing * later / reach + lean
            result[f'upperarm.{side}'] = {'rotation': (angle, 0, 0)}
            result[f'forearm.{side}'] = {'rotation': (elbow + 0.6 * max(0, angle - lean), 0, 0)}
            result[f'hand.{side}'] = {'rotation': (0.05, 0, 0)}
        return result
    return seconds, pose, stride


def idle():
    seconds = 4

    def pose(t):
        p = t / seconds
        breathe = math.sin(2 * math.pi * p)
        # Standing tall, the legs all but straight.
        height = 1.68 + 0.008 * breathe
        result = {'hips': {'location': (0, height - HIP, 0)}}
        for side, y in (('R', 0.03), ('L', -0.03)):
            result.update(leg(side, height, y, ANKLE))
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
            result.update(leg(side, height, 0.03, ANKLE + up))
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
            result.update(leg(side, height, y, ANKLE + up, 0.4 * math.sin(math.pi * q)))
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
    # The walk follows Andrew's film clip: slow and heavy, 1.2 s a step, long
    # straight-legged strides rolling heel to toe, the back leg trailing far
    # behind on its toe, the swing low with little knee; the body tall and
    # level, swaying over each foot, the feet landing a little inside the
    # hips, and the arms hanging loose.
    'walk': walking(2.4, 1.1, 0.55, 0.1, 1.645, 0.055, 0.08, 0.02, sway=0.08, track=0.21, tilt=0.05, roll=0.62),
    # The run: the same heavy heel-to-toe roll, a long loping stride with both
    # feet briefly off the ground, sinking a little onto each foot, leaning
    # in, the arms swinging loose from bent elbows.
    'run': walking(1.0, 3.0, 0.4, 0.3, 1.63, -0.04, 0.18, 0.08, sway=0.04, track=0.2, tilt=0.03, roll=0.4, elbow=0.35),
    'turn': turn(),
    'push': push(),
    'stepOver': step_over(),
}


def level(rig, keys):
    """Turn any {'level': pitch} key into the rotation that leaves that bone (a foot) level
    across, pitched only about x, given its parents' keys."""
    def basis(name):
        key = keys.get(name, {})
        x, up, forward = key.get('location', (0, 0, 0))
        translate = Matrix.Translation((x, up, -forward)) if name == 'hips' else Matrix.Identity(4)
        return translate @ Euler(key.get('rotation', (0, 0, 0)), 'XYZ').to_matrix().to_4x4()

    def posed(bone):
        rest = bone.bone.matrix_local
        if not bone.parent:
            return rest @ basis(bone.name)
        return posed(bone.parent) @ bone.parent.bone.matrix_local.inverted() @ rest @ basis(bone.name)

    for name, key in keys.items():
        if 'level' not in key:
            continue
        bone = rig.pose.bones[name]
        rest = bone.bone.matrix_local
        frame = posed(bone.parent) @ bone.parent.bone.matrix_local.inverted() @ rest
        want = Matrix.Translation(frame.translation) @ Matrix.Rotation(key['level'], 4, 'X') @ rest.to_3x3().to_4x4()
        key['rotation'] = tuple((frame.inverted() @ want).to_euler('XYZ'))


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
            level(rig, keys)
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
