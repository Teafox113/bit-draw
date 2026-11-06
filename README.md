# BIT DRAW · Pixel Studio 0.10

本機像素繪圖與圖片重建工作台，提供人類介面及 Codex／Claude 可直接執行的命令協定。

## 安裝與啟動

需要 Node.js 20 以上。首次 clone 後：

```sh
npm ci --ignore-scripts
npm run setup:models
npm start
```

開啟 http://127.0.0.1:4173/ ，Windows 也可使用 Start BIT DRAW.cmd。模型準備腳本從官方 rembg 發布下載 U²-Net 模型並核對上游校驗碼；精細模型約 176 MB、輕量模型約 4.6 MB。之後圖片分析完全在本機執行，無上傳、無雲端推論費用。模型只需安裝一次，不進 Git 或每個專案。ONNX Runtime 的瀏覽器檔案由固定 npm 版本複製。

一般回歸測試：`npm test`。實圖比較與誤判案例：[docs/quality-v10.html](docs/quality-v10.html)；[驗證報告](qa/VERIFICATION-0.10.md)。歷史 qa 腳本需要未納入 Git 的本機大型素材，並非 npm test 的必要條件。

## 0.10：先去背再縮圖，優先保留眼口

- `image.pixelize` 新增 `removeBackground: "quality" | "model" | "fast" | false`。quality 為精細 U²-Net、model 為 U²-Netp 輕量模型、fast 沿用邊緣色差。先排除背景來源像素，再計算每個輸出格子的顏色，減少邊緣色污染。需精確 width/height。
- `preserveFeatures:true` 自動建立眼口保護區，平衡取樣，縮色時提高這些像素的權重；沒有辨識到臉就回報 0 區域，不捏造五官。與手動 protect 擇一。`image.finish.detailMode` 支援 balanced/strong；舊指令預設 strong，介面預設 balanced。
- `document.focus / document.focusPreview` 新增 subjectMode=quality/model/fast、subjectThreshold=0.1–0.9。門檻預設 0.5；預覽將移除範圍變暗。既有透明圖沿用 alpha，跳過模型。模型結果標記 review，屬顯著物件分割，不能保證只留下人物。
- 同來源同模型只推論一次；改門檻不需重跑模型。模型執行在 Worker。原圖不可變，取樣遮罩用 RLE 隨 grid.output 保存，摘要只含尺寸、方法與覆蓋率，不傳整份遮罩。
- 專案內格式升為 v5，讀取 v1–v4 時自動升級；外層仍為 bitdraw-packed v1。請勿使用舊編輯器處理新專案，以免重建忽略去背設定。

代理可先保存 [recipes/smart-cutout.json](recipes/smart-cutout.json)，之後僅傳 recipeId、expectedUpdated、documentId、expectedRevision 與少數 values。照片用 kind=photo/preset=photo；複雜背景動漫請用 kind=illustration/preset=illustration。framing=face 自動裁臉，完整構圖改 full。模型摘要、請求 bytes 與實際 Token 數不同，未聲稱特定 Token 節省比例。

```json
{"action":"document.apply","documentId":"doc-2","expectedRevision":0,"dryRun":true,"commands":[{"op":"image.pixelize","width":96,"height":74,"padding":3,"colors":24,"kind":"photo","framing":"face","removeBackground":"quality","preserveFeatures":true,"finish":{"autoProtect":true,"kind":"photo","restoreDetails":true,"detailMode":"balanced","despeckle":{"maxArea":2}}}]}
```

先核對預演與輸出 PNG，再提交。精細模型在測試電腦初次約 7–9 秒；輕量約 1.5–1.8 秒。複雜動漫背景仍可能留下咖啡杯等顯著物件；側臉、遮擋、手指與髮絲需人工核對。模型和眼口估計都不等同完整語意分割／landmark 系統。

以下保留歷版功能文件；涉及版本與新去背行為時以上方 0.10 說明為準。

# BIT DRAW · Pixel Studio 0.9

## 0.9：自動眼口保護、背景運算與壓縮專案

「像素重建」新增自動取景（全圖／臉部／主體範圍），以及「分析五官與主體」「套用自動保護」。照片以本機 pico cascade 找臉，再估計眼口；動漫以平坦色彩、色域與局部對比尋找候選。選 auto 時，照片沒有找到臉且缺乏平坦色彩證據，就不套用插畫 fallback。圖中青色是主體候選 bounds、黃色是臉、粉紅是眼口保護。這些不是完整 landmark 或人物分割模型；側臉、遮擋與特殊畫風仍需核對。

`document.focus {documentId,expectedRevision,kind:"auto"}` 回傳短摘要、source 座標的人臉及輸出座標的 protect；`document.focusPreview` 另回傳 PNG（CLI 用 request 指定輸出路徑）。同一來源的分析會快取。`node agent.mjs SESSION focus DOC options.json` 的 options 需含 expectedRevision，可選 kind=photo/illustration/auto。自動主體先使用 alpha；不透明圖以邊緣色差 flood fill 估計，所以背景道具可能被一起選入，會標記 reliability=review。

```json
{"action":"document.apply","documentId":"doc-2","expectedRevision":0,"dryRun":true,"commands":[{"op":"image.pixelize","width":96,"height":74,"padding":3,"framing":"face","kind":"auto","preset":"illustration","colors":24,"finish":{"autoProtect":true,"restoreDetails":true,"despeckle":{"maxArea":2},"outline":{"style":"adaptive","mode":"outer","thickness":1}}}]}
```

`framing` 可為 full/face/subject，與 crop 擇一；face 找不到臉會明確失敗，可改 full，不會任意猜位置。需要保持原構圖就使用 full。`image.autoFocus {kind}` 可單獨更新保存的保護區；`image.finish {autoProtect:true,kind,restoreDetails:true}` 在找不到臉時跳過細節還原，摘要會顯示沒有保護區。autoProtect 與手動 protect 擇一。原圖保留，重建後重新定位。

`image.cutout {autoSubject:true,kind}` 可依來源主體候選去背；不可靠的範圍預設拒絕，只有看過預覽後才使用 allowUncertain:true。這不代表任意照片都能可靠自動去背。可繼續使用人工標註 labelIds 或 polygon 修正。

### 描邊模式

