"""Double-entry bookkeeping: trial balance, bank ledgers, transfer pairing.

Two layers:

* **Synthetic** (always runs): an in-memory profile with two bank accounts, a
  loan, an own-account transfer, a missing statement and an overdraft.
* **Bot data** (skips when absent): runs the engine against a *copy* of the
  migrated bot DB (``LEDGERFLOW_BOT_DB`` or
  /workspace/ledgerflow-bot-data/ledgerflow.db) and checks every FY TB
  balances, every statement's bank-ledger closing equals the printed closing,
  and P&L income/expense totals equal the categorised transaction totals.
* **Corpus** (skips when absent): statement header metadata (account number,
  printed balances) agrees with the reconcile harness for every PDF.
"""

from __future__ import annotations

import os
import shutil
import sqlite3
import sys
import tempfile
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.database import Base  # noqa: E402
from app import models as M  # noqa: E402
from app.services.bank_accounts import (  # noqa: E402
    apply_meta_to_batch,
    ensure_system_ledgers,
    refresh_openings,
)
from app.services.double_entry import build_books  # noqa: E402
from app.services.double_entry_reports import (  # noqa: E402
    build_balance_sheet,
    build_bank_reconciliation,
    build_general_ledger,
    build_trial_balance,
    compute_trial_balance,
)
from app.services.reports import build_pl_report, fy_bounds  # noqa: E402
from app.services.statement_meta import StatementMeta  # noqa: E402

D = Decimal


# ── synthetic fixture ─────────────────────────────────────────────────────


@pytest.fixture()
def db():
    eng = create_engine("sqlite://")
    Base.metadata.create_all(eng)
    s = sessionmaker(bind=eng)()
    yield s
    s.close()


def _seed(db):
    p = M.UserProfile(name="T", fy_start_month=3, currency="ZAR")
    db.add(p)
    db.flush()
    bp = M.BankProfile(user_profile_id=p.id, name="FNB", bank_type="FNB", calibration_data={})
    db.add(bp)
    db.flush()
    L = {}
    for name, typ in [
        ("Salary", "income"),
        ("Groceries", "expense"),
        ("Interest", "expense"),
        ("Transfers", "transfer"),
        ("Drawings", "other"),
    ]:
        lg = M.Ledger(user_profile_id=p.id, name=name, type=typ)
        db.add(lg)
        db.flush()
        L[name] = lg.id

    def stmt(acc, fname, start, end, opening, closing, rows, loan=False):
        b = M.ImportBatch(
            user_profile_id=p.id, bank_profile_id=bp.id, filename=fname, status="completed",
            transaction_count=len(rows),
        )
        db.add(b)
        db.flush()
        for d, desc, amt, lg in rows:
            db.add(
                M.Transaction(
                    user_profile_id=p.id, bank_profile_id=bp.id, date=d, description=desc,
                    amount=D(amt), ledger_id=L[lg], is_categorised=True, source_file=fname,
                    import_batch_id=b.id,
                )
            )
        db.flush()
        meta = StatementMeta(
            bank="FNB", account_number=acc, product="Personal Loan" if loan else "Cheque",
            opening=D(opening), closing=D(closing), period_start=start, period_end=end, is_loan=loan,
        )
        apply_meta_to_batch(db, b, meta, meta_source="pdf_header", bank_profile=bp)

    # Cheque A: Feb..Apr 2025 (crosses FY boundary 1 Mar), ends overdrawn
    stmt("111", "111 2025-02.pdf", date(2025, 2, 1), date(2025, 2, 28), "1000.00", "11000.00", [
        (date(2025, 2, 5), "Salary", "15000.00", "Salary"),
        (date(2025, 2, 10), "Shop", "-1000.00", "Groceries"),
        (date(2025, 2, 27), "Trf to savings", "-4000.00", "Transfers"),
    ])
    stmt("111", "111 2025-03.pdf", date(2025, 3, 1), date(2025, 3, 31), "11000.00", "-500.00", [
        (date(2025, 3, 3), "Shop", "-11000.00", "Groceries"),
        (date(2025, 3, 20), "Cash", "-500.00", "Drawings"),
    ])
    # Missing April statement → May opens at -300 (gap of +200)
    stmt("111", "111 2025-05.pdf", date(2025, 5, 1), date(2025, 5, 31), "-300.00", "700.00", [
        (date(2025, 5, 2), "Trf from savings", "1000.00", "Transfers"),
    ])
    # Savings B: receives the Feb transfer 2 days later (crosses FY boundary)
    stmt("222", "222 2025-03.pdf", date(2025, 2, 15), date(2025, 3, 15), "0.00", "4000.00", [
        (date(2025, 3, 1), "Trf from cheque", "4000.00", "Transfers"),
    ])
    stmt("222", "222 2025-05.pdf", date(2025, 4, 15), date(2025, 5, 15), "4000.00", "3000.00", [
        (date(2025, 5, 1), "Trf to cheque", "-1000.00", "Transfers"),
    ])
    # Loan (liability)
    stmt("333", "333 2025-03.pdf", date(2025, 2, 1), date(2025, 3, 31), "-5000.00", "-4600.00", [
        (date(2025, 2, 25), "Interest", "-100.00", "Interest"),
        (date(2025, 2, 26), "Repayment", "500.00", "Transfers"),  # mirror not tracked → unpaired
    ], loan=True)
    refresh_openings(db, p.id)
    ensure_system_ledgers(db, p.id)
    db.commit()
    return p, L


