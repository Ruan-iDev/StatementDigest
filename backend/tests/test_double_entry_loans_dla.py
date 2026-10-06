"""Loans, director's loan account (DLA), manual journals, overlapping statements.

Synthetic in-memory profiles only (always run).
"""

from __future__ import annotations

import sys
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app import models as M  # noqa: E402
from app.database import Base  # noqa: E402
from app.services.bank_accounts import apply_meta_to_batch, ensure_system_ledgers, refresh_openings  # noqa: E402
from app.services.double_entry import build_books  # noqa: E402
from app.services.double_entry_reports import (  # noqa: E402
    build_balance_sheet,
    build_general_ledger,
    build_trial_balance,
    compute_trial_balance,
)
from app.services.reports import build_pl_report  # noqa: E402
from app.services.rules_engine import transaction_matches_rule  # noqa: E402
from app.services.statement_meta import StatementMeta  # noqa: E402

D = Decimal


@pytest.fixture()
def db():
    eng = create_engine("sqlite://")
    Base.metadata.create_all(eng)
    s = sessionmaker(bind=eng)()
    yield s
    s.close()


class Profile:
    def __init__(self, db):
        self.db = db
        self.p = M.UserProfile(name="T", fy_start_month=3, currency="ZAR")
        db.add(self.p)
        db.flush()
        self.bp = M.BankProfile(user_profile_id=self.p.id, name="FNB", bank_type="FNB", calibration_data={})
        db.add(self.bp)
        db.flush()
        self.L: dict[str, int] = {}

    def ledger(self, name, typ):
        lg = M.Ledger(user_profile_id=self.p.id, name=name, type=typ)
        self.db.add(lg)
        self.db.flush()
        self.L[name] = lg.id
        return lg.id

    def stmt(self, acc, fname, start, end, opening, closing, rows, loan=False):
        b = M.ImportBatch(user_profile_id=self.p.id, bank_profile_id=self.bp.id, filename=fname,
                          status="completed", transaction_count=len(rows))
        self.db.add(b)
        self.db.flush()
        out = []
        for d, desc, amt, lg, *bal in rows:
            t = M.Transaction(user_profile_id=self.p.id, bank_profile_id=self.bp.id, date=d, description=desc,
                              amount=D(amt), ledger_id=self.L[lg], is_categorised=True, source_file=fname,
                              import_batch_id=b.id, balance=D(bal[0]) if bal else None)
            self.db.add(t)
            out.append(t)
        self.db.flush()
        meta = StatementMeta(bank="FNB", account_number=acc, product="Personal Loan" if loan else "Cheque",
                             opening=D(opening), closing=D(closing), period_start=start, period_end=end, is_loan=loan)
        apply_meta_to_batch(self.db, b, meta, meta_source="pdf_header", bank_profile=self.bp)
        return out

    def finish(self):
        refresh_openings(self.db, self.p.id)
        ensure_system_ledgers(self.db, self.p.id)
        self.db.commit()
        return self.p.id

    def journal(self, d, desc, lines, kind="opening", ref=None):
        je = M.JournalEntry(user_profile_id=self.p.id, date=d, description=desc, kind=kind, reference=ref,
                            source="test evidence")
        je.lines = [M.JournalLine(ledger_id=lid, amount=D(a)) for lid, a in lines]
        self.db.add(je)
        self.db.commit()
        return je


def _tb_ok(db, pid, books):
    for fy in (2020, 2021, 2022):
        assert build_trial_balance(db, pid, fy_start_year=fy, books=books).totals["difference"] == 0
    assert build_trial_balance(db, pid, period="all_time", books=books).totals["difference"] == 0


# ── overlapping / re-issued statements + excluded duplicates ───────────────


