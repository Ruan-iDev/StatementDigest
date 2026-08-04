"""Versioned upload disclaimer text and acceptance checks."""

from __future__ import annotations

# Bump this when the disclaimer wording changes (audit trail key).
DISCLAIMER_VERSION = "upload-v1-2026-07-31"

DISCLAIMER_TITLE = "Before you process statements"

DISCLAIMER_BODY = """This application is a tool only.

LedgerFlow helps you import and organise bank statement data on your machine. It does not replace professional accounting, tax, or financial advice.

You remain fully responsible for reviewing and double-checking every transaction, amount, date, category, and report produced by this app before you disclose, share, export, or rely on that information with any third party (including accountants, tax authorities, banks, partners, or other software).

Under no circumstances shall this application or its creators be held responsible for incorrect, incomplete, or misleading data. By clicking Accept you confirm that you have read this warning and the Terms of Use, and that you accept full responsibility for verification of all processed information."""

DISCLAIMER_SHORT = (
    "Tool only — you must double-check all transactions before sharing with any third party."
)
