# PACE 校園運動

GPS 運動記錄網站。學生用手機在校園步道步行或慢跑，網站會記錄軌跡、距離、時間、速度與估算熱量，可以設定老師指定的集合點，並把紀錄匯出成 CSV 與 JSON。匯入檢視頁可以讀取匯出的檔案，查看路線與詳細數據。

這個專案不是官方系統，地圖示範以逢甲大學校園為例。

## 兩種使用方式

1. **練習版（建議）**：`public/` 是純靜態網站，可以部署到 GitHub Pages。不需要後端，紀錄只存在使用者自己的瀏覽器中。
2. **班級中心（進階）**：加上 Cloudflare Worker 與 D1 資料庫，老師可以建立班級、審核學生、查看繳交的運動摘要。

## 快速開始（練習版）

Windows PowerShell（在專案根目錄執行）：

```powershell
cd .\public
py -m http.server 8000
```

macOS／Linux（在專案根目錄執行）：

```bash
cd public
python3 -m http.server 8000
```

開啟 http://localhost:8000 即可預覽。定位功能在 localhost 可以使用，但手機實測需要 `https://` 網址，例如 GitHub Pages。

## 部署到 GitHub Pages

1. 把 `public/` 的內容放在一個 GitHub 倉庫的根目錄。`scripts/sync-pages.sh` 會把 `public/` 與 `site-template/` 複製到與本專案相鄰的 `../pace-site` 倉庫。
2. 在倉庫的 Settings → Pages，Source 選 Deploy from a branch，Branch 選 `main`，資料夾選 `/ (root)`。
3. 網站會出現在 `https://<帳號>.github.io/<倉庫名稱>/`。

`site-template/` 是給學生的範本，內含學生 README、`.gitignore`，以及 VS Code Copilot 的指引、提示檔與技能。學生用 Use this template 建立自己的倉庫，就能得到這些檔案。

## 班級中心（進階）

需要 Node.js 22.13 以上。

```bash
npm ci
npm run build
npm run dev
```

`npm run dev` 會讀取專案根目錄的 `.dev.vars`。這個檔案不應該提交到 Git，內容範例如下：

```
TEACHER_EMAILS="teacher@example.com"
```

`TEACHER_EMAILS` 是教師帳號的 email 清單，以逗號分隔。資料庫綁定名稱是 `DB`，migration 在 `drizzle/`。

正式部署時，請在目標平台設定 `TEACHER_EMAILS`，並提供 D1 資料庫綁定。本機開發與建置使用的 D1 綁定名稱（`DB`）寫在 `vite.config.ts`。

## 本機運動摘要 JSON 服務

此服務可把匯出的運動 JSON 摘要保存到專案的 `data/workout-records.json`，不會連接前端或 Cloudflare D1。啟動服務後，將單筆紀錄 JSON 或 JSON 陣列送至匯入端點：

```powershell
npm run records:server
```

服務預設只監聽本機 `127.0.0.1:8788`。另一個 PowerShell 視窗可用以下命令匯入一筆檔案：

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8788/api/workouts/import -Method Post -ContentType "application/json" -InFile .\my-tracks\campus-track.json
```

匯入器只保存運動時間、文字地點（JSON 的 `location`、`place`、`locationName` 或 `campus` 欄位）、課堂代號、使用者識別碼（若有）、性別、年齡、身高、體重、體脂率、活動類型、運動時間、距離、MET 與熱量。GPS 點、軌跡、集合點座標和其他未列入摘要的欄位不會寫入。服務會建立本機 JSON 檔，並忽略該檔及暫存檔，避免把個人運動資料提交到 Git。

檢查服務狀態：`http://127.0.0.1:8788/health`。若 JSON 沒有文字地點欄位，`location` 會保存為 `null`；服務不會根據座標推算地點。

## 測試

```bash
npx tsc --noEmit
node tests/classroom.mjs
npm run lint
```

`tests/classroom.mjs` 會建立獨立的測試資料庫，驗證 61 人同時加入只收 60 人、60 人同時繳交、權限隔離、重複繳交、拒絕示範紀錄、伺服器重新計算熱量、課程截止與班級刪除。

## 專案結構

| 路徑 | 內容 |
| --- | --- |
| `public/` | 靜態網站：運動頁、匯入檢視、班級頁、講義與說明頁 |
| `public/app.js`、`public/core.js` | GPS 記錄流程、距離與熱量計算、定位點過濾 |
| `public/review.html`、`public/review.js` | 匯入檢視：讀取匯出的 JSON 與 CSV，只在瀏覽器中運作 |
| `public/tiles.js` | 底圖設定，集中在一個地方 |
| `app/api/classroom/route.ts`、`lib/classroom.ts` | 班級 API 與權限規則 |
| `db/`、`drizzle/` | 資料庫 schema 與 migration |
| `server/workout-records.mjs`、`data/workout-records.json` | 本機運動摘要匯入服務與 JSON 儲存檔（服務首次啟動時建立） |
| `tests/classroom.mjs` | 班級功能的隔離測試 |
| `site-template/` | 學生範本的檔案 |
| `scripts/sync-pages.sh` | 同步網站與範本到 Pages 倉庫 |

## 隱私與資料

- 練習版的紀錄只存在使用者的瀏覽器（localStorage）。清除網站資料或換裝置，紀錄會消失，所以請先匯出。
- 班級版只上傳使用者確認的運動摘要與身體指標，不上傳完整 GPS 軌跡。
- 匯出的軌跡 JSON 含有位置資料，不要公開分享，也不要提交到 Git。
- 地圖底圖來自 OpenStreetMap，圖磚供應者可以接收 IP 位址與地圖範圍。

## 限制

- 熱量是依 MET 與時間估算的數字，不是 GPS 直接量測，也不是醫療或飲食建議。
- 這不是防作弊或自動出席系統。
- 集合點目前由每位使用者自行在地圖上設定。
- 底圖使用 OpenStreetMap 公用圖磚，適合少量使用。大量使用請在 `public/tiles.js` 改用自備或授權的圖磚服務。
- GPS 精度會受環境影響。精度大於 35 公尺的定位點會被丟棄，室內通常無法取得可用的定位。

## 授權

本專案以 MIT 授權釋出，詳見 `LICENSE`。`public/vendor/` 內的 Leaflet 與 `vendor/` 內的其他第三方檔案，依各自的授權條款使用。
