# 固定取件機器人（Fixed Pickup Robot）

每天自動在 GoodMaji 系統（`system.goodmaji.com`）的「代收包裹 → 一般代取」頁面，
為**固定配合的客人**新增一筆取件單，確保單子「一定會出現在取件表上」，
避免遺漏。包裹數、指派司機等細節由人員事後補齊。

> **核心原則：寧可資訊不完整，也不能忘記安排。**

本專案依附的架構設計文件請見團隊內部文件；以下是實作與使用說明。

> 📖 **日常操作(新增/暫停/刪除客戶、看執行記錄、缺漏補單)請看 [`操作手冊.md`](./操作手冊.md)。**
> 本 README 偏技術總覽(架構、設定、部署、資料結構)。

---

## 這個專案包含什麼

| 模組 | 檔案 | 說明 |
|---|---|---|
| 客人設定表單（客人看到的介面） | `public/form.html` | 手機友善，客人自助填一次、長期生效 |
| 管理者檢視頁 | `public/admin.html` | 看客人設定、執行記錄、暫停/啟用客人（取代「在 Google Sheet 看資料」） |
| 表單伺服器 | `src/server.js` | 提供表單頁、管理頁與 API |
| 排程篩選邏輯 | `src/schedule.js` | 判斷「今天要幫誰新增」（純函式，好測試） |
| Playwright 機器人 | `src/robot/` | 登入、逐筆新增、統一儲存、**反查驗證**、失敗截圖 |
| 通知 | `src/notify.js` | 每天發送彙總通知（LINE / Email） |
| 每日進入點 | `src/run.js` | cron 每天呼叫這支 |
| 資料儲存 | `src/datastore/` | **local（預設，免設定）** 或 **google-sheets（之後可切換）** |

### 關於 Google Sheet

設計文件原本以 Google Sheet 當資料庫。因為 Google Sheet 的設定（雲端專案、憑證）需要另外處理，
**本專案預設用「本機檔案」儲存資料，裝好就能整套跑起來**，不必等 Google Sheet。
之後憑證備妥，只要改一個環境變數 `DATASTORE=google-sheets` 即可無痛切換，程式其他部分完全不用動。
（切換步驟見文末）

---

## 快速開始

需求：主機已安裝 **Node.js 18 以上**。

```bash
cd fixed-pickup-robot

# 1) 安裝套件
npm install

# 2) 安裝 Playwright 的 Chromium 瀏覽器
npm run install:browser

# 3) 建立 .env 設定檔，然後填入實際值
cp .env.example .env
nano .env      # 至少要填 GOODMAJI 編號/帳號/密碼、ADMIN_PASSWORD；通知可先留空

# 4) 啟動表單伺服器（給客人填、給你看）
npm run server
#   客人設定表單： http://localhost:3000/
#   管理者檢視頁： http://localhost:3000/admin
```

### 測試（不會誤動系統)

```bash
npm run run:dry     # 只印「今天要處理誰」，不開瀏覽器、不寫入
npm run testfill    # 建一筆但「不儲存」，截圖到 logs/capture/5-filled.png（安全）
npm run testsave    # 建一筆真的 + 反查驗證（測試資料記得刪）
npm run run:daily   # 正式跑一次（登入→新增→儲存→反查）
```

---

## 選擇器（已校準完成，改版時再調整）

所有頁面選擇器集中在 `src/robot/selectors.js`，已對照 `system.goodmaji.com` 實際頁面校準:
- 登入(`login.aspx`)三欄:編號 `#number`、帳號 `#account`、密碼 `#password`、登入鈕 `#SignIn`。
- 一般代取內層頁:`collection.aspx?method=get`;新增鈕 `#linkAdd`(postback)、儲存鈕 `#btnSave`;
  各欄位 id 為 `rp1_<欄位>_<列索引>`(如地址 `rp1_addr_0`)。

若 GoodMaji 改版導致大量缺漏:
1. 主機為無桌面環境,用 `npm run capture` 擷取登入頁/代收頁的截圖與原始碼到 `logs/capture/`。
2. 對照原始碼調整 `src/robot/selectors.js`(只需改這一個檔案)。
3. 執行時若某步找不到元素,程式會**自動截圖到 `logs/screenshots/`**、記錄原因,
   並**跳過該客人繼續下一位**(不中斷整批)。

---

## 每天自動執行（cron）

目前已設定(主機時區 `Asia/Taipei`,每天早上 **8:00** 執行):

