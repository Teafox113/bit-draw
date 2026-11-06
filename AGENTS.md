# BIT DRAW 開發與代理操作原則

使用者的核心定位：這是人類與 Codex／Claude 共同使用的像素編輯器。代理可直接用命令讀取、修改、驗證及匯出，類似以程式操作編輯器的工作方式。指令介面不是附加功能；新功能要同時考慮人類介面與代理操作。

- 保留不可變原圖，以及編輯時可用的左右、上下、透明疊圖比對。
- 各文件分頁獨立管理像素、圖層、復原與檢視狀態；不得暗中替換其他分頁。
- 優先使用本機 CLI，不用截圖或逐個 UI 點擊來完成已具備指令的操作。
- 先 `node agent.mjs sessions`，再 `node agent.mjs SESSION list`，明確選擇 session 與 documentId。不可猜測活躍文件就是目標。
- `node agent.mjs SESSION inspect DOC` 只取摘要；只有需要定位時才讀 region 或匯出局部 PNG。不要把整份專案像素或 base64 印到對話。
- 寫入使用 document.apply：明確 expectedRevision、commands，必要時 dryRun。若版本衝突或逾時，先重新 inspect，不要盲目重送。
- 小型步驟組成一批，一次復原。優先 paint.rect／paint.line／fill／palette.map／region.paint 等高階命令，避免列出數千個座標。
- 儲存專案與 PNG 使用 CLI 輸出路徑；活頁儲存成功才標示已存。不能只修改 JSON 檔就宣稱正在開啟的 UI 已更新。
- `.bitdraw-runtime.json` 是執行期本機權杖，禁止輸出內容、提交、嵌入文件或分享。不要將服務改成公開監聽。
- `node agent.mjs help` 列出精簡能力。完整操作範例與限制見 README.md。
- 開始重要批次前可用 `backup` 強制落盤；備份在該瀏覽器來源的 IndexedDB，正式交付仍另存專案。`backups`／`restore` 只操作明確 ID，復原開新文件，不覆蓋目前文件。
- 先 `recipes`，需要定義才 `recipe ID`。執行流程需 documentId、expectedRevision、recipeId、expectedUpdated、values；用 dryRun 後再提交。不要每次重送流程定義。
- 精準填色先 `regions DOC`，使用回傳的 region.paintVerified 命令。核對圖層、面積、bounds，必要時匯出局部圖及 regionPreview；候選是 OKLab 色距，不是皮膚／衣服的語意判定。不要猜 ID，不把一次分析的 ID 用於別張圖。影像或版本變動後重新分析。
- 任意圖流程：import → source（小尺寸原圖預覽）→ pixel-plan → image.pixelize 預演／提交 → regions → 依看圖結果 region.label 批次分類 → labels／labelPreview 核對 → rule.run 預演／提交 → save／export。先完成起稿再標註；重建會使標註失效。
- 新標註直接回傳 label 短 ID。分離色塊可合併到同一命名區域；同色相連但不同部位可用 polygon，或 polygon 與 regionIds 的交集。不要向模型傳完整 runs 遮罩。缺乏視覺依據時不要猜 skin/hair/clothes；先讀局部預覽。
- `rules` 只取規則摘要，需色碼才 `rule ID`。跨圖片沿用分類→色盤規則，不沿用舊像素範圍。rule.run 需 documentId、expectedRevision、ruleId、expectedUpdated，必要時 labelIds。每區域專用 palette 優先於分類規則；先核對覆寫。
- 0.6 保存 v3 專案；可載入 v1/v2。不要使用舊分頁／舊編輯器處理 v3 分類專案。命名遮罩保留座標，不是物件追蹤；手動畫面結構改變後需檢查並重新指定。
- 測試：`node --test tests/*.test.mjs`，包含 loopback HTTP 測試，需要測試環境允許本機網路。UI 變動需瀏覽器實際檢查。

已有備份、流程庫、區域命名／分類與可攜配色規則、圖片像素化及多邊形標註。後續優先順序：大型圖片 Worker、二進位專案儲存、更多真實 AI 圖集與選區移動；動畫以 frame 命令、對齊及洋蔥皮檢視設計。MCP 可作現有協定的薄轉接，不另建一套像素邏輯。正式商用前需真實 AI 圖集及長時間操作驗證。

