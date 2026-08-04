"""Diagnose Capitec zero-transaction import."""
from __future__ import annotations

import json
import sqlite3
import traceback
from pathlib import Path

import pdfplumber

from app.services.parsers.base import parse_pdf_content, parse_statement
from app.services.parsers.capitec_pdf import (
    CAPITEC_BUSINESS_PRESET,
    looks_like_capitec_text,
    parse_capitec_pdf_text,
)
from app.services.parsers.detect import dissect_statement

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "ledgerflow.db"
UPLOADS = ROOT / "data" / "uploads"

conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row

print("=== Capitec profile(s) ===")
for row in conn.execute(
    "SELECT id, name, bank_type, calibration_data, updated_at FROM bank_profiles "
    "WHERE lower(name) LIKE '%capitec%' OR bank_type LIKE '%Capitec%' OR id=3"
):
    cal = json.loads(row["calibration_data"]) if isinstance(row["calibration_data"], str) else row["calibration_data"]
    print(f"id={row['id']} name={row['name']!r} type={row['bank_type']} updated={row['updated_at']}")
    print(
        "  cal:",
        {
            k: cal.get(k)
            for k in (
                "parser",
                "file_type",
                "capitec_preset",
                "capitec_business",
                "combine_fees_into_amount",
                "bank_family",
                "amount_column",
                "fees_column",
                "date_column",
                "skip_rows",
                "has_header",
                "discovery_preset",
                "fnb_preset",
            )
        },
    )
    profile_cal = cal
    profile_id = row["id"]

print("\n=== Latest import batches (any) ===")
for row in conn.execute(
    """
    SELECT b.id, b.filename, b.bank_profile_id, b.transaction_count, b.status,
           b.error_message, b.uploaded_at, p.name AS pname, p.bank_type
    FROM import_batches b
    LEFT JOIN bank_profiles p ON p.id = b.bank_profile_id
    ORDER BY b.id DESC LIMIT 8
    """
):
    print(dict(row))

print("\n=== Capitec batches ===")
for row in conn.execute(
    """
    SELECT b.id, b.filename, b.transaction_count, b.status, b.error_message, b.uploaded_at
    FROM import_batches b
    JOIN bank_profiles p ON p.id = b.bank_profile_id
    WHERE p.id = ? OR lower(p.name) LIKE '%capitec%' OR lower(b.filename) LIKE '%capitec%'
    ORDER BY b.id DESC LIMIT 10
    """,
    (profile_id,),
):
    print(dict(row))
    n = conn.execute(
        "SELECT count(*) c FROM transactions WHERE import_batch_id=?", (row["id"],)
    ).fetchone()["c"]
    print(f"  txs linked: {n}")

conn.close()

# Newest PDFs that look Capitec
hits = []
for p in sorted(UPLOADS.glob("*.pdf"), key=lambda x: x.stat().st_mtime, reverse=True):
    try:
        with pdfplumber.open(str(p)) as pdf:
            pages = len(pdf.pages)
            t = "\n".join((pg.extract_text() or "") for pg in pdf.pages[: min(2, pages)])
            tables = []
            for pg in pdf.pages[: min(2, pages)]:
                tables.extend(pg.extract_tables() or [])
        if "capitec" in t.lower() or "capitec" in p.name.lower():
            hits.append((p, t, tables, pages))
    except Exception as e:
        print("open err", p.name, e)

print(f"\n=== Capitec PDFs in uploads: {len(hits)} ===")
for p, t, tables, pages in hits[:3]:
    print("\n" + "=" * 70)
    print(p.name, "mtime", p.stat().st_mtime, "pages", pages, "tables", len(tables))
    print("looks_like_capitec_text:", looks_like_capitec_text(t))
    print("--- text head ---")
    print("\n".join(t.splitlines()[:40]))
    print("--- tables ---")
    for ti, table in enumerate(tables[:4]):
        print(f"TABLE {ti} rows={len(table)}")
        if table:
            print("  header:", table[0])
            for ri, row in enumerate(table[1:8]):
                print(f"  r{ri+1}: {row}")

    content = p.read_bytes()
    print("\n--- dissect ---")
    try:
        d = dissect_statement(content, "Capitec Business sample.pdf")
        print("bank_type", d.get("bank_type"))
        print("message", d.get("message"))
        print("preview_n", len(d.get("parsed_preview") or []))
        for pr in (d.get("parsed_preview") or [])[:5]:
            print(" ", pr)
        print("cal parser", (d.get("calibration") or {}).get("parser"))
    except Exception:
        traceback.print_exc()

    print("\n--- parse_capitec_pdf_text (preset) ---")
    try:
        txs = parse_capitec_pdf_text(content, CAPITEC_BUSINESS_PRESET)
        print("n=", len(txs))
        for x in txs[:8]:
            print(f"  {x.date} fee={x.fee_amount} prin={x.principal_amount} amt={x.amount} {x.description[:50]}")
    except Exception:
        traceback.print_exc()

    print("\n--- parse_pdf_content (profile cal) ---")
    try:
        txs2 = parse_pdf_content(content, profile_cal)
        print("n=", len(txs2))
        for x in txs2[:8]:
            print(f"  {x.date} amt={x.amount} fee={getattr(x,'fee_amount',None)} {x.description[:50]}")
    except Exception:
        traceback.print_exc()

    print("\n--- parse_statement as import does ---")
    try:
        txs3 = parse_statement(p, profile_cal, "Capitec Business 2026.pdf")
        print("n=", len(txs3))
    except Exception:
        traceback.print_exc()