def _loan_overlap(db, exclude: bool):
    pr = Profile(db)
    pr.ledger("Interest", "expense")
    pr.ledger("Fees", "expense")
    pr.ledger("Loan Repayment Transfers", "transfer")
    first = pr.stmt("400", "400 2021-05-03.pdf", date(2021, 3, 14), date(2021, 4, 17), "-93063.29", "-91110.74", [
        (date(2021, 3, 25), "Interest", "-1945.41", "Interest", "-95008.70"),
        (date(2021, 3, 25), "#Monthly Service Fee", "-69.00", "Fees", "-95077.70"),
        (date(2021, 3, 25), "Debit Order", "3966.96", "Loan Repayment Transfers", "-91110.74"),
    ], loan=True)
    second = pr.stmt("400", "400 2021-06-08.pdf", date(2021, 3, 14), date(2021, 5, 15), "-93063.29", "0.00", [
        (date(2021, 3, 25), "Interest", "-1945.41", "Interest", "-95008.70"),          # duplicate
        (date(2021, 3, 25), "#Monthly Service Fee", "-69.00", "Fees", "-95077.70"),    # duplicate
        (date(2021, 3, 25), "Debit Order", "3966.96", "Loan Repayment Transfers", "-91110.74"),  # duplicate
        (date(2021, 4, 20), "Transfer - Loan Credit", "91110.74", "Loan Repayment Transfers", "0.00"),
    ], loan=True)
    if exclude:
        for t in second[:3]:
            t.is_excluded = True
    return pr, pr.finish(), first, second


def test_overlapping_statement_without_exclusion_flags_difference(db):
    pr, pid, _, _ = _loan_overlap(db, exclude=False)
    books = build_books(db, pid)
    st = {s.filename: s for s in books.statements}["400 2021-06-08.pdf"]
    assert st.overlaps_previous and st.overlap_movement == D("1952.55")
    assert st.continuity_adjustment == 0          # no suspense posting for a re-issued statement
    assert st.closing_difference == D("1952.55")  # duplicates show up as a closing difference
    assert not [e for e in books.entries if e.kind == "continuity"]
    _tb_ok(db, pid, books)


def test_excluded_duplicates_reconcile_and_drop_from_pl(db):
    pr, pid, _, _ = _loan_overlap(db, exclude=True)
    books = build_books(db, pid)
    for s in books.statements:
        assert s.status == "matched", (s.filename, s.status, s.closing_difference)
    assert books.balances().get(books.roles["bank_rec_suspense"], D("0")) == 0
    loan_lg = next(a.ledger_id for a in books.accounts.values() if a.account_number == "400")
    assert books.balances()[loan_lg] == D("0.00")  # ends at the printed closing
    # P&L report, TB and GL all skip excluded rows
    pl = build_pl_report(db, period="custom", date_from=date(2021, 3, 1), date_to=date(2022, 2, 28), user_profile_id=pid)
    tb = compute_trial_balance(books, date(2021, 3, 1), date(2022, 2, 28))
    assert pl.total_expenses == tb["expenses"] == D("2014.41")
    gl = build_general_ledger(db, pid, period="all_time", books=books)
    sec = next(s for s in gl.sections if s.key == f"lg-{pr.L['Interest']}")
    assert len(sec.transactions) == 1
    _tb_ok(db, pid, books)


# ── manual journals: loan openings, checkpoints ────────────────────────────


def test_journal_loan_opening_checkpoint_and_settlement(db):
    pr = Profile(db)
    pr.ledger("Salary", "income")
    loan = pr.ledger("Loan: CTI", "liability")
    interest = pr.ledger("Interest & Finance Charges", "expense")
    contrib = pr.ledger("Loan settlements paid from untracked accounts", "equity")
    pr.stmt("111", "111 2021.pdf", date(2021, 6, 1), date(2021, 8, 31), "0.00", "6676.04", [
        (date(2021, 6, 25), "Salary", "10000.00", "Salary"),
        (date(2021, 7, 1), "DebiCheck Ct Finance1000149354", "-1661.98", "Loan: CTI"),
        (date(2021, 8, 1), "DebiCheck Ct Finance1000149354", "-1661.98", "Loan: CTI"),
    ])
    pid = pr.finish()
    obe = build_books(db, pid).roles["opening_equity"]
    pr.journal(date(2021, 6, 9), "CTI principal", [(obe, "35000.00"), (loan, "-35000.00")], ref="cti-open")
    pr.journal(date(2021, 12, 31), "CTI checkpoint", [(interest, "1000.00"), (loan, "-1000.00")], kind="checkpoint")
    pr.journal(date(2022, 1, 31), "broken (unbalanced)", [(interest, "5.00"), (loan, "-4.00")], kind="adjustment")
    books = build_books(db, pid)
    bal = books.balances()
    assert bal[loan] == D("-32676.04")  # 35,000 + 1,000 interest − 2 × 1,661.98
    assert len(books.journal_errors) == 1  # unbalanced journal skipped, books still balance
    _tb_ok(db, pid, books)
    tb = compute_trial_balance(books, date(2021, 3, 1), date(2022, 2, 28))
    assert tb["expenses"] == D("1000.00")
    # settle from untracked funds → loan 0, liability never negative
    pr.journal(date(2022, 2, 1), "settled", [(loan, "32676.04"), (contrib, "-32676.04")], kind="settlement")
    books = build_books(db, pid)
    assert books.balances()[loan] == 0
    bs = build_balance_sheet(db, pid, fy_start_year=2021, as_at=date(2021, 12, 31), books=books)
    loans = next(s for s in bs.sections if s.key == "liab-loans")
    assert any(ln.ledger_name == "Loan: CTI" and ln.amount == D("32676.04") for ln in loans.lines)
    assert bs.totals["difference"] == 0
    gl = build_general_ledger(db, pid, period="all_time", books=books)
    sec = next(s for s in gl.sections if s.key == f"lg-{loan}")
    assert any(t.entry_kind == "journal" and "journal #" in (t.source_file or "") for t in sec.transactions)