def test_synthetic_books_balance_and_reconcile(db):
    p, L = _seed(db)
    books = build_books(db, p.id)
    # Every journal entry balances
    for e in books.entries:
        assert sum(a for _, a in e.postings) == 0
    # TB balances in each FY and all-time; FY spans the transfer-in-transit boundary
    for fy in (2024, 2025):
        rep = build_trial_balance(db, p.id, fy_start_year=fy, books=books)
        assert rep.totals["difference"] == D("0.00"), (fy, rep.totals)
        assert rep.totals["total_debit"] == rep.totals["total_credit"]
    assert build_trial_balance(db, p.id, period="all_time", books=books).totals["difference"] == 0

    # Pairing: cheque→savings (Feb 27 / Mar 1) and savings→cheque (May 1 / May 2)
    assert books.pairing.pairs == 2
    assert books.pairing.unpaired_legs == 1  # loan repayment leg
    pairs = {(books.accounts[x.out_account_id].account_number, books.accounts[x.in_account_id].account_number) for x in books.pairs}
    assert pairs == {("111", "222"), ("222", "111")}

    # Bank ledgers equal printed closing balances; the April gap is flagged + adjusted
    rec = {(books.accounts[s.account_id].account_number, s.filename): s for s in books.statements}
    for s in books.statements:
        assert s.closing_difference == D("0.00"), s
    gap = rec[("111", "111 2025-05.pdf")]
    assert gap.status == "matched_after_gap_adjustment"
    assert gap.continuity_adjustment == D("200.00")
    br = build_bank_reconciliation(db, p.id, period="all_time", books=books)
    assert br.totals["differences"] == 0 and br.totals["statements"] == 6

    # Loan is a liability ledger; opening equity = 1000 + 0 - 5000
    loan = next(a for a in books.accounts.values() if a.account_number == "333")
    assert loan.kind == "liability"
    oe = books.roles["opening_equity"]
    assert books.balances()[oe] == D("4000.00")  # debit: net liabilities at start

    # Balance sheet at FY 2025/26 end: A = L + E, overdraft shown as liability
    bs = build_balance_sheet(db, p.id, fy_start_year=2025, books=books)
    assert bs.totals["difference"] == D("0.00")
    bank_bal = {books.accounts[a].account_number: books.balances()[books.accounts[a].ledger_id] for a in books.accounts}
    assert bank_bal == {"111": D("700.00"), "222": D("3000.00"), "333": D("-4600.00")}
    bs_mar = build_balance_sheet(db, p.id, fy_start_year=2025, as_at=date(2025, 3, 31), books=books)
    titles = {s.title for s in bs_mar.sections}
    assert "Liabilities · Bank overdrafts" in titles
    assert bs_mar.totals["difference"] == 0

    # P&L totals from the TB equal the classic P&L report (unchanged)
    for fy in (2024, 2025):
        d_from, d_to = fy_bounds(date(fy, 3, 1), 3)
        tb = compute_trial_balance(books, d_from, d_to)
        pl = build_pl_report(db, period="custom", date_from=d_from, date_to=d_to, user_profile_id=p.id)
        assert tb["income"] == pl.total_income
        assert tb["expenses"] == pl.total_expenses

    # GL includes bank ledgers with running balance ending at the printed closing
    gl = build_general_ledger(db, p.id, period="all_time", books=books)
    a111 = next(a for a in books.accounts.values() if a.account_number == "111")
    sec = next(s for s in gl.sections if s.key == f"lg-{a111.ledger_id}")
    assert sec.transactions[-1].running_balance == D("700.00")
    assert gl.totals["difference"] == 0


