"""Import one original textured GLB and retain three static views. Native review pending."""
import math
from pathlib import Path

import bpy
from mathutils import Matrix

from asset_io import load_assets
from scene_checks import closure, imported_fidelity, mesh_hashes, stored_json, texture_state
from studio_scene import area, camera, cube, material, reset


def constant_keys(obj):
    if obj.animation_data and obj.animation_data.action:
        for slot in obj.animation_data.action.slots:
            for layer in obj.animation_data.action.layers:
                for strip in layer.strips:
                    bag = strip.channelbag(slot)
                    if bag:
                        for curve in bag.fcurves:
                            for key in curve.keyframe_points:
                                key.interpolation = "CONSTANT"


def build(context):
    render = context.get("render") or {}
    if (render.get("startFrame", -1) < 0 or render.get("endFrameExclusive", 4) > 3
            or render.get("width") != 960 or render.get("height") != 540
            or render.get("frameRate") != {"numerator": 24, "denominator": 1}):
        raise ValueError("Use the three bounded 960x540 still-view jobs")
    root = Path(context["sourceRoot"])
    facts, decoded, original = load_assets(root)
    scene = reset()
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.20, 0.20, 0.20, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.18
    bpy.ops.import_scene.gltf(filepath=str(root / "assets/field-carton.glb"))
    meshes = [obj for obj in scene.objects if obj.type == "MESH"]
    if len(meshes) != 1 or meshes[0].name != "FieldCarton":
        raise ValueError("Unexpected imported mesh identity")
    obj = meshes[0]
    bpy.context.view_layer.update()
    fidelity = imported_fidelity(obj, decoded, facts)
    original_hashes = mesh_hashes(obj)
    texture, image = texture_state(obj, facts, original, pack=True)
    if obj.parent is not None:
        raise ValueError("Unexpected imported parent")
    presentation = bpy.data.objects.new("Carton presentation", None)
    scene.collection.objects.link(presentation)
    # Identity parent preserves imported object-space data and assembled transform.
    obj.parent = presentation
    obj.matrix_parent_inverse = Matrix.Identity(4)
    for view in facts["views"]:
        presentation.rotation_euler = (0, 0, math.radians(view["parentYawDegrees"]))
        presentation.keyframe_insert("rotation_euler", frame=view["frame"])
    constant_keys(presentation)
    cube("Studio floor", (0, 0, -.001), (1, 1, .002),
         material("Warm neutral floor", (.22, .235, .21), roughness=.72))
    area("Large neutral key", (-.21, -.22, .30), (0, 0, .055), 8.0, (1, .97, .92), .28)
    area("Soft right fill", (.25, -.04, .18), (0, 0, .065), 4.0, (.91, .95, 1), .20)
    area("Paper edge", (-.06, .18, .24), (0, 0, .07), 5.0, (1, 1, 1), .18)
    shot = camera((.18, -.32, .22), (0, 0, .059), lens=60, fstop=8)
    shot.data.type = "ORTHO"
    shot.data.ortho_scale = .27
    shot.data.dof.use_dof = False
    if mesh_hashes(obj) != original_hashes:
        raise ValueError("Presentation changed imported mesh/UV/normals/shading")
    texture_after, image_after = texture_state(obj, facts, original)
    if texture_after != texture or image_after != image:
        raise ValueError("Presentation changed imported texture or material")
    dependencies = closure(image)
    poses = []
    for view in facts["views"]:
        scene.frame_set(view["frame"])
        bpy.context.view_layer.update()
        if abs(presentation.rotation_euler.z - math.radians(view["parentYawDegrees"])) > 1e-6:
            raise ValueError("Saved still-view pose changed")
        poses.append({"frame": view["frame"], "name": view["name"],
                      "matrixWorld": [list(row) for row in obj.matrix_world]})
    scene["slopcamera_texture_import"] = stored_json({
        "kind": "slopcamera.showcase.texture-import-observation", "nativeQualification": "pending",
        "assetSha256": facts["model"]["sha256"], "fidelity": fidelity, "meshHashes": original_hashes,
        "texture": texture, "dependencies": dependencies, "poses": poses,
        "embeddedSceneScriptsRequired": False, "authoredViews": 3, "animationFilm": False,
    })
    scene.frame_set(render["startFrame"])
