"""One-off (idempotent) migration for the LedgerFlow *bot* instance, profile 2:
duplicate loan rows, loan liabilities, loan repayment transfers, director's loan.

Each step logs the transaction ids it changes. Run with --dry-run first.
Usage:  LEDGERFLOW_DATA=/workspace/ledgerflow-bot-data python scripts/bot_loans_dla_migration.py [--dry-run] [step ...]
"""
from __future__ import annotations

import os
import sys

DATA = os.environ.get("LEDGERFLOW_DATA", "")
if not DATA or "Documents/LedgerFlow" in DATA or "Documents\\LedgerFlow" in DATA:
    sys.exit("Refusing: set LEDGERFLOW_DATA to the bot data dir (never the live Documents/LedgerFlow)")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import re  # noqa: E402
from datetime import date  # noqa: E402
from decimal import Decimal  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models import BankAccount, JournalEntry, JournalLine, Ledger, Rule, Transaction  # noqa: E402
from app.services.double_entry import build_books  # noqa: E402

PROFILE = 2
DLA_PERSONAL = "Director's Loan Account – Ruan ↔ iDesign/Dzign (personal side)"
DLA_COMPANY = "Director's Loan Account – Ruan (iDesign company side)"

# ── helpers ────────────────────────────────────────────────────────────────

def acct(db, number: str) -> int:
    return db.query(BankAccount).filter_by(user_profile_id=PROFILE, account_number=number).one().id


def ledger(db, name: str, typ: str | None = None, *, create: bool = True) -> Ledger:
    row = db.query(Ledger).filter_by(user_profile_id=PROFILE, name=name).first()
    if row is None:
        if not create or typ is None:
            raise SystemExit(f"ledger missing: {name}")
        row = Ledger(user_profile_id=PROFILE, name=name, type=typ, sort_order=0)
        db.add(row)
        db.flush()
        print("created ledger", row.id, typ, name)
    return row


def ledger_by_id(db, lid: int) -> Ledger:
    row = db.get(Ledger, lid)
    assert row is not None and row.user_profile_id == PROFILE
    return row


def upsert_rule(db, name: str, priority: int, lg: Ledger, regex: str, *, accounts=None, sign=None) -> Rule:
    re.compile(regex, re.IGNORECASE)
    mj: dict = {"regex": regex}
    if accounts:
        mj["bank_account_ids"] = list(accounts)
    if sign == "out":
        mj["amount_max"] = 0
    elif sign == "in":
        mj["amount_min"] = 0
    r = db.query(Rule).filter_by(user_profile_id=PROFILE, name=name).first()
    if r is None:
        r = Rule(user_profile_id=PROFILE, name=name, match_type="combination", is_active=True)
        db.add(r)
        print("created rule", name)
    r.match_json, r.priority, r.ledger_id, r.match_value = mj, priority, lg.id, None
    db.flush()
    return r


def move(db, tx_ids, lg: Ledger, why: str, log: list, rule: Rule | None = None) -> None:
    for tid in sorted(set(tx_ids)):
        t = db.get(Transaction, tid)
        assert t is not None and t.user_profile_id == PROFILE, tid
        if t.ledger_id == lg.id:
            continue
        log.append((tid, str(t.date), str(t.amount), t.description, t.ledger_id, lg.id, why))
        print(f"  move {tid} {t.date} {t.amount:>12} {t.description[:50]!r} {t.ledger_id} -> {lg.id} ({why})")
        t.ledger_id, t.is_categorised = lg.id, True
        t.rule_id = rule.id if rule is not None else None


def upsert_journal(db, reference: str, d: date, description: str, kind: str, source: str,
                   lines: list[tuple[Ledger, Decimal, str]], placeholder: bool = False) -> JournalEntry:
    total = sum((Decimal(str(a)) for _, a, _ in lines), Decimal("0"))
    assert total == 0, (reference, total)
    je = db.query(JournalEntry).filter_by(user_profile_id=PROFILE, reference=reference).first()
    if je is None:
        je = JournalEntry(user_profile_id=PROFILE, reference=reference)
        db.add(je)
    je.date, je.description, je.kind, je.source, je.is_placeholder = d, description, kind, source, placeholder
    je.lines = [JournalLine(ledger_id=lg.id, amount=Decimal(str(a)).quantize(Decimal("0.01")), memo=m) for lg, a, m in lines]
    db.flush()
    print(f"  journal {reference} {d} {description[:70]!r} " + ", ".join(f"{lg.id}:{a}" for lg, a, _ in lines))
    return je


