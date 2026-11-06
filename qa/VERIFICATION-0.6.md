# BIT DRAW 0.6 verification — 2026-10-29

## Automated checks

`node --test tests/*.test.mjs`: **62/62 pass**. Includes the existing authenticated local bridge checks and 12 new semantic/pixelization tests.

Coverage: grouping disconnected regions; compact sparse masks; project and backup round trips; overlap rejection and atomic rollback; palette validation and category conflicts; distinct ownership after neighboring colors merge; dedicated palette precedence; alpha preservation; relative-lightness mapping; dry run and undo; invalidation on rebuild/delete/merge; reused layer IDs; locked layers; malformed serialized masks; fresh-image rule reuse; polygon splitting of connected same-color areas; and v1/v2 to v3 migration.

## Live integration

`qa/verify-v6.mjs` ran against an explicitly selected disposable session. Fixture is a generated continuous-tone portrait, **not a photograph or AI semantic-quality benchmark**. The QA classifier groups by known fixture base colors; this heuristic can misclassify blended edge pixels and is not shipped as automatic semantic recognition.

- 192×256 source → 48×64 native pixels, with bounded quantization.
- 131 connected regions grouped into 5 named masks. Classification summary 1,059 bytes versus 815,165-byte complete project, including source. These are JSON byte counts, not measured model Tokens.
- Category rule preview made no mutation; commit changed 3,072 pixels, each within the palette allowed by its assigned category.
- Source pixel hash unchanged. Project reopening and backup recovery preserved labels, masks and pixels.
- The same stored rule ran on a freshly imported PNG at 24×32; that image had 74 regions and fresh labels. No original coordinates were reused.
- Rebuilding invalidated labels; applying stale labels failed; Undo restored validity.
- Output: `portrait-source-v6.png`, `portrait-pixel-v6.png`, `classified-v6.bitdraw.json`, `classified-small-v6.bitdraw.json`, `verification-v6.json`.

`qa/verify-v6-final.mjs` ran after a clean reload of the final v3-capable build:

- Persisted rules remained available; a stale rule version was rejected.
- Existing v2 fixture migrated to v3 with complete data equality apart from the intended schema upgrade.
- Two polygons divided a connected same-color 4×2 image into independent 4-pixel skin/clothes masks. Applying one rule recolored them differently.
- Label creation returned compact label IDs; capture produced a portable two-category rule.
- Inspect reported the five named regions without dumping masks.
- Report: `verification-v6-final.json`; fixtures: `final-v6.bitdraw.json`, `polygon-v6.bitdraw.json`.

## Browser UI

- Selected a region, named a 46-pixel mask and assigned `shadow` through the UI.
- Updated a name and assigned a dedicated working palette; summary reflected the override. Undo restored the prior metadata.
- Saved the `夜色衣著` rule through the editable category table; preview/commit changed exactly the 656 pixels owned by the clothes label. This verifies mask targeting, not correctness of the heuristic fixture's semantic boundaries.
- Quick pixelization preview/apply resized the botanical fixture from 48×48 to 32×32 and reduced to 8 colors, preserving the original source comparison.
- Reopening the dialog after switching documents refreshed the label list: five portrait labels versus two polygon labels, preventing writes through a previous document's UI state.
- Named mask PNG, category table, persistent rule selection and source/result comparison rendered successfully. Browser error/warning log was empty before server shutdown.
- Visual artifacts: `named-regions-0.6.png`, `workspace-0.6.png`.

## Remaining limitations

No embedded semantic vision model or automatic object tracking. People or agents must inspect previews and assign labels; real photos, mixed-color boundaries, tiny features, and occlusion can require mask correction. Polygon coordinates describe pixel boundaries with even-odd fill at pixel centers. Masks remain at fixed positions during ordinary painting; geometry changes require review.

Pixelization is sampling plus quantization and class-aware recoloring; it does not guarantee hand-drawn pixel-art aesthetics or recover small details lost at low resolution. No large-source performance soak, real photo/AI corpus quality benchmark, actual model Token benchmark, forced OS crash test, GIF or animation validation in this release.

v3 projects intentionally require 0.6 or later so older editors cannot silently ignore label invalidation rules. Older v1/v2 projects remain readable. Rules are browser/origin-local but exportable JSON.
