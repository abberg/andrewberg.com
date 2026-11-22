# Builds the walking character in Blender from scratch: run it in Blender's
# Python (Scripting tab, or exec(open(path).read())).
#
# Step 1, the blockout: every part is its own object, lofted from a few rings,
# so proportions are easy to change here before anything is joined or rigged.
#
# Blender is z up and the character faces -y (Blender's front view), which the
# glTF exporter turns into three.js's y up, facing +z. 1 unit = 1 m; it stands
# about 1.8 m tall with its feet at the origin. Sizes are measured off the
# front and back references (reference/), about 0.0034 m to the pixel.
import math
import os
import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else bpy.path.abspath('//')
COLLECTION = 'Character'
SEGMENTS = 24

BLACK = (0.02, 0.02, 0.022, 1)


def clear():
    for collection in [c for c in bpy.data.collections if c.name == COLLECTION]:
        for object in list(collection.objects):
            bpy.data.objects.remove(object)
        bpy.data.collections.remove(collection)
    for block in (bpy.data.meshes, bpy.data.materials):
        for item in [i for i in block if i.users == 0]:
            block.remove(item)


def material(name, colour, roughness=0.85):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes['Principled BSDF']
    shader.inputs['Base Color'].default_value = colour
    shader.inputs['Roughness'].default_value = roughness
    mat.diffuse_color = colour
    return mat


def aim(origin, target):
    """A frame at origin whose z axis points at target."""
    direction = Vector(target) - Vector(origin)
    return Matrix.Translation(origin) @ direction.to_track_quat('Z', 'Y').to_matrix().to_4x4()


