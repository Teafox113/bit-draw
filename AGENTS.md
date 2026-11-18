# BIT DRAW 開發與代理操作

這是人與 Codex／Claude 共用的像素編輯器。新功能需同時提供介面與 JSON 指令，兩者共用核心，不另做一套繪圖邏輯。各 app 維持獨立資料夾。

## 操作活頁

- 優先本機 CLI。先 node agent.mjs sessions，再 SESSION list，明確選擇 session、documentId 與 revision；不能猜活躍文件。
- inspect、recipes、rules 只取摘要。需要定位才匯出原圖、區域、focusPreview 或 atlas；不要印 source、完整像素、mask runs、壓縮 data 或 PNG base64。
- 修改帶 expectedRevision，先 dryRun；小步驟合成一批、一次復原。版本衝突或逾時先 inspect，不盲目重送。
- 優先 paint.rect、paint.line、fill、palette.map、region.paintVerified 等高階命令，不列數千個座標。
- 正式保存用 save；CLI 寫檔成功才 markSaved。修改離線 JSON 不代表活頁已更新。
- 保留不可變原圖、多文件獨立狀態及左右／上下／透明疊圖比對。
- .bitdraw-runtime.json 是本機權杖，禁止輸出、提交或分享；服務只監聽 loopback。

## 圖片與配色

- import → source 預覽 → pixel-plan / focus → image.pixelize 或 recipe 預演／提交 → 匯出核對 → 區域分類配色 → save/export。
- 原生輸出 width/height 為 1–1024；export scale 只是最近鄰放大。使用 plan.layout 換算來源座標，不把 exact 模式的 cellWidth 當成精確映射。
- 照片可用 quality 去背與 balanced 取樣；動漫可用 anime、kind:illustration、featureMode:crisp。framing:face 會裁切，不代表保留完整原圖。
- 所有模型結果需核對，reliability:review 不等於精確遮罩。多人、遮擋或含真人的背景仍可能誤留；沒找到臉時不可宣稱辨識成功。
- 五官保護矩形為輸出座標；改尺寸後重新定位。清晰取樣保留來源亮暗細節，不生成五官。
- 先 regions，再用回傳的 region.paintVerified。區域 ID 不跨圖、不跨拓撲變動；顏色候選不是語意分類。
- skin/hair/clothes 等分類需看圖證據。無種子分區只是幾何區域。polygon 可拆同色相連部位；不傳完整遮罩給模型。
- 遮罩修正完成後，以 region.rules.apply reference:source 重配色；只改遮罩不等於改了像素。專用區域色盤優先於分類規則。

## 流程與保存

- 優先 recipes/anime-icon.json 或 smart-cutout.json。定義保存一次，之後用 recipeId、expectedUpdated、documentId、expectedRevision 與 values。
- rules 跨圖重用分類→色盤，不重用舊圖的座標。操作前核對覆寫與待分類區域。
- 重要批次前可 backup；復原開新文件，不覆蓋活頁。備份在 IndexedDB，正式交付仍另存專案。
- 目前 0.11，內容 schema v5、外層 bitdraw-packed v1；可讀 v1–v4。模型不嵌入專案。不可用舊編輯器處理新格式。
- 只聲稱減少請求資料與往返；尚無實際 Token 基準，不把 JSON bytes 當 Token。

## 開發與發布

- npm ci --ignore-scripts；npm run setup:models；需要動漫時 npm run setup:anime。
- npm test 包含 loopback HTTP；UI 變更需真實瀏覽器檢查。npm run test:images 使用附帶的授權素材，詳見 qa/VERIFICATION-0.11.md。
- 新模式要測參數拒絕、原圖不變、預演／復原、精確尺寸及專案重開。避免對低風險文案建立重複測試。
- 提交前檢查秘密、模型二進位、大型專案與第三方授權。原創程式 MIT，素材與模型維持各自授權。
- 完整命令範例見 docs/COMMANDS.md。後續動畫以 frame 指令、對齊及洋蔥皮設計；MCP 作既有協定轉接。
