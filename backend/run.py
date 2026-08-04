"""Start the LedgerFlow API server.

Use a single process (reload=False) on Windows — dual reload parents fighting
for port 8000 caused Capitec imports to complete with 0 transactions.
Set LEDGERFLOW_RELOAD=1 to enable file-watch reload for local code edits.

When frozen (PyInstaller desktop build), pass the app object — string import
paths do not work the same way inside a one-file/one-dir bundle.
"""

import os
import sys

import uvicorn

if __name__ == "__main__":
    host = os.environ.get("LEDGERFLOW_HOST", "127.0.0.1").strip() or "127.0.0.1"
    port = int(os.environ.get("LEDGERFLOW_PORT", "8000") or "8000")
    frozen = getattr(sys, "frozen", False)

    if frozen:
        from app.main import app

        uvicorn.run(app, host=host, port=port, reload=False)
    else:
        reload = os.environ.get("LEDGERFLOW_RELOAD", "").strip() in {
            "1",
            "true",
            "True",
            "yes",
        }
        uvicorn.run("app.main:app", host=host, port=port, reload=reload)
