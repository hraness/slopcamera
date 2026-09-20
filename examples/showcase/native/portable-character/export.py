"""Portable derivative of the native rig. Bake pose transforms; keep the native rig separately."""
import bpy
from scene import build as build_native


def build(context):
    build_native(context)
    # The portable asset owns only the character. Floor, lighting and camera belong to a shot.
    for obj in list(bpy.data.objects):
        if obj.type in {"CAMERA", "LIGHT"} or obj.name == "Seamless studio floor":
            bpy.data.objects.remove(obj, do_unlink=True)
    rig = bpy.data.objects["Character rig"]
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="POSE")
    for bone in rig.pose.bones:
        bone.select = True
    # glTF does not carry Blender IK constraints. Bake the observed pose into real bone keys.
    bpy.ops.nla.bake(frame_start=0, frame_end=144, step=2, only_selected=True,
                    visual_keying=True, clear_constraints=True, clear_parents=False,
                    use_current_action=False, clean_curves=True, bake_types={"POSE"})
    if rig.animation_data is None or rig.animation_data.action is None:
        raise RuntimeError("Pose bake produced no armature action")
    rig.animation_data.action.name = "Wave baked from IK"
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.scene.frame_set(0)
