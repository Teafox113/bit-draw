# BIT DRAW 0.5 verification — 2026-10-29

## Automated checks

`node --test tests/*.test.mjs`: 50/50 pass, including the existing authenticated loopback bridge test. The final monotonic backup timestamp change was followed by another 7/7 automation test pass.

New tests cover typed recipe parameters, rejected inputs, atomic batches and one-step undo; region identity across pure recoloring and unrelated islands; rejected topology/layer/revision mismatches; connectivity and alpha preservation; candidate color ranking; packed source/layer/view round trips; simulated storage failure/retry; unchanged-state suppression; independent document keys; and edits while a backup write is waiting.

## Live browser and authenticated API

Ran `qa/verify-v5.mjs` against a dedicated test session. The script creates disposable QA documents and a workflow; do not run it against a user's active editing session. It verifies:

- A five-command, two-layer recipe previews 80 pixels without changing revision, then commits as one undo step. Invalid color parameters and stale revisions fail.
- Three connected regions include a 22-pixel face with two separate one-pixel eyes. Verified fill previews and changes exactly those 22 pixels; the eyes remain unchanged. PNG mask written to `region-mask-v5.png`.
- A dirty document is automatically backed up without explicitly flushing. Repeated edits and forced backups retain exactly three versions for the document key.
- Restored project is deeply equal to the saved original, starts dirty with revision 0 and no undo history. Result and SHA256 are in `verification-v5.json`.

Opened a fresh browser tab and used the visible recovery notice to restore a previous document into a new tab. Tested pending offsetX=1 with committed offsetX=0 and vertical source comparison: restored UI kept offsetX=1, `document.inspect` reported `pendingGrid:true`, and view remained vertical. Corrected test controls afterward and saved fixtures.

Reloaded a clean page and ran `qa/verify-persistence-v5.mjs`: a complete botanical project including a 384×384 source (147,456 source pixels), layers and palette compared deeply equal after recovery. Workflow definitions survived reload. Stale recipe updates/runs were rejected, and region APIs required explicit document IDs. Report: `persistence-v5.json`. The script removed the disposable earlier QA library records while retaining the two delivered reusable workflows.

## UI verification

- Backup list, manual backup, restore into new tab, and startup recovery notice work.
- Stored workflow loads; applying before preview is rejected. Preview then apply changes 22 pixels; one Undo restores the prior face color. Exported workflow JSON is at `exported-workflow-v5.json`.
- Region list shows geometry IDs, exact areas, mean colors; selecting one displays an enlarged pink mask. Candidate buttons and HEX input select the intended palette color. Preview reports the correct 6×4 bounds with 22 changed pixels.
- Dialog header stays outside its scrollable body. Source comparison, document tabs and layer list remain available behind the dialog.
- Final loaded page console error/warning list was empty before stopping the test server.
- Screenshot: `region-guide-0.5.png`.

## Limits of this verification

No forced operating-system crash, power-loss test, browser storage eviction, real quota exhaustion, or long-duration large-source stress run. Quota failure/retry was simulated at the coordinator boundary; live IndexedDB persistence and retention were tested. The last uncommitted backup interval can still be lost, and background timers can be throttled. Backups are browser/origin-local, not independent disk backups. No undo/redo history recovery.

Region identity is deterministic geometry plus revision protection, not semantic segmentation or cross-frame object tracking. Candidate colors are perceptual-distance suggestions; the test does not establish correct artistic color choices on real AI art. No model Token usage benchmark or commercial release claim.
