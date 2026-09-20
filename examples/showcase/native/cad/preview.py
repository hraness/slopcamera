"""Render two exact CadQuery GLB exports, with a closed six-second camera move."""
import math
from pathlib import Path
import bpy
from studio_scene import reset, material, cube, floor, studio_lights, camera, aim


def build(context):
    scene = reset()
    floor(size=3, color=(0.035, 0.053, 0.067))
    brass = material("Satin champagne alloy", (0.56, 0.31, 0.105), metallic=0.88, roughness=0.24)
    blue = material("Blue anodized variation", (0.04, 0.22, 0.29), metallic=0.72, roughness=0.26)
    dark = material("Isolation pad", (0.016, 0.024, 0.032), roughness=0.56)
    for filename, offset, finish in (("baseline.glb", -0.085, brass), ("wide.glb", 0.085, blue)):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(Path(context["sourceRoot"]) / filename))
        objects = set(bpy.data.objects) - before
        for obj in objects:
            if obj.parent not in objects:
                obj.location.x += offset
                obj.location.z += 0.015
            if obj.type == "MESH":
                # The solids remain the exact CadQuery tessellation. Presentation changes only materials.
                obj.data.materials.clear()
                obj.data.materials.append(dark if "IsolationPad" in obj.name else finish)
                for polygon in obj.data.polygons:
                    polygon.use_smooth = False
    plinth = material("Graphite display plinth", (0.020, 0.029, 0.036), metallic=0.60, roughness=0.29)
    cube("Single display plinth", (0, 0, 0.003), (0.34, 0.13, 0.015), plinth, 0.008)
    studio_lights(scale=0.13)
    target = (0, 0.008, 0.034)
    shot = camera((0.21, -0.38, 0.25), target, lens=43, fstop=9)
    for frame, location in ((0, (0.21, -0.38, 0.25)), (72, (0.12, -0.42, 0.24)), (144, (0.21, -0.38, 0.25))):
        shot.location = location
        aim(shot, target)
        shot.data.dof.focus_distance = math.sqrt(sum((a-b)**2 for a,b in zip(location,target)))
        shot.keyframe_insert("location", frame=frame)
        shot.keyframe_insert("rotation_euler", frame=frame)
        shot.data.dof.keyframe_insert("focus_distance", frame=frame)
    scene.frame_set((context.get("render") or {}).get("startFrame", 0))
