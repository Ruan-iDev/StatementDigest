"""Re-import latest Capitec PDF into a new batch (dev helper)."""
from __future__ import annotations

from pathlib import Path

import pdfplumber
from sqlalchemy.orm import joinedload

from app.database import SessionLocal, init_db, engine
from app.migrate_schema import migrate_schema
from app.models import BankProfile, ImportBatch, ImportStatus, Transaction
from app.services.capitec_fees import apply_capitec_fees_to_bank_ledger
from app.services.parsers import parse_statement
from app.services.parsers.capitec_pdf import CAPITEC_BUSINESS_PRESET, looks_like_capitec_text
from app.services.rules_engine import apply_rules_to_transactions
from datetime import datetime

ROOT = Path(__file__).resolve().parents[1]
UPLOADS = ROOT / "data" / "uploads"

init_db()
migrate_schema(engine)
db = SessionLocal()

profile = (
    db.query(BankProfile)
    .filter(BankProfile.name.ilike("%capitec%"))
    .order_by(BankProfile.id.asc())
    .first()
)
if not profile:
    raise SystemExit("No Capitec bank profile")

# Ensure calibration is correct
profile.bank_type = "Capitec"
profile.calibration_data = dict(CAPITEC_BUSINESS_PRESET)
profile.updated_at = datetime.utcnow()
db.commit()
db.refresh(profile)

target = None
for p in sorted(UPLOADS.glob("*.pdf"), key=lambda x: x.stat().st_mtime, reverse=True):
    with pdfplumber.open(str(p)) as pdf:
        t = pdf.pages[0].extract_text() or ""
    if looks_like_capitec_text(t):
        target = p
        break
if not target:
    raise SystemExit("No Capitec PDF in uploads")

print("Using", target.name, "profile", profile.id, profile.name)

parsed = parse_statement(target, profile.calibration_data, "Capitec Business 2026.pdf")
print("parsed", len(parsed))
if not parsed:
    raise SystemExit("Parse returned 0 — abort")

batch = ImportBatch(
    user_profile_id=profile.user_profile_id,
    bank_profile_id=profile.id,
    filename="Capitec Business 2026.pdf",
    status=ImportStatus.PARSING.value,
    transaction_count=0,
)
db.add(batch)
db.commit()
db.refresh(batch)

ids = []
for p in parsed:
    tx = Transaction(
        user_profile_id=profile.user_profile_id,
        bank_profile_id=profile.id,
        date=p.date,
        description=p.description,
        amount=p.amount,
        fee_amount=getattr(p, "fee_amount", None),
        principal_amount=getattr(p, "principal_amount", None),
        balance=p.balance,
        reference=p.reference,
        is_categorised=False,
        source_file="Capitec Business 2026.pdf",
        import_batch_id=batch.id,
        is_excluded=False,
    )
    db.add(tx)
    db.flush()
    ids.append(tx.id)

batch.transaction_count = len(ids)
batch.status = ImportStatus.COMPLETED.value
batch.error_message = None
db.commit()
fees_n = apply_capitec_fees_to_bank_ledger(db, ids)
if fees_n:
    batch.transaction_count = (
        db.query(Transaction).filter(Transaction.import_batch_id == batch.id).count()
    )
    db.commit()
apply_rules_to_transactions(db, ids)
print(f"Inserted batch {batch.id} with {batch.transaction_count} transactions (fees assigned={fees_n})")
for p in parsed:
    print(
        f"  {p.date} Fee[{p.fee_amount}] Amount[{p.amount}] prin[{p.principal_amount}] {p.description[:40]}"
    )
# Show bank-fee ledger rows
from app.models import Ledger
fee_led = (
    db.query(Ledger)
    .filter(Ledger.user_profile_id == profile.user_profile_id, Ledger.name.ilike("%bank%fee%"))
    .first()
)
if not fee_led:
    fee_led = (
        db.query(Ledger)
        .filter(Ledger.user_profile_id == profile.user_profile_id, Ledger.name.ilike("%bank%charge%"))
        .first()
    )
if fee_led:
    fee_txs = (
        db.query(Transaction)
        .filter(Transaction.import_batch_id == batch.id, Transaction.ledger_id == fee_led.id)
        .all()
    )
    print(f"Bank fees ledger '{fee_led.name}' id={fee_led.id}: {len(fee_txs)} tx(s)")
    for t in fee_txs:
        print(f"  ALLOC {t.date} {t.amount} {t.description[:50]} cat={t.is_categorised}")
db.close()
