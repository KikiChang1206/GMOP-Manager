#!/usr/bin/env python3
"""每日自動檢查未成功 API 資料流程：

  1. 登入 system.goodmaji.com
  2. 到指定頁面檢查是否有「未成功」的資料
  3. 若有 → 另存成 .xls，再重新上傳
  4. 上傳成功後 → 回頭再檢查一次
  5. 把結果 (含仍未上傳的原因) Email 通知 op2@goodmaji.com

由 cron 每天 09:00 觸發 (見 README)。
"""
import sys
import traceback
from datetime import datetime
from pathlib import Path

from src.automation import Automation
from src.config import load_settings
from src.logger import get_logger
from src.notifier import send_report

ROOT = Path(__file__).resolve().parent


def format_reasons(fail_rows, reasons) -> str:
    lines = []
    for i, (row, reason) in enumerate(zip(fail_rows, reasons), start=1):
        key = row[0] if row else "?"
        lines.append(f"  {i}. {key}｜原因：{reason}")
    return "\n".join(lines) if lines else "  (無)"


def main() -> int:
    log = get_logger()
    log.info("===== 每日 API 未成功資料檢查開始 =====")
    run_time = datetime.now().strftime("%Y-%m-%d %H:%M")

    try:
        secrets, site = load_settings()
    except Exception as e:  # noqa: BLE001
        log.error(f"設定載入失敗：{e}")
        print(f"設定載入失敗：{e}", file=sys.stderr)
        return 2

    try:
        with Automation(secrets, site, log) as bot:
            bot.login()

            # (2) 第一次檢查
            headers, fail_rows, reasons = bot.check_failures()

            if not fail_rows:
                subject = f"[GMOP] {run_time} API 資料檢查：全部正常 ✅"
                body = f"執行時間：{run_time}\n\n檢查結果：沒有未成功的 API 資料，無需上傳。"
                send_report(secrets, subject, body)
                log.info("沒有未成功資料，已寄出正常通知。")
                return 0

            # (3) 匯出 .xls
            xls_path = bot.export_xls(headers, fail_rows)

            # (3) 重新上傳
            bot.upload_xls(xls_path)

            # (4) 回頭再檢查一次
            _, remain_rows, remain_reasons = bot.check_failures()

        # (5) 組報告並通知
        if not remain_rows:
            subject = f"[GMOP] {run_time} 已重新上傳並確認完成 ✅"
            body = (
                f"執行時間：{run_time}\n\n"
                f"第一次檢查：{len(fail_rows)} 筆未成功\n"
                f"已匯出並重新上傳：{xls_path.name}\n"
                f"再次檢查：全部已成功，無殘留未上傳資料。"
            )
            send_report(secrets, subject, body, attachments=[xls_path])
        else:
            subject = f"[GMOP] {run_time} 重新上傳後仍有 {len(remain_rows)} 筆未成功 ⚠️"
            body = (
                f"執行時間：{run_time}\n\n"
                f"第一次檢查：{len(fail_rows)} 筆未成功\n"
                f"已匯出並重新上傳：{xls_path.name}\n"
                f"再次檢查：仍有 {len(remain_rows)} 筆未上傳，原因如下：\n\n"
                f"{format_reasons(remain_rows, remain_reasons)}"
            )
            send_report(secrets, subject, body, attachments=[xls_path])

        log.info("流程完成，已寄出通知。")
        return 0

    except Exception as e:  # noqa: BLE001
        log.error(f"執行失敗：{e}")
        log.error(traceback.format_exc())
        # 失敗也要通知
        try:
            send_report(
                secrets,
                f"[GMOP] {run_time} 自動檢查執行失敗 ❌",
                f"執行時間：{run_time}\n\n程式發生錯誤：\n{e}\n\n"
                f"請至伺服器 output/ 查看 debug 截圖與 log。",
            )
        except Exception as mail_err:  # noqa: BLE001
            log.error(f"連錯誤通知信都寄失敗：{mail_err}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