def test_recategorising_flows_through(db):
    p, L = _seed(db)
    tx = db.query(M.Transaction).filter(M.Transaction.description == "Cash").one()
    tx.ledger_id = L["Groceries"]
    db.commit()
    books = build_books(db, p.id)
    assert build_trial_balance(db, p.id, fy_start_year=2025, books=books).totals["difference"] == 0
    assert books.balances().get(L["Drawings"], D("0")) == 0


def test_uncategorised_goes_to_suspense(db):
    p, L = _seed(db)
    tx = db.query(M.Transaction).filter(M.Transaction.description == "Shop").first()
    tx.is_categorised = False
    tx.ledger_id = None
    db.commit()
    books = build_books(db, p.id)
    unc = books.roles["uncategorised"]
    assert books.balances()[unc] == D("1000.00")
    assert build_trial_balance(db, p.id, period="all_time", books=books).totals["difference"] == 0


# ── bot data (migrated copy) ────────────────────────────────────────────────

BOT_DB = Path(os.environ.get("LEDGERFLOW_BOT_DB") or "/workspace/ledgerflow-bot-data/ledgerflow.db")
BOT_PROFILE = int(os.environ.get("LEDGERFLOW_BOT_PROFILE", "2"))


def _bot_db_ready() -> bool:
    if not BOT_DB.is_file():
        return False
    try:
        c = sqlite3.connect(f"file:{BOT_DB}?mode=ro", uri=True)
        n = c.execute(
            "select count(*) from transactions where user_profile_id=? and bank_account_id is null", (BOT_PROFILE,)
        ).fetchone()[0]
        t = c.execute("select count(*) from transactions where user_profile_id=?", (BOT_PROFILE,)).fetchone()[0]
        c.close()
        return t > 0 and n == 0
    except sqlite3.Error:
        return False


@pytest.fixture(scope="module")
def bot_session():
    if not _bot_db_ready():
        pytest.skip(f"migrated bot DB not present at {BOT_DB}")
    tmp = Path(tempfile.mkdtemp(prefix="lf-bot-copy-"))
    dst = tmp / "ledgerflow.db"
    src = sqlite3.connect(f"file:{BOT_DB}?mode=ro", uri=True)
    out = sqlite3.connect(dst)
    src.backup(out)
    out.close()
    src.close()
    eng = create_engine(f"sqlite:///{dst}")
    s = sessionmaker(bind=eng)()
    yield s
    s.close()
    shutil.rmtree(tmp, ignore_errors=True)


@pytest.fixture(scope="module")
def bot_books(bot_session):
    return build_books(bot_session, BOT_PROFILE)


def test_bot_tb_balances_every_fy(bot_session, bot_books):
    first, last = bot_books.first_date(), bot_books.last_date()
    for fy in range(first.year - 1, last.year + 1):
        d_from, d_to = fy_bounds(date(fy, 3, 1), 3)
        if d_to < first or d_from > last:
            continue
        tb = compute_trial_balance(bot_books, d_from, d_to)
        assert tb["difference"] == 0, (fy, tb["total_debit"], tb["total_credit"])
        assert tb["total_debit"] == tb["total_credit"]
    assert sum(bot_books.balances().values()) == 0


