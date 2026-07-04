# 業務角色扮演練習工具

兩個頁面組成的靜態網站：

- **`index.html`** — 業務角色扮演轉盤：隨機組合業務、產品、產業、角色、情境、難度（原生 JS，無需建置）。
- **`roleplay-ai.html`** — AI 對話練習器：與 AI 扮演的客戶即時對話，結束後產生教練覆盤報告（React，需建置）。

## 開發

轉盤頁（`index.html`、`js/`、`css/`）直接編輯即可，不需任何建置步驟。

AI 練習頁的原始碼在 `src/roleplay-ai.jsx`，修改後需要重新編譯：

```bash
npm install        # 第一次
npm run build      # 產出 js/roleplay-ai.min.js
```

編譯產物 `js/roleplay-ai.min.js` 需要一併 commit（網站是純靜態託管）。

## 資料維護

所有轉盤清單（業務名單、產品、產業、情境、難度、雲端環境）集中在 **`js/data.js`**，兩個頁面共用，改一處即可。AI 客戶的角色/產業/雲端/難度行為設定在 **`js/profiles.js`**。改完後記得 `npm run build` 讓 AI 頁吃到新資料。

## API Key

AI 練習頁需要 Anthropic API Key，只儲存在使用者瀏覽器的 localStorage、直接從瀏覽器呼叫 API，不經過任何伺服器。若要提供多人使用，建議改走 serverless proxy（如 Cloudflare Workers）把 Key 放在伺服器端。
