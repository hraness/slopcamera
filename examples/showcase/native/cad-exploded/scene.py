"""Original two-part CAD explanation. Source-authored; native review is pending."""

import hashlib
import json
import struct
from pathlib import Path

import bpy
from mathutils import Vector

from motion import FRAME_COUNT, FRAME_RATE, PAD_TRAVEL_METERS, pad_offset
from studio_scene import reset, material, cube, floor, studio_lights, camera, set_linear_animation


def bounds(obj):
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    low = tuple(min(point[axis] for point in points) for axis in range(3))
    high = tuple(max(point[axis] for point in points) for axis in range(3))
    return {"minimum": low, "maximum": high,
            "dimensions": tuple(b - a for a, b in zip(low, high))}


def geometry_hash(obj):
    digest = hashlib.sha256()
    for vertex in obj.data.vertices:
        digest.update(struct.pack("<3d", *vertex.co))
    for polygon in obj.data.polygons:
        digest.update(struct.pack("<I", len(polygon.vertices)))
        for index in polygon.vertices:
            digest.update(struct.pack("<I", index))
    return digest.hexdigest()


def shading_hash(obj):
    """Bind imported local normals and shading flags; materials are presentation."""
    mesh = obj.data
    digest = hashlib.sha256()
    digest.update(struct.pack("<?", mesh.has_custom_normals))
    digest.update(mesh.normals_domain.encode("ascii") + b"\0")
    for normal_values in (mesh.vertex_normals, mesh.polygon_normals, mesh.corner_normals):
        digest.update(struct.pack("<I", len(normal_values)))
        for value in normal_values:
            digest.update(struct.pack("<3d", *value.vector))
    for polygon in mesh.polygons:
        digest.update(struct.pack("<?", polygon.use_smooth))
    for edge in mesh.edges:
        digest.update(struct.pack("<?", edge.use_edge_sharp))
    return digest.hexdigest()


def emission(name, color):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    result.node_tree.nodes.clear()
    shader = result.node_tree.nodes.new("ShaderNodeEmission")
    shader.inputs["Color"].default_value = (*color, 1)
    shader.inputs["Strength"].default_value = 1
    output = result.node_tree.nodes.new("ShaderNodeOutputMaterial")
    result.node_tree.links.new(shader.outputs["Emission"], output.inputs["Surface"])
    return result


def line(name, points, mat, parent=None):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 1
    curve.bevel_depth = 0.00016
    curve.bevel_resolution = 2
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, coordinates in zip(spline.points, points):
        point.co = (*coordinates, 1)
    result = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(result)
    result.parent = parent
    curve.materials.append(mat)
    return result, spline


def label(name, body, location, mat, parent, size=0.016, align="LEFT"):
    curve = bpy.data.curves.new(name, "FONT")
    curve.body = body
    curve.size = size
    curve.align_x = align
    curve.align_y = "CENTER"
    curve.space_character = 1.05
    curve.extrude = 0
    result = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(result)
    result.parent = parent
    result.location = location
    curve.materials.append(mat)
    return result


