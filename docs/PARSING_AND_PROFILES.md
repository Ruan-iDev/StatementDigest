# How the app “knows” how to read a statement

**Last updated:** 2026-07-31  

This answers: *“Will there be a terminal-like code box with a script?”*  
**No.** The florist never sees scripts. Under the hood, the app stores a **Bank Profile recipe** (structured settings), not raw code the user edits.

---

## Mental model (for humans)

| Layer | What it is |
|-------|------------|
| **Statement file** | PDF or CSV from the bank |
| **Bank profile** | Named recipe: “How Discovery statements look for me” |
| **Parser service** | Code we write once that **follows** the recipe |
| **Transactions** | Clean rows: date, description, amount, optional type/card |

Analogy: a profile is a **saved form** (which columns mean what, how money signs work). The parser is the **worker** that fills the books using that form.

---

## What the user sees (wizard Step 2)

Friendly UI only, for example:

- Profile name  
- “We found these columns…” with ability to correct  
- Yes/No: store personal details / account number  
- Yes/No: keep card number on each line  
- Preview of first few **transactions** (not raw PDF junk)  
- Proceed / Cancel  

**Not shown:** Python, JSON terminals, regex dumps (optional “Advanced” later for power users only).

---

## What we store (the recipe — invisible to normal users)

Example shape (already similar in code as `calibration_data` on `BankProfile`):

```json
{
  "file_type": "pdf",
  "bank_family": "Discovery",
  "skip_header_regions": true,
  "skip_footer": true,
  "transaction_table": {
    "columns": ["date", "card_no", "type", "details", "amount"]
  },
  "include_personal_details": false,
  "include_account_number": false,
  "include_card_number": false,
  "amount_style": "signed_rand",
  "opening_balance_markers": ["Opening Balance"],
  "closing_balance_markers": ["Closing Balance"],
  "exclude_balance_rows_from_pl": true
}
```

FNB might use `"amount_style": "credit_suffix_cr"` instead of signed `R` / `-R`.

That JSON is **configuration data**, not a script the user maintains.

---

## How auto-detection works (high level)

1. **Read file**  
   - CSV: headers + rows  
   - PDF: extract text/tables (e.g. pdfplumber)

2. **Find the transaction region**  
   - Look for a header row like `Date | … | Amount`  
   - Skip personal header block and footer fluff  

3. **Guess column roles**  
   - Header names (“Date”, “Details”, “Amount”)  
   - Patterns (dates, money, “Cr”)  

4. **Guess amount rules**  
   - Minus before amount → outflow  
   - Trailing `Cr` → inflow (FNB-style)  

5. **Preview**  
   - Show N sample transactions  
   - User confirms options  

6. **Save profile**  
   - Recipe stored in SQLite  

7. **Later uploads**  
   - Same recipe applied automatically  
   - No re-wizard unless file layout changes  

**If detection fails:** wizard asks for more help (pick bank family, map columns from dropdowns). Still no terminal.

---

## Bank families (product examples)

| Bank | Module | Layout notes | Verification |
|------|--------|--------------|--------------|
| **Discovery Personal** | `discovery_pdf.py` | Timeline text; signed R amounts | **226 txs · 100%** · LOCKED |
| **FNB Gold Business** | `fnb_pdf.py` | Text; bare debit / `Cr` credit | **1000+ txs · 100%** · LOCKED |
| **Capitec Business** | `capitec_pdf.py` | Table Fees + Amount; Amount only booked; Bank Fee UI | Sample locked; bulk TBD |
| **Nedbank Personal** | `nedbank_pdf.py` | Text list Fees/Debits/Credits; dual-column fee vs `*` debit | Sample locked; bulk TBD |

Presets are **starting guesses**, refined by the sample upload in the wizard.  
**Isolation:** never edit a locked module to fix another bank — see [PARSER_STABILITY.md](./PARSER_STABILITY.md).

### Capitec fee display
- Statement **Amount** = line amount  
- Statement **Fees** (when present) = `Bank Fee: R x` under amount  
- Never add Fee + Amount into one net  

### Nedbank fee display
- Fees + Debit on **same** row → amount = debit/credit; show Bank Fee  
- Fees column with `*` only → **normal debit** (not Bank Fee metadata)  
- R0.00 lines with description are **kept** for allocation  

---

## Pipeline after profile exists

```text
File → Queue job → Parser(profile.recipe) → Transaction rows
  → Capitec: auto fee siblings → Bank Charges & Fees (if fee_amount)
  → Apply active rules → Unallocated leftovers only
  → User allocates / more rules
  → Reports
```

---

## Implementation map (code)

| Concern | Where (approx.) |
|---------|------------------|
| Profile CRUD / Update / dissect | `backend/app/api/bank_profiles.py` |
| Upload/import | `backend/app/api/imports.py` |
| Route to bank island | `backend/app/services/parsers/base.py` |
| Wizard detect | `backend/app/services/parsers/detect.py` |
| Discovery / FNB / Capitec / Nedbank | `*_pdf.py` modules (LOCKED) |
| Capitec fee → ledger | `backend/app/services/capitec_fees.py` |
| Profile model | `BankProfile.calibration_data` |
| UI | `frontend/app/bank-profiles/`, `upload/`, wizard component |

---

## Security / privacy defaults

- **Do not** store full statement PDF text in profile unless needed  
- Default **No** for personal details & account number in display/export  
- Card number optional  
- Local disk only  

---

## Grey areas / next work

1. **Next:** multi-statement Discovery capture → then reporting calibration  
2. Bulk Capitec + Nedbank import accuracy passes  
3. Matching “is this file the same layout as profile X?” on upload  
4. User correction UI when column guess is wrong (advanced)  
