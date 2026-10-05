"""Bot-corpus reconciliation: opening + sum(txs) == closing for every real PDF.

The corpus lives in samples/bot-corpus/ (personal statements, gitignored), so
this module skips cleanly on machines / CI without it. Override the location
with LEDGERFLOW_BOT_CORPUS=/path/to/bot-corpus.

Each PDF is parsed by its own bank island only (discovery/ → discovery_pdf,
fnb/ → fnb_pdf). Failures print the file path and every problem found.

    cd backend && python -m pytest tests/test_corpus_reconcile.py -q
    cd backend && python reconcile_corpus.py            # summary table
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

import reconcile_corpus as rc  # noqa: E402

CORPUS = Path(os.environ.get("LEDGERFLOW_BOT_CORPUS") or rc.DEFAULT_CORPUS)
PDFS = list(rc.iter_pdfs(CORPUS)) if CORPUS.is_dir() else []


@pytest.mark.skipif(not PDFS, reason=f"bot corpus not present at {CORPUS}")
@pytest.mark.parametrize(
    "pdf", PDFS, ids=[str(p.relative_to(CORPUS)) for p in PDFS] if PDFS else None
)
def test_statement_reconciles(pdf: Path):
    res = rc.reconcile_pdf(pdf, CORPUS)
    assert res.ok, f"{res.path} [{res.status}] txs={res.tx_count}\n  - " + "\n  - ".join(res.problems)