# ── loan repayment transfers ───────────────────────────────────────────────


def test_loan_repayment_transfer_pairs_and_reduces_liability(db):
    pr = Profile(db)
    pr.ledger("Salary", "income")
    pr.ledger("Loan Repayment Transfers", "transfer")
    pr.stmt("111", "111 2021-03.pdf", date(2021, 3, 1), date(2021, 3, 31), "0.00", "5645.18", [
        (date(2021, 3, 1), "Salary", "10000.00", "Salary"),
        (date(2021, 3, 25), "Naedo Internal Coll FNB Persln150636", "-4354.82", "Loan Repayment Transfers"),
    ])
    pr.stmt("400", "400 2021-03.pdf", date(2021, 3, 1), date(2021, 3, 31), "-50000.00", "-45645.18", [
        (date(2021, 3, 25), "Debit Order", "4354.82", "Loan Repayment Transfers"),
    ], loan=True)
    pid = pr.finish()
    books = build_books(db, pid)
    assert books.pairing.pairs == 1 and books.pairing.unpaired_legs == 0
    assert books.balances().get(pr.L["Loan Repayment Transfers"], D("0")) == 0
    loan_lg = next(a.ledger_id for a in books.accounts.values() if a.account_number == "400")
    assert books.balances()[loan_lg] == D("-45645.18")  # liability reduced by the repayment
    tb = compute_trial_balance(books, date(2021, 3, 1), date(2022, 2, 28))
    assert tb["expenses"] == 0  # a repayment is not an expense
    _tb_ok(db, pid, books)


def test_pairing_prefers_same_transfer_ledger(db):
    pr = Profile(db)
    pr.ledger("Savings & Investment Transfers", "transfer")
    pr.ledger("Loan Repayment Transfers", "transfer")
    pr.ledger("Salary", "income")
    pr.stmt("888", "888.pdf", date(2021, 4, 1), date(2021, 4, 30), "100000.00", "6236.44", [
        (date(2021, 4, 20), "Trf Maxi To Pers", "-93763.56", "Savings & Investment Transfers"),
    ])
    pr.stmt("222", "222.pdf", date(2021, 4, 1), date(2021, 4, 30), "0.00", "0.00", [
        (date(2021, 4, 20), "Trf From Maxi", "93763.56", "Savings & Investment Transfers"),
        (date(2021, 4, 20), "To Ruan Loan Repay", "-93763.56", "Loan Repayment Transfers"),
    ])
    pr.stmt("400", "400.pdf", date(2021, 4, 1), date(2021, 4, 30), "-93763.56", "0.00", [
        (date(2021, 4, 20), "Transfer - Loan Credit", "93763.56", "Loan Repayment Transfers"),
    ], loan=True)
    pid = pr.finish()
    books = build_books(db, pid)
    assert books.pairing.pairs == 2 and books.pairing.unpaired_legs == 0
    for lg in ("Savings & Investment Transfers", "Loan Repayment Transfers"):
        assert books.balances().get(pr.L[lg], D("0")) == 0


# ── director's loan account (mirror pair) ──────────────────────────────────


