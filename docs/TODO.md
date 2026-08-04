# TODO — living backlog

**Last updated:** 2026-08-04 · **App version: 1.3.0**  
**How to use:** Move items between sections as work finishes. Add new items from product conversations. After any session, update **Status snapshot**.  
**Release notes:** [RELEASE_NOTES.md](./RELEASE_NOTES.md)

---

## Status snapshot

| Area | Status |
|------|--------|
| Local app run (FE + BE) | Working (`run.py` default **no auto-reload** — set `LEDGERFLOW_RELOAD=1` for watch mode) |
| Portable EXE | **v1.3.0** `LedgerFlow-1.3.0-Portable.exe` |
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
| Parsers (4 locked islands) | **Discovery 226 · FNB 1000+ · Capitec sample · Nedbank sample** |
| Reporting hub + monthly chart | Done — **calibrate after Discovery data** |
| P&L / PDF letterhead | Partial — polish after real data |
| Product docs in `docs/` | Living — refreshed 2026-08-04 |

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
