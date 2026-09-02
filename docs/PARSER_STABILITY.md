# Locking down statement parsing (stability)

**Last updated:** 2026-07-31 (end of day)  

**Context (human verification):**  
- **Discovery Personal** — user-tested **226 transactions**, **100% accurate**. Locked.  
- **FNB Gold Business** — user-tested **1000+ transactions**, **100% accurate**. Locked.  
- **Capitec Business** — sealed edition-1 on sample path; **bulk multi-statement import still to be run** for full confidence.  
- **Nedbank Personal** — sealed edition-1 on sample path (fee column vs `*` debit, R0.00 lines kept); **bulk multi-statement import still to be run** for full confidence.  

**Product next (not parser unlocks):** capture Discovery multi-statement data → calibrate Reporting → later bulk Capitec/Nedbank.

This document explains how to **keep that accuracy from being tainted** as we keep building.

---

## Locked banks (edition-1 accurate — do not taint)

| Bank / format | Module | Status | Human verification |
|---------------|--------|--------|--------------------|
| **Discovery Personal** (PDF text) | `discovery_pdf.py` | ✅ Edition-1 locked | **226 txs · 100% accurate** |
| **FNB** brand (Gold Business EN + Fusion AF personal) | `fnb_pdf.py` | ✅ Multi-layout island | Gold Business **1000+ · 100%**; Fusion AF edition-1 sample |
| **Capitec Business** (PDF table) | `capitec_pdf.py` | ✅ Edition-1 locked | Sample sealed; **bulk import TBD** |
| **Nedbank Personal** (PDF text) | `nedbank_pdf.py` | ✅ Edition-1 locked | Sample sealed; **bulk import TBD** |
| **Bank Zero** Check Account | `bank_zero_pdf.py` | ✅ Edition-1 sample | June + July 2026 samples |
| Other (Absa, Standard, etc.) | new modules only | Not started | — |

### Planned bulk accuracy tests (do soon)

| Bank | Goal |
|------|------|
| **Capitec Business** | Bulk multi-statement import; spot-check all months vs PDFs |
| **Nedbank Personal** | Bulk multi-statement import; spot-check all months vs PDFs |

Until bulk tests pass, treat Capitec / Nedbank as **locked against cross-bank taint**, but not yet at Discovery/FNB “1000+ verified” scale.

### Hard rule — one island per bank

| Allowed | Forbidden |
|---------|-----------|
| New module for a new bank (e.g. Absa) | Editing any **locked** module to “also handle” another bank |
| Branch in `detect.py` / `parse_pdf_content`: route only | Shared regexes that rewrite a locked bank’s line rules while fixing another |
| Bank-only presets / calibration + golden tests | Changing locked golden expectations “for convenience” |
| Profile training patterns (per profile) | One “generic SA bank text parser” that merges locked banks |

**Routing only, no shared bank logic:**  
`looks_like_discovery_text` / `parse_discovery_pdf_text` → Discovery only.  
`looks_like_fnb_text` / `parse_fnb_pdf_text` → FNB only.  
`looks_like_capitec_text` / `parse_capitec_pdf_text` → Capitec only.  
`looks_like_nedbank_text` / `parse_nedbank_pdf_text` → Nedbank only.  
`looks_like_bank_zero_text` / `parse_bank_zero_pdf_text` → Bank Zero only (before Nedbank — "Nedbank" can appear as a Bank Zero counterparty).

If a change would touch a **locked** module, stop and ask: *Is this a proven regression for that same bank, with tests?* If not → leave it alone.

### Discovery Personal edition-1 contract (LOCKED)

- Human verification: **226 transactions · 100% accurate** (2026-07-31)  
- Module: `discovery_pdf.py` only  
- Bank-side carry-overs are not app ghosts  
- **Do not taint** for FNB / Capitec / Nedbank work  

### FNB edition-1 contract (multi-layout island)

**Brand dropdown label:** `FNB` — backend may try several calibrated layouts.

| Layout | Status | Notes |
|--------|--------|-------|
| **Gold Business (English)** | ✅ LOCKED | Human: **1000+ txs · 100% accurate** (2026-07-31). Lines like `26 May … 21,845.00Cr`. Regression: `test_fnb_business_text_parser_amounts_and_year` |
| **Fusion Private Wealth (Afrikaans personal)** | ✅ Edition-1 sample | `25Okt … 42,000.00Kt` · Kt=krediet in, bare=debit. Regression: `test_fnb_fusion_afrikaans_personal_text_parser` |

- Module: `fnb_pdf.py` only (additive layouts; Gold Business rules stay locked)  
- Auto-select: orchestrator keeps the layout with more recovered lines  
- **Do not taint** for Capitec / Nedbank / Discovery work  
- New FNB products → new layout function + fixture test, not rewrite of locked Gold Business

### Capitec Business edition-1 contract (LOCKED)

- Table: Post Date | Trans Date | Description | Reference | Fees | Amount | Balance  
- `amount` = **Amount column only** (never Fee + Amount)  
- `fee_amount` = Fees when present; UI `Bank Fee: R x` under amount (meta row with Ref)  
- Fee-only (blank Amount, e.g. Monthly Service Fee): `amount = 0.00`, `fee_amount` set — **never skip**  
- Import: fee siblings → **Bank Charges & Fees**  
- Skip: Fee Total / VAT Total footers, balance brought forward  
- Regression: `test_capitec_business_fee_not_added_to_amount`  
- Scope: **Capitec Business PDF table** only  
- **Pending:** bulk multi-statement import accuracy pass  
- **Do not taint** when fixing other banks  