def drop_journal(db, reference: str) -> None:
    je = db.query(JournalEntry).filter_by(user_profile_id=PROFILE, reference=reference).first()
    if je is not None:
        db.delete(je)
        db.flush()


def ledger_balance(db, lg: Ledger, as_at: date) -> Decimal:
    db.flush()
    books = build_books(db, PROFILE)
    return books.balances(None, as_at).get(lg.id, Decimal("0.00"))


# FNB personal loan 4000094909728: statement '... 2021-06-08.pdf' re-issues the
# 25 Mar 2021 rows already on '... 2021-05-03.pdf' (both periods start 14 Mar 2021).
DUPLICATES = {8074: 8070, 8075: 8071, 8076: 8072, 8077: 8073}


def step_exclude_duplicates(db) -> None:
    for dup_id, orig_id in DUPLICATES.items():
        dup, orig = db.get(Transaction, dup_id), db.get(Transaction, orig_id)
        assert dup and orig and dup.user_profile_id == orig.user_profile_id == PROFILE
        same = (
            dup.date == orig.date
            and (dup.description or "").strip() == (orig.description or "").strip()
            and dup.amount == orig.amount
            and dup.balance == orig.balance
            and dup.bank_account_id == orig.bank_account_id
            and dup.import_batch_id != orig.import_batch_id
        )
        if not same:
            raise SystemExit(f"tx {dup_id} is not an exact duplicate of {orig_id}; refusing to exclude")
        if not dup.is_excluded:
            dup.is_excluded = True
            dup.training_reason = "duplicate_reissued_statement"
            dup.training_detail = f"Duplicate of tx {orig_id} (same date, description, amount, running balance) – overlapping re-issued statement"
            print("excluded", dup_id, dup.date, dup.amount, dup.description, "dup of", orig_id)


LOG: list = []
OBE = 70
INTEREST = 61
OTHER_OPEX = 46
COMPANY_FUNDING = 51
PERSONAL_DRAWINGS = 50
TRANSFERS_IN = 32
LRT_NAME = "Loan Repayment Transfers"


def step_loan_repayment_transfers(db) -> None:
    """Item 5: loan debit orders / settlement on the tracked FNB loan account and the
    matching paying-account (Private Wealth) legs → 'Loan Repayment Transfers' (transfer
    type), so they pair via Transfers in Transit and reduce the loan liability."""
    loan_acct, pw = acct(db, "4000094909728"), acct(db, "62753959843")
    lrt = ledger(db, LRT_NAME, "transfer")
    r_loan = upsert_rule(db, "Loan account: debit orders / adjustments / settlement → Loan Repayment Transfers", 920, lrt,
                         r"^(Debit\s*Order|Debit\s*Adjustment|Transfer\s*-?\s*Loan\s*Credit)", accounts=[loan_acct])
    r_pw = upsert_rule(db, "PW: FNB personal loan 4000094909728 collections / refunds → Loan Repayment Transfers", 874, lrt,
                       r"Naedo\s*Internal\s*Coll\s*FNB\s*Persln|Transfer\s*Sma\s*4000094909728", accounts=[pw])
    loan_rows = [t.id for t in db.query(Transaction).filter_by(user_profile_id=PROFILE, bank_account_id=loan_acct)
                 if not t.is_excluded and re.search(r"^(Debit\s*Order|Debit\s*Adjustment|Transfer\s*-?\s*Loan\s*Credit)", t.description or "", re.I)]
    move(db, loan_rows, lrt, "loan-account repayment leg", LOG, r_loan)
    pw_rows = [t.id for t in db.query(Transaction).filter_by(user_profile_id=PROFILE, bank_account_id=pw)
               if re.search(r"Naedo\s*Internal\s*Coll\s*FNB\s*Persln|Transfer\s*Sma\s*4000094909728", t.description or "", re.I)]
    move(db, pw_rows, lrt, "paying-account leg (FNB Persln / Sma 4000094909728)", LOG, r_pw)
    move(db, [8718], lrt, "PW settlement payment R93,763.56 to loan 4000094909728 (FNB settlement quote 2021-04-20)", LOG)


