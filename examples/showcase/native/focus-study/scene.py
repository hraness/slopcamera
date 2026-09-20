"""Separate focus study of the retained optical instrument. Pending render review."""

import json
import bpy
from product_geometry import build as build_product
from studio_scene import aim, set_linear_animation
from focus_schedule import CAMERA, LOOK_AT, NEAR_DETAIL, FAR_DETAIL, FRAME_COUNT, FRAME_RATE, FSTOP, focus_distance


def build(context):
    render = context.get("render") or {}
    if (render.get("endFrameExclusive", 0) > FRAME_COUNT
            or render.get("width", 0) > 960 or render.get("height", 0) > 540
            or render.get("frameRate") != {"numerator": FRAME_RATE, "denominator": 1}):
        raise ValueError("Use the retained bounded 24fps focus-study jobs")
    build_product(context)
    scene = bpy.context.scene
    shot = scene.camera
    # Geometry, materials and light positions come from the unchanged original.
    # Remove its camera loop so sharpness comparisons use identical framing.
    shot.animation_data_clear()
    shot.data.animation_data_clear()
    shot.location = CAMERA
    aim(shot, LOOK_AT)
    shot.data.lens = 44
    shot.data.dof.use_dof = True
    shot.data.dof.focus_object = None
    shot.data.dof.aperture_fstop = FSTOP
    for frame in range(FRAME_COUNT):
        shot.data.dof.focus_distance = focus_distance(frame)
        shot.data.dof.keyframe_insert("focus_distance", frame=frame)
    set_linear_animation(shot.data)
    scene["slopcamera_focus_study"] = json.dumps({
        "status": "authored-controls-not-visual-qualification",
        "camera": CAMERA, "lookAt": LOOK_AT, "nearDetail": NEAR_DETAIL,
        "farDetail": FAR_DETAIL, "fstop": FSTOP, "frames": FRAME_COUNT,
        "nearFocusMeters": focus_distance(0), "farFocusMeters": focus_distance(71),
        "reviewFrames": [0, 35, 71], "firstHold": [0, 12], "lastHold": [59, 71],
    }, sort_keys=True)
    scene.frame_set(render["startFrame"])
