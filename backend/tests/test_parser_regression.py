"""Golden regression tests for LedgerFlow statement parsing.

These tests lock "edition 1" accuracy for known bank islands:
  - Discovery Personal — LOCKED (human: 226 txs · 100% accurate)
  - FNB Gold Business text (`test_fnb_business_text_parser_amounts_and_year`) — LOCKED (human: 1000+ · 100%)
  - Capitec Business table (`test_capitec_business_fee_not_added_to_amount`) — LOCKED (bulk TBD)
  - Nedbank personal text (`test_nedbank_personal_text_parser_debits_credits_fees`) — LOCKED (bulk TBD)

If a test fails after a parser change, either:
  - the change is wrong → fix the parser, or
  - the change is intentional → update expected values and document why
    in docs/PARSER_STABILITY.md — never "fix" a locked bank for another bank.

See docs/PARSER_STABILITY.md.
"""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path

import pytest

from app.services.money import apply_amount_style, to_decimal
from app.services.parsers.base import parse_csv_content, parse_statement, get_preset
from app.services.parsers.detect import dissect_statement

ROOT = Path(__file__).resolve().parents[2]
SAMPLES = ROOT / "samples"
FNB_SAMPLE = SAMPLES / "fnb_sample.csv"


@pytest.mark.skipif(not FNB_SAMPLE.exists(), reason="fnb_sample.csv missing")
def test_fnb_sample_transaction_count_and_opening_excluded():
    """FNB sample: opening balance excluded; stable row count and amounts."""
    content = FNB_SAMPLE.read_bytes()
    cal = get_preset("FNB")
    cal["exclude_balance_rows"] = True
    txs = parse_csv_content(content, cal)

    # Fixture contract (edition 1) — update only with intentional parser changes
    assert len(txs) == 15
    descs = [t.description.lower() for t in txs]
    assert not any("opening balance" in d for d in descs)
    assert not any("closing balance" in d for d in descs)

    assert txs[0].description.upper().startswith("SALARY")
    assert txs[0].amount == Decimal("45000.00")
    assert txs[1].amount == Decimal("-2500.00")


@pytest.mark.skipif(not FNB_SAMPLE.exists(), reason="fnb_sample.csv missing")
def test_fnb_sample_dissect_and_parse_statement_path():
    content = FNB_SAMPLE.read_bytes()
    dissected = dissect_statement(content, "fnb_sample.csv")
    assert dissected["bank_type"] == "FNB"
    txs = parse_statement(FNB_SAMPLE, dissected["calibration"], "fnb_sample.csv")
    assert len(txs) == 15


def test_money_signed_rand_and_cr_styles_stable():
    """Amount parsing contracts — must not silently flip signs."""
    assert to_decimal("R 1,234.56") == Decimal("1234.56")
    assert to_decimal("-R 50.00") == Decimal("-50.00")
    assert apply_amount_style("1,234.56 Cr", "credit_suffix_cr") == Decimal("1234.56")
    assert apply_amount_style("99.00", "credit_suffix_cr") == Decimal("-99.00")
    assert apply_amount_style("R5 932.05", "signed_rand") == Decimal("5932.05")
    assert apply_amount_style("- R7 552.00", "signed_rand") == Decimal("-7552.00")


def test_iso_dates_not_mangled_by_dayfirst():
    from app.services.parsers.base import _parse_date

    assert str(_parse_date("2026-03-04", "auto")) == "2026-03-04"
    assert str(_parse_date("2022-09-06", "auto")) == "2022-09-06"