def step_loans(db) -> None:
    """Item 6: liability ledgers per loan, evidence-based openings / checkpoints, repayments
    recategorised from 'Loan Repayments (capital portion)' / transfers to the loan ledger."""
    pw, disc = acct(db, "62753959843"), acct(db, "18882058643")
    obe, interest, opex = ledger_by_id(db, OBE), ledger_by_id(db, INTEREST), ledger_by_id(db, OTHER_OPEX)
    settled_untracked = ledger(db, "Loan settlements paid from untracked accounts (owner contribution)", "equity")

    # CTI (CT Finance) 1000149354 ───────────────────────────────────────────
    cti = ledger(db, "Loan: CTI (CT Finance) 1000149354", "liability")
    rx_cti = r"^(?!#).*(DebiCheck\s*Ct\s*Finance|CTI\s*Loan)"
    r = upsert_rule(db, "CTI / CT Finance 1000149354 instalments → Loan: CTI", 878, cti, rx_cti, accounts=[pw, disc], sign="out")
    ids = [t.id for t in db.query(Transaction).filter(Transaction.user_profile_id == PROFILE,
                                                      Transaction.bank_account_id.in_([pw, disc]), Transaction.amount < 0)
           if re.search(rx_cti, t.description or "", re.I)]
    move(db, ids, cti, "CTI instalment", LOG, r)
    upsert_journal(db, "loan-cti-opening", date(2021, 6, 9),
                   "Loan: CTI 1000149354 – principal advanced R35,000.00 (opening at origination)", "opening",
                   "CTI Section 129 notice dated 2023-04-20 ('Full amount of Loan R 35,000.00', 28.75%) – "
                   "evidence/cti-demand-2023-04-20.pdf (Gmail rl.farquhar@gmail.com). Origination date approximate "
                   "(not on the letters): first DebiCheck instalment R1,661.98 on 2021-07-01 (PW tx 9654). "
                   "Disbursement did not land in a tracked account → contra Opening Balance Equity.",
                   [(obe, Decimal("35000.00"), "funds not received in a tracked account"), (cti, Decimal("-35000.00"), "principal")])
    # computed journals: drop first so a re-run recomputes from the bank-side postings only
    drop_journal(db, "loan-cti-checkpoint-2023-04-20")
    drop_journal(db, "loan-cti-settlement-2024-04-30")
    bal = ledger_balance(db, cti, date(2023, 4, 20))  # credit-negative
    true_up = Decimal("-27132.88") - bal
    upsert_journal(db, "loan-cti-checkpoint-2023-04-20", date(2023, 4, 20),
                   "Loan: CTI 1000149354 – interest & fees to outstanding balance R27,132.88 per Section 129 notice", "checkpoint",
                   "CTI Section 129 notice 2023-04-20: full outstanding balance R 27,132.88 (arrears R9,971.88). "
                   "True-up = notice balance − carried ledger balance; booked as interest & finance charges "
                   "(accrued 2021-06 → 2023-04; not split by FY).",
                   [(interest, -true_up, "interest/fees accrued"), (cti, true_up, "to notice balance")])
    bal = ledger_balance(db, cti, date(2024, 4, 30))
    upsert_journal(db, "loan-cti-settlement-2024-04-30", date(2024, 4, 30),
                   "Loan: CTI 1000149354 – settled 30/04/2024 (paid-up letter); paid from an untracked account", "settlement",
                   "CTI paid-up letter dated 7 May 2024: 'Your account balance was settled on 30/04/2024' – "
                   "evidence/cti-paid-up-2024-05-10.pdf. No settlement payment in tracked accounts; amount = carried "
                   "balance (any interest after 2023-04-20 unknown).",
                   [(cti, -bal, "settled"), (settled_untracked, bal, "paid outside tracked accounts")])

    # FNB Covid loan 4000501480598 ──────────────────────────────────────────
    covid = ledger(db, "Loan: FNB Covid Loan 4000501480598", "liability")
    rx_cov = r"Covid\s*Loan|Transfer\s*Sma\s*4000501480598"
    r = upsert_rule(db, "FNB Covid loan 4000501480598 collections / refunds → Loan: FNB Covid", 877, covid, rx_cov, accounts=[pw])
    ids = [t.id for t in db.query(Transaction).filter_by(user_profile_id=PROFILE, bank_account_id=pw)
           if re.search(rx_cov, t.description or "", re.I)]
    move(db, ids, covid, "Covid loan instalment / refund", LOG, r)
    move(db, [8829], interest, "interest rebate R59.21 refunded after early settlement (Sma 4000501480598)", LOG)
    move(db, [8773], covid, "PW settlement R28,258.02 (FNB settlement quote 4000501480598, 2021-04-20)", LOG)
    upsert_journal(db, "loan-fnb-4000501480598-opening", date(2021, 3, 1),
                   "Loan: FNB Covid Loan 4000501480598 – balance b/f 2021-03-01 (derived from settlement quote)", "opening",
                   "FNB settlement quotation 4000501480598 dated 2021-04-20: R 28,258.02 (valid to 2021-05-03) – "
                   "evidence/fnb-settle-4000501480598-2021-04-20.pdf; plus instalment R617.33 collected 2021-03-26 "
                   "(PW tx 8287). Principal / origination date unknown.",
                   [(obe, Decimal("28875.35"), "balance b/f"), (covid, Decimal("-28875.35"), "28,258.02 + 617.33")])

    # WesBank 85293515521 ───────────────────────────────────────────────────
    wes = ledger(db, "Loan: WesBank 85293515521", "liability")
    rx_wes = r"85293515521"
    r = upsert_rule(db, "WesBank 85293515521 payments → Loan: WesBank", 876, wes, rx_wes, accounts=[pw], sign="out")
    ids = [t.id for t in db.query(Transaction).filter_by(user_profile_id=PROFILE, bank_account_id=pw)
           if t.amount < 0 and re.search(rx_wes, t.description or "")]
    move(db, ids, wes, "WesBank settlement", LOG, r)
    upsert_journal(db, "loan-wesbank-85293515521-opening", date(2021, 3, 1),
                   "Loan: WesBank 85293515521 – balance b/f 2021-03-01 (= settlement paid 2021-04-23)", "opening",
                   "PW tx 8802 2021-04-23 'Internet Pmt To Ruan Loan Repay 85293515521' R219,932.44 (settlement). "
                   "No WesBank statement/letter found: balance inferred from the settlement; no instalments seen in "
                   "tracked accounts before it. Principal / origination unknown.",
                   [(obe, Decimal("219932.44"), "balance b/f"), (wes, Decimal("-219932.44"), "inferred from settlement")])

    # FNB personal loan 4000519973855 ───────────────────────────────────────
    fnb2 = ledger(db, "Loan: FNB Personal Loan 4000519973855", "liability")
    rx_f2 = r"^(?!#).*(FNB\s*Persln.*4000519973855|FNB\s*Ploan\s*2215400469)"
    r = upsert_rule(db, "FNB personal loan 4000519973855 instalments → Loan: FNB 4000519973855", 879, fnb2, rx_f2, accounts=[pw], sign="out")
    debits = [t for t in db.query(Transaction).filter_by(user_profile_id=PROFILE, bank_account_id=pw)
              if t.amount < 0 and re.search(rx_f2, t.description or "", re.I)]
    move(db, [t.id for t in debits], fnb2, "FNB 4000519973855 instalment", LOG, r)
    # each returned ('Magtape Unpaid') debit order on the same day for the same amount
    used: set[int] = set()
    unpaid = [t for t in db.query(Transaction).filter_by(user_profile_id=PROFILE, bank_account_id=pw)
              if t.amount > 0 and re.search(r"Magtape\s*Unpaid", t.description or "", re.I)]
    for d in debits:
        for u in unpaid:
            if u.id not in used and u.date == d.date and u.amount == -d.amount:
                used.add(u.id)
                move(db, [u.id], fnb2, f"returned unpaid (reverses tx {d.id})", LOG)
                break
    fnb_manual = [t.id for t in db.query(Transaction).filter_by(user_profile_id=PROFILE, bank_account_id=disc, ledger_id=48)
                  if t.amount < 0 and re.search(r"FNB\s*Loan", t.description or "", re.I)]
    move(db, fnb_manual, fnb2, "manual 'FNB Loan' payment 2023-24 while debit orders bounced – inferred to be 4000519973855", LOG)
    move(db, [12374], fnb2, "disbursement R100,000 'Trf From Loan Acc' 2022-06-07 (CPP plan start 2022-06-08) – inferred link", LOG)
    # BMW Finance debit order returned unpaid 2021-04-01: reversal belongs with the debit (same ledger)
    bmw = db.get(Transaction, 8387)
    move(db, [8363], ledger_by_id(db, bmw.ledger_id), "returned unpaid – reverses BMW Finance debit tx 8387", LOG)

    # Standard Bank revolving loan 013339494 ────────────────────────────────
    sb = ledger(db, "Loan: Standard Bank 013339494", "liability")
    dla_p = ledger(db, DLA_PERSONAL, "asset")
    upsert_journal(db, "loan-stdbank-013339494-opening", date(2021, 3, 1),
                   "Loan: Standard Bank 013339494 – opening PLACEHOLDER 0.00 (principal / approval date unknown)", "placeholder",
                   "No origination evidence found (Gmail searched read-only). Question for Ruan.",
                   [], placeholder=True)
    upsert_journal(db, "loan-stdbank-013339494-balance-2024-05-02", date(2024, 5, 2),
                   "Loan: Standard Bank 013339494 – balance R70,868.00 established by settlement quote", "checkpoint",
                   "Standard Bank email 2024-05-02 (thread 18f3a3d13f90261a, ruan@dzign.africa): 'the settlement amount "
                   "will be R 70 868'. Origination unknown → contra Opening Balance Equity.",
                   [(obe, Decimal("70868.00"), "balance not previously recorded"), (sb, Decimal("-70868.00"), "settlement balance")])
    upsert_journal(db, "loan-stdbank-013339494-settled-by-idesign", date(2024, 5, 2),
                   "Loan: Standard Bank 013339494 – settled R70,868.00 by iDesign (director's loan draw)", "settlement",
                   "FNB notification 2024-05-02 12:41 'R70868.00 paid from Current a/c..161095 (iDesign 63005161095) "
                   "Ref. Standard Bank Loan' (FNB notification email, Gmail ruan@dzign.africa). iDesign statements for May 2024 are not "
                   "imported, so only Ruan's side is posted: loan cleared, DLA (personal side) credited.",
                   [(sb, Decimal("70868.00"), "settled"), (dla_p, Decimal("-70868.00"), "paid by iDesign for Ruan")])