## 0.8 代理操作補充

目前為 **0.9**：優先 `focus DOC options.json`（expectedRevision 必填），需要視覺證據才 request document.focusPreview。framing=face 可自動取景，image.finish autoProtect 可自動更新眼口；未找到臉時回報空集合，不得宣稱成功辨識。照片 pico 分數不是機率，插畫為色域／對比候選。主體 reliability=review 不能當作精確人物遮罩；去背需先核對，不能無依據直接 allowUncertain。

0.9 預設保存 bitdraw-packed v1（內含 v4，副檔名不變），可讀舊 JSON；需要舊格式才 request document.save encoding:legacy。不要把壓縮 data 印出。重用 recipes/smart-icon.json；模型及像素都留在本機。Worker 批次結果會核對 revision，衝突後重新 inspect，不能盲目重送。window.bitdraw.dispatch/batch 現在需 await。真實驗證與限制見 qa/VERIFICATION-0.9.md。

- 輸出 PNG 指定 width/height（1–1024），不要以 export scale 冒充原生尺寸。使用 pixel-plan 的 layout 換算來源座標；exact 模式的 cellWidth 是顯示近似值，不是映射依據。
- source → pixel-plan → 看圖選 crop 與保護矩形 → image.pixelize/pipeline＋finish → 預覽 PNG → save/export。小圖可裁取主體重要部位；不要把裁切結果描述成保留整張圖。
- detail.protect 與 image.finish.protect 使用輸出座標，細節保護並非自動人臉偵測。despeckle 跳過保護與分類邊界；restoreDetails 遵守標註專用色盤／最近分類規則。影像尺寸改變需重新定位。
- 遮罩溢出用 constrain＋outsideId 歸還背景，再 reference:source 重配色；不能只改遮罩就宣稱修好了像素。先核對前後局部圖。
- v4 專案可讀 v1/v2/v3，舊編輯器不支援 v4。原圖最高 8 MP；只讀摘要，不把大型 source 陣列傳給模型。真實測試及授權見 qa/real-v8；83 項測試通過不代表任意圖語意判定正確。

## 0.7 代理操作補充

- 新圖片先 source 與 pixel-plan，再依輸出尺寸提供少量 groups；image.pipeline 一次重建、分區、配色，dryRun 後提交。沒有種子只產生 area-* 幾何類別，不能宣稱已辨識皮膚等語意。
- 優先儲存帶 regionGroups 型別參數的 recipe，之後只傳 ID／版本／groups。分類規則可沿用，新圖片的種子與多邊形必須重新定位。
- atlas 輸出編號 PNG 與短圖例；labels 無 runs。查看待確認 unclassified 與重要邊界，使用 region.mask 增減、split、merge、grow、shrink、fillHoles、keepLargest。需要移轉其他區域時明確 overlap:transfer。
- 遮罩修正只改分類，完成後以 region.rules.apply reference:source 重新配色，避免以錯配後的顏色繼續映射。明確 labelIds 可避開待確認區；pipeline 自動跳過該類。
- document.export scale 可設 1–16 整數倍；原生檔案保持原尺寸。不可用雙線性縮放冒充原生像素畫。
- 0.7 照片驗證與結果在 qa/real-v7。報告的少量位置抽查不代表全圖分割準確率；JSON bytes 不等同 Token。沒有實測不得宣稱零提示／任意圖全自動成功。

## 0.10 代理補充

目前版本 0.10，內含 v5 專案；舊 v1–v4 可讀。優先 recipes/smart-cutout.json，預演後看 PNG 再提交。subjectMode/removeBackground=quality 為精細本機模型，model 為輕量，fast 為舊色差。影像有既有 alpha 時跳過模型。所有模型主體結果均需核對；咖啡杯等顯著背景仍可能一起保留。preserveFeatures:true 在縮色前平衡取樣並提高眼口權重，不能保證未偵測的五官。document.inspect/pixelPlan 不回傳遮罩 runs；不可把專案整份 grid 或 source 印給模型。clone 後 npm ci --ignore-scripts，再 npm run setup:models。