def test_fnb_business_text_parser_amounts_and_year():
    """FNB Gold Business edition-1 contract: Cr inflows, bare outflows, year from period.

    LOCKED accuracy — do not change expectations unless FNB itself intentionally changes.
    Isolated from Discovery/Capitec — uses fnb_pdf only (synthetic text).
    """
    from app.services.parsers.fnb_pdf import parse_fnb_statement_text

    sample = """
First National Bank - a division of FirstRand Bank Limited.
GOLD BUSINESS ACCOUNT
Statement Period :26 May 2022 to31 May 2022
Statement Date :31 May 2022
Transactions inRAND (ZAR)
Date Description Amount Balance Bank Charges
26 May FNB App Transfer From Business Acc Trf 21,845.00Cr 21,845.00Cr
27 May FNB App Payment To Zim Labour Dzign Casta Projects 5,000.00 16,845.00Cr
27 May FNB App Payment To Zim Labour Dzign Casta Projects 15,000.00 1,845.00Cr
27 May FNB App Prepaid Airtime 0645145191 100.00 1,745.00Cr 2.70
27 May FNB App Prepaid Airtime 0645145191 85.00 1,660.00Cr 2.70
31 May FNB App Prepaid Airtime 0645145191 85.00 1,575.00Cr 2.70
Closing Balance 1,575.00Cr
"""
    txs = parse_fnb_statement_text(sample, {"amount_style": "credit_suffix_cr"})
    assert len(txs) == 6
    assert str(txs[0].date) == "2022-05-26"
    assert txs[0].amount == Decimal("21845.00")
    assert txs[1].amount == Decimal("-5000.00")
    assert txs[2].amount == Decimal("-15000.00")
    assert txs[3].amount == Decimal("-100.00")
    assert sum((t.amount for t in txs), Decimal("0")) == Decimal("1575.00")


def test_fnb_fusion_afrikaans_personal_text_parser():
    """FNB Fusion Private Wealth (Afrikaans) — additive layout, does not replace Gold Business.

    Kt = krediet (inflow), bare amount = debit. Day+month may have no space (25Okt).
    """
    from app.services.parsers.fnb_pdf import (
        parse_fnb_fusion_af_text,
        parse_fnb_statement_text,
    )

    sample = """
FNBFUSIONPRIVATEWEALTHACC
fnb.co.za
FirstNationalBank-'nafdelingvanFirstRandBankBeperk.
StaatPeriode:24Oktober2024tot23November2024
Staatdatum:23November2024
TransaksiesinRAND(ZAR)
Datum Beskrywing Bedrag Saldo Bank-koste
25Okt Smart-ApBetalingVanILoveYouBabes 42,000.00Kt 41,278.48Kt
25Okt Smart-ApOorplasingNaPayment 20,000.00 21,278.48Kt
25Okt Smart-ApBetalingNaPayment JustIncase 5,000.00 16,278.48Kt
25Okt DebietOrderKrediet437TWage/Salary00056663 33,804.31Kt 49,810.29Kt
26Okt DiensFooi 595.00 29,784.18Kt
01Nov PowerballAankopePowerballPurchase 15.00 16,315.27Kt
"""
    fusion = parse_fnb_fusion_af_text(sample)
    assert len(fusion) == 6
    assert str(fusion[0].date) == "2024-10-25"
    assert fusion[0].amount == Decimal("42000.00")  # Kt credit
    assert fusion[1].amount == Decimal("-20000.00")  # bare debit
    assert fusion[3].amount == Decimal("33804.31")  # Kt credit
    assert fusion[4].amount == Decimal("-595.00")  # service fee debit
    assert str(fusion[5].date) == "2024-11-01"

    # Orchestrator should prefer Fusion when Gold Business matches 0 lines
    auto = parse_fnb_statement_text(sample)
    assert len(auto) == 6
    assert auto[0].amount == Decimal("42000.00")


def test_supported_banks_are_brand_labels():
    """Dropdown shows brand names; layouts live as backend metadata."""
    from app.services.parsers.base import list_supported_banks

    banks = list_supported_banks()
    labels = {b["label"] for b in banks}
    assert labels == {"Discovery", "FNB", "Capitec", "Nedbank"}
    fnb = next(b for b in banks if b["bank_type"] == "FNB")
    assert any(L["id"] == "gold_business_en" for L in fnb["layouts"])
    assert any(L["id"] == "fusion_private_wealth_af" for L in fnb["layouts"])


