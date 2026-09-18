# TODO — living backlog

**Last updated:** 2026-09-18 · **App version: 2.1.2** (source on `main` is ahead of the tag) · last portable EXE `LedgerFlow-2.1.1-Portable.exe` (2.1.2 EXE not cut)  
**How to use:** Move items between sections as work finishes. Add new items from product conversations. After any session, update **Status snapshot**.  
**Release notes:** [RELEASE_NOTES.md](./RELEASE_NOTES.md)

---

## Status snapshot

| Area | Status |
|------|--------|
| Local app run (FE + BE) | Working on **UI :3470 / API :8470** (`run.py` default **no auto-reload** — set `LEDGERFLOW_RELOAD=1` for watch mode) |
| Portable EXE | **v2.1.1** `LedgerFlow-2.1.1-Portable.exe` — next cut should include **2.1.2 + this Work Flow slice** |
| Work Flow · costing / print | **On main 2026-09-18** — Project Flow + Costing Sheet, wages/expense highlights, print preview (white paper), traveling, absences |
| Soft grey + neon hub UI | Done |
| Auth (login / guest / first-time setup) | Done v1.3 |
| Returning-user greet + simple login | Done v1.3 |
| First-run 10-card guide | Done v1.3 |
| 30-day trial → Option C read-only | Done v1.3 |
| Dashboard hubs + shared monthly chart | Done v1.3 |
| Settings five hubs + Preferences page | Done v1.3 |
| Bank profile guided picker (calibrated) | Done v1.3 |
| Multi user-profile workspaces | Done v1.3 (extra clients: workspace username + password on create + switch gate) |
| Upload 3-step + success modal + pulse | Done v1.3 |
| Transactions dual tabs + Assign to Ledger | Done v1.3 |
| Parsers (5 islands) | **Discovery 226 · FNB 1000+ · Capitec sample · Nedbank sample · Bank Zero sample** |
| Reporting hub + monthly chart | Done — **calibrate after Discovery data** |
| P&L / PDF letterhead | Partial — polish after real data |
| Product docs in `docs/` | Living — refreshed 2026-09-16 |
| **Cabinet Flow** (new module) | Named, parked — spec TBD (explain later) |

---

## Next phase (do in this order)

### 1 — Capture Discovery Personal data ⬅️ **NEXT**
- [ ] Multi-statement import under bank profile **Discovery** (parser locked, human-verified 226 txs · 100%)
- [ ] Spot-check months vs PDFs after import
- [ ] Allocate / rules as needed so Reporting has real figures

### 2 — Reporting calibration (only after step 1)
- [ ] Monthly overview chart against real Discovery (and other) data
- [ ] P&L / SA report hubs polish with real numbers
- [ ] Budget lines, FY compare, PDF letterhead with business logo
- [ ] Graph axis / layout tweaks as needed

### 3 — Later (not blocking Discovery → reporting)
- [ ] **Bulk Capitec Business** multi-statement import accuracy pass
- [ ] **Bulk Nedbank Personal** multi-statement import accuracy pass
- [ ] Optional: freeze redacted samples under `samples/` for CI

