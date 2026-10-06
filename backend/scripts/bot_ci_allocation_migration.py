"""One-off (idempotent) migration for the LedgerFlow *bot* instance, profile 2.

Constructive Image (CI, FNB 63197269070) reference suffixes (Ruan, 2026-10-06):
  'Mike - RF'  -> Petty Cash – Mike      'Mike - PFT' -> Commission – Mike
  'Ruan - RF'  -> Petty Cash – Ruan      'Ruan - PFT' -> Commission – Ruan
Ruan's RF/PFT payments land in his Discovery account (18882058643) as
'CI - <job> - RF/PFT'; those receipts are allocated to matching personal-side
income ledgers so a consolidated P&L counts the CI cost once (CI expense +
Ruan's receipt cancel; Ruan's own out-of-pocket spend stays as expense).
They are remuneration / reimbursement, *not* director's-loan movements.

Mixed 'Rf+Pft' references go to Commission (PFT) – flagged as an open question
(the RF share cannot be split from the bank line).

Usage:  LEDGERFLOW_DATA=/workspace/ledgerflow-bot-data python scripts/bot_ci_allocation_migration.py [--dry-run]
"""
from __future__ import annotations

import os
import sys

DATA = os.environ.get("LEDGERFLOW_DATA", "")
if not DATA or "Documents/LedgerFlow" in DATA or "Documents\\LedgerFlow" in DATA:
    sys.exit("Refusing: set LEDGERFLOW_DATA to the bot data dir (never the live Documents/LedgerFlow)")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal  # noqa: E402
from app.models import BankAccount, Ledger, Rule, Transaction  # noqa: E402
from app.services.rules_engine import transaction_matches_rule  # noqa: E402

PROFILE = 2
CI_ACCT = "63197269070"
DISC_ACCT = "18882058643"
MIXED = r"(?!.*rf\s*\+\s*pft)(?!.*pft\s*\+\s*rf)"

LEDGERS = [
    ("Petty Cash – Mike", "expense"),
    ("Commission – Mike", "expense"),
    ("Petty Cash – Ruan", "expense"),
    ("Commission – Ruan", "expense"),
    ("Commission Received – Constructive Image (Ruan)", "income"),
    ("Petty Cash Reimbursed – Constructive Image (Ruan)", "income"),
]


def rules_spec(ci_id: int, disc_id: int):
    return [
        # (name, priority, ledger, regex, account, sign)
        ("CI: Mike - RF → Petty Cash – Mike", 915, "Petty Cash – Mike", r"^(?!.*pft)" + MIXED + r".*mike\s*-.*rf", ci_id, "out"),
        ("CI: Mike - PFT → Commission – Mike", 914, "Commission – Mike", r"mike\s*-.*pft", ci_id, "out"),
        ("CI: Ruan - RF → Petty Cash – Ruan", 913, "Petty Cash – Ruan", r"^(?!.*pft)" + MIXED + r".*ruan\s*-.*rf", ci_id, "out"),
        ("CI: Ruan - PFT → Commission – Ruan", 912, "Commission – Ruan", r"ruan\s*-.*pft", ci_id, "out"),
        ("Discovery: CI - RF received → Petty Cash Reimbursed (CI)", 911,
         "Petty Cash Reimbursed – Constructive Image (Ruan)", r"^(?!.*pft)" + MIXED + r".*\bci\s*-.*\brf\b", disc_id, "in"),
        ("Discovery: CI - PFT received → Commission Received (CI)", 910,
         "Commission Received – Constructive Image (Ruan)", r"\bci\s*-.*\bpft", disc_id, "in"),
    ]


def main(dry: bool) -> None:
    db = SessionLocal()
    ci = db.query(BankAccount).filter_by(user_profile_id=PROFILE, account_number=CI_ACCT).one()
    disc = db.query(BankAccount).filter_by(user_profile_id=PROFILE, account_number=DISC_ACCT).one()
    lg = {}
    for name, typ in LEDGERS:
        row = db.query(Ledger).filter_by(user_profile_id=PROFILE, name=name).first()
        if not row:
            row = Ledger(user_profile_id=PROFILE, name=name, type=typ, sort_order=0)
            db.add(row)
            db.flush()
            print("created ledger", row.id, name)
        lg[name] = row
    new_rules = []
    for name, prio, ledger, rx, acct, sign in rules_spec(ci.id, disc.id):
        mj = {"regex": rx, "bank_account_ids": [acct]}
        mj["amount_max" if sign == "out" else "amount_min"] = 0
        r = db.query(Rule).filter_by(user_profile_id=PROFILE, name=name).first()
        if not r:
            r = Rule(user_profile_id=PROFILE, name=name, match_type="combination", is_active=True)
            db.add(r)
            print("created rule", name)
        r.match_json, r.priority, r.ledger_id = mj, prio, lg[ledger].id
        db.flush()
        new_rules.append(r)
    new_rules.sort(key=lambda r: (-r.priority, r.id))
    # Re-apply the new rules to existing CI + Discovery rows (overrides older allocations).
    txs = db.query(Transaction).filter(
        Transaction.user_profile_id == PROFILE,
        Transaction.bank_account_id.in_([ci.id, disc.id]),
    ).order_by(Transaction.date, Transaction.id).all()
    moved = []
    for t in txs:
        for r in new_rules:
            if transaction_matches_rule(t, r):
                if t.ledger_id != r.ledger_id or t.rule_id != r.id:
                    moved.append((t.id, str(t.date), str(t.amount), t.description, t.ledger_id, r.ledger_id))
                    t.ledger_id, t.rule_id, t.is_categorised = r.ledger_id, r.id, True
                break
    for m in moved:
        print("moved", *m, sep="\t")
    print(f"{len(moved)} row(s) re-allocated")
    if dry:
        db.rollback()
        print("dry run: rolled back")
    else:
        db.commit()


if __name__ == "__main__":
    main("--dry-run" in sys.argv)
