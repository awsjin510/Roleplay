# 業務角色扮演練習工具

靜態網站，部署在 GitHub Pages（來源：`main` 分支根目錄）。

- **`index.html`** — 業務角色扮演轉盤：隨機組合業務、產品、產業、角色、情境、難度（原生 JS，無需建置）。
- **`roleplay-ai.html`** — AI 對話練習器：與 AI 扮演的客戶即時對話（串流回覆、語音輸入、2 分鐘回應計時），結束後產生教練覆盤報告；練習記錄與排行榜存在 Firestore，可匯出 Excel（React，需建置）。
- **`admin.html`** — 知識庫後台：上傳 PDF / Word / Excel，切塊後經 Worker 產生 embedding 寫入 Firestore `rag_chunks`，供 AI 練習頁 RAG 使用。
- **`worker.js` / `wrangler.toml`** — Cloudflare Worker：`/embed` 產生向量（Workers AI）、`/chat` 代理 Anthropic API。

## 開發

轉盤頁（`index.html`、`js/app.js`、`js/spinner.js`、`css/`）直接編輯即可，不需任何建置步驟。

AI 練習頁的原始碼在 `src/roleplay-ai.jsx`，React、Firebase、SheetJS 全部由 esbuild 打包成單一檔案，**不依賴任何第三方 CDN**。修改後需要重新編譯：

```bash
npm install        # 第一次
npm run build      # 產出 js/roleplay-ai.min.js
```

編譯產物 `js/roleplay-ai.min.js` 需要一併 commit（網站是純靜態託管）。打包目標為 ES2020（Firebase SDK 需要 BigInt）。

## 樣式

- **`css/theme.css`** — 兩頁共用的設計系統：色彩變數、按鈕（`ui-btn--primary / secondary / ghost / danger`）、頂部列、手機底部操作列、彈窗、提示條。改品牌色或按鈕樣式只需改這裡。
- **`css/main.css`、`css/spinner.css`** — 轉盤頁專用版面。
- **`css/roleplay-ai.css`** — AI 練習頁專用版面（轉盤欄、對話頁、手機版教練指標列）。

原則：每個畫面只放一顆 `ui-btn--primary`；觸控目標至少 44px；手機寬度（≤ 640px）主要操作固定在畫面底部。

## 資料維護

所有轉盤清單（業務名單、產品、產品服務、資安項目、產業、情境、難度、雲端環境）集中在 **`js/data.js`**，兩個頁面共用，改一處即可。AI 客戶的角色 / 產業 / 雲端 / 資安產品 / 難度行為設定在 **`js/profiles.js`**。改完後記得 `npm run build` 讓 AI 頁吃到新資料。

## Firebase 與 RAG

- Firebase 專案 `roleplay-training`，前端以匿名登入通過 Firestore rules（`request.auth != null`）。
- 練習記錄存在 `practice_records`，知識庫切塊存在 `rag_chunks`（欄位 `text`、`embedding`）。
- Firestore **Web SDK 沒有 `findNearest()`**，AI 練習頁的向量搜尋是透過 Firestore REST API `documents:runQuery` + `structuredQuery.findNearest` 完成，需要 `rag_chunks.embedding` 建有 vector index。查詢失敗時 RAG 會靜默停用，練習仍可正常進行。

## API Key

AI 練習頁需要 Anthropic API Key，只儲存在使用者瀏覽器的 localStorage、直接從瀏覽器呼叫 API，不經過任何伺服器。若要提供多人使用，建議改走 Worker 的 `/chat` 代理把 Key 放在伺服器端。