def test_bot_bank_ledgers_match_printed_closing(bot_books):
    with_bal = [s for s in bot_books.statements if s.printed_closing is not None]
    assert with_bal, "no statements with printed balances"
    bad = [s for s in with_bal if s.closing_difference != 0]
    assert not bad, [(s.filename, s.ledger_closing, s.printed_closing) for s in bad]
    # Final ledger balance per account == last printed closing
    bal = bot_books.balances()
    for acct in bot_books.accounts.values():
        stmts = [s for s in bot_books.statements if s.account_id == acct.id and s.printed_closing is not None]
        if stmts:
            assert bal.get(acct.ledger_id, Decimal("0")) == stmts[-1].printed_closing, acct.name


def test_bot_transfer_pairs_are_valid(bot_session, bot_books):
    txs = {
        t.id: t
        for t in bot_session.query(M.Transaction).filter(M.Transaction.user_profile_id == BOT_PROFILE).all()
    }
    lt = {lg.id: lg.type for lg in bot_session.query(M.Ledger).all()}
    assert bot_books.pairing.pairs > 0
    seen = set()
    for p in bot_books.pairs:
        o, i = txs[p.out_tx], txs[p.in_tx]
        assert o.amount < 0 < i.amount and -o.amount == i.amount
        assert o.bank_account_id != i.bank_account_id
        assert abs((i.date - o.date).days) <= 4
        assert lt[o.ledger_id] == "transfer" and lt[i.ledger_id] == "transfer"
        assert p.out_tx not in seen and p.in_tx not in seen
        seen |= {p.out_tx, p.in_tx}
    # Paired legs leave the transfer ledgers; in-transit nets to zero all-time
    assert bot_books.balances().get(bot_books.roles["transfer_in_transit"], Decimal("0")) == 0


def test_bot_pl_totals_unchanged(bot_session, bot_books):
    first, last = bot_books.first_date(), bot_books.last_date()
    for fy in range(first.year - 1, last.year + 1):
        d_from, d_to = fy_bounds(date(fy, 3, 1), 3)
        rows = (
            bot_session.query(M.Ledger.type, func.sum(M.Transaction.amount))
            .join(M.Ledger, M.Ledger.id == M.Transaction.ledger_id)
            .filter(
                M.Transaction.user_profile_id == BOT_PROFILE,
                M.Transaction.is_categorised.is_(True),
                M.Transaction.is_excluded.is_(False),
                M.Transaction.date >= d_from,
                M.Transaction.date <= d_to,
            )
            .group_by(M.Ledger.type)
            .all()
        )
        by = {t: Decimal(str(v)).quantize(Decimal("0.01")) for t, v in rows}
        tb = compute_trial_balance(bot_books, d_from, d_to)
        assert tb["income"] == by.get("income", Decimal("0.00")), fy
        assert tb["expenses"] == -by.get("expense", Decimal("0.00")), fy


# ── corpus: header metadata agrees with the reconcile harness ───────────────

try:
    import reconcile_corpus as rc  # noqa: E402

    CORPUS = Path(os.environ.get("LEDGERFLOW_BOT_CORPUS") or rc.DEFAULT_CORPUS)
    PDFS = list(rc.iter_pdfs(CORPUS)) if CORPUS.is_dir() else []
except Exception:  # pragma: no cover
    PDFS = []


@pytest.mark.skipif(not PDFS, reason="bot corpus not present")
def test_corpus_statement_meta_matches_harness():
    from concurrent.futures import ProcessPoolExecutor

    from app.services.statement_meta import account_number_from_filename

    with ProcessPoolExecutor() as ex:
        metas = list(ex.map(_meta_and_harness, PDFS))
    problems = []
    for path, meta, h_open, h_close in metas:
        fn = account_number_from_filename(Path(path).name)
        if not meta.account_number:
            problems.append(f"{path}: no account number")
        if fn and meta.account_number != fn:
            problems.append(f"{path}: header {meta.account_number} != filename {fn}")
        if meta.opening != h_open or meta.closing != h_close:
            problems.append(f"{path}: meta {meta.opening}/{meta.closing} != harness {h_open}/{h_close}")
    assert not problems, "\n".join(problems)


def _meta_and_harness(path):
    from app.services.statement_meta import meta_from_text, pdf_text

    text = pdf_text(Path(path).read_bytes())
    bank = Path(path).relative_to(CORPUS).parts[0]
    h = rc.ISLANDS[bank][1](text)
    return str(path), meta_from_text(text, bank), h.opening, h.closing
