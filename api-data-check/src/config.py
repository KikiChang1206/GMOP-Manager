"""載入設定：機密由 .env，網站操作由 config.yaml。"""
import os
from pathlib import Path

import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent


def _require(name: str) -> str:
    val = os.getenv(name, "").strip()
    if not val or val.startswith("請填入"):
        raise RuntimeError(f"環境變數 {name} 尚未設定，請檢查 .env")
    return val


def load_settings():
    """回傳 (secrets: dict, site: dict)。"""
    load_dotenv(ROOT / ".env")

    secrets = {
        "base_url": os.getenv("GMOP_BASE_URL", "https://system.goodmaji.com"),
        "login_url": _require("GMOP_LOGIN_URL"),
        "username": _require("GMOP_USERNAME"),
        "password": _require("GMOP_PASSWORD"),
        "smtp_host": _require("SMTP_HOST"),
        "smtp_port": int(os.getenv("SMTP_PORT", "587")),
        "smtp_user": _require("SMTP_USER"),
        "smtp_password": _require("SMTP_PASSWORD"),
        "mail_from": _require("MAIL_FROM"),
        "mail_to": _require("MAIL_TO"),
    }

    config_path = ROOT / "config.yaml"
    if not config_path.exists():
        raise RuntimeError("找不到 config.yaml，請由 config.example.yaml 複製一份並填入選擇器")
    with open(config_path, "r", encoding="utf-8") as f:
        site = yaml.safe_load(f)

    return secrets, site