### 4 — Practice module (separate branch — does not block EXE)
Work only on **`feature/practice-module`**. See [MODULES.md](./MODULES.md).
- [x] Module registry + git branch
- [x] Settings → Modules On/Off (quotes, invoices, projects)
- [x] Clients / suppliers libraries
- [x] Projects library + project file + Add note / quote / invoice / expense
- [x] Quotes + invoices (first draft) + invoice from quote
- [x] Project statement (notes, quotes, invoices, running costs)
- [x] Theme packs + Settings → Appearance
- [x] Quote/invoice editor + line items + company/client details
- [x] Quote/invoice PDF print
- [x] Staff library + photo (biometrics later) + wages on project trail + staff statement
- [x] Products library (name, description, supplier stock code, cost, markup %, retail, category) + pick onto quote/invoice lines
- [x] Quote print preview: Save PDF + Print, 288 DPI preview, close after print
- [x] Ledger Account Management grouped Income → Expense → Transfer
- [x] Bank Zero Check Account sample island
- [x] Per-day wages on the project trail (days with decimals × daily rate, extras + deductions with description + amount, HR notes)
- [x] Wage payments snapshot the rate at save time — later staff-card increases do not rewrite past project wages
- [x] Remove paper-trail lines (wages, expenses, notes, meetings, payments) so a wrong wage can be dropped and loaded again
- [x] Invoice payment received (project paper trail or client file) marks the invoice Paid + red “Paid — Thank you” PDF stamp
- [x] Received payment on a project file can allocate one lump sum to multiple invoices
- [x] Project wages: override daily rate with commission (amount + reason) — lands on the staff wages statement
- [x] Work Flow own ledgers (copied from Ledger Flow) under Configuration; wages pick/create a ledger
- [x] App Settings on the side nav (bottom) with database location, backup, and restore
- [x] Select multiple invoices (library + client file) and print them as one batch
- [x] Projects library as small Windows-style **yellow folders**, A–Z left to right — number on the folder, name underneath
- [x] Invoice print preview no longer sticks on Printing… after the first print
- [x] Work Flow ledgers isolated from Ledger Flow; Configuration split Company / Quote-Invoice / Ledgers; create + edit (name, income/expense)
- [x] Default wages ledger on staff profiles; Add vendor from expense list (type filters only, no keystroke-create)
- [x] Ctrl+Enter saves trail forms, opens Add, then focuses date so Tab continues
- [x] Received payment can allocate to an income ledger or credit an expense ledger
- [x] Absence on the wages trail (R0, days from the selected date) — also on the staff wages list
- [x] Project statement tabs: **Project Flow** and **Project Costing Sheet**
- [x] Costing sheet: Monday–Sunday costs include wages; Total expenses / Total wages / Total project expenses; week totals and footer colours
- [x] Wages breakdown by role (directors first) — paid amount, worked days, absent days (explicit Absent lines + days short of the rest of the crew that week)
- [x] Expense lines on costing highlighted like wages (blue badge/row vs amber wages)
- [x] Traveling on the paper trail (ledger, km, R/L, amount) and a Traveling block on costing
- [x] Costing/Flow **Print** uses the quote/invoice preview (Print + Save PDF); print pages are **white paper** with themed wage/expense colours
- [x] Opening a project folder no longer dies with **Not Found** when `practice_travels` was missing — table is migrated; travel list failure does not block the file
- [ ] **Payslips** from staff wages (PDF, weekly/monthly, bank details on the staff card) — include days, rate, extras, and deductions
- [ ] **HR file / report from wage notes** — each wage payment stores a performance note (good / poor work, unique events). Pull these onto a staff HR file later
- [ ] **HR wage-increase report** — pull dated rate history (start / increase / decrease) to PDF
- [ ] Staff statement PDF (same preview window as supplier statements)
- [ ] Attach files to a project
- [ ] Cut portable EXE that includes this Work Flow slice (still on `LedgerFlow-2.1.1-Portable.exe`)
- [ ] Merge to `Develop---EXE-Build` only when a slice is shippable

### 5 — Cabinet Flow (new module — spec later)
Parked until the product shape is explained. Same modular-monolith rules as Work Flow: own folder, own tables, one login / one SQLite / one EXE. See [MODULES.md](./MODULES.md).
- [x] Sidebar module tile + `/cabinet` placeholder hub (visual only)
- [ ] Hear the Cabinet Flow brief (what it is, who it is for, what it must not do)
- [ ] Write the module map (folders, tables, nav, what it uses from core / Work Flow)
- [ ] Settings → Modules On/Off for Cabinet Flow
- [ ] Do **not** start the real build until the brief is in this file

---

## Now / next (detail backlog)

### P0 — Documentation & alignment
- [x] Create `docs/` (vision, flow, tree, todo, decisions, parsing)
- [x] End-of-day 2026-07-31 doc pass (parser locks, next phase, FILE_TREE, README)

### P1 — Bank profile first-run wizard
- [x] Gate Upload when zero profiles
- [x] Dissect + friendly preview + privacy options
- [x] Discovery / FNB / Capitec / Nedbank routing
- [x] Bank profile **Update** + Updated timestamp

### P2 — Upload queue
- [x] Multi-file, one-by-one, background + toast
- [x] Scroll progression: start top → mid-track → clamp bottom (no jump thrash)
- [ ] Server-side job queue + heartbeat (optional if tab fully closed)

### P3 — Transactions hub
- [x] Tabs Unallocated | Allocated
- [x] Group by month; collapse memory (cleared on wipe)
- [x] Capitec Bank Fee under amount (meta row with Ref)
- [x] Wipe year/month + clear collapse prefs
- [x] Dashboard hub label: **Transactions** (was “Unallocated Transactions”)
- [ ] Shadow fields: original type/details for rules when user edits
- [ ] Rule modal: similar txs multi-select apply (polish)
- [ ] Auto-hide rule-matched rows on future imports

### P4 — Reporting
- [x] Hub + detail routes; monthly FY chart + graph type memory
- [x] Chart Y-axis: Amount label outside currency ticks
- [ ] **Calibrate after Discovery data capture** (see Next phase §2)
- [ ] Click sum → transaction list drill-down
- [ ] Edit / re-assign / unallocate from drill-down
- [ ] PDF print + export, portrait | landscape polish

### P5 — Settings & polish
- [x] Profiles Individual/Business; logo; reg/VAT
- [x] Global currency dropdown
- [x] Password strength meter (advisory)
- [ ] Theme polish pass after feature work

