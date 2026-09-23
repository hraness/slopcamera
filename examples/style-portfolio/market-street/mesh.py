"""Small deterministic mesh batches for an authored Blender scene.

Static street details share a mesh per material. Moving figures and vehicles
keep their own batches so animation never needs a scene-wide object search.
"""

import math

import bpy
from mathutils import Euler, Vector


class Batch:
    def __init__(self, name):
        self.name = name
        self.groups = {}

    def mesh(self, material, vertices, faces, smooth=False):
        group = self.groups.setdefault(material.name, [material, [], [], []])
        offset = len(group[1])
        group[1].extend(vertices)
        face_list = list(faces)
        group[2].extend(tuple(offset + i for i in face) for face in face_list)
        group[3].extend([smooth] * len(face_list))

    def box(self, material, center, size, rotation=None):
        x, y, z = center
        dx, dy, dz = (s / 2 for s in size)
        points = [Vector((sx * dx, sy * dy, sz * dz))
                  for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
        if rotation:
            transform = Euler(rotation).to_matrix()
            points = [transform @ p for p in points]
        vertices = [(x + p.x, y + p.y, z + p.z) for p in points]
        self.mesh(material, vertices, [(0, 1, 3, 2), (4, 6, 7, 5),
                                      (0, 4, 5, 1), (2, 3, 7, 6),
                                      (0, 2, 6, 4), (1, 5, 7, 3)])

    def cone(self, material, center, radius, height, top=None, segments=12,
             rotation=None, smooth=False):
        if top is None:
            top = radius
        matrix = Euler(rotation).to_matrix() if rotation else None
        origin = Vector(center)
        vertices = []
        for z, r in ((-height / 2, radius), (height / 2, top)):
            for index in range(segments):
                angle = math.tau * index / segments
                point = Vector((r * math.cos(angle), r * math.sin(angle), z))
                vertices.append(tuple(origin + (matrix @ point if matrix else point)))
        faces = [tuple(reversed(range(segments))), tuple(range(segments, segments * 2))]
        faces += [(i, (i + 1) % segments, (i + 1) % segments + segments, i + segments)
                  for i in range(segments)]
        self.mesh(material, vertices, faces, smooth=smooth)

    def ellipsoid(self, material, center, radii, segments=14, rings=8):
        x, y, z = center
        a, b, c = radii
        vertices = [(x, y, z + c)]
        for ring in range(1, rings):
            phi = math.pi * ring / rings
            for index in range(segments):
                theta = math.tau * index / segments
                vertices.append((x + a * math.sin(phi) * math.cos(theta),
                                 y + b * math.sin(phi) * math.sin(theta),
                                 z + c * math.cos(phi)))
        bottom = len(vertices)
        vertices.append((x, y, z - c))
        faces = [(0, 1 + i, 1 + (i + 1) % segments) for i in range(segments)]
        for ring in range(rings - 2):
            first = 1 + ring * segments
            next_ring = first + segments
            faces.extend((first + i, next_ring + i, next_ring + (i + 1) % segments,
                          first + (i + 1) % segments) for i in range(segments))
        first = 1 + (rings - 2) * segments
        faces.extend((first + i, bottom, first + (i + 1) % segments)
                     for i in range(segments))
        self.mesh(material, vertices, faces, smooth=True)

    def beam(self, material, start, end, radius, segments=8):
        delta = Vector(end) - Vector(start)
        self.cone(material, tuple((Vector(start) + Vector(end)) / 2), radius,
                  delta.length, segments=segments,
                  rotation=delta.to_track_quat('Z', 'Y').to_euler(), smooth=True)

    def wheel(self, material, center, radius, width=0.075, spokes=12):
        """An open spoked wheel with its axle along X."""
        x, y, z = center
        vertices, faces = [], []
        segments = 36
        for i in range(segments):
            theta = math.tau * i / segments
            for dx, r in ((-width / 2, radius), (width / 2, radius),
                          (-width / 2, radius - 0.055), (width / 2, radius - 0.055)):
                vertices.append((x + dx, y + r * math.sin(theta), z + r * math.cos(theta)))
        for i in range(segments):
            a, b = i * 4, ((i + 1) % segments) * 4
            faces.extend(((a, b, b + 1, a + 1), (a + 2, a + 3, b + 3, b + 2),
                          (a, a + 2, b + 2, b), (a + 1, b + 1, b + 3, a + 3)))
        self.mesh(material, vertices, faces)
        for i in range(spokes):
            angle = math.tau * i / spokes
            self.beam(material, center, (x, y + (radius - .045) * math.sin(angle),
                                         z + (radius - .045) * math.cos(angle)), .025, 6)
        self.cone(material, center, .095, width * 2.5, segments=12,
                  rotation=(0, math.pi / 2, 0))

    def finish(self, parent=None):
        objects = []
        for material, vertices, faces, smooth in self.groups.values():
            mesh = bpy.data.meshes.new(self.name + ' / ' + material.name)
            mesh.from_pydata(vertices, [], faces)
            mesh.update()
            mesh.materials.append(material)
            obj = bpy.data.objects.new(mesh.name, mesh)
            bpy.context.collection.objects.link(obj)
            for poly, enabled in zip(mesh.polygons, smooth):
                poly.use_smooth = enabled
            if parent:
                obj.parent = parent
            objects.append(obj)
        return objects


def empty(name, parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    return obj


def text_label(name, text, location, normal, size, material, parent=None):
    curve = bpy.data.curves.new(name, 'FONT')
    curve.body = text
    curve.align_x = 'CENTER'
    curve.size = size
    curve.extrude = 0
    curve.space_character = 1.06
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = Vector(normal).to_track_quat('Z', 'Y').to_euler()
    obj.data.materials.append(material)
    obj.parent = parent
    return obj
