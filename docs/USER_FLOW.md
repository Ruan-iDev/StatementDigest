# User flow (step by step)

**Last updated:** 2026-07-31  
**Persona:** Florist, not an accountant. Soft language. Modals guide them.

This is the **target** product flow. Gaps vs current code are marked **[NOT BUILT]** or **[PARTIAL]**.

---

## A. Open the app

1. User opens the app (today: browser at `http://localhost:3000`; future: optional desktop shell).
2. **[NOT BUILT]** “Login” — for now there is **no account system**; local app is open.  
   *Decision pending: treat “login” as “app launch” until multi-user exists.*
3. User lands on **Dashboard** with four hubs:
   - Upload Statement  
   - **Transactions** (rename from Unallocated)  
   - Reporting  
   - Settings  

---

## B. First-time gate: must create a bank profile before real uploads

### B1. User clicks **Upload Statement**

1. System checks: **any bank profiles saved?**
2. **If none:**
   - Show **modal**:  
     > “Cannot proceed — you need a bank profile first so we know how to read your statement.”  
   - Buttons: **Cancel** | **Create Bank Profile**
3. User clicks **Create Bank Profile** → modal switches into the **wizard** (section C).
4. **If profiles already exist:** skip gate; go to upload queue (section D).

**Why this order?**  
We do **not** fully import transactions before the app knows how to read the file. The florist still “starts with a statement,” but the first statement is a **sample used to teach** the app (profile creation), then they upload for real.

---

## C. Create Bank Profile wizard (modal, multi-step)

### Step 1 — Upload a sample bank statement

1. Copy: “Upload **one sample** statement from the bank you use (PDF or CSV).”
2. User clicks **Browse**, selects file, clicks **Upload** (or Next).
3. System **dissects** the file:
   - Detect structure (headers, table region, columns, amount style).
   - Build a **preview** of transaction-like rows.
4. Advance to **Step 2**.

### Step 2 — Name the profile + confirm what we found

**Always show:**

| Field | Example | Notes |
|-------|---------|--------|
| **Bank profile name** | `Standard Bank` / `Discovery Business` | User-facing label |

**Detected layout (user-friendly, not a code dump):**

The app should **not** show a terminal-like script. It shows **plain English + checkable options**, for example:

> “We found a **transaction table** with these columns:  
> **Date · Card No · Type · Details · Amount**  
> Is that correct, or do you want to change the mapping?”

**Discovery-style statement structure (example from product owner):**

| Region | Content | App behaviour |
|--------|---------|----------------|
| Main header | Account holder personal details, statement date, period, overdraft limits, minimums, etc. | **Skip** for bookkeeping (not imported as transactions) |
| Account summary | Opening/closing balance, account number | Opening/closing may be used as markers; **account number / PII** controlled by Option 1 |
| **Transaction timeline** | Columns e.g. Date \| Card No \| Type \| Details \| Amount | **This is what we import** |
| Footer | Boilerplate | **Skip** |
| First/last “rows” | Opening balance / Closing balance lines | Treat as **balance markers**, not spend/income (or exclude from P&L) |
| Amount style (Discovery) | Inflow: `R …` · Outflow: `-R …` (minus) | Encode in profile as amount rules |
| Amount style (FNB) | Inflow ends with **Cr**; outflow without Cr | Encode differently in profile |

**User options in Step 2 (Discovery example):**

| Option | Control | Meaning |
|--------|---------|--------|
| **Option 1** | Yes / No | Include personal details & bank account number with stored profile / display? **Default recommended: No** (privacy) |
| **Option 2** | Yes / No | Display **card number** with each transaction? |

Other banks may show a **different option set** based on detected columns (wizard expands relatively).

**Buttons:** **Cancel** | **Proceed**

On **Proceed:**

1. Profile is **automatically saved** into **Settings → Bank Profiles**.
2. Modal closes.
3. User returns to **Dashboard**, ready to upload statements for real.

**[DONE — P1]** Modal wizard on Upload (gate when no profiles) and on Settings → Bank Profiles.  
Backend: `POST /api/bank-profiles/dissect` auto-detects columns / amount style / bank family.

---

## D. Upload statements (after at least one profile exists)

