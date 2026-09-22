"""A finite authored separation, independent of any native renderer."""

FRAME_COUNT = 96
FRAME_RATE = 24
PAD_TRAVEL_METERS = (0.0, -0.018, 0.080)


def smoothstep(value):
    value = min(1.0, max(0.0, value))
    return value * value * (3.0 - 2.0 * value)


def separation(frame):
    if not isinstance(frame, int) or not 0 <= frame < FRAME_COUNT:
        raise ValueError("Exploded study defines only frames 0 through 95")
    if frame <= 11:
        return 0.0
    if frame <= 35:
        return smoothstep((frame - 11) / 24.0)
    if frame <= 59:
        return 1.0
    if frame <= 83:
        return 1.0 - smoothstep((frame - 59) / 24.0)
    return 0.0


def pad_offset(frame):
    return tuple(component * separation(frame) for component in PAD_TRAVEL_METERS)
