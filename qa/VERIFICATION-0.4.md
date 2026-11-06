# BIT DRAW 0.4 驗證紀錄

2026-10-29，Windows／Node.js／Codex 內建瀏覽器。

- 43 項 Node 測試通過，包含原有像素核心、多文件隔離、版本衝突、dry-run、整批復原、整批失敗回復、RLE、文件上限及矩形／直線命令。
- HTTP 橋接測試驗證本機權杖、Host／Origin／Sec-Fetch-Site 限制、不同 session 隔離、命令只送一次與逾時回覆。沙箱禁止 loopback 連線時需在允許本機網路的執行環境跑此測試。
- 使用真實 agent.mjs 連線建立 doc-2；六筆命令新增角色層、兩個矩形、兩條直線與描邊，產生 320 個可見像素、3 個圖層、3 色。瀏覽器畫面即時顯示角色。
- dryRun 回覆預計修改 4 像素，版本保持 r1、無像素修改；舊 expectedRevision:0 被拒絕。局部 4×4 讀取回傳兩色與四組 RLE。
- UI 一次復原六筆命令，圖層數 3→1；重做恢復 3 層。另一分頁的復原紀錄保持獨立。
- CLI 成功儲存專案、匯出 32×32 PNG、重新開啟專案與匯入 PNG。匯入／開啟都建立新分頁。
- 修改背景 doc-2 名稱後，前景仍為 doc-3。CLI 可設定背景文件比對方式，並明確 activate 文件。
- 分頁切換保留上下比對及 1% 疊圖透明度。介面可一次開啟兩份專案，得到三個獨立分頁。
- 未套用格線時代理 apply 被拒絕；dryRun 字串而非布林值亦被拒絕。
- 疊圖設為 100% 時，UI 匯出 PNG 與 CLI 的實際合成 PNG 逐 RGBA 位元組相同（48×48），原圖疊圖未混入輸出。
- 發現並修正上下比對時 main 的自動最小高度導致畫布溢出問題。
- 原生 confirm 在內建瀏覽器阻擋了測試工具，已改用 HTML dialog 處理未儲存關閉與文件重新命名，避免沿用原生 prompt／confirm。
- 使用者取消舊原生視窗後，已補完 HTML 對話框實際點擊驗證：複製示例、重新命名為測試文件、顯示未儲存關閉提示；「取消，繼續編輯」保留文件與名稱，「捨棄修改並關閉」只移除測試副本，原始分頁不變。最後一份文件的關閉鈕維持停用。畫面存為 document-dialog-0.4.png，瀏覽器未記錄 error／warn。
- 1600% 放大後以 PageDown 捲動成品，捲動結束時原圖與成品的 scrollTop 均為 285、可捲動範圍均為 379；確認同步後已恢復符合視窗。
- 同一份 32×32 測試專案 JSON 為 35,792 bytes，inspect 摘要為 792 bytes，4×4 區域 RLE 為 219 bytes；此為資料大小比較，並非模型 Token 計費測量。

測試產物：agent-v4.bitdraw.json、agent-v4.png、agent-background-v4.bitdraw.json、agent-import-v4.bitdraw.json、overlay-reference-v4.png；命令檔皆以 agent-*-v4.json 命名。

最後使用即時 CLI 在新版頁面開啟兩份測試專案，再設定並切回原圖左右比對；畫面存為 workspace-0.4.png，顯示三個文件分頁及仍保留在編輯模式中的原圖／成品比對。

限制：尚無工作階段自動復原、跨瀏覽器完整測試、真正 AI 圖集品質評測、GIF／3D／PSD／MCP adapter。即時 CLI 依賴已開啟的瀏覽器頁面，背景頁節流可能逾時。省 Token 目前以縮短資料與命令交換設計，未測量模型實際 Token 節省比例。
