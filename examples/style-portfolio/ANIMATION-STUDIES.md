# Original animation studies

`animation-studies.html` contains 12 six-second scenes. Each scene has its own composition, forms, materials, and movement. They use Canvas2D and load no external assets, fonts, libraries, or network resources.

| Style ID | Scene | Suggested still time |
| --- | --- | --- |
| `theatrical-cel` | A late train passes a rain-soaked platform and layered city. Cels hold while distant camera drift stays continuous. | 2.5 s |
| `watercolor-storybook` | A rabbit waters a greenhouse garden among transparent botanical washes. | 3 s |
| `pixel-art` | A tiny astronomer watches the sky from a mountain observatory. | 3.7 s |
| `math-explainer` | Five odd Fourier harmonics build sequentially, then rotate to trace their exact sum. | 2.65 s |
| `midcentury-limited` | An angular bird trio plays upright bass, trumpet, and piano. | 3 s |
| `rubber-hose` | An original record-shaped dancer performs beside a phonograph. | 3 s |
| `cut-paper` | A folded crane crosses shadowed layers of hills and reeds. | 3 s |
| `stopmotion-clay` | A clay-like snail, pressed ceramic objects, and petal flowers form a lit still life. | 3 s |
| `engraving` | An etched whale swims beneath a clipper and distant lighthouse. | 3 s |
| `ink-sketch` | A cyclist passes a cafe, a watching cat, and an ink-and-wash streetscape. | 2.5 s |
| `rotoscope` | A dancer moves through four authored anatomical poses with printed motion echoes. | 3 s |
| `clean-motion` | An orthographic kinetic sculpture combines a shaded ring, ribbon, and counterweight. | 2.65 s |

The clay scene is a two-dimensional material study. The dancer uses authored joint poses and interpolation; it was not traced from a filmed performer. The kinetic sculpture uses drawn projection and analytic shading. These scenes do not run Blender, Manim, a physical simulation, or a generative video model. The separate native street scene has its own source and receipts.

The mathematical scene evaluates `Σ sin(nθ) / n` for the active odd harmonics. Its limiting levels are `±π/4`. Each added harmonic updates both the rotating construction and the trace. No numerical integration or accumulated drawing history is used.

## Timing and rendering contract

The Slopcamera host passes `parameters.style`, an optional canonical `parameters.direction` profile, and an optional numeric `parameters.timeOffsetSeconds`. Unknown styles, malformed profiles, unsupported parameters, nonfinite times, and oversized canvases fail explicitly. A direction profile must match the selected scene. Scenes with held drawings sample the supplied subject exposure cadence; watercolor, cut paper, the mathematical construction, and the kinetic sculpture use authored continuous time. Camera cadence remains authored per scene; `cameraExposureFrames` is not applied automatically. Palettes, drawing geometry, lighting, and finishes remain authored for each composition. Profile fields are direction and delivery recommendations, not an automatic renderer or a claim of achieved fidelity.

Every rendered pose depends on absolute `timeMs`. Seeking, repeating a frame, and rendering out of order produce the same drawing commands. The supported time interval is zero through six seconds, with six accepted as the endpoint. The still offset must be below six seconds, and the total frame time must stay in that interval.

The composition is 1920 × 1080 and scales to the physical canvas while preserving its aspect ratio. The viewport and device scale determine the raster size. Physical canvases are bounded to 8192 pixels per side and 33,554,432 pixels total. A 3840 × 2160 render redraws the geometry at that resolution. Pixel art is intentionally drawn on a 320 × 180 grid, enlarged by the largest fitting integer scale with nearest sampling. Letterboxing preserves the composition in a different viewport shape.

Opening the HTML directly uses the theatrical cel scene. The query parameters `style` and `time` select another scene and an optional fixed frame. The page also exposes `window.PortfolioDrawing.render(timeSeconds, styleId, direction?)` for a deterministic local preview.

`verify-animation-source.mjs` checks all canonical profiles, finite geometry, balanced drawing stacks, invalid input handling, and command determinism after out-of-order seeks. It does not render pixels. The delivery owner must inspect actual frames and complete clips for composition, movement, clipping, type, and material quality.
