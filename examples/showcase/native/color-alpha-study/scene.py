"""Original linear-emission/alpha specimen. Its expected values await native proof."""

import json
from pathlib import Path
import bpy


def emission_material(name, rgb, alpha=1.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = (*rgb, 1)
    emission.inputs["Strength"].default_value = 1
    if alpha == 1:
        links.new(emission.outputs["Emission"], output.inputs["Surface"])
    else:
        transparent = nodes.new("ShaderNodeBsdfTransparent")
        mixed = nodes.new("ShaderNodeMixShader")
        mixed.inputs[0].default_value = alpha
        links.new(transparent.outputs["BSDF"], mixed.inputs[1])
        links.new(emission.outputs["Emission"], mixed.inputs[2])
        links.new(mixed.outputs[0], output.inputs["Surface"])
    return material


def text(name, body, location, size, material):
    curve = bpy.data.curves.new(name, "FONT")
    # Blender's bundled Bfont is part of the pinned runtime, not an ambient font.
    curve.body, curve.size, curve.align_x = body, size, "CENTER"
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.data.materials.append(material)


def build(context):
    render = context.get("render") or {}
    if (render.get("width"), render.get("height"), render.get("startFrame"), render.get("endFrameExclusive")) != (512, 288, 0, 1):
        raise ValueError("Use the retained single-frame 512x288 color/alpha job")
    source = Path(context["sourceRoot"]) / "patches.json"
    specification = json.loads(source.read_text(encoding="utf-8"))
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.unit_settings.system, scene.unit_settings.scale_length = "METRIC", 1.0
    scene.world = bpy.data.worlds.new("Zero-radiance transparent background")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0
    scene.view_settings.look = "None"
    scene.view_settings.exposure, scene.view_settings.gamma = 0, 1
    scene.render.dither_intensity = 0
    label = emission_material("Neutral annotation", (.72, .72, .72))
    for patch in specification["patches"]:
        x, y = patch["center"]
        bpy.ops.mesh.primitive_plane_add(size=1, location=(x, y, 0))
        obj = bpy.context.object
        obj.name = "Sample " + patch["id"]
        obj.scale = (*specification["patchSize"], 1)
        obj.data.materials.append(emission_material(obj.name, patch["linearRGB"], patch["alpha"]))
        text("Label " + patch["id"], patch["label"], (x, y - .56, .01), .115, label)
    text("Study title", "COLOR / COVERAGE / RANGE", (0, 1.48, .01), .20, label)
    text("Study footer", "LINEAR SOURCE   /   STRAIGHT PNG   /   PREMULTIPLIED EXR", (0, -1.57, .01), .09, label)
    camera_data = bpy.data.cameras.new("Orthographic sample camera")
    camera_data.type, camera_data.ortho_scale = "ORTHO", specification["camera"]["orthoWidth"]
    camera_data.clip_start, camera_data.clip_end = .1, 20
    camera_data.dof.use_dof = False
    camera = bpy.data.objects.new("Orthographic sample camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (0, 0, 6)
    # Identity looks down local -Z, with local +Y at the top of the image.
    camera.rotation_euler = (0, 0, 0)
    scene.camera = camera
    scene["slopcamera_alpha_targets"] = json.dumps(specification, sort_keys=True)
    scene.frame_set(0)
