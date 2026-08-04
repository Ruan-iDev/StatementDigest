import json
import sqlite3
from pathlib import Path

from app.database import init_db, SessionLocal, engine
from app.migrate_schema import migrate_schema
from app.models import BankProfile, Transaction
from app.services.parsers import parse_statement
from app.services.training import should_skip_description
from sqlalchemy import text

ROOT = Path(__file__).resolve().parents[1]
UPLOADS = ROOT / "data" / "uploads"

init_db()
migrate_schema(engine)

# columns
with engine.connect() as conn:
    cols = [r[1] for r in conn.execute(text("PRAGMA table_info(transactions)"))]
print("transaction columns:", cols)
print("has fee_amount", "fee_amount" in cols, "principal_amount", "principal_amount" in cols)

db = SessionLocal()
profile = db.query(BankProfile).filter(BankProfile.id == 3).first()
print("profile", profile.name, profile.bank_type)
cal = profile.calibration_data
print("cal type", type(cal), "parser", cal.get("parser") if isinstance(cal, dict) else None)

# newest capitec file
target = None
for p in sorted(UPLOADS.glob("*.pdf"), key=lambda x: x.stat().st_mtime, reverse=True):
    if p.stat().st_size < 1000:
        continue
    # match latest upload hash for batch 32 - just newest capitec by reading
    from app.services.parsers.capitec_pdf import looks_like_capitec_text
    import pdfplumber

    with pdfplumber.open(str(p)) as pdf:
        t = pdf.pages[0].extract_text() or ""
    if looks_like_capitec_text(t):
        target = p
        break

print("file", target)
parsed = parse_statement(target, cal if isinstance(cal, dict) else {}, "Capitec Business 2026.pdf")
print("parsed", len(parsed))
skipped = 0
for p in parsed:
    if should_skip_description(db, profile.user_profile_id, p.description):
        skipped += 1
        print("SKIP", p.description[:60])
print("skipped", skipped, "would insert", len(parsed) - skipped)

# try insert one
if parsed:
    p = parsed[0]
    try:
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
            source_file="diag",
            is_excluded=False,
        )
        db.add(tx)
        db.flush()
        print("insert OK id", tx.id, "fee", tx.fee_amount, "prin", tx.principal_amount)
        db.rollback()
    except Exception as e:
        db.rollback()
        print("INSERT FAIL", type(e), e)

# patterns
from app.models import TrainingPattern

pats = db.query(TrainingPattern).all()
print("patterns", len(pats))
for pat in pats[:20]:
    print(" ", pat.match_type, pat.pattern_value[:80] if pat.pattern_value else None)

db.close()
