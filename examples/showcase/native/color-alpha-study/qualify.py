"""Measure retained native color/alpha masters; never infer pixels from declarations.

Run inside the ordinary host compute lane after the single native frame completes.
The caller supplies actual observed output paths, not a source job or a guessed path.
"""
import hashlib
import json
import math
from pathlib import Path
import shutil
import statistics
import struct
import subprocess
import sys

exr, png, destination = map(Path, sys.argv[1:])
destination.mkdir(exist_ok=False)
ffmpeg = shutil.which("ffmpeg")
ffprobe = shutil.which("ffprobe")
if not ffmpeg or not ffprobe:
    raise RuntimeError("The observed FFmpeg and ffprobe executables are required")
commands = []


def run(args, input_bytes=None):
    result = subprocess.run(args, check=False, capture_output=True, input=input_bytes)
    commands.append({"argv": args, "exitCode": result.returncode,
                     "stderr": result.stderr.decode(errors="replace")})
    if result.returncode:
        raise RuntimeError(result.stderr.decode(errors="replace"))
    return result.stdout


def binding(path):
    value = path.read_bytes()
    return {"path": str(path.resolve()), "bytes": len(value),
            "sha256": hashlib.sha256(value).hexdigest()}


def probe(path):
    return json.loads(run([ffprobe, "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)]))


observations = {"exr": probe(exr), "png": probe(png)}
for label, observation in observations.items():
    streams = observation["streams"]
    if len(streams) != 1 or (streams[0]["width"], streams[0]["height"]) != (512, 288):
        raise RuntimeError(label + " must be one actual 512x288 image")
width, height = 512, 288
count = width * height
exr_raw = run([ffmpeg, "-v", "error", "-gamma", "1", "-apply_trc", "gamma", "-i", str(exr),
               "-frames:v", "1", "-pix_fmt", "gbrapf32le", "-f", "rawvideo", "pipe:1"])
png_raw = run([ffmpeg, "-v", "error", "-i", str(png), "-frames:v", "1", "-pix_fmt", "rgba64le", "-f", "rawvideo", "pipe:1"])
if len(exr_raw) != count * 16 or len(png_raw) != count * 8:
    raise RuntimeError("Unexpected raw frame length")
exr_values = struct.unpack("<" + "f" * (count * 4), exr_raw)
png_values = struct.unpack("<" + "H" * (count * 4), png_raw)
if not all(math.isfinite(value) for value in exr_values):
    raise RuntimeError("Nonfinite EXR sample")


def exr_pixel(x, y):
    index = y * width + x
    return [exr_values[index + count * p] for p in (2, 0, 1, 3)]


def png_pixel(x, y):
    index = (y * width + x) * 4
    return [value / 65535 for value in png_values[index:index + 4]]


def srgb(value):
    return 12.92 * value if value <= .0031308 else 1.055 * value ** (1 / 2.4) - .055


def stats(rows):
    return {"mean": [statistics.mean(row[i] for row in rows) for i in range(4)],
            "min": [min(row[i] for row in rows) for i in range(4)],
            "max": [max(row[i] for row in rows) for i in range(4)],
            "stdev": [statistics.pstdev(row[i] for row in rows) for i in range(4)]}


source = Path("examples/showcase/native/color-alpha-study/patches.json")
targets = json.loads(source.read_text())
patch_results, checks = [], []
for target in targets["patches"]:
    # Orthographic width6.4, square pixels, camera local+Y up. The actual images
    # and retained native camera must independently confirm this projection.
    x = round(width / 2 + target["center"][0] * width / 6.4)
    y = round(height / 2 - target["center"][1] * width / 6.4)
    exr_roi = [exr_pixel(xx, yy) for yy in range(y-4, y+5) for xx in range(x-4, x+5)]
    png_roi = [png_pixel(xx, yy) for yy in range(y-4, y+5) for xx in range(x-4, x+5)]
    linear, display = stats(exr_roi), stats(png_roi)
    alpha = target["alpha"]
    alpha_tolerance = .03 if 0 < alpha < 1 else .001
    target_checks = {
        "alphaMeanWithinPredeclaredTolerance": abs(linear["mean"][3] - alpha) <= alpha_tolerance,
        "pngExrAlphaMeanAgreement": abs(display["mean"][3] - linear["mean"][3]) <= .002,
    }
    premultiplied_error = max(abs(pixel[i] - pixel[3] * target["linearRGB"][i])
                              for pixel in exr_roi for i in range(3))
    target_checks["exrStoredPremultipliedRgbAgreement"] = premultiplied_error <= .004
    if alpha > 0:
        expected_srgb = [min(1, max(0, srgb(value))) for value in target["linearRGB"]]
        png_straight_error = max(abs(display["mean"][i] - expected_srgb[i]) for i in range(3))
        target_checks["pngStoredStraightSrgbMeanAgreement"] = png_straight_error <= .015
    else:
        expected_srgb, png_straight_error = None, None
    if target["id"] == "hdr":
        target_checks["exrRedAboveOne"] = linear["min"][0] > 1.9
        target_checks["pngRedDisplayClipped"] = display["min"][0] > .999
    checks.extend({"patch": target["id"], "check": key, "passed": value} for key, value in target_checks.items())
    patch_results.append({"id": target["id"], "centerPixel": [x,y], "roi": "9x9 center; no edge AA",
                          "expectedLinearRGB": target["linearRGB"], "expectedAlpha": alpha,
                          "alphaMeanTolerance": alpha_tolerance, "exrStoredRGBA": linear,
                          "pngStoredRGBA": display, "expectedStraightSrgb": expected_srgb,
                          "maxPremultipliedError": premultiplied_error,
                          "maxStraightSrgbMeanError": png_straight_error, "checks": target_checks})
background_exr, background_png = exr_pixel(4,4), png_pixel(4,4)
checks.append({"patch": "background", "check": "actualClearAlpha", "passed": background_exr[3] == 0 and background_png[3] == 0})
# A separate declared SDR derivative unpremultiplies only positive alpha, clips
# linear values for display, applies the sRGB transfer, and writes straight RGBA.
# It is never substituted for either retained native master in the measurements.
preview = bytearray(count * 4)
for index in range(count):
    alpha = max(0, min(1, exr_values[index + count * 3]))
    for channel, plane in enumerate((2, 0, 1)):
        value = exr_values[index + count * plane] / alpha if alpha > 1e-8 else 0
        preview[index * 4 + channel] = round(max(0, min(1, srgb(max(0, value)))) * 255)
    preview[index * 4 + 3] = round(alpha * 255)
exr_preview = destination / "exr-sdr-straight.png"
run([ffmpeg, "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", "512x288", "-i", "pipe:0",
     "-frames:v", "1", str(exr_preview)], bytes(preview))
derivatives = [{**binding(exr_preview), "method": "EXR positive-alpha unpremultiply; linear clip to0..1; sRGB transfer; straight8bitRGBA"}]
for name, color in (("dark", "0x101922"), ("light", "0xeef2f6")):
    composite = destination / ("png-over-" + name + ".png")
    graph = "[0:v]format=rgb24[bg];[bg][1:v]overlay=alpha=straight:format=rgb:shortest=1,format=rgb24"
    run([ffmpeg, "-v", "error", "-f", "lavfi", "-i", "color=c=" + color + ":s=512x288",
         "-i", str(png), "-filter_complex", graph, "-frames:v", "1", str(composite)])
    derivatives.append({**binding(composite), "method": "Straight PNG composited in display RGB over" + color})
    edge = destination / ("cyan-edge-" + name + "-4x.png")
    run([ffmpeg, "-v", "error", "-i", str(composite), "-vf", "crop=144:74:28:162,scale=576:296:flags=neighbor", "-frames:v", "1", str(edge)])
    derivatives.append({**binding(edge), "method": "Cyan patch boundary crop x28,y162,w144,h74; nearest-neighbor4x"})
result = {"status": "numeric-pass-awaiting-independent-visual-review" if all(c["passed"] for c in checks) else "numeric-failure",
          "source": binding(source), "masters": {"exr": binding(exr), "png": binding(png)},
          "ffmpegVersion": run([ffmpeg, "-version"]).decode().splitlines()[0], "probes": observations,
          "decoder": {"exr": "FFmpeg EXR gamma1/apply_trc=gamma; gbrapf32le; planar GBR+A reordered to RGBA; no unpremultiplication",
                      "png": "FFmpeg PNG to rgba64le; normalized integer samples; no unpremultiplication",
                      "sourceReference": "https://www.ffmpeg.org/doxygen/7.1/exr_8c_source.html"},
          "projectionRequiresVisualConfirmation": True, "patches": patch_results,
          "background": {"pixel": [4,4], "exrRGBA": background_exr, "pngRGBA": background_png},
          "checks": checks, "derivatives": derivatives, "commands": commands}
(destination / "pixels.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({"status": result["status"], "path": str(destination / "pixels.json"), "checks": len(checks)}))
if result["status"] == "numeric-failure":
    sys.exit(1)
