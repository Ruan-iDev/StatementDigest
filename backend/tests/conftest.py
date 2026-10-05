"""Test-session safety: never let pytest touch the user's real LedgerFlow DB.

app.config resolves DATA_DIR at import time and defaults to
~/Documents/LedgerFlow/Data. If LEDGERFLOW_DATA is not set, point it at a
throwaway temp folder before any app module is imported.
"""

from __future__ import annotations

import os
import tempfile

if not (os.environ.get("LEDGERFLOW_DATA") or "").strip():
    os.environ["LEDGERFLOW_DATA"] = tempfile.mkdtemp(prefix="ledgerflow-pytest-")
