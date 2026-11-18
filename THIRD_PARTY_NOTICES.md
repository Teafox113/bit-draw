# 第三方軟體與模型

BIT DRAW 原創程式碼採 [MIT](LICENSE)。下列第三方程式、模型及測試素材維持原授權，不因收錄於本專案而改為 MIT。發布包含這些元件的版本時，請一併保留對應授權與 notices。

| 元件 | 用途與來源 | 授權文件 |
|---|---|---|
| ONNX Runtime Web 1.22.0 / Microsoft | 本機 WASM 推論；由 npm lockfile 固定版本 | [MIT](dist/vendor/ort/LICENSE)、[ThirdPartyNotices](dist/vendor/ort/ThirdPartyNotices.txt) |
| U²-Net / Xuebin Qin 等 | U2Net、U2Netp 顯著物件分割；[作者專案](https://github.com/xuebinqin/U-2-Net)，ONNX 由 [rembg release](https://github.com/danielgatis/rembg/releases/tag/v0.0.0) 提供 | [Apache-2.0](dist/vendor/U2NET-LICENSE) |
| Anime Segmentation / SkyTNT | 動漫角色分割；[作者專案](https://github.com/SkyTNT/anime-segmentation)、[模型](https://huggingface.co/skytnt/anime-seg) | [Apache-2.0](dist/vendor/ANIME-SEG-LICENSE)；作者[確認模型權重也採此授權](https://huggingface.co/skytnt/anime-seg/discussions/4) |
| pico.js、facefinder / Nenad Markuš | 照片人臉候選；[來源](https://github.com/nenadmarkus/picojs) | [MIT](dist/vendor/facefinder-LICENSE)，pico.js 保留原註記 |

動漫權重固定於 revision `976cbb9ba61600e0993d1ee2a8a247ae05d183ee` 的 `isnetis.onnx`，本機名稱為 `isnet-anime.onnx`。沒有修改權重。BIT DRAW 的輸入轉換程式自行實作，使用作者公開的等比例縮放、置中黑邊、RGB / 255 規格。

模型下載網址、大小與 SHA-256 見 [model-manifest.mjs](scripts/model-manifest.mjs)。模型二進位和 npm 套件不納入 Git；安裝程式下載後核對 SHA-256。程式執行時從本機讀取模型，不把圖片送到上述服務。

測試圖片、比較頁及畫面中的插畫授權見 [ASSET_LICENSES.md](ASSET_LICENSES.md)。程式授權不授予第三方人物肖像、商標或使用者匯入圖片的額外權利。
