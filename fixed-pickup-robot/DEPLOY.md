# 部署說明書｜固定取件機器人（Vultr / Ubuntu）

本文件供實際部署參考(工程師可直接照做)。分兩大階段:
- **階段 A｜先讓「表單 + 後台」跑起來**(內部員工使用)
- **階段 B｜再讓「每日自動建單機器人」上線**(需 GoodMaji 帳密 + cron)

> 使用情境:目前為**內部使用**,以 `http://<主機IP>:3000/` 存取,不接網域、不強制 HTTPS。
> 帳密一律放主機上的 `.env`,不進版控。

---

## 0. 事前準備

- Vultr 主機登入權限(root 或具 sudo 的帳號)。可用 **Vultr 後台 → 該主機 → View Console**(瀏覽器終端機,免安裝),或本機 `ssh root@<主機IP>`。
- 一組 **GitHub Personal Access Token(PAT)**,用來 clone 私有 repo:
  1. GitHub → 右上頭像 → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**
  2. Repository access 選 **Only select repositories → `fixed-pickup-robot`**
  3. Permissions → Repository permissions → **Contents: Read-only**
  4. 產生後**複製 token**(只會顯示一次),保管好。

---

## 階段 A：表單 + 後台上線

### A1. 登入主機
用 Vultr View Console 或:
```bash
ssh root@<主機IP>
```

### A2. 安裝 Node.js（20 LTS）
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git
node -v      # 應顯示 v20.x
```

### A3. 取得程式碼（私有 repo，用 PAT）
```bash
cd ~
git clone https://<貼上你的PAT>@github.com/KikiChang1206/fixed-pickup-robot.git
cd fixed-pickup-robot
```
> 之後更新程式只要 `git pull`(見第 6 節)。

### A4. 安裝套件
```bash
npm install
```

### A5. 建立 .env（機密設定）
```bash
cp .env.example .env
nano .env        # 編輯,填入下列值
```
階段 A **至少要設定**:
```
PORT=3000
ADMIN_PASSWORD=請改成你的強密碼   # 後台 /admin 登入用,12碼以上、勿與他系統共用
DATASTORE=local                   # 先用本機檔儲存,免外部設定
```
(GoodMaji 帳密留到階段 B 再填。)
編輯完 `Ctrl+O` 存檔、`Ctrl+X` 離開。

> 安全:限制 .env 只有本人可讀 → `chmod 600 .env`

### A6. 確認埠沒衝突（避免撞到現有 LINE 系統）
```bash
sudo ss -tlnp | grep :3000   # 沒有輸出=沒被占用,可用
```
若已被占用,改 `.env` 的 `PORT` 為其他埠(例如 3100),後面步驟的 3000 一併換掉。

### A7. 用 pm2 常駐執行（開機自動啟動、當掉自動重啟）
```bash
sudo npm install -g pm2
pm2 start src/server.js --name pickup-form
pm2 save
pm2 startup      # 執行後,把它印出來的那行指令再貼一次執行
```
常用管理:
```bash
pm2 status                 # 看狀態
pm2 logs pickup-form       # 看即時日誌
pm2 restart pickup-form    # 重啟(改 .env 後要重啟)
```

### A8. 開放防火牆埠 3000
```bash
sudo ufw allow 3000/tcp    # 若有啟用 ufw
```
> 若 Vultr 後台另有「Firewall」群組套用在這台主機,也要在後台放行 TCP 3000。

### A9. 測試
瀏覽器開:
- 前台表單:`http://<主機IP>:3000/`
- 後台管理:`http://<主機IP>:3000/admin`(用 A5 設的密碼登入)

送出一筆表單 → 到後台應能看到該筆設定。

---

## 階段 B：每日自動建單機器人上線

### B1. 安裝 Playwright 瀏覽器（Chromium）
```bash
cd ~/fixed-pickup-robot
npx playwright install --with-deps chromium
```

### B2. 在 .env 補上 GoodMaji 帳密與通知
```bash
nano .env
```
```
GOODMAJI_URL=https://system.goodmaji.com
GOODMAJI_USERNAME=你的帳號
GOODMAJI_PASSWORD=你的密碼
# 通知(選填):LINE 沿用既有 Bot token
LINE_CHANNEL_ACCESS_TOKEN=
LINE_NOTIFY_TARGETS=
# 首次測試建議先看得到瀏覽器(需有桌面環境;純伺服器可改用錄影方式,見 B3)
HEADLESS=1
```

### B3. 先手動測一次（重要:選擇器需校準）
```bash
# 只列出「今天要處理誰」,不動系統
DRY_RUN=1 node src/run.js

# 正式跑一次(會登入 GoodMaji、新增、儲存、反查、發通知)
node src/run.js
```
> `src/robot/selectors.js` 內的網頁選擇器是依系統描述預寫的,首次跑幾乎一定要對照實際頁面微調。
> 失敗會自動截圖到 `logs/screenshots/`、記錄原因,並跳過該客人繼續(不中斷整批)。
> 純伺服器無桌面時,可用 Playwright 錄影 / 截圖檢視操作過程(可請工程師開啟 video 錄製)。

### B4. 設定每日 cron 排程
```bash
crontab -e
```
加入(路徑、時間依實際調整;建議早於司機排班):
```
30 7 * * * cd /root/fixed-pickup-robot && /usr/bin/node src/run.js >> logs/cron.log 2>&1
```

---

## 6. 日後更新程式
在主機上:
```bash
cd ~/fixed-pickup-robot
git pull
npm install            # 若有新套件
pm2 restart pickup-form
```

## 7. 疑難排解
| 症狀 | 檢查 |
|---|---|
| 網頁打不開 | `pm2 status` 是否 online、防火牆/Vultr Firewall 是否放行 3000、埠有沒有衝突 |
| 後台密碼錯 | `.env` 的 `ADMIN_PASSWORD`,改完要 `pm2 restart pickup-form` |
| 機器人建單失敗 | 看 `logs/screenshots/` 截圖與 `logs/daily.log`;多半是 `src/robot/selectors.js` 選擇器要校準 |
| 資料存哪 | `DATASTORE=local` 時在 `data/customers.json`、`data/logs.json`;要改 Google Sheet 見主 README |

## 8. 安全備註
- `.env`(含 GoodMaji 帳密、後台密碼)只在主機、已被 `.gitignore` 排除,永不進版控。
- 目前為內部使用、純 http;若日後要對外或加密,可加 Cloudflare Tunnel(免費、免網域)或網域+Let's Encrypt,程式不需改動。