def test_dla_mirror_pair_running_balance_and_flip(db):
    pr = Profile(db)
    pr.ledger("Sales", "income")
    dla_p = pr.ledger("Director's Loan Account – Ruan (personal side)", "asset")
    dla_c = pr.ledger("Director's Loan Account – Ruan (company side)", "liability")
    # company account: sales, then pays Ruan 30k (draw) and receives 5k from Ruan
    pr.stmt("630", "630.pdf", date(2022, 6, 1), date(2022, 8, 31), "0.00", "75000.00", [
        (date(2022, 6, 5), "Client", "100000.00", "Sales"),
        (date(2022, 7, 1), "FNB App Transfer To Ruan Salary", "-30000.00", "Director's Loan Account – Ruan (company side)"),
        (date(2022, 8, 1), "Rtc Credit Ruan Loan", "5000.00", "Director's Loan Account – Ruan (company side)"),
    ])
    # Ruan's account: the 30k arrives, 5k goes back; plus 20k from an untracked company account
    pr.stmt("627", "627.pdf", date(2022, 6, 1), date(2022, 8, 31), "0.00", "45000.00", [
        (date(2022, 6, 20), "Transfer From Dzign Casta", "20000.00", "Director's Loan Account – Ruan (personal side)"),
        (date(2022, 7, 1), "FNB App Transfer From Ruan Salary", "30000.00", "Director's Loan Account – Ruan (personal side)"),
        (date(2022, 8, 1), "Rtc Pmt To iDesign Ruan Loan", "-5000.00", "Director's Loan Account – Ruan (personal side)"),
    ])
    pid = pr.finish()
    capital = D("10000.00")
    obe = build_books(db, pid).roles["opening_equity"]
    pr.journal(date(2022, 3, 18), "DLA opening capital", [(dla_p, capital), (obe, -capital)], ref="dla-open")
    books = build_books(db, pid)
    _tb_ok(db, pid, books)
    jul = books.balances(None, date(2022, 6, 30))
    assert jul[dla_p] == D("-10000.00")  # 10k capital − 20k draw → flipped: Ruan owes 10k
    bal = books.balances()
    assert bal[dla_p] == D("-35000.00")  # 10k − 20k − 30k + 5k
    assert bal[dla_c] == D("25000.00")   # company side: 30k paid out − 5k received (debit)
    # tracked-both-sides movements eliminate: personal + company = capital − one-sided 20k draw
    assert bal[dla_p] + bal[dla_c] == capital - D("20000.00")
    bs = build_balance_sheet(db, pid, fy_start_year=2022, books=books)
    keys = {s.key: s for s in bs.sections}
    assert any(ln.ledger_id == dla_p and ln.amount == D("35000.00") and ln.note == "credit balance"
               for ln in keys["liab-other"].lines)
    assert any(ln.ledger_id == dla_c and ln.amount == D("25000.00") for ln in keys["assets-other"].lines)
    assert bs.totals["difference"] == 0
    tb = compute_trial_balance(books, date(2022, 3, 1), date(2023, 2, 28))
    assert tb["income"] == D("100000.00") and tb["expenses"] == 0  # DLA movements are not P&L


# ── rules: account scope ───────────────────────────────────────────────────


def test_rule_bank_account_scope():
    r = M.Rule(name="CI Mike RF", match_type="combination", is_active=True, ledger_id=1,
               match_json={"regex": r"^(?!.*pft).*mike\s*-.*rf", "bank_account_ids": [5], "amount_max": 0})
    hit = M.Transaction(description="Payshap Account Off-Us Mike - Naomi - Rf", amount=D("-2621.00"), bank_account_id=5)
    other_acct = M.Transaction(description="Payshap Account Off-Us Mike - Naomi - Rf", amount=D("-2621.00"), bank_account_id=2)
    pft = M.Transaction(description="Payshap Account Off-Us Mike - Naomi - Pft", amount=D("-1626.73"), bank_account_id=5)
    assert transaction_matches_rule(hit, r)
    assert not transaction_matches_rule(other_acct, r)
    assert not transaction_matches_rule(pft, r)
    plain = M.Rule(name="no scope", match_type="contains", match_value="mike", is_active=True, ledger_id=1, match_json=None)
    assert transaction_matches_rule(other_acct, plain)