def build(context):
    render = context.get("render") or {}
    if (render.get("startFrame", -1) < 0 or render.get("endFrameExclusive", 0) > FRAME_COUNT
            or render.get("width", 0) > 960 or render.get("height", 0) > 540
            or render.get("frameRate") != {"numerator": FRAME_RATE, "denominator": 1}):
        raise ValueError("Use the retained bounded 24fps exploded-assembly jobs")
    root = Path(context["sourceRoot"])
    manifest = json.loads((root / "parts.json").read_text())
    asset_path = root / "assets/baseline.glb"
    asset = asset_path.read_bytes()
    if (len(asset) != manifest["asset"]["bytes"]
            or hashlib.sha256(asset).hexdigest() != manifest["asset"]["sha256"]):
        raise ValueError("Retained original CAD asset changed")
    if asset[:4] != b"glTF" or struct.unpack_from("<I", asset, 8)[0] != len(asset):
        raise ValueError("Invalid original GLB framing")
    json_bytes = struct.unpack_from("<I", asset, 12)[0]
    gltf = json.loads(asset[20:20 + json_bytes])
    if (gltf.get("images") or gltf.get("extensionsUsed")
            or any("uri" in buffer for buffer in gltf["buffers"])
            or len(gltf["meshes"]) != 2):
        raise ValueError("Unexpected CAD dependency or mesh structure")
    expected_names = {item["name"] for item in manifest["parts"]}
    if {item["name"] for item in gltf["meshes"]} != expected_names:
        raise ValueError("Original CAD part identity changed")
    for part in manifest["parts"]:
        mesh = next(item for item in gltf["meshes"] if item["name"] == part["name"])
        if len(mesh["primitives"]) != part["primitiveCount"]:
            raise ValueError("Original CAD part topology changed")
    scene = reset()
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(asset_path))
    imported = set(bpy.data.objects) - before
    meshes = {obj.name: obj for obj in imported if obj.type == "MESH"}
    if set(meshes) != expected_names:
        raise ValueError("Blender import did not preserve the two expected parts")
    bpy.context.view_layer.update()
    observations = []
    for part in manifest["parts"]:
        obj = meshes[part["name"]]
        actual = bounds(obj)
        if any(abs(a - b) > manifest["dimensionToleranceMeters"]
               for a, b in zip(actual["dimensions"], part["blenderDimensionsMeters"])):
            raise ValueError("Imported part dimensions changed: " + part["name"])
        observations.append({"name": obj.name, "boundsBeforePresentation": actual,
                             "vertices": len(obj.data.vertices),
                             "triangles": sum(len(poly.vertices) - 2 for poly in obj.data.polygons),
                             "geometrySha256": geometry_hash(obj),
                             "shadingSha256": shading_hash(obj)})
    if sum(item["triangles"] for item in observations) != manifest["expectedTriangles"]:
        raise ValueError("Imported triangle count changed")
    for obj in imported:
        if obj.parent not in imported:
            obj.location.z += 0.018
    brass = material("Satin champagne alloy", (0.56, 0.31, 0.105), metallic=0.88, roughness=0.24)
    dark = material("Isolation pad", (0.016, 0.024, 0.032), roughness=0.56)
    for name, obj in meshes.items():
        obj.data.materials.clear()
        obj.data.materials.append(dark if name == "IsolationPad" else brass)
    floor(size=3, color=(0.035, 0.053, 0.067))
    graphite = material("Graphite display plinth", (0.020, 0.029, 0.036), metallic=0.60, roughness=0.29)
    cube("Display plinth", (0, 0, 0.006), (0.145, 0.10, 0.016), graphite, 0.006)
    studio_lights(scale=0.13)
    shot = camera((0.18, -0.28, 0.18), (0, -0.006, 0.054), lens=50, fstop=9)
    shot.data.type = "ORTHO"
    shot.data.ortho_scale = 0.300
    shot.data.dof.use_dof = False
    bpy.context.view_layer.update()
    bright = emission("Annotation ivory", (0.80, 0.86, 0.89))
    muted = emission("Annotation muted blue", (0.28, 0.43, 0.51))
    # At 960px, this 16mm camera-space size requests about 51 nominal pixels.
    # Actual Bfont glyph height still needs the selected-frame readability review.
    label("Bracket label", "Machined\nbracket", (-0.137, -0.007, -0.15), bright, shot)
    label("Pad label", "Isolation\npad", (0.063, 0.044, -0.15), bright, shot)
    label("Pad thickness", "2 mm", (0.063, 0.012, -0.15), muted, shot)
    projection = shot.matrix_world.inverted()
    bracket_anchor = projection @ Vector((-0.043, -0.021, 0.023))
    line("Bracket leader", [(-0.072, -0.035, -0.15), (-0.055, -0.035, -0.15),
                            (bracket_anchor.x, bracket_anchor.y, -0.15)], muted, shot)
    pad = meshes["IsolationPad"]
    start_local = pad.location.copy()
    parent_inverse = pad.parent.matrix_world.inverted().to_3x3() if pad.parent else None
    _, leader = line("Pad leader", [(0.063, -0.001, -0.15), (0.047, -0.001, -0.15), (0, 0, -0.15)], muted, shot)
    poses = []
    baseline_pad_bounds = bounds(pad)
    planes = manifest["sourceClearancePlanesMeters"]
    tolerance = manifest["dimensionToleranceMeters"]
    for frame in range(FRAME_COUNT):
        offset = Vector(pad_offset(frame))
        # The original bracket is the union of its base and rear upright, minus
        # holes. These two separating planes prove the pad cannot penetrate that
        # union; this is an analytic check of this specific source, not a solver.
        minimum_z = baseline_pad_bounds["minimum"][2] + offset.z
        maximum_y = baseline_pad_bounds["maximum"][1] + offset.y
        if (minimum_z < planes["baseTopZ"] + planes["presentationRootZ"] - tolerance
                or maximum_y > planes["uprightFrontY"] - tolerance):
            raise ValueError("Authored pad path penetrates the retained bracket")
        pad.location = start_local + (parent_inverse @ offset if parent_inverse else offset)
        pad.keyframe_insert("location", frame=frame)
        anchor = projection @ (Vector((0, -0.003, 0.024)) + offset)
        leader.points[2].co = (anchor.x, anchor.y, -0.15, 1)
        leader.points[2].keyframe_insert("co", frame=frame)
        poses.append({"frame": frame, "offsetMeters": tuple(offset),
                      "baseClearanceMeters": minimum_z - planes["baseTopZ"] - planes["presentationRootZ"],
                      "uprightClearanceMeters": planes["uprightFrontY"] - maximum_y})
    if (pad.location - start_local).length > 1e-9:
        raise ValueError("Return did not preserve the original assembled transform")
    set_linear_animation(pad)
    set_linear_animation(bpy.data.objects["Pad leader"].data)
    dimension_start, dimension_end = Vector((-0.05, -0.042, 0.014)), Vector((0.05, -0.042, 0.014))
    line("Nominal width dimension", [dimension_start, dimension_end], muted)
    for x in (-0.05, 0.05):
        line("Dimension tick", [(x, -0.045, 0.014), (x, -0.039, 0.014)], muted)
    dimension_label = projection @ ((dimension_start + dimension_end) / 2)
    label("Width label", "100 mm width", (dimension_label.x, max(-0.074, min(-0.061, dimension_label.y - 0.012)), -0.15), bright, shot, align="CENTER")
    for item in observations:
        if geometry_hash(meshes[item["name"]]) != item["geometrySha256"]:
            raise ValueError("Presentation changed original part geometry")
        if shading_hash(meshes[item["name"]]) != item["shadingSha256"]:
            raise ValueError("Presentation changed imported normals or shading flags")
    scene["slopcamera_cad_exploded"] = json.dumps({
        "status": "authored-controls-native-qualification-pending",
        "assetSha256": manifest["asset"]["sha256"], "parts": observations,
        "travelMeters": PAD_TRAVEL_METERS, "poses": poses,
        "camera": "fixed orthographic, no depth of field", "nativeUnits": "meters/Z-up",
        "partGeometryChanged": False, "partNormalsOrShadingFlagsChanged": False,
        "mechanicalSimulation": False,
    }, sort_keys=True)
    scene.frame_set(render["startFrame"])
