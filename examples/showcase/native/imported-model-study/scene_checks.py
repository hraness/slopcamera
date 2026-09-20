"""Native observations shared by initial import and explicit saved-scene inspection."""
import hashlib
import json
import struct
from pathlib import Path

import bpy
from mathutils import Vector


def mesh_hashes(obj):
    geometry, shading, uv = (hashlib.sha256() for _ in range(3))
    mesh = obj.data
    for vertex in mesh.vertices:
        geometry.update(struct.pack("<3d", *vertex.co))
    for polygon in mesh.polygons:
        geometry.update(struct.pack("<I", len(polygon.vertices)))
        geometry.update(struct.pack("<" + "I" * len(polygon.vertices), *polygon.vertices))
        shading.update(struct.pack("<?", polygon.use_smooth))
    shading.update(struct.pack("<?", mesh.has_custom_normals))
    shading.update(mesh.normals_domain.encode("ascii"))
    for normals in (mesh.vertex_normals, mesh.polygon_normals, mesh.corner_normals):
        shading.update(struct.pack("<I", len(normals)))
        for value in normals:
            shading.update(struct.pack("<3d", *value.vector))
    for edge in mesh.edges:
        shading.update(struct.pack("<?", edge.use_edge_sharp))
    if len(mesh.uv_layers) != 1:
        raise ValueError("Expected one original UV layer")
    for corner in mesh.uv_layers.active.data:
        uv.update(struct.pack("<2d", *corner.uv))
    return {"geometry": geometry.hexdigest(), "shading": shading.hexdigest(), "uv": uv.hexdigest()}


def imported_fidelity(obj, decoded, facts):
    """Compare oriented world-space triangle corners, independent of vertex indexing."""
    mesh = obj.data
    mesh.calc_loop_triangles()
    if len(mesh.vertices) != 24 or len(mesh.loop_triangles) != 12 or len(mesh.uv_layers) != 1:
        raise ValueError("Importer changed original mesh structure")
    def converted(v):
        return Vector((v[0], -v[2], v[1]))
    expected = []
    for start in range(0, 36, 3):
        expected.append([(converted(decoded["positions"][index]), converted(decoded["normals"][index]),
                          Vector((decoded["uvs"][index][0], 1 - decoded["uvs"][index][1])))
                         for index in decoded["indices"][start:start + 3]])
    normal_matrix = obj.matrix_world.to_3x3().inverted().transposed()
    actual = []
    for triangle in mesh.loop_triangles:
        actual.append([(obj.matrix_world @ mesh.vertices[mesh.loops[index].vertex_index].co,
                        (normal_matrix @ mesh.corner_normals[index].vector).normalized(),
                        mesh.uv_layers.active.data[index].uv.copy()) for index in triangle.loops])
    remaining = list(actual)
    maximum_position_error = maximum_uv_error = maximum_normal_error = 0.0
    for triangle in expected:
        matches = []
        for index, observed in enumerate(remaining):
            for rotation in range(3):
                aligned = observed[rotation:] + observed[:rotation]
                p = max((a[0] - b[0]).length for a, b in zip(triangle, aligned))
                n = max((a[1] - b[1]).length for a, b in zip(triangle, aligned))
                u = max((a[2] - b[2]).length for a, b in zip(triangle, aligned))
                if p <= facts["model"]["boundToleranceMeters"] and u <= facts["model"]["uvTolerance"] and n <= 1e-6:
                    matches.append((index, p, n, u))
        if len(matches) != 1:
            raise ValueError("Imported oriented triangle/UV correspondence is not unique")
        index, p, n, u = matches[0]
        remaining.pop(index)
        maximum_position_error, maximum_normal_error, maximum_uv_error = max(maximum_position_error, p), max(maximum_normal_error, n), max(maximum_uv_error, u)
    points = [obj.matrix_world @ vertex.co for vertex in mesh.vertices]
    observed_bounds = {"minimum": [min(p[a] for p in points) for a in range(3)],
                       "maximum": [max(p[a] for p in points) for a in range(3)]}
    for edge in ("minimum", "maximum"):
        if max(abs(a - b) for a, b in zip(observed_bounds[edge], facts["model"]["blenderBounds"][edge])) > facts["model"]["boundToleranceMeters"]:
            raise ValueError("Imported model bounds changed")
    return {"bounds": observed_bounds, "triangles": 12, "vertices": 24,
            "maximumPositionErrorMeters": maximum_position_error, "maximumUvError": maximum_uv_error,
            "maximumNormalError": maximum_normal_error, "orientedTrianglesMatched": 12}


