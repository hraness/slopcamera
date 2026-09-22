"""Authored camera/focus controls; pure values, not a rendered observation."""

import math

CAMERA = (0.47, -0.68, 0.39)
LOOK_AT = (0.0, -0.015, 0.17)
NEAR_DETAIL = (0.065, -0.092, 0.268)
FAR_DETAIL = (0.030, 0.070, 0.295)
FRAME_COUNT = 72
FRAME_RATE = 24
FSTOP = 0.9


def projected_distance(point):
    direction = tuple(b - a for a, b in zip(CAMERA, LOOK_AT))
    length = math.sqrt(sum(value * value for value in direction))
    return sum((p - c) * d / length for p, c, d in zip(point, CAMERA, direction))


def focus_distance(frame):
    if not isinstance(frame, int) or not 0 <= frame < FRAME_COUNT:
        raise ValueError("Focus study only defines native frames 0 through 71")
    progress = min(1.0, max(0.0, (frame - 12) / 47))
    eased = progress * progress * (3 - 2 * progress)
    near, far = projected_distance(NEAR_DETAIL), projected_distance(FAR_DETAIL)
    if not 0 < near < far:
        raise ValueError("Focus planes must be positive and ordered along the camera axis")
    return near + (far - near) * eased
