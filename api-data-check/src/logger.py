"""同時輸出到 console 與 output/run-YYYYMMDD.log 的 logger。"""
import logging
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "output"


def get_logger() -> logging.Logger:
    OUTPUT_DIR.mkdir(exist_ok=True)
    logger = logging.getLogger("api-data-check")
    if logger.handlers:
        return logger
    logger.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", "%Y-%m-%d %H:%M:%S")

    stamp = datetime.now().strftime("%Y%m%d")
    fh = logging.FileHandler(OUTPUT_DIR / f"run-{stamp}.log", encoding="utf-8")
    fh.setFormatter(fmt)
    logger.addHandler(fh)

    ch = logging.StreamHandler()
    ch.setFormatter(fmt)
    logger.addHandler(ch)
    return logger
