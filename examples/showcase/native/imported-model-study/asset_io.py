"""Pure bounded source identity and GLB decoding; importing this helper does not load Blender."""
import hashlib
import json
import math
import struct
from pathlib import Path


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_owned(root, relative, maximum=1024 * 1024):
    root = Path(root).resolve(strict=True)
    source = root / relative
    if source.is_symlink() or not source.is_file() or source.resolve(strict=True) != source:
        raise ValueError("Expected physical retained file: " + relative)
    if not source.is_relative_to(root) or source.stat().st_size > maximum:
        raise ValueError("Source exceeds its closed bound")
    return source.read_bytes()


def load_assets(root):
    facts = json.loads(read_owned(root, "asset-facts.json", 32768))
    if facts["kind"] != "slopcamera.showcase.imported-model-assets" or facts["schemaVersion"] != 1:
        raise ValueError("Unexpected asset facts")
    model = read_owned(root, "assets/field-carton.glb")
    texture = read_owned(root, "textures/field-label.png")
    artwork = read_owned(root, "artwork.svg", 65536)
    for data, item in [(model, facts["model"]), (texture, facts["texture"]), (artwork, facts["artwork"])]:
        if len(data) != item["bytes"] or sha(data) != item["sha256"]:
            raise ValueError("Authored asset identity changed")
    if model[:4] != b"glTF" or struct.unpack_from("<II", model, 4) != (2, len(model)):
        raise ValueError("Invalid GLB header")
    json_size, json_type = struct.unpack_from("<II", model, 12)
    if json_type != 0x4E4F534A or json_size > 32768 or json_size % 4:
        raise ValueError("Invalid bounded GLB JSON")
    document = json.loads(model[20:20 + json_size])
    binary_size, binary_type = struct.unpack_from("<II", model, 20 + json_size)
    binary = model[28 + json_size:]
    if binary_type != 0x004E4942 or binary_size != len(binary) or binary_size % 4:
        raise ValueError("Invalid GLB BIN framing")
    if set(document) != {"asset", "scene", "scenes", "nodes", "meshes", "buffers", "bufferViews", "accessors", "materials", "textures", "samplers", "images"}:
        raise ValueError("Unexpected GLB dependency or feature")
    if document["asset"]["version"] != "2.0" or document["scene"] != 0 or document["scenes"] != [{"nodes": [0]}]:
        raise ValueError("Unexpected GLB root")
    if document["nodes"] != [{"name": "FieldCarton", "mesh": 0}] or len(document["meshes"]) != 1:
        raise ValueError("Unexpected mesh identity or transform")
    primitive = {"attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2}, "indices": 3, "material": 0, "mode": 4}
    if document["meshes"] != [{"name": "FieldCarton", "primitives": [primitive]}]:
        raise ValueError("Unexpected GLB topology")
    if document["buffers"] != [{"byteLength": len(binary)}] or len(document["bufferViews"]) != 5 or len(document["accessors"]) != 4:
        raise ValueError("Unexpected GLB buffer closure")
    if document["images"] != [{"name": "FIELD label atlas", "bufferView": 4, "mimeType": "image/png"}]:
        raise ValueError("Unexpected GLB image dependency")
    if document["textures"] != [{"sampler": 0, "source": 0}] or document["samplers"] != [{"magFilter": 9729, "minFilter": 9729, "wrapS": 33071, "wrapT": 33071}]:
        raise ValueError("Unexpected texture mapping")
    expected_material = {"name": "FIELD printed matte paper", "alphaMode": "OPAQUE", "doubleSided": False,
        "pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1], "baseColorTexture": {"index": 0, "texCoord": 0}, "metallicFactor": 0, "roughnessFactor": 0.62}}
    if document["materials"] != [expected_material]:
        raise ValueError("Unexpected original material")
    chunks = []
    end = 0
    for index, view in enumerate(document["bufferViews"]):
        expected_keys = {"buffer", "byteOffset", "byteLength"} | ({"target"} if index < 4 else set())
        if set(view) != expected_keys or view["buffer"] != 0 or view["byteOffset"] != end or view["byteLength"] <= 0:
            raise ValueError("Invalid GLB buffer view")
        if index < 4 and view["target"] != (34962 if index < 3 else 34963):
            raise ValueError("Unexpected buffer target")
        end = view["byteOffset"] + view["byteLength"]
        if end > len(binary):
            raise ValueError("GLB buffer view overflow")
        chunks.append(binary[view["byteOffset"]:end])
        end += (-end) % 4
    if end != len(binary) or chunks[4] != texture:
        raise ValueError("GLB image is not the retained original PNG")
    values = []
    for index, (count, shape, kind, code, components) in enumerate([(24, "VEC3", 5126, "f", 3), (24, "VEC3", 5126, "f", 3), (24, "VEC2", 5126, "f", 2), (36, "SCALAR", 5123, "H", 1)]):
        accessor = document["accessors"][index]
        if {k: accessor[k] for k in ("bufferView", "componentType", "count", "type")} != {"bufferView": index, "componentType": kind, "count": count, "type": shape}:
            raise ValueError("Unexpected GLB accessor")
        if set(accessor) != ({"bufferView", "componentType", "count", "type", "min", "max"} if index in (0, 3) else {"bufferView", "componentType", "count", "type"}):
            raise ValueError("Unexpected accessor layout")
        if len(chunks[index]) != count * components * struct.calcsize(code):
            raise ValueError("Accessor bytes mismatch")
        flat = struct.unpack("<" + code * count * components, chunks[index])
        if not all(math.isfinite(v) for v in flat):
            raise ValueError("Non-finite model value")
        values.append([tuple(flat[i:i + components]) for i in range(0, len(flat), components)])
    positions, normals, uvs, indexed = values
    indices = [row[0] for row in indexed]
    if indices != [i * 4 + j for i in range(6) for j in (0, 1, 2, 0, 2, 3)]:
        raise ValueError("Unexpected face triangulation")
    for face_index, face in enumerate(facts["faces"]):
        for local in range(4):
            i = face_index * 4 + local
            if max(abs(a - b) for a, b in zip(positions[i], face["positions"][local])) > 1e-8 or normals[i] != tuple(face["normal"]):
                raise ValueError("Original face geometry changed")
            if max(abs(a - b) for a, b in zip(uvs[i], face["uvs"][local * 2:local * 2 + 2])) > 1e-7:
                raise ValueError("Original UV layout changed")
    return facts, {"positions": positions, "normals": normals, "uvs": uvs, "indices": indices}, texture