def test_nedbank_personal_text_parser_debits_credits_fees():
    """Nedbank Personal edition-1 contract (LOCKED).

    Dual-column fee vs * debit; keep R0.00 description lines.
    Isolated module (nedbank_pdf) — do not change for other banks.
    """
    from app.services.parsers.nedbank_pdf import parse_nedbank_transaction_lines

    # Sequential balances so credit/debit signs are unambiguous
    sample = """
Tranlistno Date Description Fees(R) Debits(R) Credits(R) Balance(R)
10/01/2026 Openingbalance -17,372.88
000259 10/01/2026 THAI FARMERS B518103XXXXXX5828 85.50 2,921.58 -20,294.46
10/01/2026 DEBIT ATM CASH5898460911706810 65.00* -20,359.46
12/01/2026 authority Edge 2,000.00 -22,359.46
28/01/2026 VAT 27/12-27/01 = R71.52 0.00 -22,359.46
17/01/2026 I FARQUHAR 500.00 -21,859.46
19/01/2026 Authority Edge 1,000.00 -20,859.46
Closingbalance -20,859.46
"""
    txs = parse_nedbank_transaction_lines(sample)
    assert len(txs) == 6
    assert not any("opening" in t.description.lower() for t in txs)
    assert not any("closing" in t.description.lower() for t in txs)
    # Line 2 Thai: Fees + Debit → amount is debit; Bank Fee shows 85.50
    assert txs[0].amount == Decimal("-2921.58")
    assert txs[0].fee_amount == Decimal("-85.50")
    # Line 3 ATM 65.00* = normal debit only (not fee_amount on the line)
    assert txs[1].amount == Decimal("-65.00")
    assert txs[1].fee_amount is None
    # Blank Fees → no fee_amount
    assert txs[2].amount == Decimal("-2000.00")
    assert txs[2].fee_amount is None
    # R0.00 credit/debit with description (VAT note) — must still be captured
    assert txs[3].amount == Decimal("0") or txs[3].amount == Decimal("0.00")
    assert "vat" in txs[3].description.lower()
    assert txs[3].fee_amount is None
    # Credit (balance rises)
    assert txs[4].amount == Decimal("500.00")
    assert txs[4].fee_amount is None
    # Credit transfer in
    assert txs[5].amount == Decimal("1000.00")


def test_capitec_business_fee_not_added_to_amount():
    """Capitec Business: amount = statement Amount only; fee stored separately.

    Isolated module (capitec_pdf) — does not touch Discovery/FNB.
    """
    from app.services.parsers.capitec_pdf import parse_capitec_business_table

    table = [
        ["Post\nDate", "Trans.\nDate", "Description", "Reference", "Fees", "Amount", "Balance"],
        ["", "", "Balance brought forward", "", "", "", "+0.00"],
        [
            "17/04/26",
            "17/04/26",
            "Inward EFT Credit",
            "IDEV-00001",
            "",
            "+38 249.85",
            "+38 249.85",
        ],
        [
            "19/04/26",
            "18/04/26",
            "International POS Pu",
            "SUPABASE",
            "-8.23",
            "-411.41",
            "+37 830.21",
        ],
        [
            "19/04/26",
            "19/04/26",
            "Transfer",
            "Jacoline",
            "-6.00",
            "-15 000.00",
            "+22 824.21",
        ],
        ["30/04/26", "30/04/26", "Monthly Service Fee", "", "-50.00", "", "+21 335.99"],
        ["", "", "", "Fee Total:", "-65.63", "", ""],
        ["", "", "", "VAT @ 15.00% VAT Total:", "-8.55", "", ""],
    ]
    txs = parse_capitec_business_table(table)
    assert len(txs) == 4
    assert str(txs[0].date) == "2026-04-17"
    assert txs[0].amount == Decimal("38249.85")
    assert txs[0].fee_amount is None
    # Statement Amount only — do NOT add fee on top
    assert txs[1].amount == Decimal("-411.41")
    assert txs[1].principal_amount == Decimal("-411.41")
    assert txs[1].fee_amount == Decimal("-8.23")
    assert txs[2].amount == Decimal("-15000.00")
    assert txs[2].principal_amount == Decimal("-15000.00")
    assert txs[2].fee_amount == Decimal("-6.00")
    # Fee-only line (blank Amount): capture as R0.00 + fee (never skip)
    assert txs[3].amount == Decimal("0") or txs[3].amount == Decimal("0.00")
    assert txs[3].fee_amount == Decimal("-50.00")
    assert txs[3].principal_amount == Decimal("0.00") or txs[3].principal_amount == Decimal("0")
    assert "monthly service fee" in txs[3].description.lower()
    # Fee Total / VAT not imported as separate lines
    assert not any("fee total" in t.description.lower() for t in txs)
    assert not any("vat total" in t.description.lower() for t in txs)