### Nedbank Personal edition-1 contract (LOCKED)

- Layout: `Tranlistno | Date | Description | Fees(R) | Debits(R) | Credits(R) | Balance(R)` (text)  
- Debits negative, credits positive (sign from balance chain when needed)  
- `fee_amount` **only** when Fees(R) **and** Debit/Credit both filled on the same row (e.g. Thai Farmers 85.50 + 2,921.58)  
- Fees column with `*` only (e.g. DEBIT ATM CASH 65.00*) = **standalone debit**, not Bank Fee metadata  
- Blank Fees → no Bank Fee (hidden / R0)  
- R0.00 lines with a description (e.g. VAT note) are **kept** for allocation  
- Skip only Opening / Closing balance  
- Regression: `test_nedbank_personal_text_parser_debits_credits_fees`  
- Scope: **Nedbank personal current-account PDF text** (business layouts need new fixtures)  
- **Pending:** bulk multi-statement import accuracy pass  
- **Do not taint** when fixing other banks  

---

## Principles

1. **Parser cores are sacred**  
   Locked modules: `discovery_pdf.py`, `fnb_pdf.py`, `capitec_pdf.py`, `nedbank_pdf.py`.  
   `base.py` / `money.py` change rarely and only with regression tests. New banks = **new modules**, not forks of locked ones.

2. **Prefer learning *outside* the core**  
   - User training / patterns → `training_patterns` (per profile)  
   - Bank presets → calibration JSON on bank profiles  
   Do **not** hard-code one user’s one-off mistakes into global parser code unless they are universal.

3. **Never auto-rewrite parser code from “AI train” ticks**  
   Train ticks exclude rows and build patterns. They must **not** silently mutate parsing algorithms. That is how accuracy gets poisoned.

4. **Bank data can be wrong**  
   Before calling something a ghost, check other months’ statements. Mark as ghost only when you are sure the line is **not** a real bank entry.

5. **Golden fixtures beat vibes**  
   Every intentional parser change must leave (or update) a **fixed sample + expected counts/rows** in tests. Discovery fixtures and FNB fixtures are **separate contracts**.

---

## Lock-down layers

| Layer | What it protects | How |
|-------|------------------|-----|
| **A. Golden regression tests** | Core parse logic | `backend/tests/test_parser_regression.py` — must stay green |
| **B. Frozen samples** | Inputs don’t drift | `samples/` only; never “fix” against live `data/uploads/` in CI |
| **C. Change checklist** | Human process | See below before merging parser edits |
| **D. Training isolation** | One profile’s feedback | Patterns are per `user_profile_id` |
| **E. Version / changelog** | History | Note parser behaviour changes in this file or commit messages |

---

## Change checklist (parser)

### Locked modules (`discovery_pdf.py`, `fnb_pdf.py`, `capitec_pdf.py`, `nedbank_pdf.py`)
1. [ ] **Default answer is no change** — only if that **same** bank regressed  
2. [ ] Run: `cd backend && .venv\Scripts\python.exe -m pytest tests/test_parser_regression.py -q`  
3. [ ] Re-import a known-good statement for **that** bank and spot-check totals  
4. [ ] Never open a locked file as part of another bank’s fix  

### New banks or shared `base.py` / `money.py`
1. [ ] Prefer a **new** module + bank-specific tests  
2. [ ] Run full `test_parser_regression.py` — **all** locked-bank tests must stay green with **zero** intentional expectation changes on locked banks  
3. [ ] Do **not** fix a single weird line with a global regex unless it fails on 2+ independent statements of **that same bank**  
4. [ ] Prefer bank-profile calibration or training patterns for one-off noise  

---

## What to freeze as “edition 1 accuracy”

When you are happy with a bank format:

1. Save a **redacted** sample PDF/CSV under `samples/` (strip account holder PII if you will commit it).  
2. Record in a test or short note:  
   - file name  
   - expected transaction count  
   - sum of amounts (optional)  
   - first and last description (optional)  
3. Treat that as the **contract** for that bank family.

Private originals can stay only in `data/uploads/` (local, not committed).

---

## Training tool vs core lock

| Action | Safe? |
|--------|--------|
| Mark a true ghost → exclude + pattern | ✅ Safe (profile-local) |
| “Other” reason for a bank bug that is real | ⚠️ Prefer **not** excluding — note in description instead |
| Changing Discovery date/amount regex without tests | ❌ Risk of tainting edition-1 accuracy |
| Letting auto-code-gen rewrite parsers from feedback | ❌ Forbidden for stability |

---

## Recommended habit

After any large import:

1. Spot-check 1–2 random months against the PDF.  
2. If a line looks wrong → open **the other month’s PDF** before training as ghost.  
3. Only then use **Dev train → Ghost**.

That habit, plus golden tests, is how edition-1 accuracy stays locked.

---

## Commands

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m pytest tests/test_parser_regression.py -q
```

If pytest is not installed: `pip install pytest` (or add to requirements when convenient).
