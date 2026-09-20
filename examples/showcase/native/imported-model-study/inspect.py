"""Explicit trusted inspector; the saved scene's embedded scripts stay disabled."""
import hashlib
import json
import math
from pathlib import Path

import bpy

from asset_io import load_assets
from scene_checks import closure, imported_fidelity, mesh_hashes, texture_state


def validate_pose_records(facts, saved):
    expected, actual = facts.get("views"), saved.get("poses")
    if not isinstance(expected, list) or not isinstance(actual, list) or len(expected) != 3 or len(actual) != 3:
        raise ValueError("Expected exactly three retained view poses")
    for record in [*expected, *actual]:
        if not isinstance(record, dict) or type(record.get("frame")) is not int or not isinstance(record.get("name"), str):
            raise ValueError("Malformed retained view identity")
    expected_ids = [(row["frame"], row["name"]) for row in expected]
    if [row[0] for row in expected_ids] != [0, 1, 2] or [(row["frame"], row["name"]) for row in actual] != expected_ids:
        raise ValueError("Retained view frame/name sequence changed")


def build(context):
    root = Path(context["sourceRoot"])
    facts, decoded, original = load_assets(root)
    source = root / "native/scene.blend"
    expected_sha = context["parameters"]["sourceBlendSha256"]
    if source.is_symlink() or not source.is_file() or source.stat().st_size > 64 * 1024 * 1024:
        raise ValueError("Unexpected native scene")
    if hashlib.sha256(source.read_bytes()).hexdigest() != expected_sha:
        raise ValueError("Native scene identity changed")
    bpy.ops.wm.open_mainfile(filepath=str(source), load_ui=False, use_scripts=False)
    scene = bpy.context.scene
    saved = json.loads(scene["slopcamera_texture_import"])
    obj = bpy.data.objects["FieldCarton"]
    presentation = bpy.data.objects["Carton presentation"]
    if obj.parent != presentation or mesh_hashes(obj) != saved["meshHashes"]:
        raise ValueError("Saved native geometry/UV/shading changed")
    scene.frame_set(0)
    bpy.context.view_layer.update()
    fidelity = imported_fidelity(obj, decoded, facts)
    texture, image = texture_state(obj, facts, original)
    dependencies = closure(image)
    if texture != saved["texture"] or dependencies != saved["dependencies"]:
        raise ValueError("Packed texture or dependency closure changed on reload")
    validate_pose_records(facts, saved)
    poses = []
    for view, prior in zip(facts["views"], saved["poses"]):
        scene.frame_set(view["frame"])
        bpy.context.view_layer.update()
        if abs(presentation.rotation_euler.z - math.radians(view["parentYawDegrees"])) > 1e-6:
            raise ValueError("Reloaded view rotation changed")
        observed = [list(row) for row in obj.matrix_world]
        if max(abs(a - b) for left, right in zip(observed, prior["matrixWorld"]) for a, b in zip(left, right)) > 1e-7:
            raise ValueError("Reloaded object transform changed")
        poses.append({"frame": view["frame"], "name": view["name"], "matrixWorld": observed})
    report = {"kind": "slopcamera.showcase.texture-reload-observation", "sourceBlendSha256": expected_sha,
              "embeddedSceneScriptsEnabled": False, "trustedInspectionScriptExecuted": True,
              "meshHashes": mesh_hashes(obj), "fidelity": fidelity, "texture": texture,
              "dependencies": dependencies, "poses": poses}
    print("SLOPCAMERA_TEXTURE_FACTS=" + json.dumps(report, separators=(",", ":"), allow_nan=False))
    scene.frame_set(0)