def loft(name, rings, frame=None, power=2.0, mat=None, subdivide=1):
    """A skin over rings along the local z axis.

    Each ring is (z, rx, ry) or (z, rx, ry, x, y): its height, its half
    widths, and where its centre sits. A ring with no width is a point.
    power 2 is an ellipse; higher is boxier.
    """
    bm = bmesh.new()
    loops = []
    for ring in rings:
        z, rx, ry = ring[:3]
        ox, oy = ring[3:5] if len(ring) > 3 else (0, 0)
        if rx == 0 and ry == 0:
            loops.append([bm.verts.new((ox, oy, z))])
            continue
        loop = []
        for i in range(SEGMENTS):
            a = 2 * math.pi * i / SEGMENTS
            c, s = math.cos(a), math.sin(a)
            x = math.copysign(abs(c) ** (2 / power), c) * rx
            y = math.copysign(abs(s) ** (2 / power), s) * ry
            loop.append(bm.verts.new((ox + x, oy + y, z)))
        loops.append(loop)
    for lower, upper in zip(loops, loops[1:]):
        for i in range(SEGMENTS):
            j = (i + 1) % SEGMENTS
            if len(lower) == 1:
                bm.faces.new((lower[0], upper[j], upper[i]))
            elif len(upper) == 1:
                bm.faces.new((lower[i], lower[j], upper[0]))
            else:
                bm.faces.new((lower[i], lower[j], upper[j], upper[i]))
    # Flat caps on open ends.
    if len(loops[0]) > 1:
        bm.faces.new(reversed(loops[0]))
    if len(loops[-1]) > 1:
        bm.faces.new(loops[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.materials.append(mat or material('Black', BLACK))
    object = bpy.data.objects.new(name, mesh)
    object.matrix_world = frame or Matrix()
    bpy.data.collections[COLLECTION].objects.link(object)
    if subdivide:
        object.modifiers.new('Subdivision', 'SUBSURF').levels = subdivide
    return object


def tube(name, bezier, start, end, slice_x=None, steps=28, cap=0.006):
    """A round tube swept along a quadratic bezier, its radius going from start to end.

    The far end is cut square, its rim eased by cap. With slice_x the near
    end is cut straight down instead, by the vertical plane at that x: the
    tube runs on past the bezier's start and everything nearer the body than
    the plane is sliced off, leaving a flat cap facing the body.
    """
    p0, p1, p2 = bezier
    side = (p1 - p0).cross(p2 - p1).normalized()
    first = -0.35 if slice_x is not None else 0
    bm = bmesh.new()
    loops = []
    for step in range(steps + 1):
        t = first + (1 - first) * step / steps
        centre = (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t * t * p2
        tangent = ((1 - t) * (p1 - p0) + t * (p2 - p1)).normalized()
        inside = side.cross(tangent)
        radius = start + (end - start) * t
        loops.append([bm.verts.new(centre + radius * (math.cos(a) * inside + math.sin(a) * side))
                      for a in (2 * math.pi * i / SEGMENTS for i in range(SEGMENTS))])
    # The square end: ease the rim, then close it.
    last = loops[-1]
    middle = sum((v.co for v in last), Vector()) / SEGMENTS
    loops.append([bm.verts.new(v.co + (middle - v.co).normalized() * cap + tangent * cap) for v in last])
    for lower, upper in zip(loops, loops[1:]):
        for i in range(SEGMENTS):
            j = (i + 1) % SEGMENTS
            bm.faces.new((lower[i], lower[j], upper[j], upper[i]))
    bm.faces.new(loops[-1])
    if slice_x is None:
        bm.faces.new(loops[0])
    else:
        outward = 1 if p2.x > 0 else -1
        cut = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(slice_x, 0, 0),
                                     plane_no=(-outward, 0, 0), clear_outer=True)
        bmesh.ops.holes_fill(bm, edges=[e for e in cut['geom_cut'] if isinstance(e, bmesh.types.BMEdge)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.set_sharp_from_angle(angle=math.radians(40))
    mesh.materials.append(material('Black', BLACK))
    object = bpy.data.objects.new(name, mesh)
    bpy.data.collections[COLLECTION].objects.link(object)
    return object


# The hand's outline, traced off the scan's left hand: (x, z), x out from the
# wrist and z running down from it. A long finger slanting in to a point under
# the wrist, and a short thumb split from it by a notch, its outer edge
# upright. The corners are the points the curve doesn't round: the finger's
# tip, the notch and the thumb's tip.
HAND = [(0.026, 0.001), (0.075, 0.025), (0.103, 0.049), (0.105, 0.073), (0.097, 0.097), (0.089, 0.121),
        (0.081, 0.145), (0.073, 0.169), (0.065, 0.193), (0.055, 0.217), (0.046, 0.241), (0.035, 0.265),
        (0.024, 0.289), (0.012, 0.313), (-0.002, 0.337), (-0.020, 0.360), (-0.024, 0.346), (-0.020, 0.322),
        (-0.015, 0.298), (-0.010, 0.274), (-0.006, 0.250), (-0.003, 0.226), (-0.004, 0.202), (-0.006, 0.178),
        (-0.012, 0.154), (-0.023, 0.137), (-0.039, 0.151), (-0.059, 0.175), (-0.077, 0.199), (-0.084, 0.207),
        (-0.094, 0.181), (-0.096, 0.157), (-0.096, 0.133), (-0.094, 0.109), (-0.091, 0.085), (-0.087, 0.061),
        (-0.069, 0.037), (-0.035, 0.013), (-0.000, 0.001)]
HAND_CORNERS = (15, 25, 29)


HAND_DEPTH = 0.08  # front to back, at the top


def hand_taper(x, z):
    """The hand is a wedge: full depth across the top, thinning steadily to
    a quarter of it at the fingertip."""
    return 1 - 0.75 * min(max((z - 0.05) / 0.31, 0), 1)


def smooth_outline(points, corners, steps=5):
    """A closed Catmull-Rom curve through the points, creased at the corners."""
    points = [Vector(p) for p in points]
    count = len(points)
    start = corners[0]
    order = [(start + i) % count for i in range(count + 1)]
    out = []
    for n in range(count):
        i1, i2 = order[n], order[n + 1]
        p1, p2 = points[i1], points[i2]
        # At a corner the curve leaves along the edge rather than through it.
        p0 = p1 + (p1 - p2) if i1 in corners else points[(i1 - 1) % count]
        p3 = p2 + (p2 - p1) if i2 in corners else points[(i2 + 1) % count]
        for step in range(steps):
            t = step / steps
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    return out


def slab(name, outline, corners, depth, frame, soften=0.016, spacing=0.008, rings=5, taper=None):
    """An outline in the local xz plane extruded along y, its edges softened.

    The faces are flat, and round over into the sides on a quarter circle of
    radius soften. The faces are meshed from the outline, rows of points
    stepping in from it across the rounding, and a grid over the flat middle.

    taper(x, z) gives the share of the full depth the slab has at a point,
    to make it a wedge. Where that leaves it thinner than the rounding, the
    rounding shrinks to fit.
    """
    from mathutils.geometry import delaunay_2d_cdt, intersect_point_line
    # Evenly spaced round the rim, so the rows stepping in from it mesh cleanly.
    rim = []
    curve = smooth_outline(outline, corners, steps=8)
    for i, point in enumerate(curve):
        following = curve[(i + 1) % len(curve)]
        pieces = max(1, math.ceil((following - point).length / (spacing * 0.75)))
        rim.extend(point.lerp(following, k / pieces) for k in range(pieces))
    count = len(rim)

    def distance(point):
        best = 1e9
        for i in range(count):
            a, b = rim[i], rim[(i + 1) % count]
            closest, t = intersect_point_line(point, a, b)
            closest = a if t < 0 else b if t > 1 else closest
            best = min(best, (point - closest).length)
        return best

    area = sum(rim[i].cross(rim[(i + 1) % count]) for i in range(count))
    turn = 1 if area > 0 else -1
    points = list(rim)
    for i in range(count):
        tangent = (rim[(i + 1) % count] - rim[i - 1]).normalized()
        inward = Vector((-tangent.y, tangent.x)) * turn
        for ring in range(1, rings + 1):
            inset = soften * (1 - math.cos(math.pi / 2 * ring / rings))
            point = rim[i] + inward * inset
            # Where the outline is tight (the tips, the notch) rows from either side cross.
            if distance(point) > inset * 0.9:
                points.append(point)
    xs, zs = [p.x for p in rim], [p.y for p in rim]
    x, row = min(xs), 0
    while x < max(xs):
        z = min(zs) + (spacing / 2 if row % 2 else 0)
        while z < max(zs):
            if distance(Vector((x, z))) > soften + spacing * 0.5:
                points.append(Vector((x, z)))
            z += spacing
        x += spacing * 0.866
        row += 1
    verts, _, faces, *_ = delaunay_2d_cdt(points, [(i, (i + 1) % count) for i in range(count)], [], 1, 1e-5)
    used = {i for face in faces for i in face}

    bm = bmesh.new()
    rims = []
    for sign in (1, -1):
        made = {}
        for i in used:
            half = depth / 2 * (taper(verts[i].x, verts[i].y) if taper else 1)
            round_ = min(soften, half * 0.8)
            k = min(distance(verts[i]) / round_, 1)
            y = half - round_ + round_ * math.sqrt(1 - (1 - k) ** 2)
            made[i] = bm.verts.new((verts[i].x, sign * y, verts[i].y))
        for face in faces:
            bm.faces.new([made[i] for i in (face if sign > 0 else reversed(face))])
        rims.append([made[i] for i in range(count)])
    for i in range(count):
        j = (i + 1) % count
        bm.faces.new((rims[0][i], rims[0][j], rims[1][j], rims[1][i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.materials.append(material('Black', BLACK))
    object = bpy.data.objects.new(name, mesh)
    object.matrix_world = frame
    bpy.data.collections[COLLECTION].objects.link(object)
    return object


REFERENCE = 'Tripo'


def reference():
    """The scan of the figure, as separate parts by name: torso, head, legs,
    sleeve.L, hand.R and so on.

    It is the mesh Tripo made from four photos (tripo.mjs, saved to
    tripo/model.glb): the right shapes, but soft and lumpy, and in the
    photos' striding pose. Brought in once, stood 1.8 m tall facing -y, and
    split into its loose parts, in a collection that stays out of renders.
    """
    collection = bpy.data.collections.get(REFERENCE)
    if not collection:
        collection = bpy.data.collections.new(REFERENCE)
        bpy.context.scene.collection.children.link(collection)
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(HERE, 'tripo', 'model.glb'))
        scan = next(o for o in bpy.data.objects if o not in before and o.type == 'MESH')
        for object in [o for o in bpy.data.objects if o not in before and o is not scan]:
            bpy.data.objects.remove(object)
        # The scan is 1 unit tall, centred on the origin, facing +x.
        scan.data.transform(Matrix.Translation((0, 0, 0.9)) @ Matrix.Rotation(-math.pi / 2, 4, 'Z')
                            @ Matrix.Scale(1.8, 4))
        scan.matrix_world = Matrix()
        bm = bmesh.new()
        bm.from_mesh(scan.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        # One object per loose part, named by its size and where it sits.
        left = set(bm.verts)
        while left:
            part, stack = set(), [next(iter(left))]
            while stack:
                vert = stack.pop()
                if vert in part:
                    continue
                part.add(vert)
                stack.extend(edge.other_vert(vert) for edge in vert.link_edges)
            left -= part
            if len(part) < 10:
                continue
            x = sum(v.co.x for v in part) / len(part)
            z = sum(v.co.z for v in part) / len(part)
            side = 'L' if x > 0 else 'R'
            name = ('torso' if len(part) > 600 else 'head' if len(part) > 450 else 'legs' if len(part) > 350
                    else f'rod.{side}' if len(part) < 60 else f'hand.{side}' if z < 0.5 else f'sleeve.{side}')
            piece = bmesh.new()
            copies = {v: piece.verts.new(v.co) for v in part}
            for face in {f for v in part for f in v.link_faces}:
                piece.faces.new([copies[v] for v in face.verts])
            mesh = bpy.data.meshes.new(f'tripo.{name}')
            piece.to_mesh(mesh)
            piece.free()
            object = bpy.data.objects.new(f'tripo.{name}', mesh)
            object.hide_render = True
            collection.objects.link(object)
        bm.free()
        bpy.data.objects.remove(scan)
    return {o.name.split('.', 1)[1]: o for o in collection.objects}


def adopt(name, source, tidy=None, crease=32, levels=2):
    """A part taken from the scan as it is, then rounded.

    The scan's parts are few, flat triangles. Subdividing rounds them into
    the smooth forms they stand for, and creasing the edges where its faces
    meet at more than crease degrees keeps those edges crisp. tidy(bm) can
    correct the copy first.
    """
    bm = bmesh.new()
    bm.from_mesh(source.data)
    if tidy:
        tidy(bm)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    layer = bm.edges.layers.float.get('crease_edge') or bm.edges.layers.float.new('crease_edge')
    for edge in bm.edges:
        if len(edge.link_faces) == 2 and edge.calc_face_angle() > math.radians(crease):
            edge[layer] = 1
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.materials.append(material('Black', BLACK))
    object = bpy.data.objects.new(name, mesh)
    bpy.data.collections[COLLECTION].objects.link(object)
    object.modifiers.new('Subdivision', 'SUBSURF').levels = levels
    return object


def shallow_bib(bm, keep=0.25):
    """The sunken panel under the neck is far deeper in the scan than on the
    figure. Brings its floor forward until the step round it is keep of what
    it was.

    The floor's edge points each sit beside a point on the rim, a step
    further forward: those move most of the way to their rim point, and the
    floor between them follows. The panel's upper left side (the figure's)
    has no step in the scan, so it stays put, and the lift fades out at the neck.
    """
    front = [v for v in bm.verts if -0.14 < v.co.x < 0.16 and 1.04 < v.co.z < 1.36 and v.co.y < 0.03]
    lift = {}
    for vert in front:
        steps = [vert.co.y - other.co.y for other in front
                 if other is not vert and math.hypot(other.co.x - vert.co.x, other.co.z - vert.co.z) < 0.02]
        if steps and max(steps) > 0.006:
            lift[vert] = -max(steps) * (1 - keep)
    rim = {other for vert in lift for other in front
           if math.hypot(other.co.x - vert.co.x, other.co.z - vert.co.z) < 0.02 and vert.co.y - other.co.y > 0.006}
    for vert in front:
        if vert.co.x > 0.09 and vert.co.z > 1.2:
            lift.setdefault(vert, 0)
    anchors = list(lift.items())
    for vert in front:
        inside = -0.09 < vert.co.x < 0.125 and vert.co.z > 1.09 and vert.normal.y < -0.3
        if vert in lift or vert in rim or not inside:
            continue
        weights = [(1 / (math.hypot(a.co.x - vert.co.x, a.co.z - vert.co.z) ** 2 + 1e-6), d) for a, d in anchors]
        lift[vert] = sum(w * d for w, d in weights) / sum(w for w, d in weights)
    for vert, amount in lift.items():
        vert.co.y += amount * min(max((1.34 - vert.co.z) / 0.04, 0), 1)


def melt(name, objects, voxel=0.008, smooth=12):
    """Several overlapping parts made one surface, with the creases where
    they met smoothed into fillets."""
    bm = bmesh.new()
    for object in objects:
        part = object.data.copy()
        part.transform(object.matrix_world)
        bm.from_mesh(part)
        bpy.data.meshes.remove(part)
        bpy.data.objects.remove(object)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(material('Black', BLACK))
    object = bpy.data.objects.new(name, mesh)
    bpy.data.collections[COLLECTION].objects.link(object)
    remesh = object.modifiers.new('Remesh', 'REMESH')
    remesh.mode = 'VOXEL'
    remesh.voxel_size = voxel
    remesh.use_smooth_shade = True
    soften = object.modifiers.new('Smooth', 'SMOOTH')
    soften.factor = 0.5
    soften.iterations = smooth
    # The voxels leave far more triangles than a smooth form needs.
    object.modifiers.new('Decimate', 'DECIMATE').ratio = 0.12
    return object


def build():
    clear()
    collection = bpy.data.collections.new(COLLECTION)
    bpy.context.scene.collection.children.link(collection)

    # Head and ears: the scan's, one rigid piece.
    adopt('head', reference()['head'])

    # Torso: the scan's, which has the chest plate's lopsided zigzag edge and
    # the coat's hem as they are on the figure.
    adopt('torso', reference()['torso'], tidy=shallow_bib)
    # Pelvis and legs: one continuous surface. Three plain forms, the pelvis
    # up inside the coat and a carrot for each leg standing straight (the scan
    # has them mid stride), melted together where they overlap so the thighs
    # flow into the hips as they do on the figure.
    # The pelvis sits on top of the legs, staying inside the thighs lower
    # down so nothing bulges between them: the crotch is just where the two
    # legs part. It swells out behind. The
    # swell is fullest high up, just under the coat's hem (0.68 m, where the
    # scan's is), and falls away below it in one long curve into the legs.
    # (z, half width, half depth, 0, centre y)
    pieces = [loft('pelvis', [(0.43, 0, 0, 0, 0.065), (0.45, 0.09, 0.06, 0, 0.065), (0.48, 0.15, 0.09, 0, 0.07),
                              (0.53, 0.195, 0.115, 0, 0.08), (0.60, 0.21, 0.14, 0, 0.10),
                              (0.68, 0.205, 0.148, 0, 0.107), (0.75, 0.18, 0.13, 0, 0.10), (0.80, 0, 0, 0, 0.09)],
                   power=2.5, subdivide=0)]
    for sign in (1, -1):
        hip, toe = Vector((sign * 0.108, 0.06, 0.68)), Vector((sign * 0.15, 0.05, 0))
        # Fat thighs tapering to a foot that ends in a rounded nub, not a point.
        length = (toe - hip).length
        pieces.append(loft('leg', [(0, 0, 0), (0.02, 0.06, 0.06), (0.07, 0.105, 0.105), (0.19, 0.12, 0.12),
                                   (0.33, 0.102, 0.102), (0.47, 0.07, 0.07), (0.58, 0.046, 0.046),
                                   (length - 0.04, 0.036, 0.036), (length - 0.016, 0.03, 0.03),
                                   (length - 0.004, 0.017, 0.017), (length, 0, 0)], aim(hip, toe), subdivide=0))
    melt('legs', pieces)

    for side, sign in (('L', 1), ('R', -1)):
        # Sleeve: a plain tube arcing out from the shoulder and coming down
        # near vertical at the cuff. Its top is sliced straight down, leaving a
        # flat cap against the body. Sizes are the scan's, with the arm
        # hanging at the side rather than swung as it is there.
        shoulder, cuff = Vector((sign * 0.185, 0.045, 1.15)), Vector((sign * 0.32, 0.045, 0.68))
        elbow = Vector((sign * 0.31, 0.045, 0.97))  # the arc's control point, not on it
        tube(f'sleeve.{side}', (shoulder, elbow, cuff), 0.055, 0.062, slice_x=sign * 0.148)
        # A thin rod for a forearm, then a two pronged hand.
        wrist = Vector((sign * 0.335, 0.045, 0.45))
        loft(f'rod.{side}', [(0, 0.009, 0.009), ((wrist - cuff).length, 0.009, 0.009)], aim(cuff, wrist), subdivide=0)
        # The hand: its outline extruded and softened, hanging point down.
        # Its frame: z down, x away from the body, so the thumb is on the inside.
        hand = Matrix.Translation(wrist) @ Matrix(((sign, 0, 0), (0, -sign, 0), (0, 0, -1))).transposed().to_4x4()
        slab(f'hand.{side}', HAND, HAND_CORNERS, HAND_DEPTH, hand, taper=hand_taper)


# The skeleton: each bone's name, its parent, and where it pivots. Every bone
# points straight up with no roll, so its own axes are the world's, and after
# export a bone's rotation.x in three.js swings its part forward and back.
BONES = [
    ('hips', None, (0, 0.06, 0.66)),
    ('torso', 'hips', (0, 0.06, 0.72)),
    ('head', 'torso', (0.01, 0.0, 1.33)),
    ('leg.L', 'hips', (0.108, 0.06, 0.62)),
    ('leg.R', 'hips', (-0.108, 0.06, 0.62)),
    # The knees, halfway down. The figure's legs are single carrots, so these
    # only ever bend a little.
    ('shin.L', 'leg.L', (0.129, 0.055, 0.31)),
    ('shin.R', 'leg.R', (-0.129, 0.055, 0.31)),
    ('sleeve.L', 'torso', (0.17, 0.045, 1.2)),
    ('sleeve.R', 'torso', (-0.17, 0.045, 1.2)),
    ('rod.L', 'sleeve.L', (0.32, 0.045, 0.68)),
    ('rod.R', 'sleeve.R', (-0.32, 0.045, 0.68)),
    ('hand.L', 'rod.L', (0.335, 0.045, 0.45)),
    ('hand.R', 'rod.R', (-0.335, 0.045, 0.45)),
]
RIG = 'Rig'


def leg_weights(co):
    """How a point of the legs' surface is shared between the pelvis and the
    legs: all leg below the hips, all pelvis above them, and blended over
    the 16 cm between so the surface bends rather than splits. Across the
    middle, where the legs meet, it passes from one leg to the other."""
    leg = 1 - min(max((co.z - 0.50) / 0.16, 0), 1)
    leg = leg * leg * (3 - 2 * leg)
    left = min(max(co.x / 0.06 + 0.5, 0), 1)
    # Below the knee the shin takes over from the thigh, over a long 18 cm so
    # the leg curves at the knee rather than folding.
    shin = 1 - min(max((co.z - 0.22) / 0.18, 0), 1)
    shin = shin * shin * (3 - 2 * shin)
    return {'hips': 1 - leg, 'leg.L': leg * left * (1 - shin), 'leg.R': leg * (1 - left) * (1 - shin),
            'shin.L': leg * left * shin, 'shin.R': leg * (1 - left) * shin}


# The texture is a sheet of cells, each a flat view of some parts from the
# front: where the cell sits on the sheet (u and v, from the bottom left), and
# the stretch of the figure it shows (x across, z up). The torso and the head
# have a second cell beside the first for their backs, which is blank. These
# match the cells in texture.mjs, which paints the sheet.
CELLS = {
    'torso': ((0, 0.5), (0.5, 1), (-0.25, 0.29), (0.57, 1.38)),
    'head': ((0, 0.5), (0.15, 0.5), (-0.58, 0.55), (1.2, 1.82)),
    'legs': ((0, 0.25), (0, 0.15), (-0.3, 0.3), (0, 0.82)),
    'sleeve': ((0.25, 0.5), (0, 0.15), (-0.42, 0.42), (0.6, 1.3)),
}
BLANK = (0.9, 0.05)  # a spot of plain white, for the rods and hands


def unwrap(part, mesh):
    """Lays a part out on the texture: each point goes where it is seen
    from the front, so paint drawn on the cell lands on the part as it looks
    in a front view, and bands drawn straight across run all the way round."""
    layer = mesh.uv_layers.new(name='UVMap')
    cell = CELLS.get(part.split('.')[0])
    for polygon in mesh.polygons:
        # The figure faces -y.
        behind = part in ('torso', 'head') and polygon.normal.y > 0.2
        for loop in polygon.loop_indices:
            if not cell:
                layer.data[loop].uv = BLANK
                continue
            (u0, u1), (v0, v1), (x0, x1), (z0, z1) = cell
            co = mesh.vertices[mesh.loops[loop].vertex_index].co
            u = u0 + (co.x - x0) / (x1 - x0) * (u1 - u0)
            v = v0 + (co.z - z0) / (z1 - z0) * (v1 - v0)
            layer.data[loop].uv = (u + 0.5 if behind else u, v)


def creases(mesh, reach=0.03):
    """Marks where a part folds in on itself, like the joint of an ear and
    the head, in a second UV layer: 1 on open surface, falling towards 0 in
    the bottom of a crease. The sketch's outline is a copy of the figure
    pushed outwards, and in a crease the two sides push into each other and
    show as a black seam, so it pushes less where this is low.

    A point pushed reach out from open surface is reach from the part. In a
    crease it ends up nearer the opposite wall than that.
    """
    from mathutils.bvhtree import BVHTree
    bm = bmesh.new()
    bm.from_mesh(mesh)
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    open_ = []
    for vertex in mesh.vertices:
        nearest = tree.find_nearest(vertex.co + vertex.normal * reach)
        open_.append(min(nearest[3] / reach, 1) ** 2 if nearest[0] else 1)
    layer = mesh.uv_layers.new(name='Crease')
    for loop in mesh.loops:
        layer.data[loop.index].uv = (open_[loop.vertex_index], 0)


def rig():
    """Joins the parts into one skinned mesh on a skeleton, and exports it
    to build/walker.glb, which optimize.mjs packs into public/walker.glb. Each part follows one bone, but for the legs."""
    for collection in [c for c in bpy.data.collections if c.name == RIG]:
        for object in list(collection.objects):
            bpy.data.objects.remove(object)
        bpy.data.collections.remove(collection)
    collection = bpy.data.collections.new(RIG)
    bpy.context.scene.collection.children.link(collection)

    skeleton = bpy.data.objects.new('Skeleton', bpy.data.armatures.new('Skeleton'))
    collection.objects.link(skeleton)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = skeleton
    bpy.ops.object.mode_set(mode='EDIT')
    for name, parent, pivot in BONES:
        bone = skeleton.data.edit_bones.new(name)
        bone.head = pivot
        bone.tail = Vector(pivot) + Vector((0, 0, 0.1))
        bone.roll = 0
        if parent:
            bone.parent = skeleton.data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')

    # The paint: white, with the line work and bands in a texture.
    paint = bpy.data.materials.get('Paint') or bpy.data.materials.new('Paint')
    paint.use_nodes = True
    nodes = paint.node_tree.nodes
    image = nodes.get('Paint') or nodes.new('ShaderNodeTexImage')
    image.name = 'Paint'
    path = os.path.join(HERE, 'texture', 'paint.png')
    for stale in [i for i in bpy.data.images if i.filepath == path]:
        bpy.data.images.remove(stale)
    image.image = bpy.data.images.load(path)
    shader = nodes['Principled BSDF']
    shader.inputs['Roughness'].default_value = 0.55
    paint.node_tree.links.new(image.outputs['Color'], shader.inputs['Base Color'])

    # A copy of each part with its modifiers worked in, weighted to its bone.
    graph = bpy.context.evaluated_depsgraph_get()
    copies = []
    for part in bpy.data.collections[COLLECTION].objects:
        mesh = bpy.data.meshes.new_from_object(part.evaluated_get(graph))
        mesh.transform(part.matrix_world)
        copy = bpy.data.objects.new(part.name + '.skin', mesh)
        collection.objects.link(copy)
        unwrap(part.name, mesh)
        creases(mesh)
        mesh.materials.clear()
        mesh.materials.append(paint)
        for name, _, _ in BONES:
            copy.vertex_groups.new(name=name)
        for vertex in mesh.vertices:
            weights = leg_weights(vertex.co) if part.name == 'legs' else {part.name: 1}
            for bone, weight in weights.items():
                if weight > 0.001:
                    copy.vertex_groups[bone].add([vertex.index], weight, 'REPLACE')
        copies.append(copy)
    for copy in copies:
        copy.select_set(True)
    bpy.context.view_layer.objects.active = copies[0]
    bpy.ops.object.join()
    skin = copies[0]
    skin.name = 'Walker'
    skin.parent = skeleton
    skin.modifiers.new('Armature', 'ARMATURE').object = skeleton

    skeleton.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(HERE, 'build', 'walker.glb'), use_selection=True,
                              export_yup=True, export_animations=False, export_apply=False)
    for object in collection.objects:
        object.hide_render = True
    return {'vertices': len(skin.data.vertices), 'triangles': sum(len(p.vertices) - 2 for p in skin.data.polygons)}


build()
result = {'objects': len(bpy.data.collections[COLLECTION].objects), **rig()}
