# 全台職業駕駛人數據與動態演進分析儀表板 (POC)

本專案為交通數據商業視覺化儀表板 POC，整合交通部公路局開放資料與歷史 Excel 報表，轉化為物流倉儲選址、車隊司機招募與產險拓點決策指標。

## 🌟 專案亮點

1. **3 大商業決策視角**：
   - 📦 **物流轉運視角**（大貨車 + 聯結車運能）
   - 🚕 **客運與乘車視角**（小型車 + 大客車運能）
   - 🛡️ **車商與產險拓點視角**（車隊保單市場規模估算）
2. **全台 22 縣市 Persona 標籤**：自動標記 `🌟 全國特級物流樞紐`、`🚕 計程/多元大本營` 等商業特徵。
3. **歷史時間序列與動態演進播放器**：
   - 時間軸自動演進播放 (Auto-Play Player)
   - 大尺寸 SVG 歷史趨勢折線圖（含當期 Cursor 定位線）
   - 主計總處風格雙向對比蝴蝶金字塔圖
4. **Excel ETL 自動正規化與去重引擎**：
   - 自動解析公路局官方雙層跨欄 (Merged Header) 矩陣表。
   - 包含跨檔案與多月份去重保護機制 (Idempotent De-duplication)。

## 🛠️ 技術堆疊

- **後端 Server / ETL**: Node.js, Express, SheetJS (`xlsx`), Axios, CORS
- **前端 UI / 視覺化**: Vue 3 (Composition API), Tailwind CSS, SVG Custom Charts

## 🚀 快速啟動指南

### 1. 安裝依賴套件
```bash
npm install
```

### 2. 執行 Excel ETL 自動正規化 (選擇性)
將從公路局下載的 Excel 報表放至 excel_imports/ 資料夾，並執行：

```bash
node normalizeExcelImports.js
```

### 3. 啟動 POC 伺服器
```bash
npm start
```
開啟瀏覽器造訪: http://localhost:3000