PERSONAL_ACCTS = ("18882058643", "62753959843", "62895763409", "62339775358", "62895347237", "62753959851")
IDESIGN_ACCT = "63005161095"
RX_IDESIGN_OUT = r"To\s*Ruan\b|To\s*Steen\s*Comm\s*Ruan"
RX_IDESIGN_IN = r"Credit\s*Ruan|From\s*Ruan\s*(Loan|Personal|FNB|P\s*Loan)"


def step_dla(db) -> None:
    """Items 3 + 4: director's loan account as an intercompany mirror pair.

    * personal side (asset): every receipt from the company (ex 'Company Funding Received')
      credits it, money Ruan puts into the company debits it. Opened with the capital
      investment (PLACEHOLDER 0.00 – only R10 share capital evidenced). Debit balance =
      capital/loan still owed to Ruan; credit balance = Ruan owes the company.
    * company side (liability): the tracked iDesign account's payments to/for Ruan debit
      it, receipts from Ruan credit it (credit balance = company owes Ruan).
    Where both legs are tracked the two sides eliminate on consolidation.
    """
    from app.services.double_entry import build_books as _bb

    personal = [acct(db, n) for n in PERSONAL_ACCTS]
    idesign = acct(db, IDESIGN_ACCT)
    dla_p = ledger(db, DLA_PERSONAL, "asset")
    dla_c = ledger(db, DLA_COMPANY, "liability")
    upsert_journal(db, "dla-opening-capital", date(2021, 3, 1),
                   "Director's loan – opening capital investment PLACEHOLDER 0.00 (amount unconfirmed)", "placeholder",
                   "No capital-investment amount found. iDesign Consulting (Pty) Ltd 2022/382004/07, incorporated "
                   "2022-03-18, issued share capital R10 (AFS FY2025 by Llewellyn Swart, Gmail ruan@dzign.africa "
                   "2025-08-18 'Financial statements'). AFS: loan from shareholder RL Farquhar R197,914 owed TO Ruan "
                   "at 2025-02-28, nil at 2024-02-29. Question for Ruan.",
                   [], placeholder=True)

    # pairs that exist before any change (iDesign ↔ Ruan's personal accounts)
    db.flush()
    books = _bb(db, PROFILE)
    pair_moves_c, pair_moves_p = [], []
    for p in books.pairs:
        sides = {p.out_account_id: p.out_tx, p.in_account_id: p.in_tx}
        if idesign in sides and any(a in sides for a in personal):
            pair_moves_c.append(sides[idesign])
            pair_moves_p.append(next(sides[a] for a in sides if a in personal))

    # 1. 'Company Funding Received' → DLA personal side (company-account rows → Transfers In)
    for t in db.query(Transaction).filter_by(user_profile_id=PROFILE, ledger_id=COMPANY_FUNDING).all():
        if t.bank_account_id in personal:
            move(db, [t.id], dla_p, "Company Funding Received → DLA (personal side)", LOG)
        else:
            move(db, [t.id], ledger_by_id(db, TRANSFERS_IN), "company-account receipt from Dzign Casta (not DLA)", LOG)
    # 2. tracked iDesign legs to / from Ruan → DLA company side
    for t in db.query(Transaction).filter_by(user_profile_id=PROFILE, bank_account_id=idesign).all():
        if t.is_excluded:
            continue
        d = t.description or ""
        if t.amount < 0 and (t.ledger_id == PERSONAL_DRAWINGS or re.search(RX_IDESIGN_OUT, d, re.I)):
            move(db, [t.id], dla_c, "iDesign payment to/for Ruan → DLA (company side)", LOG)
        elif t.amount > 0 and re.search(RX_IDESIGN_IN, d, re.I):
            move(db, [t.id], dla_c, "iDesign receipt from Ruan → DLA (company side)", LOG)
    move(db, pair_moves_c, dla_c, "iDesign leg of an iDesign ↔ personal transfer", LOG)
    move(db, pair_moves_p, dla_p, "personal leg of an iDesign ↔ personal transfer", LOG)
    # 3. item 4: unpaired personal transfer legs whose mirror (cross-type candidate) is now a DLA company leg
    db.flush()
    books = _bb(db, PROFILE)
    already = set(pair_moves_c) | set(pair_moves_p)
    for t, o in cross_type_candidates(db, books, skip=already):
        if o.ledger_id == dla_c.id and t.bank_account_id in personal:
            move(db, [t.id], dla_p, f"mirror of DLA company leg tx {o.id} (was unpaired transfer)", LOG)
        elif t.ledger_id == dla_p.id and o.bank_account_id == idesign:
            move(db, [o.id], dla_c, f"iDesign mirror of DLA personal leg tx {t.id}", LOG)

    # 4. 'Company Funding' rows that were really own-account moves (mirror is an unpaired
    #    transfer leg on another personal account) go back to Transfers In / Out so they pair.
    db.flush()
    books = _bb(db, PROFILE)
    used = {x for p in books.pairs for x in (p.out_tx, p.in_tx)}
    L = books.ledgers
    legs = [t for t in db.query(Transaction).filter(Transaction.user_profile_id == PROFILE,
                                                    Transaction.bank_account_id.in_(personal),
                                                    Transaction.is_excluded.is_(False)).all()
            if t.id not in used and t.ledger_id in L and L[t.ledger_id].type == "transfer"]
    taken: set[int] = set()
    company_legs = db.query(Transaction).filter(Transaction.user_profile_id == PROFILE, Transaction.ledger_id == dla_c.id).all()
    for t in db.query(Transaction).filter(Transaction.user_profile_id == PROFILE, Transaction.ledger_id == dla_p.id,
                                          Transaction.bank_account_id.in_(personal)).order_by(Transaction.date, Transaction.id).all():
        if any(c.amount == -t.amount and abs((c.date - t.date).days) <= 4 for c in company_legs):
            continue  # has an iDesign-side DLA mirror → genuine DLA movement
        best = None
        for o in legs:
            if o.id in taken or o.bank_account_id == t.bank_account_id or o.amount != -t.amount:
                continue
            gap = abs((o.date - t.date).days)
            if gap <= 1 and (best is None or gap < best[0]):
                best = (gap, o)
        if best:
            taken.add(best[1].id)
            move(db, [t.id], ledger_by_id(db, TRANSFERS_IN if t.amount > 0 else 49),
                 f"own-account transfer (mirror tx {best[1].id} on another personal account) – not DLA", LOG)

    # 5. reviewed corrections (iDesign 4343 → PW 12451 → Easy 6038 chain; 'From Ruan Salary'
    #    receipts on Gold Cheque mirrored by iDesign 'To Ruan Salary' or from untracked iDesign months)
    move(db, [12451, 7463, 7522, 7040], dla_p, "reviewed: receipt from iDesign → DLA (personal side)", LOG)
    move(db, [6038], ledger_by_id(db, TRANSFERS_IN), "reviewed: PW → Easy own-account leg of the iDesign 'Printer' chain", LOG)

    # rules: future imports follow
    for rid in (16, 17, 18):
        r = db.get(Rule, rid)
        if r is not None and r.user_profile_id == PROFILE and r.ledger_id in (COMPANY_FUNDING, dla_p.id):
            r.ledger_id = dla_p.id
            print("  rule", rid, r.name, "→ DLA personal side")
    upsert_rule(db, "iDesign: payments to/for Ruan → DLA (company side)", 866, dla_c, RX_IDESIGN_OUT, accounts=[idesign], sign="out")
    upsert_rule(db, "iDesign: funds from Ruan → DLA (company side)", 867, dla_c, RX_IDESIGN_IN, accounts=[idesign], sign="in")
    left = db.query(Transaction).filter_by(user_profile_id=PROFILE, ledger_id=COMPANY_FUNDING).count()
    cf = ledger_by_id(db, COMPANY_FUNDING)
    if left == 0 and not db.query(Rule).filter_by(user_profile_id=PROFILE, ledger_id=COMPANY_FUNDING).count():
        cf.is_archived = True
        print("  archived ledger", cf.id, cf.name)


