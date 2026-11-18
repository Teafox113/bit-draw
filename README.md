# BIT DRAW

在本機把照片、插畫和 AI 圖片轉成可編輯的像素圖，也能從空白畫布開始畫。人可以操作介面，Codex／Claude 等本機代理可以用 JSON 指令完成相同工作。

目前為 **0.11 開發版**。主要用途是校準 AI 像素圖的格線、將每格重建為單色，再調整色盤與細節。它不會自動把所有圖片變成手繪成品。

## 啟動

需要 Node.js 20 以上與支援 WebAssembly 的現代瀏覽器。在專案資料夾執行：

    npm ci --ignore-scripts
    npm run setup:models
    npm run setup:anime
    npm start

開啟 http://127.0.0.1:4173/ 。之後可雙擊「Start BIT DRAW.cmd」。介面直接載入 dist，不需建置。

setup:models 安裝本機推論檔案及約 181 MB 的通用去背模型；setup:anime 另下載約 176 MB 的動漫模型，沒有動漫去背需求可略過。首次安裝需要網路，圖片處理在本機執行。下載會核對 SHA-256；模型檔不納入 Git。

## 可以做什麼

- 匯入 PNG、JPG、WebP；保留不可變原圖，支援左右、上下、透明疊圖比對。
- 指定原生輸出寬高，或校準格線後重建；每格單色，縮色後可用鉛筆、油漆桶、選區等工具修正。
- 多文件分頁、最多 16 個圖層、復原／重做、自動備份與復原。
- 分析原圖色盤、混色、替換色碼、12 組預設色盤，以及 HSV／RGB／HEX 自訂色盤。
- 主體去背、五官保護、去除小雜點；單色、彩色、選擇性與雙層貼紙描邊。
- 區域命名、遮罩修正、每區域指定色盤；分類配色規則及參數流程可重複使用。
- 匯出 PNG 與可繼續編輯的 .bitdraw.json 專案。

## 0.11 更新

新增動漫角色去背模式，減少通用模型把背景物件一起保留的情況。「清晰」五官取樣保留來源中的深色線條和亮點，也可切回柔和的「平衡」模式。

在 Wikipe-tan 合成咖啡背景的測試中，遮罩 IoU 從 79.8% 提升至 97.6%，背景誤留像素從 279,632 減至 21,311。另一張含真人背景的測試仍有大片誤留；這些數據只描述測試案例，不代表任意圖的成功率。

看 [實圖前後比較](docs/quality-v11.html)（下載後以瀏覽器開啟），或閱讀 [驗證紀錄](qa/VERIFICATION-0.11.md)。比較包含 32 × 32、48 × 48、96 × 74、180 × 180，使用相同裁切與 24 色上限。

## 給 Codex／Claude 使用

開啟工作台後，先列出連線與文件：

    node agent.mjs sessions
    node agent.mjs SESSION list
    node agent.mjs SESSION inspect DOC

以 documentId 和 expectedRevision 指定目標，將命令合成一批；先 dryRun，再提交。動漫流程可保存 recipes/anime-icon.json，之後只傳流程 ID、版本與輸出尺寸等參數。完整範例見 [指令操作](docs/COMMANDS.md)，開發代理請先讀 [AGENTS.md](AGENTS.md)。

指令回覆以摘要為主，不傳整張原圖或完整遮罩；只有需要視覺判斷時才匯出 PNG。這能減少資料交換與來回步驟，實際 Token 節省尚未做基準測量。程式不會自行呼叫付費模型 API。

## 保存與限制

圖片上限 8,388,608 像素，工作畫布最大 1024 × 1024。尺寸預設含 370 × 320、240 × 240、96 × 74、180 × 180，也可輸入自訂寬高。PNG 可用最近鄰整數倍放大；倍率與原生尺寸分開。

專案使用壓縮封裝，保留原圖、圖層、色盤、分類及去背遮罩；可讀舊版 v1–v4。備份保存在同瀏覽器來源的 IndexedDB，清除網站資料會移除備份，重要作品請另存專案。

複雜背景、多角色、側臉或遮擋仍可能辨識錯誤。動漫模型首次分析在本次 Node/WASM 測試約 12–13 秒，依機器與負載而變；同來源、同模式會快取。大型模型需要較多記憶體。

目前沒有 PSD 相容、GIF 匯入／匯出、動畫時間軸或 3D 編輯。資料結構保留了影格與定位資訊，這些功能尚未完成。

## 開發與驗證

    npm test
    npm run test:images
    node qa/package-v11.mjs

npm test 不需要模型，包含本機 HTTP 測試。test:images 需要兩組模型下載完成，使用倉庫中的授權素材重建比較結果。測試產物寫入 qa/real-v11；較早版本 QA 腳本可能依賴未提交的本機實驗檔。

服務僅監聽 loopback。不要分享執行期權杖 .bitdraw-runtime.json；此檔已排除於 Git。

## 授權

BIT DRAW 原創程式碼採 [MIT](LICENSE)，可修改、散布及商用，請保留授權聲明。第三方模型與套件維持各自授權，見 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。測試圖片另見 [ASSET_LICENSES.md](ASSET_LICENSES.md)；其中 Wikipe-tan 及其衍生圖採 CC BY-SA 3.0。