### Parser stability lock
- [x] `docs/PARSER_STABILITY.md` — four islands locked
- [x] Discovery Personal — **226 txs · 100%** human-verified
- [x] FNB Gold Business — **1000+ txs · 100%** human-verified
- [x] Capitec Business — edition-1 locked (bulk import TBD)
- [x] Nedbank Personal — edition-1 locked (bulk import TBD)
- [x] `backend/tests/test_parser_regression.py` green (7 tests)
- [x] Standing rule: do not taint locked modules for other-bank work

### Multi-profile workspaces
- [x] Profiles + isolation + sidebar switcher
- [x] Primary profile = app login only; extra profiles = workspace username + password at create
- [x] Full-app switch gate (credentials or Cancel → reload workspace data)
- [x] Cascade delete of profile-owned data

### Desktop product (v1.3.0)
- [x] Frameless chrome + splash + first-time setup + app guide
- [x] Trial Option C + license middleware
- [x] Settings five hubs; Preferences route
- [x] Dashboard uses shared `MonthlyComparisonChart`
- [x] Portable **v1.3.0** package

### Distribution — installable apps (product targets)

**A — PC application (install on machine)** — primary packaging goal  
- [x] Choose shell: **Electron** (no Rust required; Tauri optional later)  
- [x] Bundle local API (PyInstaller) + static Next export + Electron window  
- [x] Data path remains on-device (`Documents/LedgerFlow/Data`)  
- [x] Build script: `scripts/build-desktop.ps1` → portable `.exe`  
- [x] Footer version (`VERSION` file → right side of footer)  
- [x] Portable builds through **v1.3.0**  
- [ ] Smoke test on a clean PC (no prior Node/Python)  
- [ ] Windows code signing (SmartScreen) before wider sharing  
- [ ] Optional NSIS Setup installer; macOS / Linux later  
- [ ] **Air / OTA updates** — re-enable Settings → App updates (`AppUpdatesCard`), host `latest.json` + channel URL, document publish flow (`docs/UPDATES.md`). UI is implemented but **hidden** until ready.  

**B — Mobile application** — second target (after PC path is solid)  
- [ ] **Android APK** first (sideload / internal testing); not “any phone” until iOS too  
- [ ] iOS = separate build (App Store / TestFlight) — **cannot** ship as `.apk`  
- [ ] Decide mobile runtime (open decision):  
  - full local processing on device (hard with current Python parsers), or  
  - mobile UI + reduced local engine, or  
  - companion mode (phone talks to PC app / private sync)  
- [ ] Mobile UX pass: big taps, upload from files/camera, offline-friendly  
- [ ] Same privacy rule: statements stay on device unless user opts into something else  

### Later / optional
- [ ] **Cabinet Flow** module — named 2026-09-13; brief still to come (see Next phase §5)
- [ ] Standard Bank / Absa parsers (new modules only)
- [ ] Real multi-user cloud accounts (not the primary “go live” path)
- [ ] Local LLM assist for categorisation hints
- [ ] Match uploaded file to existing bank profile automatically
- [ ] **Financial Analyzer** (Reporting / Dashboard) — explore later
  - Country packs: necessity vs luxury + themes (banking, groceries, fuel, …)
  - Rollup spend: “R X on luxuries” broken down by theme
  - Optional geolocation / profile country to pick pack; flag native merchants
  - Soft advice + disclaimers; local curated taxonomy (not cloud AI per request)
  - v1 idea: start ZA pack over existing allocated ledgers/rules

---

## Done (recent — 2026-08-04 · v1.3.0)

- [x] Desktop frameless + splash + first-time setup + 10-card guide
- [x] Returning greet + simple themed login; force flags off for production
- [x] 30-day trial → read-only Option C + key activation
- [x] Extra client workspace username/password + full-app switch gate
- [x] Profile delete FK cascade fix
- [x] Settings five hubs; Preferences page; hide rules maintenance card
- [x] Upload 3-step + pulse; Transactions Assign UX
- [x] Dashboard monthly chart = Reporting chart (shared component)
- [x] Release notes + version bump **1.3.0**

## Done (earlier — 2026-07-31)

- [x] Auth: free password + strength meter; guest login; Dashboard landing
- [x] Capitec Business parser + fee UI + Bank Charges auto-fee siblings
- [x] Nedbank Personal parser (fee column vs `*` debit; R0.00 lines kept)
- [x] Four bank islands locked + isolation docs
- [x] Upload queue scroll fix; wipe clears month collapse memory
- [x] Monthly chart axis spacing; reporting graph type memory

---

## Blocked / needs decision

See [DECISIONS.md](./DECISIONS.md). Items marked *open* block some P3–P4 details.
