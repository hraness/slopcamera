import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image

root = Path(sys.argv[1]).resolve()
samples = json.loads((root / "samples.json").read_text())
for sample in samples:
    original = np.asarray(Image.open(sample["original"]).convert("RGB"), dtype=np.int16)
    reloaded = np.asarray(Image.open(sample["reloaded"]).convert("RGB"), dtype=np.int16)
    if original.shape != reloaded.shape:
        raise RuntimeError("Reloaded dimensions differ")
    difference = np.abs(original - reloaded)
    sample["pixelComparison"] = {"shape": list(original.shape), "identical": bool(np.array_equal(original, reloaded)), "maximumDifference": int(difference.max()), "meanAbsoluteDifference": float(difference.mean()), "fractionAbove8": float((difference > 8).mean())}
    if sample["pixelComparison"]["meanAbsoluteDifference"] > 0.5 or sample["pixelComparison"]["fractionAbove8"] > 0.001:
        raise RuntimeError("Reloaded frame differs materially: " + json.dumps(sample["pixelComparison"]))
(root / "comparison.json").write_text(json.dumps(samples, indent=2) + "\n")
print(json.dumps({"reloadComparisons": [{"frame": sample["frame"], **sample["pixelComparison"]} for sample in samples]}))
