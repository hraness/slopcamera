# Contents

- `SKILL.md` – the recipe-pack authoring workflow for the built-in `cinematic-world` graph.
- `agents/openai.yaml` – agent-runner display metadata.

# Guidelines

- Keep the skill declarative: agents author bounded JSON documents (scene, direction, recipe pack); they never register operations or code.
- Keep every documented command aligned with the actual `slopcamera workflows plan|run` CLI surface and the `SpatialRecipePackSchema` contract in `src/spatial-scene/recipe-pack.ts`.
- Preserve the explicit selection and promotion boundary: `cinematic-world` plans and reviews only.
