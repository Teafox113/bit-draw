# Local inference assets

- `pico.js`: https://github.com/nenadmarkus/picojs/blob/master/pico.js (Nenad Markuš, MIT). Retrieved 2026-11-05. Local adaptation only declares/exports the pico object as an ES module. Runtime uses cascade detection and clustering, not camera access.
- `facefinder`: https://github.com/nenadmarkus/pico/blob/master/rnt/cascades/facefinder (Nenad Markuš, MIT). SHA-256 `d8014993e7298c7b1865d1f8b855d6dbf4ec5c808bf879e2091ab6837abf90cd`.
- MIT license and copyright notice retained in `facefinder-LICENSE`. picojs declares MIT in its source header and repository README; attribution is retained here and in the source.

Both assets are served from localhost. No remote model, image upload, camera access or account is used at runtime. Face cascade scores are detector scores, not calibrated probabilities; eye/mouth regions are local contrast estimates. Illustration detection is BIT DRAW's separate heuristic.

## Anime segmentation in 0.11

Anime Segmentation by SkyTNT: https://github.com/SkyTNT/anime-segmentation . Source and model weights are Apache-2.0 (ANIME-SEG-LICENSE retained; author confirmation: https://huggingface.co/skytnt/anime-seg/discussions/4).

Run `npm run setup:anime` for `isnet-anime.onnx`, pinned to revision `976cbb9ba61600e0993d1ee2a8a247ae05d183ee`. Exact URL and SHA-256 are in `scripts/model-manifest.mjs`. Weights are unchanged. Input: aspect-preserving resize, centered black padding to 1024×1024, channel-first RGB/255. Output: remove padding, store at up to 512 px on the long edge, no min-max stretching. This model can still retain background people or miss thin details; results require review.

## Subject segmentation in 0.10

U²-Net / U²-Netp by Xuebin Qin and coauthors: https://github.com/xuebinqin/U-2-Net (Apache-2.0; U2NET-LICENSE retained). ONNX conversions downloaded from https://github.com/danielgatis/rembg/releases/tag/v0.0.0 . Upstream MD5: u2net.onnx 60024c5c889badc19c04ad937298a77b; u2netp.onnx 8e83ca70e441ab06c318d82300c84806. Weights are not checked into Git; scripts/setup-models.mjs verifies downloads.

ONNX Runtime Web 1.22.0 by Microsoft, MIT, https://github.com/microsoft/onnxruntime . Runtime files copied unchanged from the pinned npm package by setup:models; LICENSE and ThirdPartyNotices.txt retained in ort/. Preprocessing uses a 320×320 normalized RGB tensor; outputs are saliency estimates, not calibrated probabilities or guaranteed person masks. Browser inference uses single-thread WASM inside the app Worker. No camera or network model request at runtime; assets are served locally.
