# Take the wave into a portable scene

This derivative carries the original character's nine-bone skin, facial morph targets and six-second animation clips into Slopcamera's bounded GLB profile. It keeps the native character separately: Blender's IK controller, constraints and authoring controls do not travel with the GLB.

From the repository root, using the verified Blender 5.2.1 runtime:

```sh
bun examples/showcase/native/portable-character.ts --blender-bin /absolute/path/to/Blender
```

Read the native Python source first. The helper bundles it and explicitly invokes `studio run --allow-trusted-code`. It selects all nine actual pose bones, bakes evaluated IK poses into bone animation, and retains the resulting GLB under a new native job. It then adapts that output as a separate asset before calling the unchanged `scene asset admit` command. Each run writes into its own timestamped directory under `artifacts/showcase/native/character-portable/`.

Blender exports four sparse accessors in this example. The [adapter](dense-glb.ts) expands them into dense storage using the [glTF sparse-accessor rules](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#sparse-accessors), then compares the effective bytes of every accessor before and after conversion. The retained proof records both GLB hashes and the adapter source hash. It never overwrites the native output or relaxes Slopcamera's importer.

The observed clip at index `0`, `Wave baked from IK`, lasts six seconds. Its 27 translation, rotation and scale channels address the nine real joints. CPU evaluation at zero and 2.5 seconds changes 4,869 vertex coordinates, with a maximum coordinate difference of about 0.619 m. These observations qualify deformation; inspect the portable render for appearance and timing as well.

Set the scene asset geometry to `materialMode: "source"` and select the actual clip index in the returned rig facts. Four additional six-second clips carry the mouth, jaw and eyelid shapes separately; selecting the wave clip alone does not simultaneously play those facial clips. A final clip animates the original IK-goal empty and does not drive the portable skeleton. The rig is intentionally partial: it does not satisfy the full 19-bone humanoid mapping or establish retargeting support.

`asset.manifest.json` contains the admitted manifest, bounds, rig facts and patch operations. Its `assets/` sibling contains the exact admitted GLB and facts bytes. Keep that directory together with the native receipt, source bundle identity, `adaptation.json` and the measured `facts.json` when handing it to a scene renderer.