def cross_type_candidates(db, books, skip=frozenset()):
    """Unpaired transfer legs ↔ same-amount opposite-sign non-transfer rows on another tracked
    account within the pairing window (same matching as the engine's diagnostic)."""
    from collections import defaultdict
    from app.models import LedgerType
    from app.services.double_entry import PAIR_WINDOW_DAYS

    used = {x for p in books.pairs for x in (p.out_tx, p.in_tx)}
    L = books.ledgers
    txs = db.query(Transaction).filter(Transaction.user_profile_id == PROFILE, Transaction.is_excluded.is_(False)).all()
    is_tr = lambda t: t.is_categorised and t.ledger_id in L and L[t.ledger_id].type == LedgerType.TRANSFER.value  # noqa: E731
    unpaired = [t for t in txs if is_tr(t) and t.id not in used and t.bank_account_id and t.amount != 0]
    others = defaultdict(list)
    for t in txs:
        if t.bank_account_id and t.amount != 0 and t.id not in used and t.id not in skip and not is_tr(t):
            others[abs(t.amount)].append(t)
    taken, out = set(), []
    for t in sorted(unpaired, key=lambda x: (x.date, x.id)):
        best = None
        for o in others.get(abs(t.amount), []):
            if o.id in taken or o.bank_account_id == t.bank_account_id or (o.amount > 0) == (t.amount > 0):
                continue
            gap = abs((o.date - t.date).days)
            if gap <= PAIR_WINDOW_DAYS and (best is None or gap < best[0]):
                best = (gap, o)
        if best:
            taken.add(best[1].id)
            out.append((t, best[1]))
    return out


STEPS = {
    "exclude_duplicates": step_exclude_duplicates,
    "loan_repayment_transfers": step_loan_repayment_transfers,
    "loans": step_loans,
    "dla": step_dla,
}


def main(argv: list[str]) -> None:
    dry = "--dry-run" in argv
    wanted = [a for a in argv if not a.startswith("--")] or list(STEPS)
    db = SessionLocal()
    for name in wanted:
        print(f"== {name}")
        STEPS[name](db)
        db.flush()
    print(f"{len(LOG)} transaction(s) re-allocated")
    if dry:
        db.rollback()
        print("dry run: rolled back")
    else:
        db.commit()
        out = os.environ.get("MIGRATION_LOG")
        if out:
            import json
            with open(out, "a") as fh:
                for row in LOG:
                    fh.write(json.dumps(row) + "\n")


if __name__ == "__main__":
    main(sys.argv[1:])
