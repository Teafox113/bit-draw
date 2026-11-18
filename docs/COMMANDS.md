# 指令操作

BIT DRAW 的瀏覽器與離線 CLI 共用 `dist/core.js`。本機代理透過 `agent.mjs` 操作活頁；檔案批次使用 `cli.mjs`。代理不需要模擬滑鼠，也不需要傳送整張像素陣列。

## 選擇文件

啟動 `node server.mjs` 並開啟工作台後：

```sh
node agent.mjs help
node agent.mjs sessions
node agent.mjs SESSION list
node agent.mjs SESSION inspect DOC
node agent.mjs SESSION import input.png
node agent.mjs SESSION source DOC source-preview.png
```

`SESSION`、`DOC` 與 revision 必須使用實際回傳值。每個瀏覽器分頁各自連線，頁面內可有多份文件。`inspect` 只回傳尺寸、圖層、色盤、版本等摘要，不回傳原圖、模型或完整遮罩。

## 一批完成像素化

將下列內容寫成 `request.json`，替換文件 ID 及版本：

```json
{
  "action":"document.apply", "documentId":"doc-2", "expectedRevision":0,
  "dryRun":true,
  "commands":[{
    "op":"image.pixelize", "width":96, "height":74, "padding":2,
    "kind":"illustration", "preset":"illustration", "framing":"face",
    "removeBackground":"anime", "subjectThreshold":0.5, "colors":24,
    "preserveFeatures":true, "featureMode":"crisp",
    "finish":{"autoProtect":true,"kind":"illustration","restoreDetails":true,
      "detailMode":"crisp","despeckle":{"maxArea":2}}
  }]
}
```

```sh
node agent.mjs SESSION apply request.json
```

`dryRun` 驗證並回傳變更摘要，不改活頁。確認後設 `dryRun:false`，再次核對 revision 再提交。一批為一次復原；失敗整批回復。提交後匯出 PNG 檢查結果；若需套用前比較圖，可在複製文件上提交、匯出後檢查。

- `width/height` 是原生尺寸，1–1024；`contain` 保留比例、`cover` 裁切填滿、`stretch` 拉伸。匯出倍率不改原生尺寸。
- `framing`：`full`、`face`、`subject`；也可用來源座標 `crop:{x,y,width,height}`，與 framing 擇一。沒找到臉時會報錯，改用全圖或明確裁切。
- `removeBackground`：`false`、`fast`、`model`、`quality`、`anime`。後三者需本機模型。已有透明輪廓時直接使用 alpha。
- 動漫用 `kind/preset:illustration`、`anime`、`featureMode:crisp`；照片可用 `kind/preset:photo`、`quality`、`balanced`。清晰模式只重取樣已有亮暗細節，不補畫未辨識的眼睛。
- `image.finish.detailMode` 支援 balanced、crisp、strong。`autoProtect` 與手動 `protect` 擇一；保護矩形使用輸出座標。

去背及五官仍需看圖核對。多人物、遮擋、透明特效、很小的側臉都可能失敗。逾時或版本衝突後先 inspect，不自動重送。

## 重複使用流程

```sh
node agent.mjs SESSION recipe-save recipes/anime-icon.json
node agent.mjs SESSION recipes
node agent.mjs SESSION recipe RECIPE_ID
node agent.mjs SESSION run run.json
```

`run.json` 使用儲存時回傳的 recipe ID 與 updated 值：

```json
{"documentId":"doc-2","expectedRevision":0,"recipeId":"RECIPE_ID",
 "expectedUpdated":1234567890,"dryRun":true,
 "values":{"width":96,"height":74,"colors":24,"framing":"face","threshold":0.5}}
```

先 dryRun，再提交。流程定義只存一次，之後只傳 ID、版本與變動參數。`recipes/smart-cutout.json` 適合照片；`recipes/anime-icon.json` 適合動漫。`recipe ID output.json` 可匯出定義。減少的是請求內容及操作次數，尚未測量不同模型的實際 Token 用量。

## 區域、分類與配色

```sh
node agent.mjs SESSION regions DOC
node agent.mjs SESSION labels DOC
node agent.mjs SESSION atlas DOC atlas.png
node agent.mjs SESSION rules
```

先看原圖／區域預覽，再用回傳的 `region.paintVerified` 或 `region.label` 指令操作。分離色塊可以歸到同一分類；同色相連的不同部位可用 polygon 分開。無種子的自動分區只產生幾何區域，不能當成皮膚、頭髮等語意判定。

`region.label` 建立具名遮罩與分類；`region.mask` 支援增減、split、merge、grow、shrink、fillHoles、keepLargest。每區域專用色盤優先於分類規則。`rule.save/get/run` 可跨圖片沿用分類到色盤的規則，但不能沿用另一張圖的遮罩座標或 region ID。

完成遮罩修正後，以 `region.rules.apply reference:source` 重新配色。只改遮罩並不會自動改掉已填錯的像素。重建或改尺寸後需重新分類。

## 常用操作

| 指令 | 用途 |
|---|---|
| grid.set / rebuild | 格寬高、起點、取樣方式與每格單色重建 |
| layer.add / duplicate / update / move / delete / mergeDown | 圖層、鎖定、可見性與不透明度 |
| paint.rect / paint.line / paint.stroke / fill | 矩形、線條、像素筆與連通填色 |
| palette.analyze / mix / map / reduce | 原圖色盤、混色、指定色盤映射、縮色 |
| swatch.save / select / replace / delete | 自訂具名色盤 |
| color.replace / adjust | 色碼替換、亮度與對比 |
| image.autoFocus / image.cutout / image.finish | 五官保護、去背、細節修整與描邊 |
| outline.auto | 外輪廓、內輪廓、色塊邊界；新增圖層 |
| image.pipeline | 像素化、帶種子分區、分類配色批次 |
| undo / redo | 單獨成批執行 |

座標從 0 開始；像素修改可帶矩形 `region`。完整能力清單見 `node agent.mjs help`，可執行範例在 `examples/`、`recipes/` 與測試。

## 儲存、備份及離線批次

```sh
node agent.mjs SESSION backup
node agent.mjs SESSION backups
node agent.mjs SESSION restore BACKUP_ID
node agent.mjs SESSION save DOC output.bitdraw.json
node agent.mjs SESSION export DOC output.png
node agent.mjs SESSION open output.bitdraw.json
node cli.mjs input.bitdraw.json examples/layers-commands.json output.bitdraw.json
```

備份存於同瀏覽器來源的 IndexedDB；restore 開新文件。save 寫入磁碟成功後才標記已儲存。離線 CLI 不會更新瀏覽器活頁。預設保存 bitdraw-packed v1，內容為專案 v5；讀取舊 v1–v4，模型不嵌入專案。

`document.focus` 需 expectedRevision，可指定 kind、subjectMode、subjectThreshold；`document.focusPreview` 可輸出 PNG。`document.readRegion` 最多讀 4096 px，以色盤＋RLE 回傳。`document.export` 可帶局部 region；透過 `request request.json output.png` 寫檔。不要將 PNG base64、壓縮專案 data 或 `.bitdraw-runtime.json` 送入對話。
