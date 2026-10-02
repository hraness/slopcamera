import type { ArticleAdmission } from "@hraness/design-kit-articles"

// Current editorial decisions; truthful AI review and source-check dates remain
// available to discovery while the reading layout omits date labels.
export const blogAdmissions = [
  {
    "href": "/blog/one-shot-render-vs-installed-techniques",
    "lifecycle": "indexable",
    "readerJob": "Choose how to keep media source and rendering reusable across revisions.",
    "nonObviousAnswer": "A custom pipeline and an installed framework can both be reused. Their maintenance responsibilities differ; source fields and per-format layout work determine what a revision needs.",
    "originalContribution": "Traces diagram labels, title parameters, pavilion dimensions and aspect-ratio layouts from editable source to rendered outputs.",
    "hostFit": "A Slopcamera guide grounded in its editable examples and commands, with links to the relevant task documentation.",
    "nearestUrls": [
      {
        "url": "/docs/reference/techniques",
        "distinction": "Catalogs available techniques; this article explains how source changes lead to revisions and variants."
      },
      {
        "url": "/blog/editable-diagrams-with-coding-agents",
        "distinction": "Teaches the diagram workflow in depth; this article follows several media formats."
      }
    ],
    "sources": [
      {
        "title": "Anthropic Agent Skills overview",
        "url": "https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview",
        "checkedOn": "2026-09-28"
      },
      {
        "title": "Remotion agent skills",
        "url": "https://www.remotion.dev/docs/ai/skills",
        "checkedOn": "2026-09-28"
      },
      {
        "title": "HyperFrames skills guide",
        "url": "https://hyperframes.heygen.com/guides/skills",
        "checkedOn": "2026-09-28"
      },
      {
        "title": "Slopcamera showcase examples at a95e7fe",
        "url": "https://github.com/hraness/slopcamera/tree/a95e7feef61c65076c3cfd37cc23c0357eb3ecd4/examples/showcase",
        "checkedOn": "2026-09-28"
      },
      {
        "title": "Source-to-film diagram README at a95e7fe",
        "url": "https://github.com/hraness/slopcamera/blob/a95e7feef61c65076c3cfd37cc23c0357eb3ecd4/examples/showcase/diagram/README.md",
        "checkedOn": "2026-09-28"
      },
      {
        "title": "Crescent pavilion wide README at a95e7fe",
        "url": "https://github.com/hraness/slopcamera/blob/a95e7feef61c65076c3cfd37cc23c0357eb3ecd4/examples/showcase/parametric/crescent-pavilion-wide/README.md",
        "checkedOn": "2026-09-28"
      },
      {
        "title": "Four-ratio edit README at a95e7fe",
        "url": "https://github.com/hraness/slopcamera/blob/a95e7feef61c65076c3cfd37cc23c0357eb3ecd4/examples/showcase/edit/README.md",
        "checkedOn": "2026-09-28"
      }
    ],
    "observations": [
      "Diagram labels and title parameters change in source while the rendering pipeline stays fixed.",
      "A new aspect ratio can require its own framing and title layout."
    ],
    "scores": {
      "readerUtility": 2,
      "originalEvidence": 1,
      "factualConfidence": 2,
      "hostFit": 2,
      "voiceIntegrity": 2,
      "maintenanceValue": 2
    },
    "owner": "hraness/slopcamera",
    "drafting": "ai",
    "review": {
      "reviewer": "Codex independent editorial review (AI)",
      "reviewerType": "ai",
      "reviewedOn": "2026-10-01"
    },
    "humanReview": null,
    "reassessOn": "2026-11-12",
    "harmIfWrong": "Readers could install Slopcamera expecting measured token or cost savings, or expect a new format or revision to take less work than it does, and lose trust in the project's other claims.",
    "refreshTriggers": [
      "Changes to the linked example source formats, command grammar or required runtimes",
      "Changes to supported output formats or per-format layout requirements"
    ]
  },
  {
    "href": "/blog/make-video-with-claude-code",
    "lifecycle": "indexable",
    "readerJob": "Choose an engine and a practical command sequence for a coding agent to make and revise a video.",
    "nonObviousAnswer": "Choose the engine by the shot, then retain editable source or footage with the project. Bundled scene inputs do not limit the files native Python can read.",
    "originalContribution": "Maps five kinds of shot to engines, editable inputs and commands, including bundle-digest updates before native jobs.",
    "hostFit": "A Slopcamera guide grounded in its editable examples and commands, with links to the relevant task documentation.",
    "nearestUrls": [
      {
        "url": "/docs/tutorials/claude-code",
        "distinction": "Sets up Claude Code and a first request; this post chooses an engine per shot and gives a recipe for each."
      },
      {
        "url": "/docs/tutorials/codex",
        "distinction": "Sets up Codex; this post is engine selection and per-engine recipes after setup."
      },
      {
        "url": "/docs/tutorials/first-animation",
        "distinction": "Full tutorial for the HTML editorial title; the post condenses it to one recipe and links the clone step."
      }
    ],
    "sources": [
      {
        "title": "Agent Skills overview (Anthropic)",
        "url": "https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview",
        "checkedOn": "2026-09-28"
      },
      {
        "title": "Build skills (Codex skill locations)",
        "url": "https://learn.chatgpt.com/docs/build-skills",
        "checkedOn": "2026-09-28"
      },
      {
        "title": "Remotion agent skills",
        "url": "https://www.remotion.dev/docs/ai/skills",
        "checkedOn": "2026-09-28"
      },
      {
        "title": "Remotion Lambda",
        "url": "https://www.remotion.dev/docs/lambda",
        "checkedOn": "2026-09-28"
      },
      {
        "title": "HyperFrames repository",
        "url": "https://github.com/heygen-com/hyperframes",
        "checkedOn": "2026-09-28"
      },
      {
        "title": "HyperFrames README (AWS Lambda rendering and cloud render)",
        "url": "https://github.com/heygen-com/hyperframes/blob/main/README.md",
        "checkedOn": "2026-09-28"
      },
      {
        "title": "video-use repository",
        "url": "https://github.com/browser-use/video-use",
        "checkedOn": "2026-09-28"
      }
    ],
    "observations": [
      "HTML, Three.js, Blender, Manim and edited footage feed the project workflow.",
      "Native jobs require a current bundle digest and explicit trusted-code permission."
    ],
    "scores": {
      "readerUtility": 2,
      "originalEvidence": 1,
      "factualConfidence": 2,
      "hostFit": 2,
      "voiceIntegrity": 2,
      "maintenanceValue": 2
    },
    "owner": "hraness/slopcamera",
    "drafting": "ai",
    "review": {
      "reviewer": "Codex independent editorial review (AI)",
      "reviewerType": "ai",
      "reviewedOn": "2026-10-01"
    },
    "humanReview": null,
    "reassessOn": "2026-11-12",
    "harmIfWrong": "A reader copies a command block that fails (missing job file, missing example path, wrong flag) or picks an engine that cannot produce the shot, wasting setup time; overstating capabilities such as recording, beat detection, or cloud rendering would mislead readers choosing between Slopcamera and Remotion or HyperFrames.",
    "refreshTriggers": [
      "Any change to html, scene, studio, project, media, align, or workflows CLI commands or flags",
      "Changes to the first-animation, first-native-film, or educational-video helper scripts or job file names",
      "Changes to the Manim lesson parameter limits or the editorial.json example",
      "Changes to skill install targets or to where Claude Code or Codex scan for skills",
      "Remotion, HyperFrames, or video-use changing their skill install commands or cloud rendering offers",
      "Slopcamera adding recording, beat detection, or remote rendering"
    ]
  },
  {
    "href": "/blog/editable-diagrams-with-coding-agents",
    "lifecycle": "indexable",
    "readerJob": "Revise a diagram once and keep its light, dark and editable exports consistent.",
    "nonObviousAnswer": "The JSON is the lasting source; tldraw edits do not flow back into it, and layout lint does not establish whether a diagram is semantically correct.",
    "originalContribution": "Explains a concrete source edit, validation exit codes, export formats and the choice between Mermaid and pre-rendered diagrams.",
    "hostFit": "A Slopcamera guide grounded in its editable examples and commands, with links to the relevant task documentation.",
    "nearestUrls": [
      {
        "url": "https://slopcamera.com/docs/tutorials/first-diagram",
        "distinction": "The tutorial walks through a first diagram from `diagram init`. The post covers the strict-check loop for agents and CI, MCP differences, the tldraw one-way limit, export sizes, and when to use Mermaid instead."
      },
      {
        "url": "https://slopcamera.com/docs/reference/diagram-format",
        "distinction": "The reference defines every field of .diagram.json. The post uses one small file to show why a source file makes revisions cheap and what the checker does and does not catch."
      },
      {
        "url": "https://slopcamera.com/docs/explanation/why-slopcamera",
        "distinction": "The hub explains Slopcamera's approach across all media. The post shows that approach for diagrams only, with reproduced commands and outputs."
      }
    ],
    "sources": [
      {
        "title": "Slopcamera v3.6.0 release",
        "url": "https://github.com/hraness/slopcamera/releases/tag/v3.6.0",
        "checkedOn": "2026-09-28"
      },
      {
        "title": "Slopcamera diagram lint rules",
        "url": "https://github.com/hraness/slopcamera/blob/v3.6.0/src/lint.ts",
        "checkedOn": "2026-09-28"
      },
      {
        "title": "Slopcamera CLI (diagram check exit codes)",
        "url": "https://github.com/hraness/slopcamera/blob/v3.6.0/src/cli.ts",
        "checkedOn": "2026-09-28"
      },
      {
        "title": "Slopcamera diagram artifacts and config discovery",
        "url": "https://github.com/hraness/slopcamera/blob/v3.6.0/src/artifacts.ts",
        "checkedOn": "2026-09-28"
      },
      {
        "title": "Slopcamera diagram parser (shape types and tones)",
        "url": "https://github.com/hraness/slopcamera/blob/v3.6.0/src/parse.ts",
        "checkedOn": "2026-09-28"
      },
      {
        "title": "Slopcamera Agent Skill: diagrams",
        "url": "https://github.com/hraness/slopcamera/blob/v3.6.0/skills/slopcamera/references/diagrams.md",
        "checkedOn": "2026-09-28"
      },
      {
        "title": "Mermaid",
        "url": "https://mermaid.js.org/",
        "checkedOn": "2026-09-28"
      },
      {
        "title": "GitHub Docs: Creating diagrams",
        "url": "https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams",
        "checkedOn": "2026-09-28"
      },
      {
        "title": "tldraw",
        "url": "https://tldraw.dev",
        "checkedOn": "2026-09-28"
      }
    ],
    "observations": [
      "Strict checks report invalid source separately from layout findings.",
      "A diagram render writes tldraw plus light and dark SVG and PNG exports."
    ],
    "scores": {
      "readerUtility": 2,
      "originalEvidence": 1,
      "factualConfidence": 2,
      "hostFit": 2,
      "voiceIntegrity": 2,
      "maintenanceValue": 2
    },
    "owner": "hraness/slopcamera",
    "drafting": "ai",
    "review": {
      "reviewer": "Codex independent editorial review (AI)",
      "reviewerType": "ai",
      "reviewedOn": "2026-10-01"
    },
    "humanReview": null,
    "reassessOn": "2026-11-12",
    "harmIfWrong": "A reader could wire `diagram check --strict` into CI expecting different exit codes, and pull requests would pass that should fail. They could also expect tldraw edits to flow back into the JSON, or expect byte-identical exports across machines, and lose edits or chase false diffs.",
    "refreshTriggers": [
      "Slopcamera release tag bump",
      "Change to diagram lint codes or thresholds (src/lint.ts)",
      "Change to diagram check exit codes or the --strict flag (src/cli.ts)",
      "Change to render outputs, filenames, or font embedding in SVG",
      "Change to config discovery or the MCP check_diagram/render_diagram tools",
      "Slopcamera starts reading .tldr files back into the source",
      "GitHub or Mermaid changes where Mermaid diagrams render",
      "The first-diagram tutorial, diagram-format reference, or why-slopcamera hub changes route"
    ]
  },
  {
    "href": "/blog/headless-blender-manim-cadquery-for-agents",
    "lifecycle": "indexable",
    "readerJob": "Choose between interactive scene exploration and a saved scene program, then revise native renders safely.",
    "nonObviousAnswer": "Live sessions can preserve Blender files and scripts. Saved scene jobs make inputs explicit, and a source change needs a new bundle digest and job ID before rendering.",
    "originalContribution": "Connects material edits, CAD parameters and silent Manim visuals to the native command sequence and runtime boundaries.",
    "hostFit": "A Slopcamera guide grounded in its editable examples and commands, with links to the relevant task documentation.",
    "nearestUrls": [
      {
        "url": "/docs/tutorials/first-native-film",
        "distinction": "Tutorial walks one 320x180 CPU preview through the loop; the post compares approaches and shows revisions across three engines."
      },
      {
        "url": "/docs/how-to/native-films",
        "distinction": "How-to covers every native film feature (caches, rigs, masters, imports); the post argues when to keep scene source versus using a live session."
      },
      {
        "url": "/docs/reference/native-engines",
        "distinction": "Reference lists the full rules; the post summarizes only the trust and version rules a reader needs before letting an agent run commands."
      }
    ],
    "sources": [
      {
        "title": "MCP for Blender (formerly blender-mcp) README",
        "url": "https://github.com/ahujasid/mcp-for-blender",
        "checkedOn": "2026-09-28"
      },
      {
        "title": "Blender manual: command-line rendering",
        "url": "https://docs.blender.org/manual/en/latest/advanced/command_line/render.html",
        "checkedOn": "2026-09-28"
      },
      {
        "title": "Manim Community: configuration and CLI",
        "url": "https://docs.manim.community/en/stable/guides/configuration.html",
        "checkedOn": "2026-09-28"
      },
      {
        "title": "CadQuery introduction",
        "url": "https://cadquery.readthedocs.io/en/latest/intro.html",
        "checkedOn": "2026-09-28"
      },
      {
        "title": "Slopcamera product example scene.py",
        "url": "https://github.com/hraness/slopcamera/blob/81217777f193718e20351a886516ecae445590a9/examples/showcase/native/product/scene.py",
        "checkedOn": "2026-09-28"
      },
      {
        "title": "Slopcamera product example studio_scene.py",
        "url": "https://github.com/hraness/slopcamera/blob/81217777f193718e20351a886516ecae445590a9/examples/showcase/native/product/studio_scene.py",
        "checkedOn": "2026-09-28"
      },
      {
        "title": "Slopcamera product example job.json",
        "url": "https://github.com/hraness/slopcamera/blob/81217777f193718e20351a886516ecae445590a9/examples/showcase/native/product/job.json",
        "checkedOn": "2026-09-28"
      },
      {
        "title": "Slopcamera CAD example scene.py (widthMm 50-160 limit)",
        "url": "https://github.com/hraness/slopcamera/blob/81217777f193718e20351a886516ecae445590a9/examples/showcase/native/cad/scene.py",
        "checkedOn": "2026-09-28"
      },
      {
        "title": "Slopcamera CAD wide variation job",
        "url": "https://github.com/hraness/slopcamera/blob/81217777f193718e20351a886516ecae445590a9/examples/showcase/native/cad/wide.job.json",
        "checkedOn": "2026-09-28"
      },
      {
        "title": "Slopcamera cad-variations.ts (STEP round-trip volume check)",
        "url": "https://github.com/hraness/slopcamera/blob/81217777f193718e20351a886516ecae445590a9/examples/showcase/native/cad-variations.ts",
        "checkedOn": "2026-09-28"
      },
      {
        "title": "Slopcamera education example",
        "url": "https://github.com/hraness/slopcamera/tree/81217777f193718e20351a886516ecae445590a9/examples/showcase/native/education",
        "checkedOn": "2026-09-28"
      }
    ],
    "observations": [
      "Source manifests name bundled scene files; trusted Python still runs with the user’s access.",
      "Scene bundling and job updates precede plan, probe and run."
    ],
    "scores": {
      "readerUtility": 2,
      "originalEvidence": 1,
      "factualConfidence": 2,
      "hostFit": 2,
      "voiceIntegrity": 2,
      "maintenanceValue": 2
    },
    "owner": "hraness/slopcamera",
    "drafting": "ai",
    "review": {
      "reviewer": "Codex independent editorial review (AI)",
      "reviewerType": "ai",
      "reviewedOn": "2026-10-01"
    },
    "humanReview": null,
    "reassessOn": "2026-11-12",
    "harmIfWrong": "A reader could let an agent run bundled Python believing it is sandboxed, expect byte-identical renders across machines, expect a GLB export to keep an editable rig, or dismiss a live MCP session as unable to keep scripts. Any of these would cost them time or expose their machine to untrusted code.",
    "refreshTriggers": [
      "Adding, removing or renaming studio init templates",
      "Changes to studio command names or flags (bundle, plan, probe, run, inspect, encode, assemble, reconcile, --allow-trusted-code)",
      "Changes to the native trust model, sandboxing or environment scrubbing",
      "New tested engine versions or platforms beyond Blender 5.2.1 LTS, CadQuery 2.8.0, Manim Community 0.21.0 on macOS arm64",
      "Changes to the MCP for Blender README (name, safe mode, execute_blender_code behavior)",
      "Standalone executable gaining support for durable native workflows"
    ]
  },
  {
    "href": "/blog/introducing-slopcamera",
    "lifecycle": "indexable",
    "readerJob": "Choose a first Slopcamera project after seeing what editable source can produce.",
    "nonObviousAnswer": "A precise change can reuse source and timing; diagrams provide a portable first result, while animation and paid generation have their own tool requirements.",
    "originalContribution": "Connects original gallery films and a controlled moon-scale revision to first-project commands and the generation routes.",
    "hostFit": "A Slopcamera guide grounded in its editable examples and commands, with links to the relevant task documentation.",
    "nearestUrls": [
      {
        "url": "https://slopcamera.com/",
        "distinction": "The product entry point; this article connects the examples to practical first projects."
      },
      {
        "url": "/docs/tutorials/first-animation",
        "distinction": "Gives the full animation steps; the article explains what the revision demonstrates."
      }
    ],
    "sources": [
      {
        "title": "Reviewed studio films and source hashes",
        "url": "https://github.com/hraness/slopcamera/blob/d2accc8badd991f288bb0c83668efc641aa89981/apps/web/media/examples.json",
        "checkedOn": "2026-10-01"
      },
      {
        "title": "Editable studio showcase sources",
        "url": "https://github.com/hraness/slopcamera/tree/d2accc8badd991f288bb0c83668efc641aa89981/examples/showcase/studio-relaunch",
        "checkedOn": "2026-10-01"
      },
      {
        "title": "First animation and controlled revision",
        "url": "https://slopcamera.com/docs/tutorials/first-animation",
        "checkedOn": "2026-09-30"
      },
      {
        "title": "Slopcamera README",
        "url": "https://github.com/hraness/slopcamera/blob/d2accc8badd991f288bb0c83668efc641aa89981/README.md",
        "checkedOn": "2026-10-01"
      },
      {
        "title": "Slopcamera scene behavior bake",
        "url": "https://github.com/hraness/slopcamera/blob/d2accc8badd991f288bb0c83668efc641aa89981/src/spatial-scene/behavior-bake.ts",
        "checkedOn": "2026-10-01"
      }
    ],
    "observations": [
      "The launch beats use the original studio gallery examples and their source recipes.",
      "The diagram starter runs without a browser or paid model; native animation and AI generation have distinct requirements."
    ],
    "scores": {
      "readerUtility": 2,
      "originalEvidence": 1,
      "factualConfidence": 2,
      "hostFit": 2,
      "voiceIntegrity": 2,
      "maintenanceValue": 2
    },
    "owner": "hraness/slopcamera",
    "drafting": "ai",
    "review": {
      "reviewer": "Codex independent editorial review (AI)",
      "reviewerType": "ai",
      "reviewedOn": "2026-10-01"
    },
    "humanReview": null,
    "reassessOn": "2026-11-12",
    "harmIfWrong": "A reader could expect the hosted route to accept reference images or media, or expect Slopcamera to be a hosted app, and install a tool that does not fit their work.",
    "refreshTriggers": [
      "Changes to a featured film, its source, score, revision parameters or platform requirements",
      "Slopcamera release tag bump",
      "Change to hosted image generation (options accepted with --hosted, credits checkout, upload acknowledgement)",
      "Change to the ALGAL relation detail or the scene behavior bake (behavior.ts, behavior-bake.ts, scene behavior CLI help)",
      "AI Charts or Ghostget replaces or removes its Slopcamera figures or provenance files",
      "Change to the first-diagram commands or their outputs in the README or tutorial",
      "Slopcamera rename, or the how-slopcamera-uses-algal post changes route or title"
    ]
  },
  {
    "href": "/blog/how-slopcamera-uses-algal",
    "lifecycle": "indexable",
    "readerJob": "Understand how to keep character behavior repeatable while revising a rendered scene.",
    "nonObviousAnswer": "Bake the behavior into a saved timeline before rendering. A mapped channel drives existing performance assets; it does not generate rigs or animation clips.",
    "originalContribution": "Shows a state-machine example, check/bake/audit commands, input fingerprints and the closed behavior function boundary.",
    "hostFit": "A Slopcamera guide grounded in its editable examples and commands, with links to the relevant task documentation.",
    "nearestUrls": [
      {
        "url": "https://slopcamera.com/docs/how-to/direct-scenes",
        "distinction": "The how-to covers rendering and editing scenes; it does not explain why behavior runs through ALGAL or what a bake guarantees."
      },
      {
        "url": "https://slopcamera.com/docs/reference/spatial-scenes",
        "distinction": "The reference mentions behavior documents in one clause; the post explains the bake's checks and limits."
      },
      {
        "url": "https://slopcamera.com/blog/introducing-slopcamera",
        "distinction": "The introduction mentions ALGAL in one paragraph and links here for the details."
      }
    ],
    "sources": [
      {
        "title": "Slopcamera behavior bake",
        "url": "https://github.com/hraness/slopcamera/blob/7e7027521f134aaaaa8404efebdc5bac24be6252/src/spatial-scene/behavior-bake.ts",
        "checkedOn": "2026-09-24"
      },
      {
        "title": "Slopcamera behavior bake tests",
        "url": "https://github.com/hraness/slopcamera/blob/7e7027521f134aaaaa8404efebdc5bac24be6252/src/spatial-scene/behavior-bake.test.ts",
        "checkedOn": "2026-09-24"
      },
      {
        "title": "Slopcamera behavior functions",
        "url": "https://github.com/hraness/slopcamera/blob/7e7027521f134aaaaa8404efebdc5bac24be6252/src/spatial-scene/behavior-fns.ts",
        "checkedOn": "2026-09-24"
      },
      {
        "title": "Slopcamera behavior trace and channel map",
        "url": "https://github.com/hraness/slopcamera/blob/7e7027521f134aaaaa8404efebdc5bac24be6252/src/spatial-scene/behavior-trace.ts",
        "checkedOn": "2026-09-24"
      },
      {
        "title": "Slopcamera package manifest (ALGAL dependency)",
        "url": "https://github.com/hraness/slopcamera/blob/7e7027521f134aaaaa8404efebdc5bac24be6252/package.json",
        "checkedOn": "2026-09-24"
      },
      {
        "title": "Slopcamera Agent Skill: directed scenes",
        "url": "https://github.com/hraness/slopcamera/blob/7e7027521f134aaaaa8404efebdc5bac24be6252/skills/slopcamera/references/directed-scenes.md",
        "checkedOn": "2026-09-24"
      },
      {
        "title": "Slopcamera ALGAL character behaviors plan",
        "url": "https://github.com/hraness/slopcamera/blob/7e7027521f134aaaaa8404efebdc5bac24be6252/kb/plans/algal-character-behaviors.md",
        "checkedOn": "2026-09-24"
      },
      {
        "title": "ALGAL README",
        "url": "https://github.com/hraness/algal/blob/1bc117df7e9d18911123e736e28e2c051598a9f3/README.md",
        "checkedOn": "2026-09-24"
      },
      {
        "title": "Slopcamera v3.4.0 release",
        "url": "https://github.com/hraness/slopcamera/releases/tag/v3.4.0",
        "checkedOn": "2026-09-24"
      }
    ],
    "observations": [
      "Behavior baking rejects recorded effects and model calls.",
      "Changing scene inputs requires rebinding and a new bake, while the prior bake remains available for comparison."
    ],
    "scores": {
      "readerUtility": 2,
      "originalEvidence": 1,
      "factualConfidence": 2,
      "hostFit": 2,
      "voiceIntegrity": 2,
      "maintenanceValue": 2
    },
    "owner": "hraness/slopcamera",
    "drafting": "ai",
    "review": {
      "reviewer": "Codex independent editorial review (AI)",
      "reviewerType": "ai",
      "reviewedOn": "2026-10-01"
    },
    "humanReview": null,
    "reassessOn": "2026-11-12",
    "harmIfWrong": "A reader could trust a bake guarantee that the code does not enforce, or assume behavior can reach tools, models or files.",
    "refreshTriggers": [
      "Slopcamera release tag bump",
      "Change to the slopcamera:algal relation detail",
      "ALGAL pin bump in package.json",
      "Change to the scene behavior commands, function catalog, starting programs or bake checks",
      "Rename of Slopcamera or ALGAL",
      "The introducing-slopcamera post or an ALGAL built-on page goes live or moves"
    ]
  }
] as const satisfies readonly ArticleAdmission[]

export type BlogAdmission = (typeof blogAdmissions)[number]
