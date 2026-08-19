"""Email 通知：把執行結果與未上傳原因寄到指定信箱。"""
import smtplib
from email.message import EmailMessage
from email.utils import formatdate
from pathlib import Path


def send_report(secrets: dict, subject: str, body: str, attachments=None):
    """attachments: 選填的檔案路徑清單 (例如產生的 .xls 或 log)。"""
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = secrets["mail_from"]
    msg["To"] = secrets["mail_to"]
    msg["Date"] = formatdate(localtime=True)
    msg.set_content(body)

    for path in attachments or []:
        p = Path(path)
        if not p.exists():
            continue
        data = p.read_bytes()
        # .xls -> application/vnd.ms-excel；其餘當純文字/二進位
        if p.suffix.lower() == ".xls":
            maintype, subtype = "application", "vnd.ms-excel"
        elif p.suffix.lower() == ".log":
            maintype, subtype = "text", "plain"
        else:
            maintype, subtype = "application", "octet-stream"
        msg.add_attachment(data, maintype=maintype, subtype=subtype, filename=p.name)

    with smtplib.SMTP(secrets["smtp_host"], secrets["smtp_port"], timeout=30) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.login(secrets["smtp_user"], secrets["smtp_password"])
        smtp.send_message(msg)
