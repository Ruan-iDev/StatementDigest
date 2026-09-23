# LedgerFlow release notes

**Source of truth for version:** repo root `VERSION`  
**Portable artifact:** `desktop/dist/LedgerFlow-<version>-Portable.exe`

---

## v2.1.3 — 2026-09-23

**Theme:** Project costing in the portable EXE, and Back returns you to the page that opened the document.

First portable build since **v2.1.1**. v2.1.2 (paid invoices, batch print, yellow project folders) was never cut as its own EXE, so this file includes that work as well.

**Work Flow · Project statement**
- Tabs: **Project Flow** and **Project Costing Sheet**
- Costing board: invoices + payments, Monday–Sunday costs (expenses and wages), wages breakdown by role, traveling
- Wage rows amber, expense rows blue; Total expenses / Total wages / Total project expenses
- Absent days: explicit Absent (R0) lines, plus days short of the rest of the crew that week
- **Print** opens the same preview as quotes/invoices (Print + Save PDF). Pages are white paper; wage/expense colours stay

**Work Flow · Paper trail**
- Traveling (ledger, km, R/litre, amount paid)
- Absence (R0, days from the selected date) next to commission
- Ctrl+Enter to add/save trail forms; date focused after open
- Received payment can credit an expense ledger (e.g. director cash-advance refund)

**Work Flow · Ledgers & Settings**
- Own ledgers (copy from Ledger Flow once); Configuration Company / Quote-Invoice / Ledgers; edit name + income/expense
- App Settings at the bottom of the sidebar — database location, backup, restore
- Opening a project no longer shows **Not Found** when the traveling table was missing

**Work Flow · Documents**
- Back on a quote, invoice, or RFQ returns to the list, client file, supplier file, project, or report you opened it from

### Upgrade notes
- Close `LedgerFlow-2.1.1-Portable.exe`, run `LedgerFlow-2.1.3-Portable.exe`
- Dev: `npm run dev` (UI :3470 / API :8470)
- First launch of this build creates the traveling table if it is missing
- Data path unchanged: `Documents\LedgerFlow\Data`

---

## v2.1.2 — 2026-09-16

**Theme:** Paid invoices, batch print, and project folders.

**Work Flow · Invoices**
- Record **Payment received** on a project paper trail (tied to an invoice) or on the client file — the invoice is marked **Paid**
- Paid invoices show a red **PAID / Thank you** stamp on the sheet and on the PDF printout
- Tick several invoices (library or client file) and **Print selected** as one batch
- Print preview no longer freezes on **Printing…** after the first invoice

**Work Flow · Projects**
- Project library (and the client-file Projects tab) is a File Explorer-style grid of **yellow folders**
- Project number sits **on** the folder; project name sits **underneath**; A–Z left to right

**Cabinet Flow**
- Sidebar tile + `/cabinet` coming-soon hub only (brief still to come)

### Upgrade notes
- v2.1.2 was not cut as its own EXE. Testers move from `LedgerFlow-2.1.1-Portable.exe` to `LedgerFlow-2.1.3-Portable.exe`
- Dev: `npm run dev` (UI :3470 / API :8470)

---

## v2.1.1 — 2026-09-13

**Theme:** EXE profile switch, Work Flow RFQ, FNB fee lines.

- Frameless desktop window was treating the unlock overlay as a drag region, so clicks never reached the inputs
- Unlock dialog is now portaled above the chrome with `no-drag` on fields
- Reset workspace username/password from My Profile without the old password
- **RFQ** (Request for Quote): create from a supplier file or project **+ Add** — quote sheet with item, description and quantity only (no prices)
- FNB Gold Business: R0.00 accrued-charge lines are not treated as income; image-only fees keep statement wording
- Quote/invoice workspace zoom (Ctrl + / − / 0, persisted)

### Upgrade notes
- Close `LedgerFlow-2.1.0-Portable.exe`, run `LedgerFlow-2.1.1-Portable.exe`
- RFQ numbering starts at `RFQ-001` per workspace

---

## v2.1.0 — 2026-09-02

**Theme:** Work Flow catalogue, quote print quality, and ledger list grouping — tester EXE.

### Shipped in this test build

**Work Flow · Products**
- Markup % on each product: cost + % fills retail, cost + retail fills %
- Free-text **Category** (no presets): type a name or pick one already used; matching names group on the list
- Quote line picker can match on category

