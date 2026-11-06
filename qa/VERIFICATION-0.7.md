# BIT DRAW 0.7 verification — 2026-11-05 (Asia/Taipei)

## Automated checks

`node --test tests/*.test.mjs`: **73/73 passed**. Eleven additional tests cover deterministic seeded partitioning, identical-color objects separated by location, uncertainty ties, transparent islands, invalid seed input and collisions, polygon constraints, explicit replacement, overlap transfer, brush/polygon correction, split/merge, morphology, empty-mask removal, locked/stale labels, atomic pipeline preview/rollback/undo, source-based recoloring and typed reusable workflow parameters.

No dependency installation or embedded machine learning model. Engine is shared by Node CLI and browser. Saved project schema stays v3.

## Real-image evidence

Two real photographs downloaded from the scikit-image v0.25.2 data repository:

- `astronaut.png`: NASA photograph of Eileen Collins, public domain / no known restrictions.
- `coffee.png`: Rachel Michetti, courtesy of Pikolo Espresso Bar, CC0.

Source and license documentation: https://scikit-image.org/docs/stable/api/skimage.data.html

Downloads: https://raw.githubusercontent.com/scikit-image/scikit-image/v0.25.2/skimage/data/astronaut.png and https://raw.githubusercontent.com/scikit-image/scikit-image/v0.25.2/skimage/data/coffee.png

Fixtures and outputs are in `qa/real-v7/`. These are actual photographs, not generated test drawings. Agent inspected the originals, supplied seeds, inspected the atlas, then made targeted corrections. This is assisted semantic segmentation; the application does not invent object names.

| Image | Source | Native output | Seeds | Initial review pixels | Preview + commit |
|---|---|---|---|---|---|
| Astronaut | 512×512 | 64×64 | 24 | 185 / 4096 (4.5%) | 1,675 ms |
| Coffee | 600×400 | 75×50 | 23 | 46 / 3750 (1.2%) | 1,633 ms |

Times are one local run including bridge overhead, not a benchmark distribution. Review fractions are uncertainty flags, not error rates or segmentation accuracy. Each output has five named classes plus a review mask. Unknown pixels retain their quantized original colors, so final total colors can exceed the initial 24-color quantization cap.

`test-real-v7.mjs` verified source equality, every assigned pixel belonging to its allowed palette, dry-run revision stability and exact one-step undo. `report.json` records results. Pipeline request sizes were 1,284 / 1,265 bytes; result summaries were 681 / 682 bytes, excluding image import/export. These are UTF-8 JSON byte counts, not measured model Tokens.

## Observed corrections

- Astronaut: left flag colors initially leaked into clothes, and part of the helmet edge was uncertain. One polygon transfer to background and one short brush transfer to equipment corrected those locations.
- Coffee: a reflective spoon edge was initially assigned to the cup/saucer. UI brush transfer moved seven pixels into the metal mask. The UI preview preserved the project; commit updated masks without repainting pixels. Source-based palette mapping then applied the appropriate colors.
- Visual location checks: astronaut 12/14 before, 14/14 after; coffee 12/13 before, 13/13 after. These small, agent-selected samples include observed error locations. They are neither independent validation nor a full-image ground truth metric. Full boundary correctness has not been established.
- `correction-report.json`, `*-corrections.json`, `*-corrected.bitdraw.json`, `*-final-native.png`, `*-final.png` and `*-final-atlas.png` preserve evidence. Enlarged final PNGs use 8× nearest-neighbor export through the app.

Visual result: major silhouettes and color groups remain recognizable. Fine facial features, lettering and small hardware are lost or simplified at these native sizes. Wood grain becomes discrete color patches. Outputs are useful pixel-style drafts, not a claim of hand-authored pixel-art quality.

## Reuse and UI checks

- `recipe-v7.mjs` saved the new typed `regionGroups` recipe after a fresh page load, then imported the coffee photo and ran it with a short seed parameter array. Stored workflow contains palette definitions once. Result has six label summaries and no raw masks.
- Stale revision rejected; preview made no changes; project exported and marked saved only after disk write. `recipe-report.json`: 796-byte run request, 762-byte response for this run, excluding initial recipe save and image transfer.
- Browser UI: automatic segmentation preview/commit created four generic classes plus review on the botanical demo; saved as `automatic-ui.bitdraw.json`.
- Browser UI: named-mask brush preview/commit changed the coffee spoon area from 90 to 97 pixels, with the cup/saucer shrinking from 1,151 to 1,144.
- Switching the active document externally while the mask dialog remained open rejected stale UI target state until the mask list was refreshed.
- `workspace-0.7.png` shows the original coffee photo beside the final pixel output. Console error/warning check was empty at final verification.

## Limits / next validation

No zero-prompt semantic model, object tracking, independent annotated image corpus, real Token benchmark, large-image soak or performance Worker in this release. Similar neighboring colors can leak despite a high relative path-score margin. Seed placement and polygon bounds affect results; disconnected islands need seeds or review. Fixed masks do not follow object motion. Inputs remain bounded by existing source and native-output limits.

Saved rules are reusable across images; seeds and polygon coordinates must be selected for each image and output grid. The sample photo-specific command/recipe files are reproducibility fixtures. The `recipes/*-guided.json` files require fresh groups as parameters.
