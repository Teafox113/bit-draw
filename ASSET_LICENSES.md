# 圖片與測試素材授權

程式碼的 MIT 授權不涵蓋下列第三方圖片。圖片沒有重新授權為 MIT。

| 素材 | 作者與原始來源 | 授權與修改 |
|---|---|---|
| Wikipe-tan full length | Kasuga， [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Wikipe-tan_full_length.png) | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)（[法律全文](https://creativecommons.org/licenses/by-sa/3.0/legalcode)）。本專案使用 CC BY-SA 選項；解碼、背景合成、去背、裁切、縮放、縮色及像素化的衍生圖繼續採 CC BY-SA 3.0。 |
| Eileen Collins, early NASA portrait | NASA，[Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Eileen_Collins,_early_NASA_portrait.jpg) | 公有領域；測試中縮放、裁切、去背及像素化。 |
| Coffee | Rachel Michetti，由 [scikit-image data](https://scikit-image.org/docs/stable/api/skimage.data.html#skimage.data.coffee) 提供 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)；解碼、縮放並作為動漫合成背景。 |

適用位置：

- `qa/fixtures-v11/anime.rgba.gz`、`photo.rgba.gz`、`coffee.rgba.gz` 是上述圖片的 gzip 壓縮 RGBA；尺寸、來源與 SHA-256 見同目錄 `sources.json`。
- `docs/quality-v10.html`、`docs/quality-v11.html` 內嵌比較圖、對應截圖及 `qa/workspace-0.10.png` 中的動漫衍生圖片，維持 CC BY-SA 3.0；照片維持上述來源狀態。截圖中的 BIT DRAW 介面與文件程式碼採 MIT。
- `qa/real-v*/` 內本機產出的圖片、專案內嵌原圖及其衍生圖也遵循各來源授權。這些大型產物通常不提交 Git。動漫與其他素材的背景合成圖採 CC BY-SA 3.0。
- `qa/portrait-source-v6.png`、`portrait-pixel-v6.png`、`portrait-night-v6.png` 為本專案程式產生的合成測試圖；內建 BOTANICAL 示例亦由本專案程式繪製，採 MIT。

比較頁已標示作者、原作、授權連結及修改方式。轉載動漫比較圖時，請保留這些資訊與 CC BY-SA 3.0 授權；若單獨匯出圖片，應將署名資訊一起提供。以上署名不表示原作者或 NASA 為 BIT DRAW 背書。