| style | 行為 |
|---|---|
| solid | 固定 color 的單色輪廓 |
| adaptive | 相鄰原色約 50% 亮度的彩色輪廓；可能增加色數 |
| selective | 彩色輪廓，省略朝向指定 light 的受光側；程序化 sel-out 近似 |
| double | 第一圈用 color，外圈用 lightColor；外描邊、thickness 至少 2 |

同時支援 mode=inner/outer、geometry=diamond/square、厚度 1–4 px。light 可選 top-left/top/top-right/left/right/bottom-left/bottom/bottom-right，預設左上。保護區不被描邊覆蓋；命名區域可用 labelIds，描邊仍修改目前圖層，可復原。完整不透明照片的外描邊會沿畫面 alpha 邊界，需主體去背或標註才有角色輪廓。參考 [Lospec 像素描邊教學](https://lospec.com/articles/pixel-art-outlines/) 與 [Aseprite Outline](https://www.aseprite.org/api/command/Outline)，成品對照在 [qa/real-v9/comparison.html](qa/real-v9/comparison.html)。

### 速度、儲存與代理

較重的代理批次、UI 快速像素化／成品修整、辨識、壓縮及解壓在 Worker 執行。原圖以 typed array 傳送一次；只對保護範圍重新取樣細節。提交時重新核對 revision，背景運算期間的其他修改不會被過期結果覆蓋；dryRun 不改動文件，整批一次復原。`window.bitdraw.dispatch/batch` 在 0.9 改為 Promise，使用 await；建議代理維持明確 documentId/revision 的 request／HTTP 協定。Node cli.mjs 會自動載入本機 facefinder；直接使用核心模組時，照片辨識需先 loadFaceModel。

預設儲存為 `bitdraw-packed` v1 包裝、內含 v4 專案，檔名仍是 `.bitdraw.json`。每個來源／圖層用無損 RGBA gzip＋base64 與 SHA-256 校驗；載入檢查宣告長度及解壓上限。舊 v1–v4 JSON 可讀，備份相容；舊編輯器不能開新的壓縮包。需要明文相容檔，可用 `document.save` 加 `encoding:"legacy"`（檔案較大）。原圖沒有降解析度或有損重壓。

本次測試：動漫專案 26.45→0.20 MB，照片 88.66→18.47 MB；相同細節修整暖機後中位數約 60–64→17 ms。資料見 [VERIFICATION-0.9.md](qa/VERIFICATION-0.9.md)，不能解讀為整套 app 倍速。原圖上限仍為 8,388,608 像素，來源 RGBA 在記憶體的大小不會因檔案壓縮而消失；主執行緒仍負責顯示與部分編輯。

重用流程：[recipes/smart-icon.json](recipes/smart-icon.json)。保存一次後，只需流程 ID／版本及尺寸參數；不用每次傳送眼口座標或全文指令。回應只有摘要與統計，需核對時才取 PNG；JSON bytes 不等同實際 Token。

## 0.8：精確原生尺寸與成品修整

「像素重建」提供 370×320、240×240、96×74、180×180 與自訂寬高，輸出每邊 1–1024 px。這是 PNG 的真實寬高，與畫面或匯出放大倍率分開。`contain` 保留比例並留透明邊，`cover` 裁切填滿，`stretch` 拉伸。`padding` 是四邊留白；`crop:{x,y,width,height}` 可用指令指定原圖裁切。小圖示可裁取臉部，避免整個人物縮得太小。

精確模式的 `pixel-plan` 回傳 `layout.source` 與 `layout.content`：來源位置轉輸出位置用 `content.x+(sourceX-source.x)/source.width*content.width`，Y 同理，並裁在 content 內。不要再用整數 cellWidth 換算。修改舊格線欄位會退出精確模式；純儲存專案保留精確設定。

```json
{"action":"document.apply","documentId":"doc-2","expectedRevision":0,"dryRun":true,"commands":[{"op":"image.pixelize","width":96,"height":74,"fit":"contain","padding":2,"colors":24,"preset":"illustration","finish":{"despeckle":{"maxArea":1,"passes":1},"outline":{"mode":"outer","thickness":1,"color":"#343233"}}}]}
```

預演後以同一 revision 提交。`image.pipeline` 同樣接受 width/height/crop/finish；順序為重建、分類、配色、成品修整，整批可一次復原。

| 命令 | 用途 |
|---|---|
| `detail.protect {regions:[{x,y,width,height}]}` | 保護最多 32 個輸出座標矩形，隨專案保存；重建清空，避免錯用舊位置 |
| `image.finish {despeckle:{maxArea:2,passes:1}}` | 清除封閉微小色塊；跳過保護範圍、透明邊及分類邊界 |
| `image.finish {restoreDetails:true}` | 精確尺寸模式下，依原圖局部對比恢復保護範圍；遵守區域色盤，無區域規則則使用現有畫面色盤 |
| `image.finish {outline:{mode:"outer",thickness:1,color:"#252333"}}` | outer 在透明邊描邊，inner 在輪廓內描邊；可加 labelIds 指定前景。修改目前圖層，可復原 |
| `image.cutout {labelIds:[…]}` 或 `{polygon:[…]}` | 保留指定前景，外部透明；兩者並用取交集，原圖保留 |
| `region.mask {id,action:"constrain",polygon:[…],outsideId}` | 限制指定遮罩輪廓，把外溢位置歸回另一個有效區域；再以 reference:source 配色 |

`image.finish` 可用 `protect` 同時指定保護矩形；回應僅傳 cleaned/outlined/details/protectedPixels 計數。保護是代理看圖或人類選區提供，不是人臉語意模型。需重要細節時，在清理之前先定位；恢復不會憑空生成五官。描邊顏色可超出原本縮色數量，依需求最後再檢查色盤。

可保存 [recipes/exact-icon.json](recipes/exact-icon.json)，後續只傳流程 ID、版本與 width/height/colors 等參數。跨圖不沿用眼口座標或舊分類遮罩。實圖比較頁：[qa/real-v8/comparison.html](qa/real-v8/comparison.html)；原生 PNG、前後圖、修正專案、測試命令與素材授權均在同目錄。完整驗證見 [VERIFICATION-0.8.md](qa/VERIFICATION-0.8.md)。

目前保存 **v4** 專案，可讀 v1/v2/v3；舊編輯器不支援精確尺寸設定，勿用舊分頁開新版專案。大圖最高 8,388,608 像素／單邊 8192 px，仍以主執行緒運算；原圖 RGBA 專案可能很大，待後續 Worker 與二進位儲存優化。

## 0.7：自動分區、遮罩修正與照片流程

「備份與流程 → 自動分區與遮罩修正」提供兩種分區方式：不提供提示時，依連通色差挑選主要色塊，自動建立 `area-*` 區域；提供 `groups` 時，使用分類種子、OKLab 色差、四向邊界與空間路徑成本擴張分類。**名稱來自人或看圖的代理；程式沒有內建人物／物件語意模型。** 這讓 Codex／Claude 看一次原圖、提供少量位置後，就能直接完成其餘像素處理。

每張圖片的建議流程：`import → source → pixel-plan → image.pipeline（dryRun / commit）→ atlas → region.mask → region.rules.apply → save / export`。不必逐格傳送座標，分類摘要與操作結果不包含完整遮罩；只有檢查邊界時匯出預覽。範例照片與成品在 [qa/real-v7](qa/real-v7)，驗證見 [VERIFICATION-0.7.md](qa/VERIFICATION-0.7.md)。

### 一次執行像素化、分類與配色

`document.apply` 的 `commands` 可放一個 `image.pipeline`：

```json
{
  "op":"image.pipeline", "targetSize":64, "colors":24, "preset":"photo",
  "groups":[
    {"name":"皮膚","category":"skin","points":[{"x":26,"y":14},{"x":29,"y":18}]},
    {"name":"背景","category":"background","points":[{"x":3,"y":3}]}
  ],
  "uncertainty":0.08,
  "reference":"source",
  "rules":{"format":"bitdraw-region-rules","version":1,"name":"簡化配色","categories":[
    {"category":"skin","colors":["#ac7764","#e2af8b","#f7d6ab"],"mode":"nearest"},
    {"category":"background","colors":["#292837","#a0a3ac","#d8d5c9"],"mode":"nearest"}
  ]}
}
```

這裡的座標只是說明，**必須根據該張圖、pixel-plan 輸出尺寸重新選取**。座標為輸出像素 `(x,y)`；種子需在不透明像素上。每組可另加 `polygon` 限制擴張範圍。最多 32 類、256 個種子；不同類不可共用種子。原圖座標可用格線 offset 與 cell 尺寸換算，不能直接當作輸出座標。

`uncertainty`（0–0.9，預設 0.08）使用兩個最佳路徑分數的相對差距；它不是語意正確機率。無法到達或競爭接近的像素放入保留分類 `unclassified`（待確認），pipeline 不替這一類換色。沒有種子的獨立透明島也會留待確認。`edgeWeight` 預設 3，`spatial` 預設 0.015；放大前者增加跨越色差邊界的成本。

`colors` 限制起稿縮色數；最終色數由各分類色盤及保留原色的待確認區域決定，可能超過起稿色數。提供 rules 時，每個已分類區域都需有規則；缺少則整批取消。已有標註時需明確 `replace:true`，才會取代該圖層標註。整個 pipeline 是一次復原，原圖保留。

只要分類、不重建時用 `region.autolabel`，其分區參數相同。唯讀 `document.segmentPlan` 需 `documentId`、`expectedRevision`，回傳類別面積、待確認數量，不傳 runs。分區使用目前圖層色彩；反覆配色後重新辨識，建議以 pipeline 重新由原圖起稿。

### 遮罩修正

```json
{"op":"region.mask","id":"label-4","action":"add","points":[{"x":48,"y":32}],"radius":1,"overlap":"transfer"}
```

- `add`、`subtract`、`intersect`：可提供 `points` 圓筆刷、`polygon` 或 `regionIds`；多種選取條件取聯集。筆刷半徑 0–32；regionIds 配合原分析 tolerance，不能跨圖沿用。
- `grow`、`shrink`：四向擴張／收縮，半徑 1–16。
- `fillHoles`：填補未接觸畫布邊界的內部孔洞，透明像素仍保留。
- `keepLargest`：只留最大四向連通區。
- `split`：提供選取範圍、`name`、`category`，將部分範圍分成新 ID；新區域使用分類色盤。
- `merge`：以 `id` 為保留目標、`ids` 為其他區域 ID，合併同層遮罩並保留目標名稱與色盤。

所有遮罩操作保留像素色彩。新增／擴張／填洞若碰到其他區域，預設拒絕；明確 `overlap:"transfer"` 才移轉所有權。刪空的標註會移除，可 Undo。鎖定、隱藏、失效或不同圖層的目標會拒絕。修正後重新 `labels` 讀取有效 ID。

`region.rules.apply` 與 `rule.run` 新增 `reference:"source"`：依原圖與目前格線重新取樣，再選分類色號，避免連續換色累積偏差。預設 `current` 沿用現有像素；原圖透明而新畫的像素會以目前色彩為參考。保留目前 alpha。

### 儲存流程與精簡操作

`recipes/astronaut-guided.json`、`recipes/coffee-guided.json` 是可重用範例。新參數型別 `regionGroups` 僅接受有界的名稱、分類、種子與多邊形；範例刻意不設定種子預設值，每張圖由代理重新提供。流程與配色只儲存一次，之後執行僅需流程 ID、版本、文件 ID、revision、groups 及目標尺寸。

```text
node agent.mjs sessions
node agent.mjs SESSION list
node agent.mjs SESSION source DOC original-preview.png
node agent.mjs SESSION pixel-plan DOC options.json
node agent.mjs SESSION recipe-save recipes/coffee-guided.json
node agent.mjs SESSION run run.json
node agent.mjs SESSION atlas DOC labels.png
node agent.mjs SESSION labels DOC
node agent.mjs SESSION segment-plan DOC options.json
node agent.mjs SESSION save DOC finished.bitdraw.json
node agent.mjs SESSION export DOC finished.png
```

`run.json` 使用既有 recipe.run 格式：`documentId`、`expectedRevision`、`recipeId`、`expectedUpdated`、`values:{groups:[...]}`；先加 `dryRun:true`，檢查後提交。`atlas` 產生帶編號 PNG，終端只輸出短圖例。一般代理請優先用 labels 和 atlas，不讀全專案。

`document.export` 新增 `scale:1..16` 整數倍最近鄰匯出；原生 PNG 預設 1 倍。使用 `agent.mjs SESSION request request.json output.png`。放大不補色、不模糊每格。

目前是少量視覺提示的像素化與分區起稿工具。細小五官、同色相連物件與遮擋仍需修正；不等同手工像素畫或零提示語意辨識。核心在瀏覽器主執行緒運作，大圖與大量分類仍待效能壓測。0.8 保存 v4，舊專案可讀；含精確尺寸／成品修整的配方需 0.8。

## 0.6：從圖片起稿到分類配色

「像素重建」面板新增圖片快速像素化：照片採平均取樣，插畫與 AI 像素圖採主要色群，設定目標長邊與色數後預演／套用。原圖保留，整次操作可復原。正方格取樣使輸出長邊不超過目標，並保留近似長寬比；不會為湊指定尺寸把像素拉成長方形。多圖層重建需維持尺寸，重建會使既有標註失效。AI 像素圖若已有格線，仍優先手動校準。

「備份與流程 → 命名區域與配色規則」可保存區域名稱、分類及專用色盤。先在區域助手選色塊，再輸入如「臉與手」／`skin`，可建立新區域、將其他色塊加入同一區域，或重新指定既有範圍。分類也可自訂；名稱不參與配色，分類 ID 必須與規則完全相同。

| 分類 ID | 用途 |
|---|---|
| skin | 皮膚 |
| hair | 頭髮 |
| clothes | 衣服 |
| shadow | 陰影 |
| eyes | 眼睛 |
| accessory | 配件 |
| background | 背景 |

標註保存的是指定圖層上的稀疏像素遮罩，不是重新分區後的臨時編號。相鄰區域改成同色後，兩個名稱仍各自持有原範圍。同層標註不可重疊；透明像素不加入遮罩。一般繪圖與改色保留原位置標註，不會自動追蹤人物移動或新畫出的輪廓。重建、刪除／合併圖層會標示失效；Undo 可回復。區域可跨多個分離色塊，但不跨圖層；最多 128 個名稱。

區域專用色盤優先於分類規則；選「依分類規則」可移除專用覆寫。色盤從工作色盤複製顏色快照，之後修改原色盤不會悄悄影響既有規則。每類 1–64 色、每份規則最多 32 類。`nearest` 依 OKLab 最近色映射；`ramp` 依每個命名區域的相對明暗分配由暗至亮的色階，單色區域使用中間色。透明度保留，未命名像素不修改。

規則可儲存於本機庫及匯出／匯入 JSON。套用預設只處理目前圖層；CLI 可用 labelIds 明確指定其他圖層的區域。缺少分類色盤、標註失效或圖層鎖定會讓整次操作失敗，無部分修改。預演不改像素，套用可一次復原。規則庫獨立存於 `bitdraw-region-rules` IndexedDB，與備份一樣受瀏覽器／網址與清除網站資料影響。

可重用範例：`rules/character-soft.json`、`rules/night-wardrobe.json`；起稿流程為 `recipes/photo-to-pixel.json`。分類規則不包含圖片的遮罩或座標，另一張圖需先重新命名分類，之後只需傳規則 ID 與版本。

### 代理最短工作流程

```powershell
node agent.mjs sessions
node agent.mjs SESSION list
node agent.mjs SESSION import input.png
node agent.mjs SESSION source DOC source-preview.png
node agent.mjs SESSION pixel-plan DOC
node agent.mjs SESSION apply pixelize.json
node agent.mjs SESSION regions DOC
node agent.mjs SESSION apply labels.json
node agent.mjs SESSION labels DOC
node agent.mjs SESSION rules
node agent.mjs SESSION rule-save rules/character-soft.json
node agent.mjs SESSION rule-run recolor.json
node agent.mjs SESSION save DOC result.bitdraw.json
node agent.mjs SESSION export DOC result.png
```

先檢視 source-preview，再決定尺寸與語意分類；不要靠色號直接假設是皮膚。`document.pixelPlan` 只回傳建議格線、原生輸出尺寸與 `image.pixelize` 命令，不修改圖片。`document.sourcePreview` 預設最大長邊 512、可指定 64–1024，僅供看圖，並不縮減專案內原圖。原圖支援 PNG/JPEG/WebP，上限 20 MB／8,388,608 像素／每邊 8192，原生輸出每邊最多 1024。

以下 JSON 的 documentId、revision、regionIds、ruleId、updated 均須換成實際查詢值。先 dryRun，再用同一文件版本提交。

```json
{"action":"document.apply","documentId":"doc-2","expectedRevision":0,"commands":[{"op":"image.pixelize","targetSize":64,"colors":16,"preset":"photo"}],"dryRun":true}
```

一個命名區域可收納多個色塊；最多 1024 個 regionIds。新標註回覆會直接包含短 ID、名稱、分類及面積，不必再讀整份專案。

```json
{"action":"document.apply","documentId":"doc-2","expectedRevision":1,"commands":[{"op":"region.label","layerId":"layer-1","regionIds":["實際區域ID"],"tolerance":0,"connectivity":4,"name":"臉與手","category":"skin"}]}
```

同色部位連在一起時，可用 3–64 個整數頂點的 polygon 指定範圍（頂點是像素邊界，可到 width/height）。以像素中心及奇偶規則決定是否在多邊形內；若同時提供 regionIds，取兩者交集。這是可核對的手動範圍，不是自動語意辨識。先保存標註、檢視遮罩，確認後再改色。

```json
{"op":"region.label","layerId":"layer-1","name":"左側皮膚","category":"skin","polygon":[{"x":0,"y":0},{"x":16,"y":0},{"x":16,"y":32},{"x":0,"y":32}]}
```

`region.label` 可指定既有 `id` 及 `mode:"add"` 合併範圍；預設 replace 重新指定。`region.label.update` 的 `patch` 支援 name、category、palette（HEX 陣列或 null）、paletteName。`region.label.delete` 只刪標註，不刪像素。`document.labels` 回傳摘要，無完整遮罩；`document.labelPreview` 搭配 documentId、expectedRevision、labelId 回傳粉紅遮罩 PNG，使用 `request preview.json mask.png` 輸出。

```json
{"action":"rule.run","documentId":"doc-2","expectedRevision":2,"ruleId":"實際規則ID","expectedUpdated":123456789,"dryRun":true}
```

`rule.list` 精簡列出分類與色數；需要完整色碼才 `rule.get`。更新 `rule.save` 需 ruleId、expectedUpdated、rules；執行需 expectedRevision 與 expectedUpdated。`rule.run` 可加 `labelIds:["label-1"]`，不提供則處理目前圖層所有標註。`document.rules.capture` 從目前專用色盤／最近套用規則建立可攜分類規則；同分類存在不同覆寫時拒絕匯總，需明確編輯規則。已套用規則也存於專案，下載專案可攜帶標註與配色設定。

任意圖片可快速得到單格單色、受限色盤的像素化起稿，但本版沒有內建人物語意模型、去背或人工像素藝術品質保證。皮膚、頭髮、衣服與陰影由人或代理看圖標註；小圖細節、混色邊界、跨姿態一致性仍需修正。測試示例是合成連續色調圖片，不代表已完成真實照片／AI 圖集品質評測。資料摘要與規則 ID 可減少傳輸；沒有實測模型 Token 用量。

## 0.5：備份、流程與區域助手

頂部「備份與流程」集中提供三項功能，不增加常駐側欄。

**備份與當機後復原**：每 2 秒檢查修改文件，亦在頁面切到背景時嘗試寫入。每個文件實例保留最近 3 個完整版本，來源像素另存一份共用，圖層以 Uint8Array 存入 IndexedDB。同一筆交易寫入來源、快照與淘汰舊版，寫入失敗不發佈半份備份。跨瀏覽器分頁使用 UUID，互不覆蓋；不同文件的備份不會自動清除，可於清單刪除。狀態列顯示最近成功時間；容量不足／寫入錯誤會提示另存專案。未變動文件不重複寫入；「立即備份」包含乾淨文件。

重開相同網址時會提示先前版本。復原包含原圖、像素、圖層、色盤、未套用格線欄位與檢視，開成新文件並標記未儲存。新文件 revision 從 0 起算，undo/redo 歷史不保存。最近尚未完成備份的變動可能遺失；背景計時器可能被瀏覽器延遲。這不是作業系統層級的當機保證，也沒有跨裝置同步。清除網站資料、無痕模式、變更瀏覽器／主機名稱／連接埠可能使資料不可用，請定期下載 .bitdraw.json；流程另可匯出 JSON。

**流程庫**：將一批命令存成 `bitdraw-recipe` v1，參數以整個 JSON 值 `{"$param":"name"}` 取代；支援 color、integer、number、string、boolean、default、min/max，沒有 eval／腳本執行。最多 100 步、32 個參數、200 KB。預演不修改文件，套用整批只有一次復原。介面要求先預演，文件／流程／參數變動後重新預演。CLI 可直接套用，但必須明確指定文件 revision 與流程 updated。資料庫內更新流程也需 expectedUpdated，避免兩個分頁互相覆寫。流程不隱含原本的矩形選區；需要範圍時必須把 region 寫在命令內。

可匯入 `recipes/ai-pixel-cleanup.json`（格線重建＋縮色）及 `recipes/replace-color.json`（指定色號替換）。流程的圖層 ID／座標不會自動適應另一張圖；重新分析與預演後再使用。

```powershell
node agent.mjs sessions
node agent.mjs SESSION list
node agent.mjs SESSION backup
node agent.mjs SESSION backups
node agent.mjs SESSION restore BACKUP_ID
node agent.mjs SESSION recipe-save recipes/ai-pixel-cleanup.json
node agent.mjs SESSION recipes
node agent.mjs SESSION recipe RECIPE_ID workflow.json
node agent.mjs SESSION run run.json
node agent.mjs SESSION regions DOC_ID
```

`run.json`（使用實際查詢到的 ID、updated、revision）：

```json
{"documentId":"doc-2","expectedRevision":3,"recipeId":"RECIPE_ID","expectedUpdated":123456789,"values":{"cellWidth":8,"cellHeight":8,"colors":16},"dryRun":true}
```

`regions DOC_ID options.json` 可指定 layerId、bookId、tolerance（預設 0）、connectivity（預設 4）、offset、limit（預設 24，上限 100）。回傳面積排序、區域 ID、面積、邊界、種子座標、平均色、色差幅度、鄰接 ID（前 12 筆與總數）、工作色盤最近 3 色及可直接使用的 `command`。只分析指定圖層的非透明像素；不同 alpha 不會自動切區，但填色保留原 alpha。四向接觸用於鄰接摘要。

**代理正確填色順序**：inspect 確認圖層／版本 → regions 找候選區 → 必要時 document.export 局部原貌及 document.regionPreview 粉紅遮罩 → 選工作色盤色號 → document.apply dryRun → 同一版本提交。像素位置、面積及形狀雜湊組成 ID，純改色且形狀不變時維持 ID，形狀改變就拒絕舊指令。這是確定性指紋，不是可跨圖片或動畫影格追蹤的物件 ID。外層 expectedRevision 仍不可省略；多區域在同批中因新顏色合併而改變形狀時，整批會安全回滾，需重新分區。

```json
{"action":"document.regionPreview","documentId":"doc-2","expectedRevision":3,"layerId":"layer-2","regionId":"查詢所得 ID","tolerance":0,"connectivity":4}
```

以 `node agent.mjs SESSION request preview.json mask.png` 輸出遮罩，避免輸出 base64。把 regions 回傳的 command 放入現有 document.apply commands，修改 color 即可；若分析的不是目前圖層，先以 layer.select 選取，並重新 inspect／分析。

候選色以平均 RGB 轉 OKLab，色距乘 100 排序；距離 >12、前兩候選差 <2 或區域 RGB 幅度 >40 時標示需判讀。這些是可檢查的啟發式，不是信心機率。色距無法知道皮膚、衣服、光源或角色設定；不要把「最近色」說成「語意正確色」，也不要自動接受候選。需要語意時先查看局部圖或由使用者指定，再用 ID 精準填色。

流程存一次後只傳 ID、版本與參數，區域分析只傳摘要；只在需要視覺判讀時取 PNG。這些減少重複內容與往返，尚未做實際模型 Token 基準測試，短流程也不保證每次都比原始命令更短。

本機像素繪圖與 AI 圖片重建工作台。0.5 加入自動備份與復原、可重用參數流程，以及帶區域形狀核對與色盤候選的代理操作。保留多文件分頁、原圖比對及即時 CLI。設計重點是人類與 Codex／Claude 共用同一套編輯核心；這是開發版，尚非商用發行驗收。

## 啟動

需要 Node.js 20 以上，沒有第三方執行期依賴，不需 npm install。雙擊「Start BIT DRAW.cmd」，再在瀏覽器開啟 http://127.0.0.1:4173 。也可在此資料夾執行：

    node server.mjs

關閉終端機可停止本機伺服器。預設僅監聽 127.0.0.1；圖片與專案在瀏覽器處理；備份與流程存於此網址的本機 IndexedDB，不傳往雲端。若連接埠佔用，設定環境變數 BIT_DRAW_PORT 後啟動。不要直接雙擊 index.html，ES module 需經 HTTP 載入。

## 多文件與原圖比對

最多同時開啟 8 份文件。新增畫布、匯入圖片、開啟專案、載入示例都新增分頁。圖片與專案選擇器可以一次選多個檔案，圖片也能批次拖入。每頁獨立保留圖層、色盤、復原紀錄、選區、前景色、工具、縮放、比對方式及尚未套用的格線欄位。

點分頁切換；× 關閉，未儲存會確認，至少保留一份文件。「複製文件」建立獨立副本，「重新命名」可復原。Alt+PageUp／PageDown 切換文件，Ctrl+O 開啟專案。儲存與匯出作用於目前分頁。修改中的文件與檢視有本機自動備份；重新開啟頁面後會提示可復原版本，需選擇復原至新分頁，不會自動覆蓋工作區。

比對列一直保留在畫布上方，與右側編輯／轉換分頁無關：

- 左右並排：原圖左、成品右。
- 上下並排：原圖上、成品下。
- 透明疊圖：原圖以 0–100% 不透明度疊在可編輯畫布上，可繼續繪製。使用已套用的格線尺寸與 X／Y 起點對齊，不做任意影像拉伸對位。
- 僅編輯圖：隱藏參考圖。

可同步兩邊的縮放與捲動；使用格寬／格高換算原圖與工作像素比例。符合視窗時採整數倍顯示工作像素；上下並排在小螢幕可能較小，可手動放大後同步捲動。透明疊圖、格線與區域標記都不影響 PNG 或專案像素。

## 工作區

移除了原先的 WORKSPACE 標語與介紹區。頂部為檔案與工具選項，左側為繪圖工具，中間為主要畫布，右側提供「編輯／像素重建／調整／區域」分頁。右下方固定圖層面板，色盤可獨立捲動；窄視窗可按「面板」暫時收起右側區域。圖層列表內容較多時可捲動。

設計參考 Adobe 的 [工作區介紹](https://www.adobe.com/learn/photoshop/web/ps-basics-fundamentals) 與 [圖層面板](https://helpx.adobe.com/photoshop/desktop/create-manage-layers/get-started-layers/work-with-the-layers-panel.html) 所述工作方式；BIT DRAW 並不提供 Photoshop 全功能或 PSD 相容性。

## 圖層

- 最多 16 層，可新增透明圖層、複製、重新命名、上移、下移、刪除、向下合併。
- 列表上方為前景，資料陣列從底層到頂層排列。
- 左側圓點切換可見性，右側菱形切換鎖定；鎖定或隱藏的圖層不能繪圖、填色、縮色或重建。
- 支援正常混合與 0–100% 不透明度。數值可輸入後按 Enter 或離開欄位套用。
- 目前圖層有高亮標示。畫布顯示所有可見圖層的合成結果，吸色亦從合成結果取樣。
- 合併需要目前及下方圖層均可見、未鎖定。合併結果烘焙到下方圖層，透明度回到 100%，可復原；8-bit 半透明連續合併可能有約 1 級的捨入差異。
- 至少保留一個圖層。所有圖層修改可復原；選取圖層本身不新增復原步驟。

## 顏色與自訂色盤

顏色面板支援原生選色器、HEX（#RRGGBB）、RGB 0–255。色票面板可保存最多 32 組具名色盤，每組最多 256 色。

1. 點「＋」建立色盤，用名稱欄與勾號命名。
2. 修改前景色後按「＋ 前景色」加入色卡。
3. 點選一張色卡，修改前景色，再按「更新色卡」；或按「刪除色卡」。
4. 「分析原圖」開啟色盤工作室，擷取原始圖片的主要色與占比，另建或追加至工作色盤。「圖片使用色」仍可取用目前可見合成圖的顏色。
5. 色盤隨專案保存；「匯出／匯入」可用 BIT DRAW palette JSON 跨專案交換。尚未支援 ASE、ACO、GPL 色盤檔。
6. 「將目前圖層對應至此色盤」將該層（或選區）以加權 RGB 距離映射到指定顏色，不改變其他圖層或像素 alpha。色盤不可為空。
7. 「圖片使用色」是可見合成圖的統計，不是限制色盤；透明度混合可能產生色盤外的合成色。

自訂色盤沒有自動保存到全域素材庫，需儲存專案或匯出色盤檔。

### 色盤工作室

- **原圖分析**：選擇 8／16／24／32／64 個目標色，以加權中位切割整理顏色。最多分析 65,536 個分層抖動取樣；較大圖片明確標為「抽樣估計」。占比以非透明取樣像素數計算，並非物件面積或精確全圖統計。完全透明圖片無色盤可建立。
- **兩色混合**：分析結果可直接指定 A／B，也可從目前工作色盤取色或使用前景色。0–100% 是 B 的占比，以 sRGB 通道插值，並非實體顏料混色。結果可設前景色、加入色盤，或將 A／B 色卡合併。
- **色卡替換**：「替換色卡 A → B」只整理工作色盤，會去除重複色卡，不改畫布。欲修改圖像，使用下方「套用替換」；支援 A→B、A→混合色、A與B→混合色，僅影響目前圖層／矩形選區，保留每格 alpha。
- **匹配容許值**：0 為精確 RGB 同色，1–255 容許各通道的差異。介面顯示預計匹配像素數，找不到匹配會明確提示。分析產生的代表色可能與重建後的色不同，可增加容許值或從畫布吸色。
- **預設色盤**：12 組自編配色，涵蓋經典冒險、掌機、霓虹、柔和、肌膚、森林、海洋、火焰、金屬、糖果、大地、灰階。建立副本後可自由修改，原預設不受影響。
- **自訂選色**：點「自訂選色…」，以色彩平面設定飽和度／明度，色相滑桿或 HSV、RGB、HEX 數字欄位精確調整；原色與新色並列比較。自訂色盤的名稱、增刪修改、匯入／匯出仍在主面板。

### 區域區分與自動描邊

「區域」頁籤分析目前圖層的非透明像素，依 RGB 色差與四向／八向連通性分類。固定以區域起始色比較，避免漸層一路串連。這是色塊分區，不是人物、衣物、肢體等語意辨識；雜色與碎點可能產生很多小區域，建議先縮色。顏色不同或互不相連的島嶼會分開。

分析後可顯示彩色區域標記，列表顯示面積最大的 100 個，其餘仍可點畫布選取。開啟標記時，畫布點擊用於選區域；關閉預覽後恢復繪圖。選定區域可用前景色填色，亦受既有矩形選區限制。

自動描邊提供外輪廓、內輪廓、區域邊界三種模式，寬度 1–4 px，沿用色差／相鄰設定。區域邊界在兩側色塊內側各描邊，因此總邊線可能比設定寬度粗。先預覽再套用，會在目前圖層上方新增獨立「自動描邊」圖層，可調整透明度、隱藏或復原。只分析目前層，不是整張合成圖。外描邊需要畫布內透明空間；畫布外的筆畫會裁切，不會自動擴大畫布。修改圖層、選區或參數會取消舊預覽。

區域標記與尚未套用的描邊都是暫時預覽，不寫入專案或 PNG。套用後的描邊圖層才會輸出。

## 繪製與調整

- 新增：建立 1–256 px 的透明畫布。
- 鉛筆 B、橡皮擦 E：1／2／3／5／8 px 方形筆刷，連續筆畫以整數格線補點。
- 油漆桶 G：目前圖層、精確同色、四向連通填滿。
- 吸色 I：取樣可見合成圖。
- 矩形選取 M：拖曳選取後，繪製、縮色、色盤映射、調整與描邊皆受選區限制。
- Delete 清除目前圖層選區；Esc 取消選取。
- 平移 H 或按住空白鍵拖曳：放大後移動畫布視圖，也可使用捲動條。
- 「調整」提供亮度、對比、1 px 四向外描邊；直接修改像素、可復原，尚非調整圖層。
- Ctrl+Z 復原，Ctrl+Shift+Z 重做；Ctrl+S 下載專案。
- 最多 32 步復原，另設約 8,388,608 個 RGBA 通道值的歷史容量上限。大圖／多圖層時可復原步數會減少。

## AI 像素圖重建

匯入 PNG／JPG／WebP 後，會開啟原圖對照及像素重建面板。設定格寬、格高、X／Y 起點、主要色群／中心／平均取樣和透明門檻。格線即時預覽，按「重建目前圖層」才套用。

起點之前的原圖區域裁掉，右／下不足一格保留。輸出大小為 ceil((原圖尺寸 - 起點) / 格子尺寸)。主要色群及平均模式需至少半數取樣通過 alpha 門檻才保留該格。重建得到每格單色、二值透明的原生像素資料。

單圖層時可重建為不同尺寸；多圖層時必須維持現有畫布大小，以免隱性裁切其他圖層。欲更換整個專案尺寸，請另開原圖重新校準。重建替換目前層的手修內容，可復原。

自動縮色支援 2–64 色，僅處理目前層／選區。手動補色或圖層混合後，合成圖片的色數可能再次增加。

## 匯出與保存

PNG 匯出所有可見圖層的合成結果，不含格線或選框。倍率 1／4／8／16，使用最近鄰放大。設定在「調整」頁籤。

預設保留合成的 alpha；若需要完全透明／完全不透明，可勾「強制二值透明」，以 128 為門檻二值化。這只影響輸出，不改專案。

.bitdraw.json 保留原圖、圖層、像素、透明度、鎖定、色盤庫及格線設定。v1／v2／v3 舊專案自動升級為 v4，保存時寫成 v4；0.7 及更早的編輯器不支援 v4。歷史紀錄不保存。修改另有本機自動備份；正式保存仍請下載專案。

限制：圖片最多 20 MB、單邊 8192 px、總計 8,388,608 像素；工作畫布最大 1024 × 1024；專案上限 160 MB；色盤檔上限 100 KB。大原圖及多圖層操作仍可能短暫阻塞主執行緒。

## 指令介面

「⌘ 指令」接受一筆命令或 JSON 陣列，批次失敗會整批回復。無 eval 或任意 shell 執行。瀏覽器公開 window.bitdraw.getState()、dispatch(command)、batch(commands)、getCapabilities()。

檔案 CLI 可由 Codex／Claude 等本機代理使用：

    node cli.mjs input.bitdraw.json examples/layers-commands.json output.bitdraw.json

上述 cli.mjs 為離線檔案處理，成功才寫結果，不會修改已開啟的瀏覽器文件。另有下方 agent.mjs 即時介面，已可匯入圖片、修改活頁與匯出 PNG；圖像解碼／輸出由已開啟的瀏覽器完成。尚未提供 MCP adapter。

| op | 參數與說明 |
|---|---|
| project.rename | name，修改文件名稱 |
| paint.rect | x、y、width、height、color；filled 預設 true，false 畫 1 px 邊框，可選 region |
| paint.line | from:{x,y}、to:{x,y}、color，可選 region；整數 Bresenham 直線 |
| layer.add | 可選 name，於目前層上方新增並選取 |
| layer.duplicate | 可選 name，複製目前層 |
| layer.select | id |
| layer.update | 可選 id；patch 可含 name、visible、locked、opacity（0–1） |
| layer.move | index，0 是底層 |
| layer.delete | 刪除目前層 |
| layer.mergeDown | 向下合併 |
| swatch.save | name、colors（#RRGGBB 陣列）；有 id 更新，無 id 新增 |
| swatch.select / swatch.delete | id；delete 省略時刪目前色盤 |
| swatch.replace | from 色碼陣列、color；替換目前工作色盤中的色卡並去重，不改像素 |
| palette.analyze | 可選 count（2–64，預設 16）、name；從原圖建立工作色盤 |
| palette.mix | a、b（色碼）、percent（B 占比 0–100，預設 50）；混合色加入目前色盤 |
| color.replace | from 色碼陣列、color、可選 tolerance（0–255，預設 0）、region |
| region.paint | x、y、color、可選 tolerance（0–255，預設 20）、connectivity（4 或 8）、region；依全層分區選取包含座標的區域 |
| outline.auto | color、可選 mode（outer／inner／regions）、thickness（1–4）、tolerance、connectivity、region；新增描邊圖層 |
| palette.map | 可選 colors、region；省略 colors 使用目前自訂色盤 |
| adjust | brightness、contrast（整數 −100–100）、可選 region |
| outline | color、可選 region；1 px 外描邊 |
| selection.clear | 可選 region，省略會清空目前層 |

保留 grid.set、rebuild、palette.reduce（count）、paint.stroke（color、points）、erase.stroke（points）、fill（x、y、color）、undo、redo。像素修改可提供 region: {x,y,width,height}。points: [{x,y}]。所有座標從 0 開始。

## 即時代理操作：agent.mjs

先啟動伺服器並開啟新版工作台。底部會顯示「指令連線：已連線」。每個瀏覽器頁面有自己的 session，頁面內則有多個 documentId。代理先列出，不猜測目標：

    node agent.mjs help
    node agent.mjs sessions
    node agent.mjs SESSION list
    node agent.mjs SESSION inspect doc-1

SESSION 請替換成 sessions 回傳的完整 id，documentId／revision 亦使用實際回傳值。重新整理後 session 與文件 ID 重建。

將以下內容寫入 request.json，先模擬；dryRun 不改像素、dirty、版本與復原紀錄，只回傳變更摘要：

    {"action":"document.apply","documentId":"doc-1","expectedRevision":0,"dryRun":true,"commands":[
      {"op":"layer.add","name":"代理修正"},
      {"op":"paint.rect","x":3,"y":3,"width":4,"height":4,"color":"#c7e68c"}
    ]}

    node agent.mjs SESSION apply request.json

確認後以最新 revision 及 dryRun:false 執行。成功回覆僅含新版本、合成像素變更數、包圍框、圖層／色數；一批命令只占一個復原步驟，任一步失敗會整批回復。undo／redo 必須單獨成批。背景文件也能修改，不會強制切換使用者正在看的分頁。命令採明確座標與 region，不會自動套用 UI 中的矩形選區。

版本檢查避免覆蓋使用者的新操作。繪製中、正在載入檔案，或目標有尚未套用的格線欄位時，代理修改會被拒絕。逾時不自動重送；回覆可能遺失而操作已完成，須重新 inspect 核對版本。

其他常用入口：

    node agent.mjs SESSION import input.png
    node agent.mjs SESSION open input.bitdraw.json
    node agent.mjs SESSION save doc-1 output.bitdraw.json
    node agent.mjs SESSION export doc-1 output.png
    node agent.mjs SESSION request request.json

import 支援 PNG／JPG／WebP（20 MB）；open 支援 BIT DRAW 專案（80 MB），都開新分頁。save 在磁碟寫入成功後才標示已存；期間有新修改時保留 dirty。export 輸出原生尺寸、可見圖層合成與完整 alpha，不跟隨 UI 的輸出倍率或二值透明設定。

| request action | 參數／用途 |
|---|---|
| capabilities | 精簡能力清單 |
| documents.list | 只列文件摘要 |
| document.inspect | documentId；尺寸、版本、圖層、色盤摘要、待套用格線狀態，不含像素陣列 |
| document.readRegion | documentId、region，可選 layerId；最多 4096 px，回傳 #RRGGBBAA 色盤與 RLE |
| document.palette | documentId，可選 count；讀取原圖分析結果，不建立色盤、不改版本 |
| document.create | width、height、可選 name；新透明畫布 |
| document.activate | documentId；明確切換 UI 分頁 |
| document.view | documentId、view，可含 compareMode: horizontal／vertical／overlay／off、overlayOpacity:0–100、syncViews:boolean |
| document.apply | documentId、expectedRevision、commands、可選 dryRun |
| document.export | documentId、可選 region；使用 request request.json output.png 存局部圖 |

局部讀取例：{"action":"document.readRegion","documentId":"doc-1","region":{"x":0,"y":0,"width":8,"height":8}}。runs 為 [色盤索引,連續像素數]，以列優先掃描。只在需要視覺判斷時匯出局部 PNG；不會把 base64 或整份專案印入 CLI 輸出。減少的是交換資料量與來回步驟，實際 Token 節省依模型及工作內容而定，尚未做用量基準測試。

本機橋接僅監聽 loopback，驗證 Host、Origin、Authorization；每次啟動產生權杖，存於被忽略的 .bitdraw-runtime.json。CLI 自行讀取，請勿分享。瀏覽器採短輪詢，頁面需保持開啟；背景頁被瀏覽器節流時可能延遲或逾時。服務不接受任意 shell 指令或任意路徑讀寫，磁碟操作由明確執行的 CLI 完成。此介面沒有自動呼叫模型 API，也不會自行產生模型費用。

## 架構及下一步

dist/core.js 是 Node／瀏覽器共用的無 DOM 命令引擎，包含 schema 遷移、圖層合成與色盤演算法。dist/color-tools.js 提供 HSV、混色、連通分區與描邊；dist/studio.js 封裝色盤工作室及區域 UI；dist/app.js 處理主工作區、Canvas、檔案及指令面板。0.6 使用 v3 專案格式，包含命名區域遮罩與分類配色。專案含 layers[]、frames[].cels[layerId]、durationMs、anchors、directions、extensions；目前只有單一影格，為動畫與 3D 工具預留資料。

執行 node --test tests/*.test.mjs 驗證核心及本機橋接；環境需允許 loopback 測試。詳見 qa/VERIFICATION-0.6.md。原有指令範例：examples/studio-commands.json；即時整合測試命令：qa/agent-*-v4.json。

代理需求規劃已寫入 AGENTS.md。0.6 已實作備份／復原、參數流程、區域命名與分類規則、圖片像素化起稿。下一階段優先大型圖 Worker、實際照片／AI 圖集品質評測、遮罩修整工具與選區移動；動畫以 frame 指令、對齊、洋蔥皮及 GIF 進出設計。MCP 作既有協定轉接。此版尚無 PSD、動畫、3D、完整 Photoshop 功能，也尚未用真實 AI 圖集證明轉換品質。商用定位另見 COMMERCIAL-ASSESSMENT.md。
