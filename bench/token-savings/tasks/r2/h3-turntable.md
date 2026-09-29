# H3 3D turntable

## TASK.md

# Product turntable

Using Blender, make a turntable of a stylized product: a smart speaker with
a rounded cylindrical body, a lighter ring on top and a small status light,
standing on a round pedestal.

- Body colour `#1F6FEB`, matte.
- Three-point lighting: key, fill and rim light.
- `out/turntable.mp4`: H.264 MP4, 1080x1080, 24 fps, 5 seconds
  (120 frames). The product (or the camera) makes exactly one full
  360-degree turn, so the video loops cleanly.
- `out/hero.png`: a 1920x1080 hero still from a three-quarter angle.
- Keep the Blender scene or scripts in this folder so the project can be
  changed later.
- Keep render times reasonable (for example Eevee, or Cycles with few
  samples).
- No audio is needed.

## Create prompt

Do the task described in TASK.md in the current directory. When the deliverables are written, reply with one line per output file.

## Revision 1

Revision: change the body colour to #2E7D6B. Keep everything else the same and re-render both outputs to the same paths. When done, reply with one line per output file.

## Revision 2

Revision: slow the turntable down so the one full rotation takes 8 seconds (192 frames at 24 fps); `out/turntable.mp4` becomes 8 seconds long. Keep everything else the same and re-render to the same path. When done, reply with one line per output file.

## Revision 3

Revision: add the product name "AURA" as raised 3D text on the front of the pedestal, visible in both the turntable and the hero still. Keep everything else the same and re-render both outputs to the same paths. When done, reply with one line per output file.

## Revision 4

The project in this folder was made earlier; make this change and re-render. Change: render the hero still at 2560x1440 instead of 1920x1080, to the same path `out/hero.png`. Leave `out/turntable.mp4` as it is. When done, reply with one line per output file.

## Revision 5

The project in this folder was made earlier; make this change and re-render. Change: render `out/turntable.mp4` at 30 fps instead of 24, still 8 seconds long (240 frames) and still exactly one full rotation. Leave `out/hero.png` as it is. When done, reply with one line per output file.
