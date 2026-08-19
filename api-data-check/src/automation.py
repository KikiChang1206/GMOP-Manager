"""Playwright 網站自動化：登入 / 導覽 / 檢查未成功 / 匯出 / 上傳。

所有頁面相關的選擇器都來自 config.yaml，找不到元素時會把截圖與
HTML 存到 output/ 供除錯。
"""
from datetime import datetime
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

from .excel import write_xls

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "output"


class Automation:
    def __init__(self, secrets: dict, site: dict, logger):
        self.secrets = secrets
        self.site = site
        self.log = logger
        self.timeout = int(site.get("timeout_ms", 30000))
        self._pw = None
        self._browser = None
        self.page = None

    # ---------- 生命週期 ----------
    def __enter__(self):
        self._pw = sync_playwright().start()
        self._browser = self._pw.chromium.launch(headless=self.site.get("headless", True))
        ctx = self._browser.new_context(accept_downloads=True)
        ctx.set_default_timeout(self.timeout)
        self.page = ctx.new_page()
        return self

    def __exit__(self, exc_type, exc, tb):
        if exc_type is not None:
            self.dump_debug("error")
        try:
            if self._browser:
                self._browser.close()
        finally:
            if self._pw:
                self._pw.stop()

    def dump_debug(self, tag: str):
        """把當前頁面截圖與 HTML 存檔，方便對照選擇器。"""
        try:
            OUTPUT_DIR.mkdir(exist_ok=True)
            stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            self.page.screenshot(path=str(OUTPUT_DIR / f"debug_{tag}_{stamp}.png"), full_page=True)
            (OUTPUT_DIR / f"debug_{tag}_{stamp}.html").write_text(self.page.content(), encoding="utf-8")
            self.log.info(f"已存除錯截圖/HTML：debug_{tag}_{stamp}.*")
        except Exception as e:  # noqa: BLE001
            self.log.warning(f"存除錯檔失敗：{e}")

    # ---------- 通用 step 執行器 ----------
    def _run_steps(self, steps):
        for step in steps or []:
            t = step.get("type")
            if t == "goto":
                self.log.info(f"前往 {step['url']}")
                self.page.goto(step["url"], wait_until="networkidle")
            elif t == "click":
                self.log.info(f"點選 {step['selector']}")
                self.page.click(step["selector"])
                self.page.wait_for_load_state("networkidle")
            elif t == "fill":
                self.page.fill(step["selector"], step.get("value", ""))
            elif t == "select":
                self.page.select_option(step["selector"], step.get("value"))
            elif t == "wait":
                if step.get("selector"):
                    self.page.wait_for_selector(step["selector"])
                else:
                    self.page.wait_for_timeout(int(step.get("ms", 1000)))
            else:
                self.log.warning(f"未知的 step type：{t}")

    # ---------- 登入 ----------
    def login(self):
        cfg = self.site["login"]
        self.log.info("開啟登入頁…")
        self.page.goto(self.secrets["login_url"], wait_until="networkidle")
        self.page.fill(cfg["username_selector"], self.secrets["username"])
        self.page.fill(cfg["password_selector"], self.secrets["password"])
        self.page.click(cfg["submit_selector"])
        self.page.wait_for_load_state("networkidle")
        # 確認登入成功
        try:
            self.page.wait_for_selector(cfg["success_selector"], timeout=self.timeout)
        except PWTimeout:
            self.dump_debug("login_failed")
            raise RuntimeError("登入後找不到成功指標，可能帳密錯誤或選擇器需調整")
        self.log.info("登入成功")

    # ---------- 檢查未成功資料 ----------
    def check_failures(self):
        """回傳 (headers, fail_rows, reasons)。
        fail_rows: 未成功資料列 (List[List[str]])
        reasons:   對應的原因清單 (List[str])
        """
        cfg = self.site["check_failures"]
        self._run_steps(self.site.get("navigate_to_check", {}).get("steps"))

        try:
            self.page.wait_for_selector(cfg["table_selector"], timeout=self.timeout)
        except PWTimeout:
            self.dump_debug("no_table")
            raise RuntimeError("找不到結果表格，請確認 navigate_to_check 與 table_selector")

        fail_texts = cfg.get("fail_text", [])
        reason_sel = cfg.get("reason_selector")
        rows = self.page.query_selector_all(cfg["row_selector"])

        headers = self._extract_headers(cfg)
        fail_rows, reasons = [], []
        for row in rows:
            text = (row.inner_text() or "").strip()
            if not text:
                continue
            if any(ft in text for ft in fail_texts):
                cells = [c.inner_text().strip() for c in row.query_selector_all("td")]
                if not cells:
                    continue
                fail_rows.append(cells)
                reason = ""
                if reason_sel:
                    el = row.query_selector(reason_sel)
                    reason = el.inner_text().strip() if el else ""
                reasons.append(reason or text)

        self.log.info(f"偵測到未成功資料 {len(fail_rows)} 筆")
        return headers, fail_rows, reasons

    def _extract_headers(self, cfg):
        configured = self.site.get("export", {}).get("headers") or []
        if configured:
            return configured
        # 嘗試從表頭抓
        ths = self.page.query_selector_all(f"{cfg['table_selector']} th")
        if ths:
            return [th.inner_text().strip() for th in ths]
        return []

    # ---------- 匯出 .xls ----------
    def export_xls(self, headers, fail_rows) -> Path:
        cfg = self.site["export"]
        mode = cfg.get("mode", "download")

        if mode == "download":
            self.log.info("以網站匯出按鈕下載 .xls…")
            OUTPUT_DIR.mkdir(exist_ok=True)
            with self.page.expect_download(timeout=self.timeout) as dl_info:
                self.page.click(cfg["export_button_selector"])
            download = dl_info.value
            stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            out_path = OUTPUT_DIR / f"api_failures_{stamp}.xls"
            download.save_as(str(out_path))
            self.log.info(f"已下載：{out_path.name}")
            return out_path

        # mode == "scrape"：自行產生 .xls
        self.log.info("自行讀取表格產生 .xls…")
        if not headers:
            headers = [f"欄位{i+1}" for i in range(len(fail_rows[0]))] if fail_rows else ["資料"]
        out_path = write_xls(headers, fail_rows)
        self.log.info(f"已產生：{out_path.name}")
        return out_path

    # ---------- 上傳 .xls ----------
    def upload_xls(self, xls_path: Path):
        cfg = self.site["upload"]
        self._run_steps(cfg.get("steps"))
        self.log.info(f"上傳檔案：{xls_path.name}")
        self.page.set_input_files(cfg["file_input_selector"], str(xls_path))
        if cfg.get("submit_selector"):
            self.page.click(cfg["submit_selector"])
            self.page.wait_for_load_state("networkidle")
        # 確認上傳成功
        success_sel = cfg.get("success_selector")
        if success_sel:
            try:
                self.page.wait_for_selector(success_sel, timeout=self.timeout)
            except PWTimeout:
                self.dump_debug("upload_failed")
                raise RuntimeError("上傳後找不到成功指標，請確認 upload.success_selector")
        self.log.info("上傳完成")
