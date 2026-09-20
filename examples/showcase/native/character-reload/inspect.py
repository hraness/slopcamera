"""Inspect a retained blend without running its embedded scripts or rebuilding the rig."""
import hashlib
import json
from pathlib import Path
import bpy


def build(context):
    source = Path(context["sourceRoot"]) / "character.blend"
    bpy.ops.wm.open_mainfile(filepath=str(source), load_ui=False, use_scripts=False)
    rig = bpy.data.objects["Character rig"]
    names = sorted(bone.name for bone in rig.data.bones)
    expected = sorted(["root", "chest", "head", "upper_arm.R", "forearm.R", "upper_arm.L", "forearm.L", "leg.R", "leg.L"])
    if names != expected:
        raise RuntimeError("Retained rig identities changed")
    ik = next(constraint for constraint in rig.pose.bones["forearm.R"].constraints if constraint.type == "IK")
    if ik.target.name != "Right hand IK goal" or ik.pole_target.name != "Elbow pole" or ik.chain_count != 2 or ik.use_stretch:
        raise RuntimeError("Retained IK controls changed")
    arm = bpy.data.objects["Deforming IK sleeve"]
    skin = next(modifier for modifier in arm.modifiers if modifier.type == "ARMATURE")
    if skin.object != rig:
        raise RuntimeError("Retained arm is not bound to its rig")
    weights = [[vertex.index, [[arm.vertex_groups[group.group].name, group.weight] for group in vertex.groups]] for vertex in arm.data.vertices]
    maximum_sum_error = max(abs(sum(weight for _, weight in groups) - 1) for _, groups in weights)
    blended_vertices = sum(len(groups) == 2 and all(0 < weight < 1 for _, weight in groups) for _, groups in weights)
    if maximum_sum_error > 1e-6 or blended_vertices == 0:
        raise RuntimeError("Retained skin weights lost their normalized blended region")
    morphs = {obj.name: [key.name for key in obj.data.shape_keys.key_blocks] for obj in bpy.data.objects if obj.type == "MESH" and obj.data.shape_keys}
    if not {"Smile", "MouthOpen", "JawOpen", "Blink"}.issubset({name for names in morphs.values() for name in names}):
        raise RuntimeError("Retained facial morph identities changed")
    observations = []
    for frame in (0, 72, 143):
        bpy.context.scene.frame_set(frame)
        evaluated = arm.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = evaluated.to_mesh()
        positions = [list(evaluated.matrix_world @ vertex.co) for vertex in mesh.vertices]
        observations.append({"frame": frame, "firstVertex": positions[0], "minimum": [min(p[i] for p in positions) for i in range(3)], "maximum": [max(p[i] for p in positions) for i in range(3)], "positionSha256": hashlib.sha256(json.dumps(positions, separators=(",", ":")).encode()).hexdigest()})
        evaluated.to_mesh_clear()
    if observations[0]["positionSha256"] == observations[1]["positionSha256"]:
        raise RuntimeError("Reloaded native rig did not deform")
    report = {"kind": "slopcamera.showcase-character-reload", "embeddedScriptsEnabled": False, "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(), "bones": names, "ik": {"bone": "forearm.R", "target": ik.target.name, "pole": ik.pole_target.name, "chainLength": ik.chain_count, "stretch": ik.use_stretch}, "armVertices": len(weights), "blendedVertices": blended_vertices, "maximumWeightSumError": maximum_sum_error, "weightsSha256": hashlib.sha256(json.dumps(weights, separators=(",", ":")).encode()).hexdigest(), "morphs": morphs, "observations": observations}
    print("SLOPCAMERA_RELOAD_FACTS=" + json.dumps(report, separators=(",", ":")))
    bpy.context.scene.frame_set(0)