def texture_state(obj, facts, original, pack=False):
    if len(obj.data.materials) != 1:
        raise ValueError("Expected one original material")
    mat = obj.data.materials[0]
    if not mat.use_nodes:
        raise ValueError("Imported material lost its node shader")
    nodes = list(mat.node_tree.nodes)
    image_nodes = [n for n in nodes if n.type == "TEX_IMAGE"]
    shaders = [n for n in nodes if n.type == "BSDF_PRINCIPLED"]
    if len(image_nodes) != 1 or len(shaders) != 1:
        raise ValueError("Unexpected imported material/image graph")
    node, shader = image_nodes[0], shaders[0]
    if not any(link.from_node == node and link.from_socket.name == "Color" and link.to_node == shader and link.to_socket.name == "Base Color" for link in mat.node_tree.links):
        raise ValueError("Original image is not connected to base color")
    if abs(shader.inputs["Metallic"].default_value) > 1e-8 or abs(shader.inputs["Roughness"].default_value - .62) > 1e-6:
        raise ValueError("Original matte material changed")
    image = node.image
    if image is None or image.is_dirty or tuple(image.size) != (2048, 2048) or image.colorspace_settings.name != "sRGB":
        raise ValueError("Unexpected imported texture state")
    if image.packed_file:
        imported_bytes = bytes(image.packed_file.data)
    else:
        path = Path(bpy.path.abspath(image.filepath, library=image.library))
        if image.source != "FILE" or not path.is_absolute() or path.is_symlink() or path.resolve(strict=True) != path or path.stat().st_size > 1024 * 1024:
            raise ValueError("Unpacked texture is not a bounded physical source")
        imported_bytes = path.read_bytes()
    if imported_bytes != original or hashlib.sha256(imported_bytes).hexdigest() != facts["texture"]["sha256"]:
        raise ValueError("Importer did not retain the exact original PNG")
    if pack and not image.packed_file:
        image.pack()
    if not image.packed_file or bytes(image.packed_file.data) != original:
        raise ValueError("Native scene does not contain the exact packed PNG")
    return {"name": image.name, "bytes": len(original), "sha256": hashlib.sha256(original).hexdigest(),
            "width": image.size[0], "height": image.size[1], "channels": image.channels,
            "colorSpace": image.colorspace_settings.name, "packed": True,
            "material": mat.name, "imageBaseColorConnected": True}, image


def closure(image):
    if bpy.data.libraries or bpy.data.volumes or bpy.data.movieclips or bpy.data.sounds or bpy.data.texts:
        raise ValueError("Unexpected native library/volume/media/script dependency")
    if any(obj.type == "FONT" or obj.library or obj.constraints or obj.modifiers for obj in bpy.data.objects):
        raise ValueError("Unexpected font/library/constraint/modifier dependency")
    for group in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.scenes, bpy.data.worlds, bpy.data.cameras, bpy.data.lights):
        for item in group:
            animation = getattr(item, "animation_data", None)
            if animation and animation.drivers:
                raise ValueError("Unexpected Python or expression driver")
    if any(item != image and item.source not in {"VIEWER"} for item in bpy.data.images):
        raise ValueError("Unexpected scene image dependency")
    if bpy.context.scene.sequence_editor or bpy.context.scene.use_nodes:
        raise ValueError("Unexpected sequencer or compositor dependency")
    return {"externalDependencies": [], "libraries": 0, "volumes": 0, "mediaInputs": 0,
            "fontObjects": 0, "embeddedTextScripts": 0, "drivers": 0, "packedImages": 1,
            "runtimeHermetic": False}


def stored_json(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)