1. User opens **Upload Statement**.
2. Selects bank profile (the one they created, or another).
3. Selects **one or more** statement files.
4. **No hard file limit** — add as many statements as needed; process one by one.
5. User starts upload.
6. **Processing queue (background):**
   - Process **one file at a time**.
   - User may navigate to Dashboard / Transactions / elsewhere while it runs.
   - Full queue list on Upload page; **bottom-right floating toast** shows spinning `Uploading n/total`.
7. When complete → toast shows **View transactions**; or use sidebar **Transactions** hub.
8. Server-side persistent job queue still optional if the browser tab is fully closed.

**[DONE v2 — P2]** Unlimited multi-file, themed queue, background processing via app-wide context, floating progress toast with View transactions.

---

## E. Transactions hub (renamed from Unallocated)

### Tabs

| Tab | Purpose |
|-----|---------|
| **Unallocated** | Needs a ledger |
| **Allocated** | Already categorised — review, re-assign, or unallocate |

### Unallocated tab

1. Group / filter **by month**.
2. Each row:
   - Date, amount, etc.
   - **Ledger** dropdown  
   - **Type** — editable field  
   - **Details** — editable field  
   - **Allocate** button  
   - **Rule** button  
3. **Original text preserved:**  
   If user edits Type or Details, keep a **background copy of original bank text** for the rule engine (match on original, show edited if desired).
4. **Allocate:** assign ledger (and optional edited type/details) → moves to Allocated.

### Create Rule (modal)

1. User clicks **Rule** on a transaction (or selection).
2. Modal opens: proposed match (e.g. contains “CHECKERS”).
3. System lists **all similar transactions** (current + previous, allocated or not as designed).
4. Each has a **checkbox — all ticked by default**.
5. User unticks exceptions.
6. **Apply** →  
   - Save rule  
   - Apply to all selected  
   - Those rows leave Unallocated (if they were there)
7. **Future imports:** matching lines auto-allocate and **user never sees them again** in Unallocated.

**[PARTIAL]** Rules and pending queue exist; not full dual-tab UX, original-text shadow fields, or multi-select apply modal as specified.

---

## F. Reporting (Profit & Loss)

1. Default: **current financial year**, **month by month**, neat layout.
2. If more history loaded: **date / FY selector** to browse other financial years.
3. Click any **summed amount** → drill-down list of **linked transactions**.
4. On a transaction: **Edit** → modal to:
   - Re-assign ledger, or  
   - **Unallocate** → returns to **Transactions → Unallocated**.
5. **PDF:**
   - Print / export P&L  
   - **Portrait or landscape**  
   - Share with accountant  

**[PARTIAL]** P&L + PDF export exist; drill-down edit/unallocate and orientation choice need alignment with this flow.

---

## G. Settings (management, not first-day homework)

| Area | Role |
|------|------|
| **Setup Bank Profile** | List/edit/delete profiles created by wizard; optional re-teach |
| **Ledger Account Management** | Create/rename/archive ledgers (simple names: “Flowers stock”, “Fuel”) |
| **Rule Management** | View/edit/disable rules |
| Preferences | FY start month, currency, etc. |

Day-one user path is still: **Upload → forced profile wizard → Dashboard → Upload real statements**.

---

## H. End-to-end happy path (florist)

```text
Open app
  → Dashboard
  → Upload Statement
  → Modal: no profile → Create Bank Profile
  → Step 1: sample Discovery statement
  → Step 2: name "Discovery", privacy options, confirm columns
  → Proceed → profile saved
  → Dashboard
  → Upload Statement (up to 12) → queue processes 1-by-1
  → Transactions → Unallocated (by month)
  → Allocate + create Rules (tick similar)
  → New uploads auto-rule
  → Reporting → monthly P&L → drill-down if wrong
  → Export PDF for accountant
```

---

## Open product questions (track in DECISIONS.md when resolved)

1. True **login** vs local-only open app  
2. Opening/Closing balance rows: exclude entirely vs store as non-P&L markers  
3. Rule match: always on **original** bank description only  
4. Multi-account: one profile per bank product vs per account number  
5. PDF Discovery layout detection confidence / manual “pick table” fallback  