```bash
0 8 * * *  cd /root/fixed-pickup-robot && /usr/bin/node src/run.js >> /root/fixed-pickup-robot/logs/cron.log 2>&1
```

- 表單伺服器(前台/後台)由 **pm2** 常駐(`pm2 status` / `pm2 restart pickup-form`),且已設**開機自動啟動**。
- cron 只負責每天跑一次 `run.js`;執行日誌在 `logs/cron.log`。

---

## 運作流程（對應設計文件）

```
客人填表單 (public/form.html)
        ↓  POST /api/customers
   資料儲存 (local 檔 或 Google Sheet)
        ↓  cron 每日觸發 src/run.js
   篩選今天要處理的客人 (src/schedule.js)
        ↓
   Playwright (src/robot/)
     1. 登入 system.goodmaji.com
     2. 代收包裹 → 一般代取
     3. 逐位「新增」→ 填欄位（最後統一儲存一次）
     4. 反查驗證：重新查當天清單，用「客戶名稱＋地址」比對
        ↓
   寫執行記錄 + 每天發彙總通知 (LINE / Email)
```

### 欄位填寫規則（設計文件第 8 節，已寫進程式）

| 欄位 | 規則 |
|---|---|
| 客戶 | 客人設定值 |
| 取件人 | 固定填 **`API`**(標記為自動新增、需確認實際件數) |
| 日期 | 執行當天(MM/DD) |
| 地址 / 時間 / 電話 / 聯絡人 | 客人設定值 |
| 包裹數 | 固定 `1` |
| 備註 | 只帶入客人自己的備註(無則留空) |

### 反查驗證（防漏關鍵）

不信任「腳本沒報錯」＝成功。儲存後一律**重新查詢當天清單**，
以「客戶名稱＋地址」比對，統計成功/缺漏，缺漏者：

- 寫進執行記錄，標記「待人工補單」
- 列進當天通知
- 連續 2 天以上缺漏，通知會額外加註⚠️提醒

通知**每天都發**（無論成功或有缺漏），讓你每天都能安心確認。

---

## 資料結構

**客人設定**（local：`data/customers.json`；Google Sheet：客人設定主表）

| 欄位 | 說明 |
|---|---|
| `customer_id` | 唯一識別碼（送出時自動產生） |
| `name` / `address` / `fixedTime` / `phone` / `contact` | 客人填的基本資料 |
| `frequencyType` | `daily` 或 `weekly` |
| `weekdays` | weekly 時的星期，如 `1,3,5`（1=週一…7=週日） |
| `effectiveDate` | 生效日期 `YYYY-MM-DD` |
| `customerNote` | 客人自訂備註 |
| `status` | `active`（啟用）/ `paused`（暫停） |
| `createdAt` | 建立時間 |

**執行記錄**（local：`data/logs.json`；Google Sheet：執行記錄表）：
執行日期、customer_id、客戶名稱、結果、失敗原因、時間戳記。

---

## 切換到 Google Sheet（之後憑證備妥再做）

1. 在 Google Cloud 建立專案 → 啟用 **Google Sheets API** → 建立**服務帳戶** → 下載金鑰 JSON。
2. 把金鑰檔放到專案下（例如 `google-credentials.json`，此檔已被 `.gitignore` 排除）。
3. 建立一張 Google 試算表，新增兩個分頁：`客人設定主表`、`執行記錄表`。
4. 把試算表「共用」給服務帳戶的 email（給編輯權限）。
5. 修改 `.env`：
   ```
   DATASTORE=google-sheets
   GOOGLE_SHEET_ID=你的試算表ID
   GOOGLE_CREDENTIALS_PATH=./google-credentials.json
   ```
6. 完成。程式其他部分不用改。
   （分頁表頭可由 `GoogleSheetsStore.ensureHeaders()` 自動建立，或手動貼上。）

---

## 部署環境

沿用現有 Vultr（Tokyo，1 vCPU / 1GB RAM / Ubuntu）主機即可，
Playwright 執行當下約需 300–500MB RAM，每天僅跑一次、數分鐘，非常態負載，
與既有 LINE 通知系統共存無虞。

## 安全

- 帳密與 API 金鑰一律走 `.env`，**不寫死在程式碼**，且 `.env` 已被 `.gitignore` 排除。
- 管理者頁面以 `ADMIN_PASSWORD` 保護，請務必改掉預設值。
