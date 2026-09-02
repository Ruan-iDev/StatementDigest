"""Start the LedgerFlow API server.

Use a single process (reload=False) on Windows — dual reload parents fighting
for the API port caused Capitec imports to complete with 0 transactions.
Set LEDGERFLOW_RELOAD=1 to enable file-watch reload for local code edits.

Default bind is 127.0.0.1:8470 (not uvicorn's 8000) so this app does not collide
with other local stacks. Override with LEDGERFLOW_HOST / LEDGERFLOW_PORT.

When frozen (PyInstaller desktop build), pass the app object — string import
paths do not work the same way inside a one-file/one-dir bundle.

Desktop builds also write Documents/LedgerFlow/logs/api.log (LEDGERFLOW_LOG_FILE).
"""

from __future__ import annotations

import logging
import os
import sys
import traceback
from pathlib import Path

import uvicorn


def _setup_file_logging(frozen: bool) -> Path | None:
    raw = (os.environ.get("LEDGERFLOW_LOG_FILE") or "").strip()
    if not raw and frozen:
        raw = str(Path.home() / "Documents" / "LedgerFlow" / "logs" / "api.log")
    if not raw:
        return None
    path = Path(raw)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            handlers=[
                logging.FileHandler(path, encoding="utf-8"),
                logging.StreamHandler(sys.stderr),
            ],
            force=True,
        )
    except Exception:
        traceback.print_exc()
        return None

    def _hook(exc_type, exc, tb):
        logging.critical("Uncaught exception", exc_info=(exc_type, exc, tb))
        sys.__excepthook__(exc_type, exc, tb)

    sys.excepthook = _hook
    return path


if __name__ == "__main__":
    host = os.environ.get("LEDGERFLOW_HOST", "127.0.0.1").strip() or "127.0.0.1"
    port = int(os.environ.get("LEDGERFLOW_PORT", "8470") or "8470")
    frozen = getattr(sys, "frozen", False)
    log_file = _setup_file_logging(frozen)
    logging.info(
        "API starting frozen=%s host=%s port=%s log=%s argv=%s",
        frozen,
        host,
        port,
        log_file,
        sys.argv,
    )

    try:
        if frozen:
            from app.main import app

            logging.info("imported app.main — starting uvicorn")
            uvicorn.run(app, host=host, port=port, reload=False, log_level="info")
        else:
            reload = os.environ.get("LEDGERFLOW_RELOAD", "").strip() in {
                "1",
                "true",
                "True",
                "yes",
            }
            uvicorn.run("app.main:app", host=host, port=port, reload=reload)
    except Exception:
        logging.exception("API aborted")
        raise
