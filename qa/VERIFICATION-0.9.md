# BIT DRAW 0.9 驗證（2026-11-05）

## 實圖與自動定位

沿用 0.8 原圖：Wikipe-tan 1110×2100、NASA Eileen Collins 2250×2848。`verify-v9.mjs SESSION` 使用正式本機代理 HTTP 協定：匯入 → focusPreview → 自動 face 取景 pixelPlan → 精確 96×74 → 預演／提交自動保護修整 → 匯出 → 壓縮保存 → 重開 → 校驗。不提供任何手動 crop 或 protect 座標；眼口與取景由本機程序產生。

兩圖各偵測一張臉與三個眼口保護區。`verify-focus-v9.mjs` 在 auto 模式檢查六個事先人工標記的眼口參考點均被保護，咖啡照片（無臉反例）回報 0 張臉。這是三張實圖的抽查，不能宣稱任意圖準確率。照片主體估計包含旗幟／道具，reliability=review，未自動去背；透明插畫的 alpha 範圍較明確。插畫以色塊比例、膚色色域與局部對比估計，不是訓練過的動漫臉模型。照片使用 pico 人臉 cascade；眼口仍是臉內對比估計，不含完整 68 點 landmarks。

在測試中觀察到咖啡的色塊會誤觸發插畫 fallback，因此 auto 模式現在只在平坦色彩比例足夠時才啟用該 fallback；不把這次修正外推為所有物件都能排除誤判。

## 成品與容量

`real-v9/comparison.html` 可離線開啟。`*-before.png` 與 `*-after.png` 使用同一自動裁切與尺寸，before 是取樣縮色，after 是自動保護、去雜點與細節恢復（動漫另加彩色描邊）。四份 `outline-*.png` 使用同一動漫圖，比較 solid/adaptive/selective/double；皆為原生 96×74。

無損保存：動漫約 26.45 MB → 0.20 MB（縮小 99.2%），照片約 88.66 MB → 18.47 MB（縮小 79.2%）。MB 採十進位。新舊容量由同一成品計算，不是拿不同內容比較。瀏覽器重開壓縮專案後，來源 SHA-256 與所有圖層像素均吻合；來源並與 0.8 保存原圖逐 byte 校驗相同。格式為 bitdraw-packed v1，內含 v4 專案，RGBA gzip＋base64＋SHA-256；檔名維持 .bitdraw.json。

## 速度

`node --expose-gc qa/benchmark-v9.mjs` 在相同來源、相同 0.8 保護矩形下比較舊新核心，像素輸出完全相同。先暖機兩次，再五次交錯執行，每次恢復相同畫布；兩邊均用 typed source，計時前 GC。細節還原＋去雜點中位數：動漫 60.2→17.0 ms，照片 64.1→16.7 ms。完整分佈見 `benchmark.json`。

初次測量與大型壓縮驗證同時執行，每次重建 Engine，GC／競爭造成照片新版本反而較慢；原紀錄保留為 `benchmark-initial.json`。改成上述控制條件後才報告可比較的運算時間。這不是整套 app 的倍速宣稱。

背景運算把圖片重建、辨識、成品修整、壓縮與解壓移到 module Worker。原圖以 Uint8Array 傳送一次，後續只傳文件狀態與命令；細節恢復只重新取樣保護區。主執行緒仍負責解碼匯入圖、Canvas 顯示與部分一般編輯，尚非所有操作都完全無阻塞。各步 workerMs／匯入保存耗時見 report.json，受機器負載影響。

## 回歸及 UI

91/91 Node 測試通過，涵蓋新壓縮格式無損往返、資料損壞與解壓長度界線、透明／空白圖辨識、裁切座標轉換、四種描邊與轉角、保護區、找不到臉時回滾、背景過期結果拒絕、dryRun、一次復原及既有所有功能。

瀏覽器實際操作照片：分析顯示 1 張臉／3 個保護區／主體需核對 → 套用保護 → 選擇性描邊預演與套用 → 兩次復原 → UI 儲存。下載檔案確認為 bitdraw-packed，約 18.47 MB，原生 96×74。正式 recipe.save 保存 smart-icon 配方後，只傳 width=180/height=180 即預演成功，revision 維持 0，並自動取景及保護。

最終介面又檢查照片的「自動臉部圖示」取景預演成功；指令工作台執行 image.autoFocus kind=photo，回傳三個保護範圍與 workerMs，沒有修改合成像素。舊報告在復原／切換文件後會清除，避免把上個狀態的辨識或修整數字當成目前結果。

測試命令的 119／170 bytes 是單筆 image.finish JSON 大小，沒有量測模型 Token。回應只含範圍與統計，只有需要看圖才取預覽。主體 mask 不輸出到對話。

來源與授權沿用 [0.8 SOURCES](real-v8/SOURCES.md)；pico 偵測器與模型授權見 [vendor README](../dist/vendor/README.md)。描邊參考 Lospec 的像素輪廓教學及 Aseprite 的內外／形狀選項；BIT DRAW 的 adaptive/selective 是程序化近似，不等同畫師逐像素 sel-out。