**Work Flow · Quotes / invoices**
- Quote number chip: rounded corners, 50% yellow
- Print preview: **Save PDF** (real PDF bytes) and **Print** (system printer dialog — no blank pop-up)
- Preview / print quality: 288 DPI on-screen; Print uses the original PDF when it can
- Preview window closes when printing finishes
- Duplicate quote; client-file Duplicate / Print preview / Process to invoice
- Tab from reference no longer replaces the selected client

**Ledger Flow**
- Ledger Account Management grouped **Income → Expense → Transfer**
- Bank Zero Check Account island (samples A + B; detect before Nedbank)

**Desktop**
- Crash logs still in `Documents\LedgerFlow\logs\` (from 2.0.1)

### Upgrade notes
- Close any previous portable EXE and `npm run dev` (they share ports 3470 / 8470)
- Run `LedgerFlow-2.1.0-Portable.exe`
- Data path unchanged: `Documents\LedgerFlow\Data`
- First launch of this build adds `markup_percent` and `category` on products
- Windows SmartScreen may warn (unsigned test build) — More info → Run anyway

---

## v2.0.1 — 2026-09-02

**Theme:** Crash logs for portable EXE testers.

### Shipped in this test build
- Writes `Documents\LedgerFlow\logs\desktop.log`, `api.log`, and `last-error.txt`
- Failed start opens that folder and names the port / PID that blocked launch
- Quote **Duplicate** + Tab no longer overwrites the selected client

---

## v2.0.0 — 2026-09-02

**Theme:** Work Flow — clients, products, quotes, invoices, staff, and project files in the portable EXE.

### Shipped in this test build

- **Work Flow** module beside Ledger Flow (clients, suppliers, staff, products, projects, quotes, invoices, reports)
- **Products** library (name, description, supplier stock code, cost, retail) — goods, labour, or other repeating lines; type-to-pick on quote/invoice items
- Quote / invoice editor with line items, VAT, branding, PDF print
- Project files with a dated paper trail (notes, quotes, invoices, expenses, wages)
- Staff library, wages on a project, staff statements
- Independent On/Off for Quotes, Invoices, Projects (Settings → Modules)
- Theme packs (Settings → Appearance)

### Upgrade notes
- Close any previous portable EXE; run `LedgerFlow-2.0.0-Portable.exe`
- Data path unchanged: `Documents\LedgerFlow\Data`
- First launch of this build creates Work Flow tables in the existing SQLite file
- Windows SmartScreen may warn (unsigned test build) — More info → Run anyway

---

## v1.5.0 — 2026-08-17

**Theme:** Practice documents — real quotes and invoices with line items.

### Shipped in this test build

- Client / supplier **Edit** (button + double-click) with full address, VAT, registration
- Client library **Quote** and **Invoice** buttons open the document screen, pre-filled, next number applied
- Quote / invoice **editor**: company (from My Profile) + client details, line items, totals
- Project **+ Add** quote/invoice opens that same editor (not a tiny form)
- Second **Add to trail** button at the bottom of the project paper trail
- Independent module switches unchanged (Settings → Modules)

### Upgrade notes
- Restart the API after pulling this branch so new Practice tables/columns are created
- Existing clients can be edited; add business/VAT details so they print on the next quote

---

## v1.4.0 — 2026-08-06

**Theme:** Guest can prove the product; bank pick simplified; FNB multi-layout island.

### Shipped in this release

#### Guest = full product
- Guest mode is no longer “look only” — **bank import, ledgers, rules, reports** all work with **local SQLite writes**
- Still no account password; free registered account remains for locked private login
- Lets a tester prove *their* bank works before subscribe

#### Banks without DIY profiles
- **No user-facing bank profiles** in Settings / upload flow
- Upload Step 1: **Select your bank** (supported brands only)
- Backend still auto-creates an internal bank profile for import routing
- Brand dropdown only: **FNB, Capitec, Discovery, Nedbank** — product/language layouts tried on import

#### FNB multi-layout island
- **Gold Business (English)** remains locked (1000+ txs · 100% human verified)
- **Fusion Private Wealth (Afrikaans personal)** edition-1 layout added (`Kt` credit / bare debit)
- Orchestrator keeps the layout with more recovered lines; Gold Business rules stay locked

### Upgrade notes
- Close previous portable EXE; run `LedgerFlow-1.4.0-Portable.exe`
- Data path unchanged: `Documents\LedgerFlow\Data`
- Existing workspaces and registered accounts continue as before; Guest now persists on this PC

---

## v1.3.0 — 2026-08-04

**Theme:** Desktop product polish — first-run journey, trial, multi-client workspaces, dashboard insights.

### Shipped in this release

#### Desktop shell
- Frameless Electron window with custom titlebar (min / max / close)
- Black splash with logo, Welcome, cycling quotes, minimum ~6s hold
- Reliable local API sidecar: same-origin `/api` proxy, free port on launch, process-tree kill on quit
- Portable packaging via `scripts/build-desktop.ps1` (PyInstaller API + static Next UI + electron-builder)

#### First-time & returning users
- Multi-step **FirstTimeSetup** (welcome → personal → private/business → credentials)
- Optional forced first-run flags for testers (`FORCE_FIRST_TIME_SETUP` / `FORCE_APP_GUIDE` — off for production)
- **10-card** “How to use LedgerFlow” guide (once per PC unless forced)
- Returning users: **Welcome back {name}** → Log in | Guest | Close
- Simple login screen (username + password + Back) matching splash theme — no legacy register tabs on return

#### 30-day trial (Option C)
- Silent trial start on first use; badge in My Profile / sidebar / guest banner
- After trial: **read-only** books (view OK; mutations and PDF exports blocked until license key)
- Offline HMAC keys (`LF-LIFE-*` / `LF-EXT30-*`) for activation

#### Multi-profile workspaces
- Isolated workspaces (never mix data)
- **Primary profile** protected by **app login** only
- **Extra profiles** (Create on My Profile): **workspace username + password** at create time
- Switch → full-app unlock gate (username + password or Cancel) → reload that workspace’s data
- Profile delete cascades all related data (transactions, banks, ledgers, rules, training, disclaimers)
- Person/business display names on the profile list

#### Banks, upload, transactions
- Guided bank profile setup from **calibrated** banks (picker — no DIY mapping)
- Upload: three clear steps + success modal; unallocated pulse on Dashboard / Transactions
- Unallocated UX: **Assign to Ledger…**, 50/50 Unallocated | Allocated tabs; cleaner action row

#### Settings & dashboard
- Settings hub cleaned to **five tiles**: My Profile, Setup Bank Profile, Ledger Account Management, Rule Management, Preferences
- Preferences on its own page (FY start month + currency)
- **Monthly overview chart** on Dashboard (same shared `MonthlyComparisonChart` as Reporting — not a fork)

### Known limits / not in this build
- Settings → App updates (OTA) still **hidden** until a public `latest.json` channel is hosted
- Windows code signing / SmartScreen not yet applied
- Profile ownership isolation by AppUser (all local profiles still visible on one PC; extra clients use workspace credentials)
- Bulk Capitec / Nedbank multi-statement accuracy still TBD beyond locked samples
- Full read-only UI polish on every write control (API already enforces)

### Upgrade notes
- Data remains under `Documents\LedgerFlow\Data` (or custom path)
- Bump is portable: close old EXE, run `LedgerFlow-1.3.0-Portable.exe`
- Finish the first-run guide once if you had force flags on during testing

---

## Future (planned after v1.4.0)

| Priority | Item |
|----------|------|
| Next | Capture real Discovery Personal multi-statement data; calibrate Reporting against it |
| Next | Bulk Capitec Business + Nedbank Personal import accuracy passes |
| Near | Host update channel (`latest.json`) and re-enable in-app Check for updates |
| Near | Windows code signing for SmartScreen-friendly distribution |
| Later | Optional NSIS installer; macOS / Linux shells |
| Later | Report drill-down (click sum → transactions); PDF polish |
| Later | Mobile companion (Android first) — open architecture decision |
| Later | Additional bank islands (e.g. Standard Bank / Absa) as **new modules only** |
| Later | Financial Analyzer country packs (ZA luxury/necessity themes) |

See also: [TODO.md](./TODO.md), [UPDATES.md](./UPDATES.md), [PARSER_STABILITY.md](./PARSER_STABILITY.md).

---

## Earlier portable builds

| Version | Notes |
|---------|--------|
| 1.1.x | Patch desktop reliability, versioning, early EXE packaging |
| 1.0.0 | First PC portable build line |
