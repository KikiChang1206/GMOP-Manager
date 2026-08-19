# 每日 API 未成功資料自動檢查 (api-data-check)

每天 09:00 自動登入 `system.goodmaji.com`，檢查是否有「未成功 API 的資料」，
若有就另存成 `.xls` 並重新上傳，上傳後再檢查一次，最後把結果（含未上傳原因）
Email 通知 `op2@goodmaji.com`。

技術：**Python + Playwright**（模擬瀏覽器操作 ASP.NET `.aspx` 網站）。
執行環境：**Vultr Linux 伺服器 + cron**。

---

## 流程

```
登入 → 檢查未成功資料 ─┬─ 沒有 → 寄「全部正常」信
                      └─ 有   → 匯出 .xls → 重新上傳 → 再檢查一次
                                                        ├─ 都成功 → 寄「完成」信 (附 .xls)
                                                        └─ 仍有殘留 → 寄「仍有 N 筆未上傳」信 + 原因
```
任何一步出錯也會寄一封「執行失敗」通知信。

---

## 檔案結構

```
api-data-check/
├── run.py                # 主程式 (cron 執行這支)
├── requirements.txt
├── .env.example          # 機密設定範本 → 複製成 .env
├── config.example.yaml   # 網站選擇器設定範本 → 複製成 config.yaml
├── src/
│   ├── config.py         # 載入 .env 與 config.yaml
│   ├── automation.py     # Playwright：登入/導覽/檢查/匯出/上傳
│   ├── excel.py          # 產生 .xls (xlwt)
│   ├── notifier.py       # SMTP 寄信
│   └── logger.py         # log 到 console + output/
└── output/               # 執行產物：log、.xls、除錯截圖 (git 忽略)
```

---

## 一、在 Vultr 伺服器安裝 (Ubuntu / Debian)

```bash
# 1. 系統套件
sudo apt update
sudo apt install -y python3 python3-pip python3-venv git

# 2. 取得程式碼
git clone <你的 repo 網址> gmop
cd gmop/api-data-check

# 3. 建立虛擬環境並安裝套件
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 4. 安裝 Playwright 的 Chromium 瀏覽器與系統相依 (headless 需要)
playwright install --with-deps chromium
```

---

## 二、設定

```bash
cp .env.example .env
cp config.example.yaml config.yaml
```

1. 編輯 **`.env`**：填入登入帳密與 SMTP 寄信設定。
   - 若用 Gmail 寄信：`SMTP_PASSWORD` 要用 **應用程式密碼 (App Password)**，
     不是 Google 登入密碼（需先開啟兩步驟驗證）。
2. 編輯 **`config.yaml`**：把每個標了 `# TODO` 的**選擇器**改成
   `system.goodmaji.com` 實際頁面上的元素（登入欄位、選單路徑、匯出/上傳按鈕）。

> `.env` 與 `config.yaml` 已被 `.gitignore` 排除，不會被 commit。

### 怎麼找選擇器？

在你自己電腦上，把 `config.yaml` 的 `headless` 先設成 `false`，
用 Playwright 的錄製工具邊點邊產生選擇器：

```bash
playwright codegen https://system.goodmaji.com/web/login.aspx
```

或在瀏覽器按 F12，對元素按右鍵 → Copy → Copy selector。
若程式找不到元素，會在 `output/` 存下當下的**截圖 + HTML**，可據此修正。

---

## 三、手動測試

```bash
source .venv/bin/activate
python run.py
```

看 `output/run-YYYYMMDD.log` 與收到的 Email 是否正確。
確認沒問題後再設 cron。

---

## 四、設定 cron 每天 09:00 執行

```bash
crontab -e
```

加入一行（請把路徑改成實際位置）：

```cron
# 每天 09:00 執行 (伺服器時區請先確認：date；台灣請設 Asia/Taipei)
0 9 * * *  cd /home/ubuntu/gmop/api-data-check && /home/ubuntu/gmop/api-data-check/.venv/bin/python run.py >> output/cron.log 2>&1
```

確認伺服器時區為台灣時間：

```bash
timedatectl set-timezone Asia/Taipei   # 需 sudo
```

---

## 常見問題

- **登入失敗**：多半是 `config.yaml` 的 `login.*_selector` 或帳密不對；
  看 `output/debug_login_failed_*.png`。
- **找不到表格**：調整 `navigate_to_check.steps` 與 `check_failures.table_selector`。
- **匯出拿不到檔**：若網站沒有「匯出」按鈕，把 `export.mode` 改成 `scrape`，
  程式會自行讀表格產生 `.xls`。
- **收不到信**：檢查 SMTP 設定、應用程式密碼、以及伺服器對外 587 埠是否開放。
