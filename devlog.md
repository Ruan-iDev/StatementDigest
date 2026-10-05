# LedgerFlow — Development Log

Living document. Append **newest day at the top** under [Log](#log).  
Hours are **focused development time** for that calendar day (design + build + debug + verify), estimated from session work unless logged more precisely.

| Metric | Value |
|--------|------:|
| **Total hours (all days)** | **~40+** (estimate across multi-session desktop product work) |
| **Days logged** | 2+ |
| **Last updated** | 2026-09-30 · Cabinet Flow brief (no code) · shipped app still **v2.1.3** |

---

## How to maintain this file

1. At the **start** of a work day, add a new `### YYYY-MM-DD` section at the **top** of the Log.  
2. Bullet what landed (features, fixes, docs, parsers). Prefer plain language.  
3. At **end of day**, set `Hours: X.X` for that stamp and update the **Total hours** table above.  
4. Optional: note who worked (`Solo` / pair) and environment notes.  

---

## Log

### 2026-09-30

**Hours:** docs only  
**Who:** Solo  
**Branch:** `main`  
**Shipped:** nothing. App remains **v2.1.3**

- Agreed Cabinet Flow is a fresh cabinetry module inside LedgerFlow. iDev-ERP (`mycuttinglist-app` 4.4.29, local repo under `Documents\GitHub\iDev-ERP`) is the reference product, not code to merge
- Living brief written: `docs/CABINET_FLOW.md`
- Pointers updated: `docs/README.md`, `MODULES.md`, `TODO.md` §5, `DECISIONS.md`, `WHAT_IS_THIS_APP.md`, `FILE_TREE.md`
- No `cabinet_*` tables, no backend module, coming-soon hub unchanged
- Still open: whether cabinet quotes reuse Work Flow documents, and whether old Supabase jobs are ever imported

---

### 2026-09-23

**Hours:** release cut  
**Who:** Solo  
**Branch:** `main`  
**Shipped:** **v2.1.3** `LedgerFlow-2.1.3-Portable.exe`

- First portable EXE since 2.1.1 (2.1.2 was source-only)
- Project costing sheet, traveling, absences, print preview
- Quote / invoice / RFQ Back returns to the page that opened the document

---

### 2026-09-02

**Hours:** in progress  
**Who:** Solo  
**Branch:** `feature/practice-module`  
**Shipped:** **v2.1.0** `LedgerFlow-2.1.0-Portable.exe`

#### Products library
- Work Flow catalogue named **Products** (not Stock) so goods, labour, and other repeating lines fit
- Fields: name, description, category, supplier stock code, cost, markup %, retail
- Type-to-pick on quote/invoice item lines fills description + retail; cost stays on the card
- Markup % bidirectional; categories typed/grouped with typeahead

#### Quotes / print
- Duplicate quote; client-file Duplicate / Print preview / Process to invoice
- In-app preview (288 DPI); Save PDF + Print; preview closes after print
- Quote number: rounded 50% yellow chip

#### Ledger Flow
- Ledger list grouped Income → Expense → Transfer
- Bank Zero Check Account sample island

#### Desktop
- v2.1.0 portable EXE; crash logs from 2.0.1 still apply

---

### 2026-08-24

**Hours:** in progress  
**Who:** Solo  
**Branch:** `feature/practice-module`

#### Local ports
- Reserved **UI :3470** and **API :8470** so LedgerFlow does not sit on Next `:3000` or uvicorn `:8000`

---

### 2026-08-17

**Hours:** setup session  
**Who:** Solo  
**Branch:** `feature/practice-module` (do not treat as a shipping EXE)

#### Module architecture
- Modular monolith: core stays statement digest; bolt-ons live in `backend/app/modules` + `frontend/modules`
- Registry mounts Practice without dumping tables into `app.models` or routes into `app.api`
- One EXE / one SQLite / one login — updates still ship core + modules together

#### Practice scaffold
- Clients + suppliers libraries
- Projects library + project file (info sheet + paper trail + Add note)
- Quotes / invoices placeholders
- Docs: `docs/MODULES.md` is the map

---

### 2026-08-04

**Hours:** multi-session (desktop product track through v1.3.0)  
**Who:** Solo  
**Release:** **LedgerFlow v1.3.0** portable EXE  

#### Desktop shell
- Frameless window, custom titlebar, splash (logo + quotes, ≥6s)  
- API proxy `/api`, free port, process-tree kill on quit  
- Portable build pipeline + version sync from `VERSION`  

#### First-run & auth
- FirstTimeSetup multi-step; 10-card How to use guide  
- Returning user: Welcome back + simple themed login  
- Force first-time flags off for production builds  

#### Trial & license
- 30-day silent trial; Option C read-only after expiry  
- Offline key activation  

#### Multi-client workspaces
- Primary profile = app login; extra profiles = workspace username + password at create  
- Full-app switch gate; cascade profile delete  
- Removed mistaken “set workspace password on any profile” form  

#### Product UX
- Settings → five hubs + Preferences page  
- Upload 3-step + unallocated pulse  
- Dashboard shares Reporting monthly chart component  

#### Docs
- `docs/RELEASE_NOTES.md`, TODO / UPDATES / README refreshed for 1.3.0  

### 2026-07-31

**Hours: 12.0** (end-of-day estimate for a long single session)  
**Who:** Solo  

#### Auth & shell
- Free passwords + classic strength meter (advisory only)  
- Guest login (ephemeral; nothing saved)  
- Post-login → Dashboard  
- Footer: powered by IdevConsulting (Pty) Ltd  
- Global currency dropdown; Individual/Business profiles; logo + reg/VAT letterhead  

#### Upload & transactions UX
- Multi-file upload queue; disclaimer gate  
- Queue scroll: top → mid-track → bottom (no jump thrash)  
- Transactions: Unallocated/Allocated; month groups; collapse prefs **cleared on wipe**  
- Capitec: `Bank Fee` under amount (meta row with Ref); never Fee+Amount net  
- Wipe year/month + clear expand/collapse memory for wiped period  

#### Parsers (four locked islands)
| Bank | Module | Status |
|------|--------|--------|
| Discovery Personal | `discovery_pdf.py` | ✅ Locked — **226 txs · 100%** human |
| FNB Gold Business | `fnb_pdf.py` | ✅ Locked — **1000+ txs · 100%** human |
| Capitec Business | `capitec_pdf.py` | ✅ Locked — sample edition-1; **bulk TBD** |
| Nedbank Personal | `nedbank_pdf.py` | ✅ Locked — sample edition-1; **bulk TBD** |

- Capitec: Amount only; fee-only R0 + fee; Bank Charges fee siblings; Monthly Service Fee kept  
- Nedbank: dual-column fee vs `*` debit; R0.00 description lines kept  
- Isolation docs: `docs/PARSER_STABILITY.md`  
- Backend: single process default (`LEDGERFLOW_RELOAD=1` for watch) — fixed dual-server 0-tx imports  
- Regression: 7 tests green  

#### Reporting (skeleton)
- Hub + detail routes; monthly FY chart; graph type memory  
- Chart Y-axis: Amount label left of currency ticks  
- **Not calibrated yet** — waiting on Discovery data capture  

#### Ops
- Full docs pass EOD: TODO, DECISIONS, FILE_TREE, PARSING, PARSER_STABILITY, README, this log  

---

### Next phase (do in order)

1. **Capture Discovery Personal data** — multi-statement import; confirm against PDFs  
2. **Reporting calibration** — only after data is in (charts, P&L, SA reports, budgets, PDF)  
3. **Later:** bulk Capitec Business + Nedbank Personal multi-statement accuracy  

---

## Running total by month

| Month | Hours |
|-------|------:|
| 2026-07 | 12.0 |
| **All time** | **12.0** |
