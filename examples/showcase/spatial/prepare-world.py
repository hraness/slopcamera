"""Prepare an explicitly downsampled, original-attribute SPZ derivative.

Downloads only the immutable Niantic MIT sample below (24 MiB upper bound).
Version-2 section order and widths are verified against the pinned official
src/cc/load-spz.cc serializePackedGaussians implementation (lines 627–632).
No scale, position, rotation, color, opacity or spherical harmonic is invented.
Every even source splat index is kept; all other indices are omitted together.
The result must still pass Slopcamera's independent decoder and visual review.
"""
from pathlib import Path
import gzip
import hashlib
import io
import json
import struct
import urllib.request

COMMIT = "affd0ecea7fbb4c265ee119475af7ee5b2997482"
BASE = f"https://raw.githubusercontent.com/nianticlabs/spz/{COMMIT}"
SOURCE_URL = BASE + "/samples/hornedlizard.spz"
SOURCE_GIT_BLOB = "e80aaa92464bf85a5ffaa02ccc2fe2341c87344e"
SOURCE_BYTES = 18_143_098
MAX_DOWNLOAD = 24 * 1024 * 1024
MAX_DECOMPRESSED = 64 * 1024 * 1024
ROOT = Path("artifacts/showcase/spatial/world-source")
ROOT.mkdir(parents=True, exist_ok=True)

def download(url, maximum):
    request = urllib.request.Request(url, headers={"User-Agent": "Slopcamera-example-provenance"})
    with urllib.request.urlopen(request, timeout=60) as response:
        length = response.headers.get("Content-Length")
        if length is not None and int(length) > maximum:
            raise ValueError("Remote asset exceeds the declared download bound")
        data = response.read(maximum + 1)
        if len(data) > maximum:
            raise ValueError("Remote asset exceeds the declared download bound")
        return data

source_path = ROOT / "hornedlizard-original.spz"
source = source_path.read_bytes() if source_path.exists() else download(SOURCE_URL, MAX_DOWNLOAD)
if len(source) != SOURCE_BYTES:
    raise ValueError("Immutable source size mismatch")
git_blob = hashlib.sha1(f"blob {len(source)}\0".encode() + source).hexdigest()
if git_blob != SOURCE_GIT_BLOB:
    raise ValueError("Immutable Git blob identity mismatch")
if not source_path.exists():
    source_path.write_bytes(source)
license_bytes = download(BASE + "/LICENSE", 16 * 1024)
(ROOT / "LICENSE-Niantic.txt").write_bytes(license_bytes)
codec_bytes = download(BASE + "/src/cc/load-spz.cc", 256 * 1024)
(ROOT / "official-load-spz.cc").write_bytes(codec_bytes)
with gzip.GzipFile(fileobj=io.BytesIO(source)) as stream:
    raw = stream.read(MAX_DECOMPRESSED + 1)
if len(raw) > MAX_DECOMPRESSED:
    raise ValueError("Source decompression exceeds the declared bound")
magic, version, count = struct.unpack_from("<III", raw)
degree, fractional_bits, flags, reserved = raw[12:16]
if (magic, version, count, degree, fractional_bits, flags, reserved) != (0x5053474E, 2, 786233, 3, 12, 0, 0):
    raise ValueError("Source header differs from the reviewed v2 non-AA sample")
sections = [("position", 9), ("alpha", 1), ("color", 3), ("scale", 3), ("rotation", 3), ("spherical-harmonic", 3 * ((degree + 1) ** 2 - 1))]
expected_bytes = 16 + count * sum(width for _, width in sections)
if len(raw) != expected_bytes:
    raise ValueError("Source does not match the documented complete v2 attribute layout")
indices = range(0, count, 2)
kept = len(indices)
header = bytearray(raw[:16])
struct.pack_into("<I", header, 8, kept)
parts = [bytes(header)]
offset = 16
section_receipts = []
for name, width in sections:
    original_section = memoryview(raw)[offset:offset + count * width]
    retained_section = b"".join(original_section[index * width:(index + 1) * width] for index in indices)
    if len(retained_section) != kept * width:
        raise ValueError("Selected attribute section is incomplete")
    parts.append(retained_section)
    section_receipts.append({"name": name, "bytesPerSplat": width, "sourceSha256": hashlib.sha256(original_section).hexdigest(),
                             "derivativeSha256": hashlib.sha256(retained_section).hexdigest()})
    offset += count * width
derived_raw = b"".join(parts)
derivative = gzip.compress(derived_raw, compresslevel=6, mtime=0)
if gzip.decompress(derivative) != derived_raw:
    raise ValueError("Derivative gzip round trip failed")
path = ROOT / "hornedlizard-even-index-v2.spz"
path.write_bytes(derivative)
receipt = {
    "kind": "showcase.spz-attribute-preserving-downsample", "schemaVersion": 1,
    "source": {"url": SOURCE_URL, "commit": COMMIT, "gitBlob": git_blob, "bytes": len(source),
               "sha256": hashlib.sha256(source).hexdigest(), "splats": count},
    "license": {"url": BASE + "/LICENSE", "path": str(ROOT / "LICENSE-Niantic.txt"), "sha256": hashlib.sha256(license_bytes).hexdigest()},
    "formatReference": {"url": BASE + "/src/cc/load-spz.cc", "sha256": hashlib.sha256(codec_bytes).hexdigest()},
    "transformation": {"selection": "source indices 0, 2, 4, …; same selection in every complete attribute section", "sectionOrder": section_receipts,
                       "positionOrScaleModified": False, "inventedGeometry": False},
    "derivative": {"path": str(path), "version": version, "flags": flags, "splats": kept, "bytes": len(derivative),
                   "decompressedBytes": len(derived_raw), "sha256": hashlib.sha256(derivative).hexdigest()},
    "authorSourceSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    "visualReview": "pending", "slopcameraAdmission": "pending",
}
(ROOT / "conversion-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps({"source": receipt["source"], "derivative": receipt["derivative"]}, indent=2))
